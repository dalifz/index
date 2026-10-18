/* App shell: views, drawer, modal, and every page except the map drawing itself. */
(function () {
  const Z = window.Z, { A, CAGES, WHERE, CLIM, TYPE, TYPE_CN, STATUS_TH, esc, fmt, img, zp, rel } = Z;
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const ALL = Object.values(A).sort((a, b) => a.n.localeCompare(b.n));
  const ZONE = Object.fromEntries(window.ZONES.map(z => [z.id, z]));
  const LV = window.LEVELS;

  /* ---------- shared bits ---------- */
  const ticon = k => `<span class="ticon ${k}" title="${TYPE[k]}">${TYPE_CN[k]}</span>`;
  const asiaB = a => a.asia ? `<span class="asia" title="มีถิ่นในเอเชีย">亞</span>` : '';
  const lvChip = lv => `<span class="chip fill" style="background:${Z.LVC(lv)}">Lv${lv} ${LV[lv - 1].cn}</span>`;
  const climChip = c => c ? `<span class="chip fill" style="background:${c.color}">${c.cn} ${c.th}</span>` : `<span class="chip b">ตั้งอุณหภูมิในตู้</span>`;
  function equip(c, lo, hi) { if (c.controlled) return null; return { heat: Math.max(0, c.lo - lo), cool: Math.max(0, hi - c.hi) }; }
  function equipChip(c) {
    const e = equip(c, ...Z.state.amb); if (!e) return '';
    if (!e.heat && !e.cool) return `<span class="chip ok">ไม่ต้องใช้ Heater/Cooler</span>`;
    return (e.heat ? `<span class="chip warn">Heater +${e.heat}°C</span>` : '') + (e.cool ? `<span class="chip b">Cooler −${e.cool}°C</span>` : '');
  }
  function ownBox(s) { return `<label class="own" onclick="event.stopPropagation()"><input type="checkbox" data-own="${s}" ${Z.owned(s) ? 'checked' : ''}> มีแล้ว</label>`; }
  document.addEventListener('change', e => {
    const o = e.target.closest('[data-own]'); if (o) { Z.setOwned(o.dataset.own, o.checked); $$(`[data-own="${o.dataset.own}"]`).forEach(x => (x.checked = o.checked)); }
    const b = e.target.closest('[data-build]'); if (b) Z.setBuild(b.dataset.build, b.checked);
  });

  /* ---------- top progress ---------- */
  function topProg() {
    const n = ALL.filter(a => Z.owned(a.slug)).length;
    $('#topProg').innerHTML = `มีแล้ว <b>${n} / ${ALL.length}</b><div class="bar"><i style="width:${n / ALL.length * 100}%"></i></div>`;
  }

  /* ---------- views ---------- */
  const inited = {};
  function show() {
    const v = (location.hash || '#map').slice(1).split('/')[0];
    const id = $('#v-' + v) ? v : 'map';
    $$('.view').forEach(x => (x.hidden = x.id !== 'v-' + id));
    $$('#tabs a').forEach(a => a.classList.toggle('on', a.dataset.v === id));
    if (!inited[id]) { inited[id] = 1; INIT[id] && INIT[id](); }
    REFRESH[id] && REFRESH[id]();
    if (id !== 'map') window.scrollTo(0, 0);
  }
  const INIT = {}, REFRESH = {};
  window.addEventListener('hashchange', show);
  Z.onChange(() => { topProg(); const v = (location.hash || '#map').slice(1); REFRESH[v] && REFRESH[v](); if (v === 'map' || !v) mapState(); });

  /* =========================================================
     MAP
     ========================================================= */
  let selCage = null;
  INIT.map = function () {
    const svg = $('#map');
    window.ZooMap.build(svg);
    $$('#map .cage').forEach(g => { const c = CAGES.find(c => c.id === g.dataset.c); g.dataset.clim = c.clim ? c.clim.id : 'ctrl'; });
    window.ZooMap.initInteract(svg, {
      animal: s => openAnimal(s), cage: id => openCage(id), zone: zid => openZone(zid),
      stop: at => { const r = window.ROUTE.find(r => r.at === at); if (r) location.hash = '#route'; },
    });
    const M = window.ZooMap;
    $('#zIn').onclick = () => M.zoomBy(.75); $('#zOut').onclick = () => M.zoomBy(1.33); $('#zFit').onclick = () => { M.fit(); closeDrawer(); };
    // zone bar
    $('#zoneBar').innerHTML = `<button data-zone="" class="on"><span class="cn">全</span>ทั้งสวน</button>` +
      window.ZONES.map(z => `<button data-zone="${z.id}" style="--zc:${z.fill};--zi:${z.ink}"><span class="cn">${z.cn.slice(0, 2)}</span>${esc(z.th.split(' (')[0].split(' · ')[0])}</button>`).join('');
    $('#zoneBar').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; closeDrawer(); if (b.dataset.zone) M.zoomZone(b.dataset.zone); else M.fit(); });
    // minimap
    const mm = $('#minimap');
    mm.innerHTML = `<svg viewBox="0 0 ${M.W} ${M.H}">
      <rect width="${M.W}" height="${M.H}" fill="#efe4c9"/>
      <path d="${M.superellipse(M.LAKE, 4, 80)}" fill="#9cc7d3"/>
      ${window.ZONES.map(z => { const r = M.zoneRect(z.id); return `<rect data-zone="${z.id}" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="60" fill="${z.id === 'palace' ? '#e9c2b4' : z.fill}" stroke="${z.ink}" stroke-width="10"/><text x="${r.x + r.w / 2}" y="${r.y + r.h / 2 + 50}" text-anchor="middle" font-family="LXGW WenKai TC" font-weight="700" font-size="150" fill="${z.ink}" opacity=".75">${z.cn.slice(0, 2)}</text>`; }).join('')}
      <rect id="mmView" fill="rgba(184,50,42,.12)" stroke="#b8322a" stroke-width="22"/></svg>`;
    const mmSvg = mm.querySelector('svg'), mmView = mm.querySelector('#mmView');
    const mmPoint = e => { const r = mmSvg.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * M.W, (e.clientY - r.top) / r.height * M.H]; };
    let mmDrag = false;
    mm.addEventListener('pointerdown', e => { mmDrag = true; mm.setPointerCapture(e.pointerId); const [x, y] = mmPoint(e); const v = M.view(); M.go({ x: x - v.w / 2, y: y - v.h / 2, w: M.isOverview() ? 1500 : v.w }); });
    mm.addEventListener('pointermove', e => { if (!mmDrag) return; const [x, y] = mmPoint(e); const v = M.view(); M.go({ x: x - v.w / 2, y: y - v.h / 2, w: v.w }, true); });
    mm.addEventListener('pointerup', () => (mmDrag = false));
    let lastZone = null;
    M.setOnView((v, t) => {
      mmView.setAttribute('x', v.x); mmView.setAttribute('y', v.y); mmView.setAttribute('width', v.w); mmView.setAttribute('height', v.h);
      const over = t.w > 1900; $('#mapWrap').classList.toggle('overview', over);
      const z = over ? '' : (M.zoneAt(t.x + t.w / 2, t.y + t.h / 2) || '');
      if (z !== lastZone) { lastZone = z; $$('#zoneBar button').forEach(b => b.classList.toggle('on', b.dataset.zone === z)); }
    });
    // heater / cooler layer
    const ambIn = () => { $('#mAmbLo').value = Z.state.amb[0]; $('#mAmbHi').value = Z.state.amb[1]; };
    ambIn();
    const ambUpd = () => { const lo = +$('#mAmbLo').value, hi = +$('#mAmbHi').value; if (!isNaN(lo) && !isNaN(hi)) Z.setAmb(lo, hi); };
    $('#mAmbLo').addEventListener('change', ambUpd); $('#mAmbHi').addEventListener('change', ambUpd);
    $('#lyDev').addEventListener('change', () => { if ($('#lyDev').checked && M.isOverview()) M.zoomZone('savannah'); mapState(); });
    const lf = $('#lvFilter'); LV.forEach(l => lf.insertAdjacentHTML('beforeend', `<option value="${l.lv}">Lv${l.lv} ${l.cn} · ${l.th}</option>`));
    ['#lvFilter', '#lyRoute', '#lyTemp', '#lyOwned'].forEach(s => $(s).addEventListener('change', mapState));
    mapState();
    $('#mapSearch').addEventListener('input', e => mapSearch(e.target.value));
    $('#mapSearch').addEventListener('keydown', e => { if (e.key === 'Enter') { const h = $('#map .tok.hit'); if (h) openAnimal(h.dataset.s); } });
    $('#drawerX').onclick = closeDrawer;
    $('#exportPng').onclick = async () => {
      const b = $('#exportPng'); b.disabled = true; b.textContent = 'กำลังสร้าง…';
      try { const blob = await window.ZooMap.exportPng(svg, 1.25); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'jade-valley-zoo-map-4000x2500.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
      catch (e) { alert('สร้างภาพไม่สำเร็จ: ' + e.message); }
      b.disabled = false; b.textContent = '⬇ PNG';
    };
    $('#exportPost').onclick = async () => {
      const b = $('#exportPost'); b.disabled = true; b.textContent = 'กำลังสร้าง…';
      try { const blob = await posterPng(svg); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'jade-valley-zoo-post-1080x1350.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
      catch (e) { alert('สร้างภาพไม่สำเร็จ: ' + e.message); }
      b.disabled = false; b.textContent = '⬇ โพสต์';
    };
    $('#mapLegend').innerHTML = [
      `<span class="lg"><i class="sw" style="border:3px solid #2f7d5d"></i>กรงรวม</span>`, `<span class="lg"><i class="sw" style="border:1.5px solid #5a5040"></i>กรงเดี่ยว</span>`,
      `<span class="lg"><i class="sw" style="border:2px solid #7b4f8a;background:#f7eef6"></i>Exhibit</span>`, `<span class="lg"><i class="sw" style="border:2px solid #2f6f8c;background:#9cc7d3"></i>Aquarium</span>`,
      ...['L', 'F', 'A', 'E'].map(k => `<span class="lg">${ticon(k)}${TYPE[k]}</span>`), `<span class="lg"><span class="asia">亞</span>ถิ่นเอเชีย</span>`,
      `<span class="lg"><i class="sw" style="border-radius:50%;background:rgba(255,106,77,.35);border:2px dashed #e0503c"></i>Heater</span>`, `<span class="lg"><i class="sw" style="border-radius:50%;background:rgba(77,163,255,.35);border:2px dashed #3c8ee0"></i>Cooler</span>`,
    ].join('');
    // hover tooltip
    const tip = $('#tip');
    svg.addEventListener('pointerover', e => { const t = e.target.closest('.tok'); if (!t) return; const a = A[t.dataset.s]; const c = WHERE[a.slug];
      tip.innerHTML = `<b>${esc(a.n)}</b> · ${esc(a.zh || '')}<br>${a.lo}–${a.hi}°C · ${esc(c.zone.th)} · Lv${Z.levelOf(a.slug)}${Z.owned(a.slug) ? ' · ✓ มีแล้ว' : ''}`; tip.hidden = false; });
    svg.addEventListener('pointermove', e => { if (!tip.hidden) { tip.style.left = Math.min(innerWidth - 270, e.clientX + 14) + 'px'; tip.style.top = (e.clientY + 16) + 'px'; } });
    svg.addEventListener('pointerout', e => { if (e.target.closest('.tok')) tip.hidden = true; });
    // deep link: #map/cage-id
    const deep = location.hash.split('/')[1]; if (deep) setTimeout(() => focusCage(deep), 60);
  };
  REFRESH.map = () => { const deep = location.hash.split('/')[1]; if (deep && inited.map) focusCage(deep); };
  async function posterPng(svg) {
    const mapBlob = await window.ZooMap.exportPng(svg, .5);
    const im = new Image(); const u = URL.createObjectURL(mapBlob); await new Promise((r, j) => { im.onload = r; im.onerror = j; im.src = u; });
    await document.fonts.ready;
    const cv = document.createElement('canvas'); cv.width = 1080; cv.height = 1350; const g = cv.getContext('2d');
    g.fillStyle = '#efe4c9'; g.fillRect(0, 0, 1080, 1350);
    g.fillStyle = '#2a1f17'; g.fillRect(0, 0, 1080, 250); g.fillStyle = '#a8822e'; g.fillRect(0, 250, 1080, 6);
    g.fillStyle = '#e0604c'; g.font = '700 92px "LXGW WenKai TC"'; g.textAlign = 'center'; g.fillText('玉谷萬獸園', 540, 118);
    g.fillStyle = '#f3e6c8'; g.font = '700 40px "Noto Serif Thai"'; g.fillText('สวนสัตว์หุบเขาหยก', 540, 180);
    g.fillStyle = '#cdb98d'; g.font = '500 24px "Noto Sans Thai"'; g.fillText('Planet Zoo 2 · 136 ชนิด · 8 โซน · วังมังกรกลางทะเลสาบ', 540, 224);
    // map crop: centre 3:2 window of the 16:10 map scaled to width 1080
    const sw = im.width, sh = im.height; const mh = 1080 * sh / sw; g.drawImage(im, 0, 0, sw, sh, 0, 262, 1080, mh);
    URL.revokeObjectURL(u);
    let y = 262 + mh + 28; g.textAlign = 'left';
    const zs = window.ZONES; const colW = 1080 / 2;
    zs.forEach((z, i) => { const x = 40 + (i % 2) * colW, yy = y + Math.floor(i / 2) * 78;
      g.fillStyle = z.fill; g.beginPath(); g.roundRect(x, yy, colW - 60, 64, 12); g.fill(); g.strokeStyle = z.ink; g.lineWidth = 2; g.stroke();
      g.fillStyle = '#b8322a'; g.font = '700 32px "LXGW WenKai TC"'; g.fillText(z.cn, x + 16, yy + 43);
      g.fillStyle = '#2a251d'; g.font = '600 21px "Noto Sans Thai"'; g.fillText(z.th.split(' (')[0].split(' · ')[0], x + 160, yy + 30);
      g.fillStyle = '#6b6252'; g.font = '400 18px "Noto Sans Thai"'; g.fillText(z.count + ' ชนิด', x + 160, yy + 54); });
    g.save(); g.translate(975, 125); g.rotate(-.08); g.fillStyle = '#b8322a'; g.fillRect(-52, -52, 104, 104); g.fillStyle = '#fbe9e3'; g.font = '700 38px "LXGW WenKai TC"'; g.textAlign = 'center';
    g.fillText('玉萬', 0, -6); g.fillText('谷獸', 0, 38); g.restore();
    return new Promise(r => cv.toBlob(r, 'image/png'));
  }
  function mapState() {
    if (!inited.map) return;
    const lv = +$('#lvFilter').value, route = $('#lyRoute').checked, temp = $('#lyTemp').checked, own = $('#lyOwned').checked;
    $('#L-route').style.display = route ? '' : 'none';
    const dev = $('#lyDev').checked, [alo, ahi] = Z.state.amb;
    if ($('#mAmbLo') && document.activeElement !== $('#mAmbLo') && document.activeElement !== $('#mAmbHi')) { $('#mAmbLo').value = alo; $('#mAmbHi').value = ahi; }
    window.ZooMap.setDevices(dev, alo, ahi);
    $('#mapWrap').classList.toggle('devmode', dev);
    if (dev) {
      let h = 0, c = 0; CAGES.forEach(cg => { const p = Z.devicePlan(cg, alo, ahi); if (p && p.units) { if (p.heat) h += p.units; if (p.cool) c += p.units; } });
      $('#devSum').innerHTML = `<b style="color:#e0503c">Heater ${h}</b> · <b style="color:#3c8ee0">Cooler ${c}</b> เครื่อง · ≈ $${fmt((h + c) * 50)}`;
    } else $('#devSum').textContent = '';
    $('#map').classList.toggle('tempmode', temp);
    $$('#map .cage').forEach(g => { const c = CAGES.find(c => c.id === g.dataset.c); g.classList.toggle('dim', !!lv && !c.m.some(s => Z.levelOf(s) === lv)); });
    $$('#map .tok').forEach(t => { t.style.opacity = lv && +t.dataset.lv !== lv ? .3 : ''; t.classList.toggle('notown', own && !Z.owned(t.dataset.s)); });
  }
  function mapSearch(q) {
    q = q.trim().toLowerCase(); $$('#map .tok.hit').forEach(t => t.classList.remove('hit'));
    if (q.length < 2) return;
    const hits = ALL.filter(a => a.n.toLowerCase().includes(q) || (a.zh || '').includes(q));
    hits.forEach(a => { const t = $(`#map .tok[data-s="${CSS.escape(a.slug)}"]`); t && t.classList.add('hit'); });
    if (hits.length) window.ZooMap.zoomCage(WHERE[hits[0].slug].id);
  }
  function focusCage(id) { if (!window.ZooMap.cageCenter(id)) return; window.ZooMap.zoomCage(id); openCage(id); }
  function openDrawer(html) { $('#mapWrap').classList.add('dopen'); $('#drawerBody').innerHTML = html; $('#drawer').classList.add('open'); $('#drawer').setAttribute('aria-hidden', 'false'); $('#drawer').scrollTop = 0; }
  function closeDrawer() { $('#mapWrap').classList.remove('dopen'); $('#drawer').classList.remove('open'); $('#drawer').setAttribute('aria-hidden', 'true'); $$('#map .cage.sel').forEach(g => g.classList.remove('sel')); }

  function cageHTML(c) {
    const z = c.zone;
    const head = `<div class="dh">${ticon(c.kind)}<div><div class="big">${esc(c.cn || '')}</div><h2>${esc(c.title)}</h2><small>${esc(z.cn)} ${esc(z.th)}</small></div></div>`;
    const chips = `<div class="chips"><span class="chip ${c.kind === 'A' ? 'b' : c.kind === 'E' ? 'p' : c.kind === 'F' ? 'g' : 'ok'}">${c.ex ? `Exhibit ${c.m.length} ตู้` : TYPE[c.kind]}${c.mixed ? ' · กรงรวม ' + c.m.length : ''}</span>${lvChip(c.lv)}${climChip(c.clim)}${c.walk ? '<span class="chip g">แขกเดินผ่านได้</span>' : ''}${c.sal ? `<span class="chip b">${c.sal}</span>` : ''}</div>`;
    const mems = `<div class="mem-list">${c.sp.map(a => `<div class="mem" data-open="${a.slug}"><img src="${img(a.slug)}" alt=""><div class="mn"><b>${esc(a.n)} ${asiaB(a)}</b><small>${esc(a.zh || '')} · ${a.lo}–${a.hi}°C${a.hum ? ' · ชื้น ' + a.hum + '%' : ''} · $${fmt(a.food)}/รอบ · Lv${Z.levelOf(a.slug)}</small></div>${ownBox(a.slug)}</div>`).join('')}</div>`;
    const rows = [];
    if (!c.ex) {
      rows.push(['อุณหภูมิที่ทุกตัวรับได้', `${c.lo} ถึง ${c.hi}°C`]);
      if (c.land) rows.push(['พื้นที่ดินขั้นต่ำ', `${fmt(c.land)} m²`]);
      if (c.shelter) rows.push(['ที่หลบ (shelter)', `${fmt(c.shelter)} m²`]);
      if (c.dw) rows.push(['น้ำลึก', `${fmt(c.dw)} m²`]);
      if (c.aq) rows.push(['น้ำตื้น', `${fmt(c.aq)} m²`]);
      if (c.fl) rows.push(['พื้นที่บิน', `${fmt(c.fl)} m² (ต้องมีหลังคา Aviary)`]);
      if (c.cl) rows.push(['พื้นที่ปีน', `${fmt(c.cl)} m²`]);
      if (c.g) rows.push(['รั้ว', `Grade ${c.g} · สูง ${c.bh} m`]);
    } else rows.push(['ตู้', 'ตั้งอุณหภูมิ/ความชื้นแยกรายตู้ · จัดตู้ที่ค่าใกล้กันไว้ห้องเดียวกัน']);
    rows.push(['ค่าอาหารรวม', `$${fmt(c.food)} ต่อรอบ (กลุ่มเริ่มต้น)`]);
    const spec = `<dl class="spec">${rows.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('')}</dl>`;
    let mx = '';
    if (c.mixed) {
      mx = `<h4 style="margin:12px 0 4px;font-family:var(--f-head)">ความสัมพันธ์ในกรง</h4><div style="overflow-x:auto"><table class="rel-mx"><tr><th></th>${c.sp.map(a => `<th>${esc(a.n)}</th>`).join('')}</tr>${c.sp.map(a => `<tr><th>${esc(a.n)}</th>${c.sp.map(b => a === b ? '<td>—</td>' : (r => `<td class="r-${r}">${r === 'T' ? 'Thriving' : r === 'N' ? 'Neutral' : '✕'}</td>`)(rel(a, b))).join('')}</tr>`).join('')}</table></div>`;
    }
    const eq = c.controlled ? '' : `<div class="chips">${equipChip(c)}<span class="chip" style="color:var(--ink-soft)">จากแผนที่ ${Z.state.amb[0]}…${Z.state.amb[1]}°C</span></div>`;
    const dev = deviceHTML(c);
    return head + chips + eq + mems + dev + spec + mx + `<p class="deco">${esc(z.deco)}</p>`;
  }
  function deviceHTML(c) {
    const [lo, hi] = Z.state.amb;
    if (c.kind === 'A') return `<div class="devbox ctl"><h4>🌡 อุณหภูมิน้ำ</h4><p>ตู้ปลาไม่ใช้ Heater/Cooler ของ Habitat · ตั้งอุณหภูมิน้ำที่ตัวตู้/ระบบกรองให้อยู่ <b>${c.lo}–${c.hi}°C</b>${c.sal ? ' · ' + c.sal : ''}</p></div>`;
    if (c.ex) return `<div class="devbox ctl"><h4>🌡 ตู้ Exhibit</h4><p>ตั้งอุณหภูมิ + ความชื้นทีละตู้ในหน้าต่างของตู้ ไม่ต้องวางเครื่อง</p></div>`;
    const p = Z.devicePlan(c, lo, hi);
    if (!p.units) return `<div class="devbox ok"><h4>✓ ไม่ต้องวางเครื่อง</h4><p>อากาศแผนที่ ${lo}…${hi}°C อยู่ในช่วง ${c.lo}…${c.hi}°C ของกรงนี้แล้ว</p></div>`;
    const rows = [];
    if (p.heat) rows.push(`<div class="devrow heat"><span class="dot heat"></span><div><b>Heater × ${p.units}</b> · รัศมี ~${p.radius} m · ตั้ง ~${p.heatTo}°C<br><small>หน้าหนาวต่ำกว่าที่สัตว์รับได้ ${p.heat}°C</small></div></div>`);
    if (p.cool) rows.push(`<div class="devrow cool"><span class="dot cool"></span><div><b>Cooler × ${p.units}</b> · รัศมี ~${p.radius} m · ตั้ง ~${p.coolTo}°C<br><small>หน้าร้อนสูงเกินที่สัตว์รับได้ ${p.cool}°C</small></div></div>`);
    return `<div class="devbox"><h4>🌡 วางเครื่องปรับอุณหภูมิ <small>(พื้นที่ ~${fmt(p.area)} m²)</small></h4>${rows.join('')}
      <ul><li>วางเป็นกลุ่มกลางกรง ให้วงคลุม <b>shelter · จุดให้อาหาร · น้ำ</b> ไม่ต้องคลุมทุกตารางเมตร (ราว 60% ของพื้นที่พอ)</li>
      <li>ตอนวางเกมจะโชว์รัศมีเป็นวง · เปิด Heat map (แท็บ Habitat บนแถบด้านบน) เช็กว่าแดง/ฟ้าครอบจุดที่สัตว์อยู่</li>
      <li>รัศมีใหญ่เครื่องเดียวแพงกว่าเครื่องกลาง 2 เครื่อง → ใช้หลายเครื่องรัศมี ~${p.radius} m ดีกว่า</li>
      <li>ต้องต่อไฟ (Power) · ซ่อนเครื่องโดยกด Shift จมลงดินเล็กน้อยหรือวางหิน/พุ่มไม้บัง</li>
      ${p.heat && p.cool ? '<li>กรงนี้ต้องทั้งสองแบบ: เปิด Heater หน้าหนาว Cooler หน้าร้อน วางสลับกันในกลุ่มเดียว</li>' : ''}</ul>
      <p class="fine" style="margin:4px 0 0">จำนวนเครื่องคำนวณจากพื้นที่ขั้นต่ำใน Zoopedia ÷ วงรัศมี 14 m (ค่าจากชุมชน ยังไม่ยืนยันใน PZ2) ถ้ากรงใหญ่กว่าขั้นต่ำให้เพิ่มตาม</p></div>`;
  }
  function openCage(id) {
    const c = CAGES.find(c => c.id === id); if (!c) return; selCage = id;
    $$('#map .cage.sel').forEach(g => g.classList.remove('sel')); const g = $(`#map .cage[data-c="${id}"]`); g && g.classList.add('sel');
    openDrawer(cageHTML(c));
  }
  function openZone(zid) {
    const z = ZONE[zid]; const cs = CAGES.filter(c => c.zone === z);
    openDrawer(`<div class="dh"><div><div class="big">${z.cn}</div><h2>${esc(z.th)}</h2><small>${esc(z.biome)} · ${z.count} ชนิด · ${cs.length} กรง/อาคาร</small></div></div>
      <p class="deco">${esc(z.deco)}</p>
      <div class="mem-list">${cs.map(c => `<div class="mem" data-cage="${c.id}">${ticon(c.kind)}<div class="mn"><b>${esc(c.cn ? c.cn + ' ' + c.th : c.title)}</b><small>${c.sp.map(a => esc(a.n)).join(', ')}</small></div><span class="chip fill" style="background:${Z.LVC(c.lv)}">Lv${c.lv}</span></div>`).join('')}</div>`);
  }
  document.addEventListener('click', e => {
    const o = e.target.closest('[data-open]'); if (o && !e.target.closest('.own')) { openAnimal(o.dataset.open); return; }
    const cg = e.target.closest('[data-cage]'); if (cg) { if (location.hash.startsWith('#map')) focusCage(cg.dataset.cage); else location.hash = '#map/' + cg.dataset.cage; closeModal(); }
  });

  /* ---------- animal modal ---------- */
  function openAnimal(s) {
    const a = A[s]; if (!a) return; const c = WHERE[s]; const cl = Z.climOf(a);
    const names = arr => arr.map(x => A[x]).filter(Boolean);
    const thr = names(a.thr), neu = names(a.neu).filter(b => !a.thr.includes(b.slug));
    const sp = a.space || {};
    const rows = [
      ['ประเภท', `${ticon(a.ty)} ${TYPE[a.ty]}`], ['Biome', esc(a.biomes.join(', '))], ['อุณหภูมิ', `${a.lo} ถึง ${a.hi}°C`],
      a.hum && ['ความชื้น', a.hum + '%'], a.sal && ['ความเค็มน้ำ', esc(a.sal)],
      ...Object.entries(sp).map(([k, v]) => [esc(k), fmt(v) + ' m²']),
      a.g && ['รั้ว', `Grade ${a.g} · สูง ${a.h} m`], ['ค่าอาหาร', `$${fmt(a.food)} ต่อรอบ`], ['ขนาดฝูง', esc(a.pop)],
      a.temper && ['นิสัย', esc(a.temper)], ['แขกเดินผ่าน', a.walk ? 'ได้' : 'ไม่ได้'],
      ['สถานะ', `${esc(a.st)} · ${STATUS_TH[a.st] || ''}`], ['ถิ่น', esc(a.cont.join(', '))],
      a.repro && ['การขยายพันธุ์', `${esc(a.repro)} · ครอก ${esc(a.litter || '-')} · ตั้งท้อง ${esc(a.gest || '-')} · โตเต็มวัย ${esc(a.mature || '-')}`],
      a.pack !== 'BaseGame' && ['แพ็ก', `<b style="color:var(--seal)">${esc(a.pack)} Edition</b>`],
    ].filter(Boolean);
    const pill = (b, cls) => `<span class="pill ${cls}" data-open="${b.slug}"><img src="${img(b.slug)}" alt="">${esc(b.n)}</span>`;
    $('#modalBody').innerHTML = `
      <div class="am-hero"><img src="${img(s)}" alt=""><div><h2 id="mTitle">${esc(a.n)} ${asiaB(a)}</h2><div class="zh">${esc(a.zh || '')}</div>
        <div class="chips">${lvChip(Z.levelOf(s))}${climChip(cl)}<span class="chip" data-cage="${c.id}" style="cursor:pointer">📍 ${esc(c.zone.th)} · ${esc(c.cn ? c.th : 'กรงเดี่ยว')}</span></div></div></div>
      <div class="am-body">
        <p class="ov">${esc(a.ov)}</p>
        <div class="am-cols">
          <div class="am-sec"><dl class="spec">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl></div>
          <div class="am-sec">
            <h4>Thriving (${thr.length}) — อยู่ด้วยแล้วมีความสุขขึ้น</h4><div class="rel">${thr.map(b => pill(b, 'T')).join('') || '<span class="muted" style="font-size:13px">ไม่มี</span>'}</div>
            <h4>Neutral (${neu.length}) — อยู่ด้วยกันได้</h4><div class="rel">${neu.map(b => pill(b, '')).join('') || '<span class="muted" style="font-size:13px">ไม่มี · ควรอยู่กรงเดี่ยว</span>'}</div>
            ${a.terrain.length ? `<h4>พื้นผิว (Terrain)</h4><div class="tlist">${a.terrain.map(t => `<span>${esc(t)}</span>`).join('')}</div>` : ''}
            ${a.fe.length || a.he.length ? `<h4>Enrichment</h4><div class="tlist">${[...a.fe, ...a.he].map(t => `<span>${esc(t)}</span>`).join('')}</div>` : ''}
          </div>
        </div>
        <div class="am-act">${ownBox(s)}<a class="btn" href="${zp(a)}" target="_blank" rel="noopener">เปิดใน Zoopedia ↗</a><button class="btn-ghost btn" data-cage="${c.id}">ดูบนแผนที่</button><button class="btn-ghost btn" data-pair="${s}">จับคู่กับตัวอื่น</button></div>
      </div>`;
    $('#modal').hidden = false; $('#modalX').focus();
  }
  function closeModal() { $('#modal').hidden = true; }
  $('#modalX').onclick = closeModal;
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (!$('#modal').hidden) closeModal(); else closeDrawer(); } });
  document.addEventListener('click', e => { const p = e.target.closest('[data-pair]'); if (p) { pairSel = [p.dataset.pair]; closeModal(); location.hash = '#pair'; renderPair(); } });

  /* =========================================================
     LEVEL
     ========================================================= */
  function lvAnimals(l) { return ALL.filter(a => Z.levelOf(a.slug) === l.lv).sort((a, b) => a.food - b.food); }
  function lvProgress(l) {
    const an = lvAnimals(l), b = l.build.map((_, i) => `L${l.lv}-${i}`);
    const done = an.filter(a => Z.owned(a.slug)).length + b.filter(k => Z.state.build[k]).length;
    return { done, total: an.length + b.length, pct: Math.round(done / (an.length + b.length) * 100) };
  }
  function currentLevel() { const l = LV.find(l => lvProgress(l).pct < 100); return l ? l.lv : 7; }
  INIT.level = function () { $('#lvList').addEventListener('click', e => { const h = e.target.closest('.lv-h'); if (h) { const lv = h.parentElement.dataset.lv; Z.state.open[lv] = !Z.state.open[lv]; h.parentElement.classList.toggle('closed'); Z.save(); } }); };
  REFRESH.level = function () {
    const cur = currentLevel();
    $('#lvTrack').innerHTML = LV.map(l => { const p = lvProgress(l); return `<button class="lv-step ${l.lv === cur ? 'cur' : ''} ${p.pct === 100 ? 'done' : ''}" onclick="document.getElementById('lv-${l.lv}').scrollIntoView({behavior:'smooth'})"><span class="n">LV ${l.lv}${l.lv === cur ? ' · ตอนนี้' : ''}</span><b style="color:${l.color}">${l.cn}</b><span class="pb"><i style="width:${p.pct}%;background:${l.color}"></i></span></button>`; }).join('');
    $('#lvList').innerHTML = LV.map(l => {
      const p = lvProgress(l), an = lvAnimals(l), open = Z.state.open[l.lv] !== undefined ? Z.state.open[l.lv] : l.lv === cur;
      const food = an.reduce((s, a) => s + a.food, 0);
      return `<article class="lv ${open ? '' : 'closed'}" id="lv-${l.lv}" data-lv="${l.lv}" style="--lc:${l.color}">
        <div class="lv-h"><div class="seal">${l.cn.length > 2 ? l.cn.slice(0, 2) + '<br>' + l.cn.slice(2) : l.cn}</div><div class="t"><h3>เลเวล ${l.lv} · ${esc(l.th)}</h3><p>${esc(l.goal)}</p></div><div class="pct"><b>${p.pct}%</b><br><small>${p.done}/${p.total}</small></div></div>
        <div class="lv-b">
          <div class="lv-meta"><span class="meta"><b>ปลดล็อกเมื่อ</b> ${esc(l.gate)}</span><span class="meta"><b>เป้าหมาย</b> ${esc(l.target)}</span><span class="meta"><b>โซน</b> ${l.zones.map(z => ZONE[z].cn).join(' · ')}</span><span class="meta"><b>ค่าอาหารรวม</b> $${fmt(food)}/รอบ</span></div>
          <div class="lv-col"><h4><span class="cn" style="color:${l.color}">築</span>สิ่งที่ต้องสร้าง</h4>
            ${l.build.map((t, i) => `<label class="chk"><input type="checkbox" data-build="L${l.lv}-${i}" ${Z.state.build[`L${l.lv}-${i}`] ? 'checked' : ''}><span>${esc(t)}</span></label>`).join('')}
            <ul class="tips">${l.tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
            <div class="lv-act"><a class="btn btn-ghost" href="#map" onclick="setTimeout(()=>{const s=document.getElementById('lvFilter');s.value='${l.lv}';s.dispatchEvent(new Event('change'))},80)">ดูบนแผนที่</a></div></div>
          <div class="lv-col"><h4><span class="cn" style="color:${l.color}">獸</span>สัตว์ที่ซื้อ (${an.length}) · เรียงจากค่าอาหารถูกสุด</h4>
            <div class="ani-grid">${an.map(a => `<div class="ani ${Z.owned(a.slug) ? 'got' : ''}" data-open="${a.slug}">${asiaB(a)}<img src="${img(a.slug)}" alt=""><span>${esc(a.n)}</span><span class="fd">$${fmt(a.food)}</span><span class="zn">${esc(WHERE[a.slug].zone.cn)}</span></div>`).join('')}</div>
            <p class="fine" style="margin-top:8px">คลิกรูปเพื่อดูรายละเอียดและติ๊ก "มีแล้ว"</p></div>
        </div></article>`;
    }).join('');
  };

  /* =========================================================
     TEMPERATURE
     ========================================================= */
  const PRESETS = [['อบอุ่น (Temperate)', 2, 30], ['หนาว (Taiga)', -12, 22], ['ทุนดรา', -25, 12], ['ทุ่งหญ้า', 10, 36], ['ทะเลทราย', 4, 42], ['ป่าฝน', 20, 33]];
  INIT.temp = function () {
    $('#ambLo').value = Z.state.amb[0]; $('#ambHi').value = Z.state.amb[1];
    const upd = () => Z.setAmb(+$('#ambLo').value, +$('#ambHi').value);
    $('#ambLo').addEventListener('input', upd); $('#ambHi').addEventListener('input', upd);
    $('#ambPre').innerHTML = PRESETS.map(([n, lo, hi]) => `<button data-lo="${lo}" data-hi="${hi}">${n} ${lo}…${hi}°</button>`).join('');
    $('#ambPre').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; $('#ambLo').value = b.dataset.lo; $('#ambHi').value = b.dataset.hi; upd(); });
    // climate groups
    $('#climGroups').innerHTML = CLIM.map(cl => {
      const an = ALL.filter(a => Z.climOf(a) === cl);
      const live = an.filter(a => a.ty === 'L' || a.ty === 'F'), ctl = an.filter(a => a.ty === 'A' || a.ty === 'E');
      const zones = [...new Set(live.map(a => WHERE[a.slug].zone.cn))];
      return `<div class="cg" style="--cc:${cl.color}"><h3><span class="cn">${cl.cn}</span>${cl.th} <small class="muted" style="font-family:var(--f-body);font-weight:400;font-size:12.5px">${cl.range} · ${an.length} ชนิด</small></h3>
        <p>${esc(cl.tip)}${zones.length ? ' · อยู่โซน ' + zones.join(' ') : ''}</p>
        ${live.length ? `<div class="heads">${live.map(a => `<img src="${img(a.slug)}" alt="${esc(a.n)}" title="${esc(a.n)} ${a.lo}…${a.hi}°C" data-open="${a.slug}">`).join('')}</div>` : ''}
        ${ctl.length ? `<p style="margin-top:8px">ในตู้ (Aquarium / Exhibit):</p><div class="heads">${ctl.map(a => `<img src="${img(a.slug)}" alt="${esc(a.n)}" title="${esc(a.n)} ${a.lo}…${a.hi}°C" data-open="${a.slug}" style="width:30px;height:30px">`).join('')}</div>` : ''}</div>`;
    }).join('');
  };
  REFRESH.temp = function () {
    const [lo, hi] = Z.state.amb; const open = CAGES.filter(c => !c.controlled);
    const grp = { ok: [], heat: [], cool: [], both: [] };
    open.forEach(c => { const e = equip(c, lo, hi); grp[e.heat && e.cool ? 'both' : e.heat ? 'heat' : e.cool ? 'cool' : 'ok'].push([c, e]); });
    const li = ([c, e]) => `<li data-cage="${c.id}" style="cursor:pointer"><b>${esc(c.cn || c.sp[0].n)}</b> ${c.cn ? esc(c.th) : ''} <span class="muted">(${c.lo}…${c.hi}°)</span>${e.heat ? ` 🔥+${e.heat}°` : ''}${e.cool ? ` ❄−${e.cool}°` : ''}</li>`;
    const box = (k, ic, t, d) => `<div class="eq ${k}"><h4>${ic} ${t} <small class="muted">(${grp[k].length})</small></h4><p style="margin:0 0 6px;font-size:12.5px" class="muted">${d}</p><ul>${grp[k].sort((a, b) => (b[1].heat + b[1].cool) - (a[1].heat + a[1].cool)).map(li).join('') || '<li class="muted">ไม่มี</li>'}</ul></div>`;
    $('#ambSum').innerHTML = box('heat', '🔥', 'ต้อง Heater', 'หน้าหนาว/กลางคืนอากาศต่ำกว่าที่สัตว์รับได้') + box('cool', '❄', 'ต้อง Cooler', 'หน้าร้อนสูงเกินที่สัตว์รับได้') + box('both', '⚠', 'ต้องทั้งสองอย่าง', 'ช่วงแคบ ต้องคุมทั้งปี') + box('ok', '✓', 'อยู่ได้เลย', 'ไม่ต้องใช้อุปกรณ์');
    drawTempChart(lo, hi);
  };
  function drawTempChart(lo, hi) {
    const svg = $('#tempChart'); const rows = [];
    window.ZONES.forEach(z => { const cs = CAGES.filter(c => c.zone === z); rows.push({ z }); cs.forEach(c => rows.push({ c })); });
    const W = 1100, L = 300, R = 80, T = 30, rh = 22, H = T + rows.length * rh + 30, min = -30, max = 42;
    const x = v => L + (v - min) / (max - min) * (W - L - R);
    let s = `<rect x="${x(lo)}" y="${T - 14}" width="${x(hi) - x(lo)}" height="${H - T - 10}" fill="#f2c14e" opacity=".18"/><text x="${(x(lo) + x(hi)) / 2}" y="${T - 18}" text-anchor="middle" font-size="12" fill="#a8822e">อากาศแผนที่ ${lo}…${hi}°C</text>`;
    for (let v = -30; v <= 40; v += 10) s += `<line x1="${x(v)}" x2="${x(v)}" y1="${T - 10}" y2="${H - 24}" stroke="#d6c9a9" ${v === 0 ? 'stroke-width="1.6"' : 'stroke-dasharray="2 4"'}/><text x="${x(v)}" y="${H - 8}" text-anchor="middle" font-size="12" font-family="IBM Plex Mono" fill="#6b6252">${v}°</text>`;
    rows.forEach((r, i) => {
      const y = T + i * rh + rh / 2;
      if (r.z) { s += `<text x="8" y="${y + 6}" font-family="LXGW WenKai TC" font-weight="700" font-size="17" fill="#b8322a">${r.z.cn}</text><text x="92" y="${y + 5}" font-size="13" font-weight="600" fill="#2a251d">${esc(r.z.th)}</text><line x1="${L}" x2="${W - R}" y1="${y + 10}" y2="${y + 10}" stroke="#c2b28c"/>`; return; }
      const c = r.c, col = c.clim ? c.clim.color : '#2f6f8c';
      s += `<g data-cage="${c.id}" style="cursor:pointer"><text x="${L - 10}" y="${y + 4}" text-anchor="end" font-size="12.5" fill="#2a251d">${esc(c.cn ? c.cn + ' ' + c.th : c.sp[0].n)}</text>`;
      if (c.controlled) c.sp.forEach(a => (s += `<line x1="${x(a.lo)}" x2="${x(a.hi)}" y1="${y}" y2="${y}" stroke="${col}" stroke-width="3" opacity=".35"/>`));
      else s += `<rect x="${x(c.lo)}" y="${y - 7}" width="${Math.max(3, x(c.hi) - x(c.lo))}" height="14" rx="7" fill="${col}" opacity=".85"/>`;
      const e = equip(c, lo, hi); if (e && (e.heat || e.cool)) s += `<text x="${x(c.hi) + 8}" y="${y + 4}" font-size="11.5" fill="${e.heat ? '#b8322a' : '#2f6f8c'}">${e.heat ? '🔥+' + e.heat : ''}${e.cool ? ' ❄−' + e.cool : ''}</text>`;
      if (c.controlled) s += `<text x="${x(Math.max(...c.sp.map(a => a.hi))) + 8}" y="${y + 4}" font-size="11" fill="#6b6252">ตั้งในตู้</text>`;
      s += `</g>`;
    });
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.innerHTML = s;
  }

  /* =========================================================
     PAIR
     ========================================================= */
  let pairSel = [];
  INIT.pair = function () {
    const q = $('#pairQ'), sg = $('#pairSugg'); let act = 0;
    const list = () => { const v = q.value.trim().toLowerCase(); if (!v) return []; return ALL.filter(a => !pairSel.includes(a.slug) && (a.n.toLowerCase().includes(v) || (a.zh || '').includes(v))).slice(0, 10); };
    const draw = () => { const L = list(); sg.innerHTML = L.map((a, i) => `<div class="sg ${i === act ? 'act' : ''}" data-add="${a.slug}"><img src="${img(a.slug)}" alt="">${esc(a.n)} ${asiaB(a)}<small>${TYPE[a.ty]} · ${a.lo}…${a.hi}°C</small></div>`).join(''); };
    q.addEventListener('input', () => { act = 0; draw(); });
    q.addEventListener('keydown', e => { const L = list(); if (e.key === 'ArrowDown') { act = Math.min(L.length - 1, act + 1); draw(); e.preventDefault(); } if (e.key === 'ArrowUp') { act = Math.max(0, act - 1); draw(); e.preventDefault(); } if (e.key === 'Enter' && L[act]) { pairSel.push(L[act].slug); q.value = ''; draw(); renderPair(); } });
    document.addEventListener('click', e => { const a = e.target.closest('[data-add]'); if (a) { if (!pairSel.includes(a.dataset.add)) pairSel.push(a.dataset.add); q.value = ''; sg.innerHTML = ''; renderPair(); q.focus(); }
      const r = e.target.closest('[data-rm]'); if (r) { pairSel = pairSel.filter(s => s !== r.dataset.rm); renderPair(); } });
    if (!pairSel.length) pairSel = ['giant-panda', 'red-panda'];
  };
  REFRESH.pair = () => renderPair();
  function renderPair() {
    if (!inited.pair) return;
    $('#pairSel').innerHTML = pairSel.map(s => { const a = A[s]; return `<span class="pill"><img src="${img(s)}" alt="">${esc(a.n)}<button data-rm="${s}" aria-label="เอาออก">×</button></span>`; }).join('') || '<span class="muted">ยังไม่ได้เลือก</span>';
    const sp = pairSel.map(s => A[s]); let out = '';
    if (sp.length === 1) {
      const a = sp[0];
      const partners = ALL.filter(b => b !== a && rel(a, b) !== 'X').map(b => ({ b, r: rel(a, b), lo: Math.max(a.lo, b.lo), hi: Math.min(a.hi, b.hi) })).sort((x, y) => (x.r === 'T' ? 0 : 1) - (y.r === 'T' ? 0 : 1));
      out = `<div class="card" style="margin-top:14px"><h3 style="margin:0 0 8px;font-family:var(--f-head)">คู่ที่เป็นไปได้ของ ${esc(a.n)} (${partners.length})</h3>
        <div class="partner">${partners.map(p => `<span class="pill ${p.r === 'T' ? 'T' : ''}" data-add="${p.b.slug}" title="${p.lo}…${p.hi}°C" style="${p.r === 'T' ? 'border-color:var(--jade);background:#e6f2e8' : ''}"><img src="${img(p.b.slug)}" alt="">${esc(p.b.n)} <small class="muted">${p.r === 'T' ? 'Thriving' : 'Neutral'}${p.lo > p.hi ? ' · อุณหภูมิไม่ทับ' : ''}</small></span>`).join('') || '<span class="muted">ไม่มีสัตว์ที่อยู่ร่วมได้ → กรงเดี่ยว</span>'}</div><p class="fine">คลิกเพื่อเพิ่มเข้าการเช็ก</p></div>`;
    } else if (sp.length >= 2) {
      const lo = Math.max(...sp.map(a => a.lo)), hi = Math.min(...sp.map(a => a.hi));
      const tys = [...new Set(sp.map(a => a.ty))];
      const pairs = []; for (let i = 0; i < sp.length; i++) for (let j = i + 1; j < sp.length; j++) pairs.push([sp[i], sp[j], rel(sp[i], sp[j])]);
      const bad = pairs.filter(p => p[2] === 'X'), thr = pairs.filter(p => p[2] === 'T');
      const tyBad = tys.includes('E') ? 'Exhibit ไม่ใส่รวมกัน แต่ละตัวมีตู้ของตัวเอง' : (tys.includes('A') && tys.length > 1) ? 'สัตว์น้ำในตู้ปลาใส่รวมกับสัตว์บกไม่ได้' : '';
      const salSet = sp.filter(a => a.ty === 'A').map(a => a.sal); const salBad = salSet.length > 1 && !salSet.every(s => /Fresh|Any/i.test(s)) && !salSet.every(s => /Salt|Brack|Any/i.test(s));
      const biomeShared = sp.map(a => new Set(a.biomes)).reduce((acc, s) => new Set([...acc].filter(x => s.has(x))));
      const problems = [...bad.map(p => `${p[0].n} × ${p[1].n} ไม่อยู่ในรายชื่อ Thriving/Neutral`), lo > hi ? `ไม่มีช่วงอุณหภูมิที่ทุกตัวรับได้ (${lo} > ${hi}°C)` : '', tyBad, salBad ? 'น้ำจืดกับน้ำเค็มผสมกันไม่ได้' : ''].filter(Boolean);
      const ok = !problems.length;
      const sum = k => sp.reduce((s, a) => s + (a[k] || 0), 0);
      const verdict = ok ? `<div class="verdict ok"><span class="big">✓</span><div><b>อยู่กรงเดียวกันได้</b><br>${thr.length ? `Thriving ${thr.length} คู่ · ` : ''}ช่วงอุณหภูมิร่วม ${lo}…${hi}°C</div></div>` : `<div class="verdict bad"><span class="big">✕</span><div><b>ไม่ควรรวมกรง</b><ul style="margin:4px 0 0;padding-left:18px">${problems.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div></div>`;
      const mx = `<table class="rel-mx"><tr><th></th>${sp.map(a => `<th>${esc(a.n)}</th>`).join('')}</tr>${sp.map(a => `<tr><th>${esc(a.n)}</th>${sp.map(b => a === b ? '<td>—</td>' : (r => `<td class="r-${r}">${r === 'T' ? 'Thriving' : r === 'N' ? 'Neutral' : '✕'}</td>`)(rel(a, b))).join('')}</tr>`).join('')}</table>`;
      // temperature bars
      const W = 520, L = 150, x = v => L + (v + 30) / 72 * (W - L - 10); const rh = 24;
      let tb = `<svg class="tempbars" viewBox="0 0 ${W} ${sp.length * rh + 40}">`;
      if (lo <= hi) tb += `<rect x="${x(lo)}" y="4" width="${x(hi) - x(lo)}" height="${sp.length * rh + 8}" fill="#2f7d5d" opacity=".14"/>`;
      sp.forEach((a, i) => { const y = 12 + i * rh; const cl = Z.climOf(a); tb += `<text x="${L - 8}" y="${y + 11}" text-anchor="end" font-size="12">${esc(a.n)}</text><rect x="${x(a.lo)}" y="${y}" width="${x(a.hi) - x(a.lo)}" height="14" rx="7" fill="${cl.color}"/><text x="${x(a.lo) - 4}" y="${y + 11}" text-anchor="end" font-size="10.5" fill="#6b6252">${a.lo}</text><text x="${x(a.hi) + 4}" y="${y + 11}" font-size="10.5" fill="#6b6252">${a.hi}</text>`; });
      for (let v = -30; v <= 40; v += 10) tb += `<text x="${x(v)}" y="${sp.length * rh + 34}" text-anchor="middle" font-size="10.5" fill="#6b6252">${v}°</text>`;
      tb += '</svg>';
      const rows = [['อุณหภูมิร่วม', lo <= hi ? `${lo} ถึง ${hi}°C` : 'ไม่ทับกัน'], ['Biome ร่วม', biomeShared.size ? [...biomeShared].join(', ') : 'ไม่มี (ไม่บังคับ แต่ terrain จะยากขึ้น)'],
        sum('land') && ['พื้นที่ดินรวม', fmt(sum('land')) + ' m²'], sum('dw') && ['น้ำลึกรวม', fmt(sum('dw')) + ' m²'], sum('aq') && ['น้ำตื้นรวม', fmt(sum('aq')) + ' m²'],
        sum('fl') && ['พื้นที่บินรวม', fmt(sum('fl')) + ' m² · ต้องหลังคา Aviary'], sum('cl') && ['พื้นที่ปีนรวม', fmt(sum('cl')) + ' m²'],
        ['รั้ว', `Grade ${Math.max(...sp.map(a => a.g))} · สูง ${Math.max(...sp.map(a => a.h))} m`], ['ค่าอาหารรวม', `$${fmt(sum('food'))} ต่อรอบ`], ['แขกเดินผ่าน', sp.every(a => a.walk) ? 'ได้' : 'ไม่ได้']].filter(Boolean);
      out = verdict + `<div class="pair-grid"><div class="card"><h3 style="margin:0 0 6px;font-family:var(--f-head);font-size:16px">ความสัมพันธ์</h3><div style="overflow-x:auto">${mx}</div><h3 style="margin:12px 0 6px;font-family:var(--f-head);font-size:16px">อุณหภูมิ</h3>${tb}</div>
        <div class="card"><h3 style="margin:0 0 6px;font-family:var(--f-head);font-size:16px">ความต้องการรวม (ขั้นต่ำ)</h3><dl class="spec">${rows.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('')}</dl>
        <p class="fine">อยู่ในแผนตอนนี้: ${sp.map(a => `${esc(a.n)} → ${esc(WHERE[a.slug].zone.cn)} ${esc(WHERE[a.slug].cn || '')}`).join(' · ')}</p></div></div>`;
    }
    $('#pairOut').innerHTML = out;
  }

  /* =========================================================
     ROUTE
     ========================================================= */
  INIT.route = function () {
    const M = window.ZooMap, R = M.ZR;
    let s = `<rect width="${M.W}" height="${M.H}" fill="#efe4c9"/>`;
    s += `<path d="${M.superellipse(M.LAKE, 4, 120)}" fill="#a9d3df" stroke="#4f7f92" stroke-width="5"/>`;
    s += `<path d="${M.superellipse(M.RING, 4, 140)}" fill="none" stroke="#c9ad74" stroke-width="30"/>`;
    window.ZONES.forEach(z => { const r = R[z.id]; s += `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="60" fill="${z.id === 'palace' ? '#f6e2d0' : z.fill}" stroke="${z.id === 'palace' ? '#9b2a22' : z.ink}" stroke-width="6"/><text x="${r.x + r.w / 2}" y="${r.y + r.h / 2 + (z.id === 'palace' ? -40 : 0)}" text-anchor="middle" font-family="LXGW WenKai TC" font-weight="700" font-size="${z.id === 'palace' ? 90 : 96}" fill="${z.ink}" opacity=".55">${z.cn}</text>`; });
    s += `<rect x="1580" y="1500" width="120" height="440" fill="#c9ad74"/><circle cx="1640" cy="1505" r="80" fill="#ead8aa" stroke="#a88d5c" stroke-width="6"/>`;
    s += M.routeLayer();
    $('#routeMap').setAttribute('viewBox', `0 0 ${M.W} ${M.H}`); $('#routeMap').innerHTML = s;
    $('#routeList').innerHTML = window.ROUTE.map(r => `<li data-at="${r.at}"><span class="num">${r.n}</span><div><b><span class="cn">${r.cn}</span>${esc(r.th)}</b><small>${esc(r.note)}</small><small>เปิดเส้นทางช่วงนี้ใน <b style="color:${Z.LVC(r.lv)}">Lv${r.lv}</b></small></div></li>`).join('');
    const hl = at => { $$('#routeList li').forEach(li => li.classList.toggle('on', li.dataset.at === at)); $$('#routeMap .stop circle').forEach(c => c.setAttribute('r', c.parentNode.dataset.at === at ? 44 : 30)); };
    $('#routeList').addEventListener('mouseover', e => { const li = e.target.closest('li'); if (li) hl(li.dataset.at); });
    $('#routeMap').addEventListener('mouseover', e => { const st = e.target.closest('.stop'); if (st) hl(st.dataset.at); });
    $('#routeList').addEventListener('click', e => { const li = e.target.closest('li'); if (!li) return; const p = M.STOP[li.dataset.at]; location.hash = '#map'; setTimeout(() => { $('#lyRoute').checked = true; mapState(); M.zoomTo(p[0], p[1], 1500); }, 60); });
    const PS = [
      [1, 'ประตู → ลานประตูจันทร์ → ครึ่งตะวันตกของวงแหวน → ทางแยกเข้าหุบไผ่ และทางแยกลงป่าฝนนานาชาติ'],
      [2, 'ครึ่งตะวันออกของวงแหวน → ทางแยกเข้าทุ่งหญ้า · ทางเลียบริมทะเลสาบหน้าลาน'],
      [3, 'ปิดวงแหวนให้ครบ · ทางแยกเข้าชุ่มน้ำ (ทางไม้ยกสูงเหนือแม่น้ำ)'],
      [4, 'ทางขึ้นเหนือฝั่งตะวันออก → เส้นทางสายไหม · สะพานรุ้งข้ามแม่น้ำ'],
      [5, 'ทางจากลานลงตะวันออกเฉียงใต้ → ป่าฝนหนานหยาง'],
      [6, 'สะพานโค้งจากวงแหวนใต้เข้าวังมังกร · ทางพนักงานใต้ดินหลังวัง'],
      [7, 'ทางซิกแซกขึ้นยอดเขาหิมะ + จุดชมวิว'],
    ];
    $('#pathSteps').innerHTML = PS.map(([lv, t]) => `<div class="ps" style="--lc:${Z.LVC(lv)}"><b style="color:${Z.LVC(lv)}">Lv${lv} ${LV[lv - 1].cn}</b>${esc(t)}</div>`).join('');
    $('#pathNotes').innerHTML = [
      ['วงแหวนเดียว ไม่มีทางตัน', 'แขกเดินวนครบทุกโซนโดยไม่ย้อนทาง ลดคนกระจุก ทางแยกเข้าโซนทำเป็นวงย่อยแล้วกลับมาที่วงแหวน'],
      ['ลานกลางทุก ๆ ~120 m', 'ห้องน้ำ ร้านน้ำ ม้านั่ง ถังขยะ ที่ลานประตูจันทร์ และลานย่อยหน้าแต่ละโซน'],
      ['ทางพนักงานแยกจากแขก', 'วิ่งรอบนอกสวน (เส้นประเทาบนแผนที่) ซ่อนด้วยกำแพง แนวไผ่ หรือใต้ดิน กลับ keeper hut ได้เร็ว'],
      ['สัตว์ใหญ่อยู่ปลายทางแยก', 'สิงโต เสือ ช้าง แพนด้า ไว้ปลายทางแยก แขกหยุดดูนานไม่ขวางวงแหวน'],
      ['ทางยกสูงในทุ่งหญ้า', 'มองข้ามฝูงสัตว์โดยไม่ต้องตัดกรง ทำให้กรงรวมใหญ่ได้เต็มที่'],
      ['Donation + Education ที่จุดหยุด', 'วางคู่กันที่หน้าต่างชมสัตว์ทุกจุดที่แขกหยุด'],
    ].map(([b, t]) => `<div class="note"><b>${b}</b><span>${t}</span></div>`).join('');
  };

  /* =========================================================
     REGISTER
     ========================================================= */
  INIT.reg = function () {
    window.ZONES.forEach(z => $('#regZone').insertAdjacentHTML('beforeend', `<option value="${z.id}">${z.cn} ${z.th}</option>`));
    CLIM.forEach(c => $('#regClim').insertAdjacentHTML('beforeend', `<option value="${c.id}">${c.cn} ${c.th}</option>`));
    LV.forEach(l => $('#regLv').insertAdjacentHTML('beforeend', `<option value="${l.lv}">Lv${l.lv} ${l.cn}</option>`));
    ['#regQ', '#regZone', '#regType', '#regClim', '#regLv', '#regOwn', '#regAsia'].forEach(s => $(s).addEventListener('input', REFRESH.reg));
  };
  REFRESH.reg = function () {
    const q = $('#regQ').value.trim().toLowerCase(), zf = $('#regZone').value, tf = $('#regType').value, cf = $('#regClim').value, lf = $('#regLv').value, of = $('#regOwn').value, af = $('#regAsia').checked;
    const list = ALL.filter(a => (!q || a.n.toLowerCase().includes(q) || (a.zh || '').includes(q)) && (!zf || WHERE[a.slug].zone.id === zf) && (!tf || a.ty === tf) && (!cf || Z.climOf(a).id === cf) && (!lf || Z.levelOf(a.slug) === +lf) && (of === '' || Z.owned(a.slug) === (of === '1')) && (!af || a.asia));
    $('#regLede').textContent = `แสดง ${list.length} จาก ${ALL.length} ชนิด · คลิกการ์ดเพื่อดูรายละเอียดเต็ม`;
    $('#regGrid').innerHTML = list.map(a => { const c = WHERE[a.slug], cl = Z.climOf(a);
      return `<div class="rc ${Z.owned(a.slug) ? 'got' : ''}" data-open="${a.slug}"><img src="${img(a.slug)}" alt="" loading="lazy"><div class="i"><b>${esc(a.n)} ${asiaB(a)}</b><span class="zh">${esc(a.zh || '')}</span><small>${esc(c.zone.cn)} · ${esc(c.cn ? c.th : 'กรงเดี่ยว')}</small>
        <div class="chips">${ticon(a.ty)}<span class="chip fill" style="background:${cl.color}">${a.lo}…${a.hi}°</span><span class="chip fill" style="background:${Z.LVC(Z.levelOf(a.slug))}">Lv${Z.levelOf(a.slug)}</span><span class="chip">$${fmt(a.food)}</span></div></div>${ownBox(a.slug)}</div>`; }).join('');
  };

  /* =========================================================
     TOOLS + SAVE
     ========================================================= */
  INIT.tools = function () {
    $('#toolsBox').addEventListener('change', e => { const t = e.target.closest('[data-tool]'); if (t) Z.setTool(t.dataset.tool, t.checked); });
    $('#saveExport').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(Z.state, null, 1)], { type: 'application/json' })); a.download = 'jade-valley-zoo-progress.json'; a.click(); };
    $('#saveImport').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { Z.replaceState(JSON.parse(await f.text())); alert('นำเข้าแล้ว'); } catch (err) { alert('ไฟล์ไม่ถูกต้อง'); } };
    $('#saveReset').onclick = () => { if (confirm('ล้างความคืบหน้าทั้งหมด (สัตว์ที่มี สิ่งที่สร้าง เครื่องมือ)?')) Z.replaceState({}); };
  };
  REFRESH.tools = function () {
    $('#toolsBox').innerHTML = window.TOOLS.map((g, gi) => `<div class="card tool-group"><h3><span class="cn">${g.cn}</span>${esc(g.h)}</h3>${g.items.map((t, ti) => { const k = `t${gi}-${ti}`; return `<label class="chk"><input type="checkbox" data-tool="${k}" ${Z.state.tools[k] ? 'checked' : ''}><span><b>${esc(t[0])}</b><br><small class="muted">${esc(t[1])}</small></span></label>`; }).join('')}</div>`).join('');
    const n = Object.keys(Z.state.tools).length, all = window.TOOLS.reduce((s, g) => s + g.items.length, 0);
    $('#toolProg').textContent = `ติ๊กแล้ว ${n} จาก ${all}`;
  };

  topProg(); show();
})();
