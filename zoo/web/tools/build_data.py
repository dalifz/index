"""Build web/data.js and web/img.js from Zoopedia scrape (zp.json) + plan v2 rows.

Usage: python build_data.py <path-to-zp.json>
"""
import json, re, sys, os, base64

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.dirname(HERE)
ROOT = os.path.dirname(WEB)
zp = json.load(open(sys.argv[1], encoding='utf8'))

# plan v2 rows: [slug,name,type,biomes,lo,hi,land,deepWater,aquatic,flight,climb,grade,height,status,asian,humidity,salinity,food,pop,walk]
v2 = open(os.path.join(ROOT, 'สวนสัตว์หุบเขาหยก v2.html'), encoding='utf8').read()
rows = json.loads('[' + re.search(r'const S=\[(.*?)\];', v2, re.S).group(1) + ']')
V = {r[0]: r for r in rows}

def slugify(s):
    return s.replace('á', 'a')

name2slug = {a['name'].replace('’', "'"): slugify(s) for s, a in zp.items()}

STATUS = {'Least Concern': 'LC', 'Near Threatened': 'NT', 'Vulnerable': 'VU', 'Endangered': 'EN',
          'Critically Endangered': 'CR', 'Extinct in the Wild': 'EW', 'Data Deficient': 'DD',
          'Not Evaluated': 'NE', 'Domesticated': 'DO'}

A = {}
for s, a in zp.items():
    r = V.get(s)
    sp = a['space']
    ty = r[2] if r else 'L'
    rel = lambda lst: [name2slug[n.replace('’', "'")] for n in lst if n.replace('’', "'") in name2slug]
    sal = ''
    for e in a['envRaw']:
        if e.startswith('Salinity'): sal = e.replace('Salinity ', '')
    A[slugify(s)] = {
        'slug': slugify(s), 'zslug': s, 'n': a['name'], 'zh': a['zh'], 'ty': ty, 'biomes': a['biomes'],
        'lo': a['tlo'], 'hi': a['thi'], 'hum': a['hum'], 'sal': sal,
        'land': sp.get('Land area', 0), 'shelter': sp.get('Shelter area', 0), 'dw': sp.get('Deep water area', 0),
        'aq': sp.get('Shallow water area', sp.get('Aquatic area', 0)), 'fl': sp.get('Flight area', 0), 'cl': sp.get('Climbing area', 0),
        'space': sp, 'g': a['grade'], 'h': a['height'], 'st': STATUS.get(a['status'], a['status']),
        'asia': 1 if 'Asia' in a['continents'] else 0, 'cont': a['continents'], 'food': a['food'], 'pop': a['pop'],
        'walk': a['walk'], 'thr': rel(a['thriving']), 'neu': rel(a['neutral']), 'ov': a['overview'],
        'pack': a['pack'], 'repro': a['repro'], 'litter': a['litter'], 'mature': a['maturity'], 'gest': a['gestation'],
        'life': a['lifeAdult'], 'temper': a['temperament'], 'dom': a['dominance'], 'terrain': a['terrain'],
        'fe': a['foodEnrich'], 'he': a['habEnrich'], 'wild': a['wildPop'], 'colour': a['colour'],
    }

# sanity: compare with v2
for s, r in V.items():
    a = A[slugify(s)]
    if (a['lo'], a['hi']) != (r[4], r[5]): print('temp changed', s, r[4], r[5], '->', a['lo'], a['hi'])
    if a['food'] != r[17]: print('food changed', s, r[17], '->', a['food'])

out = 'window.ANIMALS=' + json.dumps(A, ensure_ascii=False, separators=(',', ':')) + ';\n'
open(os.path.join(WEB, 'data-animals.js'), 'w', encoding='utf8').write(out)

imgs = {}
for s in A:
    p = os.path.join(WEB, 'img', s + '.png')
    imgs[s] = 'data:image/png;base64,' + base64.b64encode(open(p, 'rb').read()).decode()
open(os.path.join(WEB, 'data-img.js'), 'w', encoding='utf8').write('window.IMG=' + json.dumps(imgs, separators=(',', ':')) + ';\n')
print('animals', len(A), 'packs', sorted(set(a['pack'] for a in A.values())))
print('non-base', [(s, a['pack']) for s, a in A.items() if a['pack'] != 'BaseGame'])
