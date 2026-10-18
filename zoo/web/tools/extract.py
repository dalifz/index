import re, json, os, html as H, sys
os.chdir(os.path.dirname(os.path.abspath(__file__)))
meta = json.load(open('meta.json', encoding='utf8'))

def text_of(p):
    i = p.find('<main'); body = p[i:p.find('__NUXT_DATA__')]
    t = re.sub(r'<script.*?</script>|<style.*?</style>', '', body, flags=re.S)
    t = re.sub(r'<(h[1-4])[^>]*>', r'\n## ', t); t = re.sub(r'<li[^>]*>', '\n- ', t); t = re.sub(r'<br\s*/?>', '\n', t)
    t = re.sub(r'<[^>]+>', ' ', t); t = H.unescape(t); t = re.sub(r'[ \t]+', ' ', t); t = re.sub(r'\n\s*\n+', '\n', t)
    return t

def section(t, name, stop=r'\n## '):
    m = re.search(r'\n## ' + re.escape(name) + r'(.*?)(?=\n## |\Z)', t, re.S)
    return m.group(1) if m else ''

def items(s):
    return [x.strip() for x in re.findall(r'^- (.+)$', s, re.M) if x.strip()]

def num(s):
    m = re.search(r'-?[\d,.]+', s or ''); return float(m.group(0).replace(',', '')) if m else None

out = {}
for slug, m in meta.items():
    p = open(f'pages/{slug}.html', encoding='utf8').read()
    t = text_of(p)
    a = {'slug': slug, 'id': m['id'], 'internal': m['in'], 'zh': m['zh'], 'continents': sorted(set(m['cont'])), 'pack': m['pack']}
    a['name'] = re.sub(r' - (Planet Zoo 2|Zoopedia).*','',H.unescape(re.search(r'<title>([^<|]+)', p).group(1)).strip())
    ov = section(t, 'Overview')
    a['overview'] = re.split(r'(?<=[.!])\s', ov.strip())[0][:300] if ov else ''
    a['biomes'] = items(section(t, 'Biomes'))
    st = section(t, 'Statistics')
    g = lambda k: (re.search(re.escape(k) + r' (.+?)(?= [A-Z][a-z]+ [A-Z]|$)', st) or [None, None])[1]
    a['food'] = num((re.search(r'Periodic Food Expenses \$([\d,.]+)', st) or [0, '0'])[1])
    a['pop'] = (re.search(r'Population Range ([\d]+-[\d]+)', st) or [0, ''])[1]
    a['temperament'] = (re.search(r'Temperament (\w+)', st) or [0, ''])[1]
    sp = section(t, 'Space')
    a['space'] = {k: num(v) for k, v in re.findall(r'^- ([A-Za-z ]+?) ([\d,.]+)m', sp, re.M)}
    b = section(t, 'Barrier')
    a['grade'] = num((re.search(r'Grade (\d)', b) or [0, '0'])[1]); a['height'] = num((re.search(r'Height ([\d.]+)', b) or [0, '0'])[1])
    a['terrain'] = items(section(t, 'Terrain'))
    env = section(t, 'Environment')
    tm = re.search(r'temperature (-?\d+)°C to (-?\d+)°C', env)
    a['tlo'], a['thi'] = (int(tm.group(1)), int(tm.group(2))) if tm else (None, None)
    hm = re.search(r'[Hh]umidity(?: Requirement)? (\d+)% to (\d+)%', env); a['hum'] = f'{hm.group(1)}-{hm.group(2)}' if hm else ''
    a['envRaw'] = items(env)
    th = section(t, 'Thriving relationships'); ne = section(t, 'Neutral relationships')
    a['thriving'] = items(th); a['neutral'] = items(ne)
    walk = re.search(r'Guests Can Walk Through (true|false)', t); a['walk'] = bool(walk and walk.group(1) == 'true')
    a['dominance'] = (re.search(r'Dominance (\w+)', t) or [0, ''])[1]
    a['foodEnrich'] = items(section(t, 'Food-Based Enrichments'))
    a['habEnrich'] = items(section(t, 'Habitat Enrichments'))
    for k, rx in [('litter', r'Litter Size ([\d-]+)'), ('gestation', r'Gestation / Incubation Period ([\d.]+ \w+)'),
                  ('interbirth', r'Interbirth Period ([\d.]+ \w+)'), ('repro', r'Reproduction Difficulty (\w+(?: \w+)?)'),
                  ('maturity', r'Age Of Sexual Maturity ([\d.]+ \w+)'), ('wildPop', r'Wild Population ([^\n]+?) Conservation'),
                  ('status', r'Conservation Status (Least Concern|Near Threatened|Vulnerable|Endangered|Critically Endangered|Extinct in the Wild|Data Deficient|Not Evaluated|Domesticated)')]:
        mm = re.search(rx, t); a[k] = mm.group(1).strip() if mm else ''
    a['repro'] = re.sub(r' Age.*', '', a['repro'])
    a['lifeAdult'] = (re.search(r'- Adult ([\d.]+ \w+)', t) or [0, ''])[1]
    a['colour'] = items(section(t, 'Colourmorphs'))
    a['headshot'] = f"https://hosting.zaonce.net/websites/planet-zoo-2/animals/{m['id']}/{m['in']}_headshot.png"
    a['hero'] = f"https://hosting.zaonce.net/websites/planet-zoo-2/animals/{m['id']}/{m['in']}.jpg"
    out[slug] = a

json.dump(out, open('zp.json', 'w', encoding='utf8'), ensure_ascii=False, indent=0)
print(len(out))
for s in ['giant-panda', 'koi', 'monarch', 'great-hornbill', 'galápagos-giant-tortoise']:
    print(json.dumps(out[s], ensure_ascii=False)[:1400]); print()
bad = [s for s, a in out.items() if a['tlo'] is None]
print('no temp', bad)
