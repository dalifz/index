/* Illustrated ink-and-watercolour park map (SVG, 3200×2000 = 16:10). */
(function () {
  const { A, CAGES, TYPE_CN, esc, img } = window.Z;
  const W = 3200, H = 2000;
  const NS = 'http://www.w3.org/2000/svg';
  const FONT_CN = "'LXGW WenKai TC','Kaiti TC',KaiTi,serif";
  const FONT_TH = "'Noto Sans Thai','Leelawadee UI',sans-serif";
  const FONT_TH_HEAD = "'Noto Serif Thai',Georgia,serif";
  const TC = { L: '#3f7a5e', F: '#b0862c', A: '#2f6f8c', E: '#7b4f8a' };

  /* ---------- seeded random ---------- */
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  /* ---------- geometry ---------- */
  const ZR = {
    snow: { x: 50, y: 170, w: 900, h: 440 },
    silk: { x: 2250, y: 170, w: 880, h: 440 },
    bamboo: { x: 40, y: 660, w: 860, h: 600 },
    savannah: { x: 2300, y: 650, w: 830, h: 820 },
    river: { x: 40, y: 1310, w: 690, h: 600 },
    world: { x: 760, y: 1500, w: 830, h: 440 },
    asia: { x: 1750, y: 1500, w: 1380, h: 440 },
    palace: { x: 1104, y: 548, w: 992, h: 612 }, // the building; courtyard handled separately
  };
  const RING = { cx: 1600, cy: 960, a: 680, b: 490 };
  const LAKE = { cx: 1600, cy: 960, a: 630, b: 440 };
  const PLAZA = { x: 1670, y: 1500 }, GATE = { x: 1670, y: 1935 };
  const COURT = { x: 1150, y: 1170, w: 900, h: 208 };

  function superellipse(e, n = 4, steps = 160, jitter = 0, seed = 1) {
    const r = rng(seed); const pts = [];
    for (let i = 0; i < steps; i++) {
      const t = i / steps * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
      const k = 1 + (jitter ? (r() - .5) * jitter : 0);
      pts.push([e.cx + e.a * k * Math.sign(c) * Math.pow(Math.abs(c), 2 / n), e.cy + e.b * k * Math.sign(s) * Math.pow(Math.abs(s), 2 / n)]);
    }
    return 'M' + pts.map(p => p.map(v => v.toFixed(1)).join(' ')).join('L') + 'Z';
  }
  function inSE(e, x, y, k = 1) { return Math.pow(Math.abs((x - e.cx) / (e.a * k)), 4) + Math.pow(Math.abs((y - e.cy) / (e.b * k)), 4) <= 1; }
  function ringPoint(deg) { const t = deg * Math.PI / 180, c = Math.cos(t), s = Math.sin(t); return [RING.cx + RING.a * Math.sign(c) * Math.pow(Math.abs(c), .5), RING.cy + RING.b * Math.sign(s) * Math.pow(Math.abs(s), .5)]; }
  function blobPath(r, seed, rad = 70, wob = 14) {
    // rounded rectangle with hand-drawn wobble
    const R = rng(seed), pts = [], x0 = r.x, y0 = r.y, x1 = r.x + r.w, y1 = r.y + r.h;
    const edge = (ax, ay, bx, by) => { const n = Math.max(3, Math.round(Math.hypot(bx - ax, by - ay) / 60)); for (let i = 0; i < n; i++) { const t = i / n; pts.push([ax + (bx - ax) * t + (R() - .5) * wob, ay + (by - ay) * t + (R() - .5) * wob]); } };
    const arc = (cx, cy, a0) => { for (let i = 0; i < 4; i++) { const t = (a0 + i * 22.5) * Math.PI / 180; pts.push([cx + Math.cos(t) * rad + (R() - .5) * wob, cy + Math.sin(t) * rad + (R() - .5) * wob]); } };
    edge(x0 + rad, y0, x1 - rad, y0); arc(x1 - rad, y0 + rad, -90);
    edge(x1, y0 + rad, x1, y1 - rad); arc(x1 - rad, y1 - rad, 0);
    edge(x1 - rad, y1, x0 + rad, y1); arc(x0 + rad, y1 - rad, 90);
    edge(x0, y1 - rad, x0, y0 + rad); arc(x0 + rad, y0 + rad, 180);
    return smooth(pts, true);
  }
  function smooth(pts, closed) {
    // Catmull-Rom → cubic Bézier
    const n = pts.length; let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
    const P = i => closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))];
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += `C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
    }
    return d + (closed ? 'Z' : '');
  }

  /* ---------- cage sizing & packing ---------- */
  function cell(c) { return c.zone.id === 'palace' && !c.outside ? { w: 76, h: 94 } : { w: 84, h: 106 }; }
  function colsFor(c) {
    const n = c.m.length;
    if (c.zone.id === 'palace' && !c.outside) return n >= 13 ? 7 : n >= 11 ? 6 : n >= 4 ? 2 : n;
    if (n <= 5) return n;
    if (n <= 8) return 4;
    return 5;
  }
  function sizeCage(c) {
    const ce = cell(c), cols = colsFor(c), rows = Math.ceil(c.m.length / cols);
    const head = c.cn ? 46 : 26, roof = c.ex ? 30 : 0, pad = 10;
    const minW = c.cn ? Math.max(c.cn.length * 21 + (c.star ? 22 : 0) + 84, c.th.length * 6.3 + 20) : 0;
    c.cols = cols; c.cell = ce; c.head = head; c.roof = roof;
    c.w = Math.max(cols * ce.w + pad * 2, Math.min(minW, 360)); c.h = roof + head + rows * ce.h + pad;
  }
  function pack(items, rect, gap = 14) {
    const placed = [];
    const fits = (x, y, it) => x + it.w <= rect.x + rect.w + .5 && y + it.h <= rect.y + rect.h + .5 &&
      !placed.some(p => x < p.x + p.w + gap && x + it.w + gap > p.x && y < p.y + p.h + gap && y + it.h + gap > p.y);
    for (const it of items) {
      const cand = [[rect.x, rect.y]];
      placed.forEach(p => { cand.push([p.x + p.w + gap, p.y]); cand.push([p.x, p.y + p.h + gap]); cand.push([rect.x, p.y + p.h + gap]); });
      cand.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
      const ok = cand.find(([x, y]) => fits(x, y, it));
      if (!ok) { console.warn('no room for', it.id, it.title); it.x = rect.x; it.y = rect.y + rect.h + 20; }
      else { it.x = ok[0]; it.y = ok[1]; }
      placed.push(it);
    }
    return placed;
  }

  function placePalace(list, ix, iy) {
    const g = 12, by = n => list.find(c => c.cn === n), singles = list.filter(c => !c.cn);
    const shark = by('鯊魚灣'), river = by('南洋河'), coral = by('珊瑚宮'), outer = by('外洋');
    shark.x = ix; shark.y = iy; river.x = ix + shark.w + g; river.y = iy;
    coral.x = ix; coral.y = iy + shark.h + g; outer.x = ix + coral.w + g; outer.y = coral.y;
    const sx = river.x + river.w + g;
    singles.forEach((c, i) => { c.x = sx + (i % 2) * (c.w + g); c.y = iy + Math.floor(i / 2) * (c.h + g); });
  }
  function layout() {
    CAGES.forEach(sizeCage);
    const byZone = {};
    CAGES.forEach(c => (byZone[c.zone.id] = byZone[c.zone.id] || []).push(c));
    for (const zid in byZone) {
      const r = ZR[zid];
      if (zid === 'palace') {
        const inner = byZone[zid].filter(c => !c.outside), out = byZone[zid].filter(c => c.outside);
        placePalace(inner, r.x + 20, r.y + 104);
        pack(out, { x: COURT.x + 10, y: COURT.y + 8, w: COURT.w - 20, h: COURT.h - 8 }, 18);
        continue;
      }
      const list = byZone[zid].slice().sort((a, b) => b.w * b.h - a.w * a.h);
      pack(list, { x: r.x + 26, y: r.y + 90, w: r.w - 52, h: r.h - 100 }, 14);
    }
  }

  /* ---------- drawing helpers ---------- */
  const g = (inner, attrs = '') => `<g ${attrs}>${inner}</g>`;
  function wrapName(n, max = 12) {
    const words = n.split(' '); const lines = [''];
    for (const w of words) { const cur = lines[lines.length - 1]; if ((cur + ' ' + w).trim().length > max && cur) lines.push(w); else lines[lines.length - 1] = (cur + ' ' + w).trim(); }
    if (lines.length > 3) { lines[2] = lines.slice(2).join(' '); lines.length = 3; }
    return lines;
  }
  function token(a, x, y, r, small) {
    const lines = wrapName(a.n, small ? 11 : 12);
    const fs = small ? 10.5 : 11.5;
    const seal = a.asia ? `<g transform="translate(${x + r * .72} ${y - r * .78}) rotate(6)"><rect x="-9" y="-9" width="18" height="18" rx="2.5" fill="#b8322a" stroke="#fff" stroke-width="1.5"/><text x="0" y="4.5" text-anchor="middle" font-family="${FONT_CN}" font-weight="700" font-size="12" fill="#fff">亞</text></g>` : '';
    const isNew = a.slug === 'galapagos-giant-tortoise' ? `<g transform="translate(${x - r * .9} ${y - r * .8})"><rect x="-16" y="-9" width="32" height="16" rx="8" fill="#d9533f"/><text x="0" y="3.5" text-anchor="middle" font-family="${FONT_TH}" font-size="10" font-weight="700" fill="#fff">ใหม่</text></g>` : '';
    return `<g class="tok" data-s="${a.slug}" data-lv="${window.LEVEL_OF[a.slug]}">
      <circle class="tok-halo" cx="${x}" cy="${y}" r="${r + 9}" fill="none" stroke="#f2c14e" stroke-width="7" opacity="0"/>
      <circle cx="${x}" cy="${y + 2}" r="${r + 1}" fill="rgba(60,40,20,.18)"/>
      <circle cx="${x}" cy="${y}" r="${r}" fill="#fffdf6"/>
      ${tokenImg(a, x, y, r)}
      <circle class="tok-ring" cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${TC[a.ty]}" stroke-width="2.6"/>
      ${seal}${isNew}
      ${lines.map((l, i) => `<text x="${x}" y="${y + r + 15 + i * (fs + 1.5)}" text-anchor="middle" font-family="${FONT_TH}" font-size="${fs}" font-weight="500" fill="#2a251d" paint-order="stroke" stroke="#fffaf0" stroke-width="3">${esc(l)}</text>`).join('')}
    </g>`;
  }
  // headshots are already circular cut-outs with transparent corners
  function tokenImg(a, x, y, r) { return `<image href="${img(a.slug)}" x="${x - r}" y="${y - r}" width="${r * 2}" height="${r * 2}"/>`; }

  function typeIcon(k, x, y) {
    return `<g transform="translate(${x} ${y})"><circle r="12" fill="${TC[k]}" stroke="#fffaf0" stroke-width="1.5"/><text y="4.5" text-anchor="middle" font-family="${FONT_CN}" font-weight="700" font-size="13" fill="#fff">${TYPE_CN[k]}</text></g>`;
  }

  function drawCage(c) {
    const { x, y, w, h, roof, head } = c;
    const by = y + roof, bh = h - roof;
    let box = '';
    if (c.ex) {
      // exhibit house: curved Chinese roof over a hall
      const rx0 = x - 10, rx1 = x + w + 10;
      box += `<path d="M${rx0} ${by + 4} Q${x + w * .08} ${by - 6} ${x + w * .16} ${y + 8} L${x + w * .84} ${y + 8} Q${x + w * .92} ${by - 6} ${rx1} ${by + 4} L${x + w - 4} ${by + 2} L${x + 4} ${by + 2} Z" fill="#5b3a66" stroke="#3b2344" stroke-width="2"/>
        <path d="M${x + w * .16} ${y + 8} L${x + w * .84} ${y + 8}" stroke="#d4ad55" stroke-width="3"/>
        <circle cx="${x + w * .16}" cy="${y + 7}" r="3.5" fill="#d4ad55"/><circle cx="${x + w * .84}" cy="${y + 7}" r="3.5" fill="#d4ad55"/>`;
      box += `<rect class="cage-box" x="${x}" y="${by}" width="${w}" height="${bh}" rx="6" fill="#f7eef6" stroke="#7b4f8a" stroke-width="3"/>`;
      box += `<rect x="${x + 4}" y="${by + 4}" width="${w - 8}" height="${bh - 8}" rx="4" fill="none" stroke="#7b4f8a" stroke-opacity=".35" stroke-width="1"/>`;
    } else if (c.kind === 'A') {
      const sw = c.mixed ? 5 : 3;
      box += `<rect class="cage-box" x="${x}" y="${by}" width="${w}" height="${bh}" rx="8" fill="url(#tank)" stroke="${c.mixed ? '#2f7d5d' : '#2f6f8c'}" stroke-width="${sw}"/>
        <path d="M${x + 6} ${by + head - 2} q 12 -6 24 0 t 24 0 t 24 0 t 24 0 t 24 0 t 24 0 t 24 0 t 24 0 t 24 0 t 24 0 t 24 0 t 24 0 t 24 0 t 24 0 t 24 0 t 24 0 t 24 0 t 24 0 t 24 0 t 24 0 t 24 0 t 24 0 t 24 0 t 24 0" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="2" clip-path="url(#clip-${c.id})"/>
        <clipPath id="clip-${c.id}"><rect x="${x}" y="${by}" width="${w}" height="${bh}" rx="8"/></clipPath>
        <g clip-path="url(#clip-${c.id})" opacity=".55">${seaweed(x, by + bh, w, c.id)}</g>
        <rect x="${x + 5}" y="${by + 5}" width="10" height="${bh - 10}" rx="5" fill="#fff" opacity=".22"/>`;
      if (c.big) box += `<path d="M${x + 14} ${by + bh - 8} q ${w / 2 - 14} -40 ${w - 28} 0" fill="none" stroke="#fffaf0" stroke-width="7" stroke-opacity=".55" stroke-dasharray="2 9" stroke-linecap="round"/>`;
    } else {
      const mixed = c.mixed, avi = c.kind === 'F';
      const stroke = mixed ? '#2f7d5d' : '#5a5040';
      box += `<rect class="cage-box" x="${x}" y="${by}" width="${w}" height="${bh}" rx="10" fill="#fffaf0" fill-opacity=".93" stroke="${stroke}" stroke-width="${mixed ? 5.5 : 1.8}"/>`;
      if (avi) box += `<rect x="${x + (mixed ? 6 : 4)}" y="${by + (mixed ? 6 : 4)}" width="${w - (mixed ? 12 : 8)}" height="${bh - (mixed ? 12 : 8)}" rx="7" fill="url(#mesh)" stroke="#b0862c" stroke-width="2" stroke-dasharray="6 4"/>`;
      if (c.star) box += `<rect x="${x - 6}" y="${by - 6}" width="${w + 12}" height="${bh + 12}" rx="14" fill="none" stroke="#b8322a" stroke-width="3" stroke-dasharray="1 0"/>`;
    }
    // header
    let hd = typeIcon(c.kind, x + 18, by + 17);
    if (c.cn) {
      hd += `<text x="${x + 36}" y="${by + 25}" font-family="${FONT_CN}" font-weight="700" font-size="21" fill="${c.ex ? '#5b3a66' : '#b8322a'}">${esc(c.cn)}${c.star ? ' ★' : ''}</text>`;
      hd += `<text x="${x + 10}" y="${by + 41}" font-family="${FONT_TH}" font-size="11.5" fill="#6b6252">${esc(c.th)}</text>`;
    }
    const lvC = window.Z.LVC(c.lv);
    hd += `<g class="lvb" transform="translate(${x + w - 20} ${by + 15})"><rect x="-16" y="-9" width="32" height="18" rx="9" fill="${lvC}" stroke="#fffaf0" stroke-width="1.5"/><text y="4" text-anchor="middle" font-family="'IBM Plex Mono',monospace" font-size="10.5" font-weight="600" fill="#fff">Lv${c.lv}</text></g>`;
    // tokens
    const ce = c.cell, r = ce.w <= 80 ? 27 : 31;
    let toks = '';
    c.sp.forEach((a, i) => {
      const col = i % c.cols, row = Math.floor(i / c.cols);
      const rowCount = Math.min(c.cols, c.sp.length - row * c.cols);
      const offset = (c.w - rowCount * ce.w) / 2;
      const cx = x + offset + col * ce.w + ce.w / 2, cy = by + head + row * ce.h + r + 2;
      toks += token(a, cx, cy, r, ce.w <= 80);
    });
    return `<g class="cage" data-c="${c.id}" data-k="${c.kind}">${box}${hd}${toks}</g>`;
  }
  function seaweed(x, yb, w, seed) {
    const R = rng(String(seed).split('').reduce((s, ch) => s + ch.charCodeAt(0), 0)); let s = '';
    for (let i = 0; i < w / 26; i++) { const sx = x + 10 + i * 26 + R() * 10, hh = 18 + R() * 26; s += `<path d="M${sx} ${yb} q ${-6 + R() * 12} ${-hh / 2} 0 ${-hh}" stroke="${R() > .5 ? '#3f8a6a' : '#6aa36f'}" stroke-width="4" fill="none" stroke-linecap="round"/>`; }
    for (let i = 0; i < w / 60; i++) s += `<ellipse cx="${x + 20 + i * 60 + R() * 30}" cy="${yb - 3}" rx="${10 + R() * 10}" ry="6" fill="#e9d7a8"/>`;
    return s;
  }

  /* ---------- scenery glyphs ---------- */
  const TREE = {
    pine: (x, y, s, R) => `<g transform="translate(${x} ${y}) scale(${s})"><rect x="-2" y="-6" width="4" height="12" fill="#5b4632"/><path d="M0 -46 L13 -22 L7 -22 L18 -4 L-18 -4 L-7 -22 L-13 -22Z" fill="${R() > .5 ? '#2f5a46' : '#3c6b4f'}" stroke="#1f3a2d" stroke-width="1.2" stroke-linejoin="round"/><path d="M0 -46 L-4 -36" stroke="#fff" stroke-width="2" opacity=".6"/></g>`,
    snowpine: (x, y, s, R) => `<g transform="translate(${x} ${y}) scale(${s})"><rect x="-2" y="-6" width="4" height="12" fill="#5b4632"/><path d="M0 -46 L13 -22 L7 -22 L18 -4 L-18 -4 L-7 -22 L-13 -22Z" fill="#2f5a56" stroke="#1f3a3d" stroke-width="1.2" stroke-linejoin="round"/><path d="M0 -46 L6 -34 L-6 -34Z M-7 -22 L7 -22 L4 -18 L-4 -18Z" fill="#fff"/></g>`,
    bamboo: (x, y, s, R) => { let o = ''; for (let i = 0; i < 4; i++) { const dx = -9 + i * 6 + R() * 3, hh = 44 + R() * 22; o += `<path d="M${dx} 0 L${dx + 2} ${-hh}" stroke="${i % 2 ? '#5f9a52' : '#4a8443'}" stroke-width="3.2"/><path d="M${dx + 1} ${-hh * .45} l 10 -6 M${dx + 2} ${-hh * .75} l -10 -5 M${dx + 2} ${-hh} l 9 -5" stroke="#6aa85b" stroke-width="2.2" stroke-linecap="round"/>`; } return `<g transform="translate(${x} ${y}) scale(${s})">${o}</g>`; },
    acacia: (x, y, s, R) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 0 L1 -20 L-8 -30 M1 -20 L9 -31" stroke="#6b4e30" stroke-width="3" fill="none"/><ellipse cx="0" cy="-34" rx="26" ry="7" fill="#7f9a3c" stroke="#4f6526" stroke-width="1.2"/><ellipse cx="-6" cy="-37" rx="14" ry="4" fill="#9cb558"/></g>`,
    round: (x, y, s, R) => `<g transform="translate(${x} ${y}) scale(${s})"><rect x="-2" y="-12" width="4" height="12" fill="#5b4632"/><circle cy="-24" r="15" fill="${['#5d8d4a', '#6f9c52', '#4f7f43'][Math.floor(R() * 3)]}" stroke="#2f5030" stroke-width="1.2"/><circle cx="-5" cy="-29" r="5" fill="#fff" opacity=".18"/></g>`,
    palm: (x, y, s, R) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 0 Q4 -20 0 -40" stroke="#6b4e30" stroke-width="3.5" fill="none"/>${[-150, -110, -70, -30, 10].map(a => `<path d="M0 -40 q ${Math.cos(a * Math.PI / 180) * 14} ${Math.sin(a * Math.PI / 180) * 14 - 6} ${Math.cos(a * Math.PI / 180) * 26} ${Math.sin(a * Math.PI / 180) * 18 + 6}" stroke="#3f8a4a" stroke-width="5" fill="none" stroke-linecap="round"/>`).join('')}</g>`,
    jungle: (x, y, s, R) => `<g transform="translate(${x} ${y}) scale(${s})"><rect x="-3" y="-14" width="6" height="14" fill="#5b4632"/><circle cx="-10" cy="-24" r="12" fill="#3f7a3a"/><circle cx="10" cy="-26" r="13" fill="#4d8a3f"/><circle cx="0" cy="-36" r="14" fill="#5c9a46" stroke="#2c5a2a" stroke-width="1"/></g>`,
    reed: (x, y, s, R) => `<g transform="translate(${x} ${y}) scale(${s})" stroke="#6f8a3a" stroke-width="2" stroke-linecap="round"><path d="M0 0 L-4 -26 M4 0 L6 -30 M-2 0 L-10 -20 M2 0 L12 -22"/><path d="M6 -30 l0 -8" stroke="#8a5a2a" stroke-width="4"/></g>`,
    lotus: (x, y, s, R) => `<g transform="translate(${x} ${y}) scale(${s})"><ellipse rx="13" ry="6" fill="#5f9a52"/><path d="M-4 -4 Q0 -14 4 -4 Q8 -10 6 -2 Q0 0 -6 -2 Q-8 -10 -4 -4Z" fill="#f2a0b0" stroke="#c96a80" stroke-width=".8"/></g>`,
    rock: (x, y, s, R) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M-14 0 L-10 -12 L-2 -16 L8 -11 L14 0Z" fill="#9b968a" stroke="#5e5a50" stroke-width="1.2"/><path d="M-2 -16 L0 -6" stroke="#5e5a50" stroke-width="1"/></g>`,
    dune: (x, y, s, R) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M-30 0 Q-10 -16 6 -6 Q16 -12 30 0Z" fill="#e2c27e" stroke="#b6914a" stroke-width="1"/></g>`,
    cactus: (x, y, s, R) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 0 L0 -28 M0 -16 Q-9 -16 -9 -24 M0 -20 Q8 -20 8 -27" stroke="#6b8a3a" stroke-width="5" stroke-linecap="round" fill="none"/></g>`,
  };
  const ZONE_TREES = {
    snow: ['snowpine', 'snowpine', 'pine', 'rock'], silk: ['dune', 'rock', 'cactus', 'dune'], bamboo: ['bamboo', 'bamboo', 'round', 'bamboo'],
    savannah: ['acacia', 'acacia', 'rock', 'acacia'], river: ['reed', 'lotus', 'reed', 'round'], world: ['palm', 'jungle', 'jungle', 'palm'], asia: ['jungle', 'palm', 'jungle', 'bamboo'],
  };

  const LAND = {
    pagoda: (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})"><rect x="-10" y="-14" width="20" height="14" fill="#b8322a"/>${[0, 1, 2, 3].map(i => `<path d="M${-24 + i * 4} ${-14 - i * 16} Q0 ${-22 - i * 16} ${24 - i * 4} ${-14 - i * 16} L${16 - i * 4} ${-10 - i * 16} L${-16 + i * 4} ${-10 - i * 16}Z" fill="#3a2a1e"/><rect x="${-8 + i * 1.5}" y="${-28 - i * 16}" width="${16 - i * 3}" height="14" fill="#c4473a"/>`).join('')}<path d="M0 -78 L0 -92" stroke="#d4ad55" stroke-width="3"/></g>`,
    temple: (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})"><rect x="-30" y="-26" width="60" height="26" fill="#f4efe4" stroke="#6b6252"/><rect x="-30" y="-32" width="60" height="7" fill="#9b2a22"/><rect x="-8" y="-14" width="16" height="14" fill="#9b2a22"/><path d="M-22 -32 L-22 -46 L22 -46 L22 -32" fill="#f4efe4" stroke="#6b6252"/><rect x="-22" y="-50" width="44" height="5" fill="#9b2a22"/><circle cy="-56" r="5" fill="#d4ad55"/></g>`,
    flags: (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M-40 0 Q0 18 40 0" stroke="#5a5040" stroke-width="1" fill="none"/>${[-32, -20, -8, 4, 16, 28].map((fx, i) => `<path d="M${fx} ${4 + Math.abs(fx) * -.08 + 6} l 8 0 l -4 10Z" fill="${['#2f6fb0', '#f4efe4', '#c0392b', '#3f8a4a', '#e2b33a', '#2f6fb0'][i]}"/>`).join('')}</g>`,
    yurt: (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M-22 0 L-22 -14 Q0 -34 22 -14 L22 0Z" fill="#f4efe4" stroke="#6b6252" stroke-width="1.4"/><rect x="-5" y="-11" width="10" height="11" fill="#b8322a"/><path d="M-22 -14 Q0 -20 22 -14" stroke="#b8322a" stroke-width="2" fill="none"/></g>`,
    fort: (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M-40 0 L-40 -30 L-34 -30 L-34 -36 L-26 -36 L-26 -30 L-14 -30 L-14 -36 L-6 -36 L-6 -30 L6 -30 L6 -36 L14 -36 L14 -30 L26 -30 L26 -36 L34 -36 L34 -30 L40 -30 L40 0Z" fill="#cfa66a" stroke="#8a6a3a" stroke-width="1.5"/><path d="M-8 0 L-8 -14 Q0 -22 8 -14 L8 0Z" fill="#6b4e30"/></g>`,
    wall: (x, y, s) => { let o = `<path d="M-120 0 Q-60 -26 0 -10 Q60 6 120 -24" stroke="#8a6a3a" stroke-width="12" fill="none" stroke-linecap="round"/><path d="M-120 0 Q-60 -26 0 -10 Q60 6 120 -24" stroke="#cfa66a" stroke-width="8" fill="none" stroke-dasharray="6 5" stroke-linecap="butt"/>`; [-110, -40, 40, 110].map((t, i) => o += `<rect x="${t - 7}" y="${[-14, -28, -6, -38][i]}" width="14" height="16" fill="#b8925a" stroke="#6b4e30"/>`); return `<g transform="translate(${x} ${y}) scale(${s})">${o}</g>`; },
    pavilion: (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})"><rect x="-16" y="-20" width="4" height="20" fill="#9b2a22"/><rect x="12" y="-20" width="4" height="20" fill="#9b2a22"/><path d="M-30 -18 Q-16 -24 -12 -34 L12 -34 Q16 -24 30 -18 L18 -22 L-18 -22Z" fill="#2f5a46" stroke="#1f3a2d"/><circle cy="-38" r="3" fill="#d4ad55"/></g>`,
    tower: (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M-10 0 L-6 -40 M10 0 L6 -40 M-8 -20 L8 -20" stroke="#6b4e30" stroke-width="3"/><path d="M-20 -40 Q0 -50 20 -40 L14 -36 L-14 -36Z" fill="#3a2a1e"/><path d="M-14 -52 Q0 -62 14 -52 L10 -48 L-10 -48Z" fill="#3a2a1e"/><rect x="-6" y="-48" width="12" height="8" fill="#c4473a"/></g>`,
    boat: (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M-22 0 Q0 10 22 0 L18 -4 L-18 -4Z" fill="#6b4e30"/><path d="M-8 -4 Q0 -14 8 -4" fill="#d9c08f" stroke="#6b4e30"/><path d="M14 -4 L24 -26" stroke="#3a2a1e" stroke-width="1.5"/></g>`,
    shrine: (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})"><rect x="-18" y="-22" width="36" height="22" fill="#b5a888" stroke="#5e5a50"/><path d="M-26 -22 L0 -40 L26 -22Z" fill="#6b5d44" stroke="#3a3428"/><path d="M-18 -8 Q-26 -2 -30 4 M18 -8 Q28 -4 32 4 M-6 0 Q-10 6 -14 10" stroke="#6b4e30" stroke-width="3" fill="none"/><circle cx="0" cy="-12" r="5" fill="#3a3428"/></g>`,
    waterfall: (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M-30 -60 L-24 0 L24 0 L30 -60Z" fill="#7d8c86"/><path d="M-10 -60 L-12 0 M0 -60 L0 0 M10 -60 L12 0" stroke="#e8f3f6" stroke-width="6" stroke-linecap="round"/><ellipse cy="2" rx="30" ry="8" fill="#e8f3f6" opacity=".8"/></g>`,
    bridge: (x, y, s, rot = 0) => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})"><path d="M-46 8 Q0 -30 46 8" stroke="#8a2a20" stroke-width="12" fill="none"/><path d="M-46 8 Q0 -30 46 8" stroke="#c4473a" stroke-width="8" fill="none"/>${[-30, -15, 0, 15, 30].map(t => `<path d="M${t} ${-14 + Math.abs(t) * .5} l0 -10" stroke="#8a2a20" stroke-width="2.5"/>`).join('')}<path d="M-38 -2 Q0 -36 38 -2" stroke="#8a2a20" stroke-width="2" fill="none"/></g>`,
  };

  /* ---------- background layers ---------- */
  function mountains() {
    const R = rng(7); let o = '';
    const layers = [
      { y: 210, amp: 150, col: '#c7ccc6', op: .55, n: 11 },
      { y: 200, amp: 120, col: '#8e9a98', op: .6, n: 14 },
      { y: 170, amp: 90, col: '#5f6e70', op: .55, n: 18 },
    ];
    layers.forEach((L, li) => {
      const pts = [[-50, L.y + 80]]; const step = (W + 100) / L.n;
      const peaks = [];
      for (let i = 0; i <= L.n; i++) { const x = -50 + i * step + (R() - .5) * step * .4, y = L.y - L.amp * (.35 + R() * .65); pts.push([x - step * .32, y + L.amp * .45 + R() * 20]); pts.push([x, y]); peaks.push([x, y]); }
      pts.push([W + 50, L.y + 80]);
      o += `<path d="M${pts.map(p => p.join(' ')).join('L')}Z" fill="url(#mtn${li})" opacity="${L.op}" filter="url(#inkEdge)"/>`;
      if (li > 0) peaks.forEach(([x, y]) => { o += `<path d="M${x} ${y} L${x + 18} ${y + 24} L${x + 8} ${y + 20} L${x} ${y + 30} L${x - 9} ${y + 19} L${x - 20} ${y + 26}Z" fill="#fbfbf7" opacity=".92"/>`; });
    });
    // side cliffs (scroll framing)
    o += `<path d="M0 0 L0 1100 Q40 900 30 700 Q70 520 40 360 Q80 200 50 0Z" fill="#7d8a86" opacity=".25" filter="url(#inkEdge)"/>`;
    o += `<path d="M${W} 0 L${W} 1100 Q${W - 40} 900 ${W - 30} 700 Q${W - 70} 520 ${W - 40} 360 Q${W - 80} 200 ${W - 50} 0Z" fill="#7d8a86" opacity=".25" filter="url(#inkEdge)"/>`;
    return o;
  }
  function mist() {
    const R = rng(11); let o = '';
    for (let i = 0; i < 14; i++) o += `<ellipse cx="${R() * W}" cy="${120 + R() * 140}" rx="${180 + R() * 260}" ry="${22 + R() * 26}" fill="#fff" opacity="${.35 + R() * .3}" filter="url(#blur18)"/>`;
    [[900, 1720], [1400, 1960], [2400, 1960], [300, 1000], [2900, 640], [3000, 1520]].forEach(([x, y]) => o += `<ellipse cx="${x}" cy="${y}" rx="260" ry="30" fill="#fff" opacity=".35" filter="url(#blur18)"/>`);
    return o;
  }
  const RIVER_IN = [[905, -10], [940, 120], [1010, 240], [1090, 330], [1140, 430], [1180, 560]];
  const RIVER_OUT = [[1080, 1280], [985, 1345], [900, 1420], [760, 1520], [600, 1590], [420, 1690], [230, 1760], [-20, 1840]];
  function river() {
    const d1 = smooth(RIVER_IN, false), d2 = smooth(RIVER_OUT, false);
    return [d1, d2].map(d => `<path d="${d}" fill="none" stroke="#5f8fa3" stroke-width="44" stroke-linecap="round" opacity=".55" filter="url(#inkEdge)"/><path d="${d}" fill="none" stroke="#8ec0cf" stroke-width="34" stroke-linecap="round"/><path d="${d}" fill="none" stroke="#d6eef3" stroke-width="5" stroke-dasharray="14 26" stroke-linecap="round" opacity=".8"/>`).join('');
  }
  function lake() {
    const p = superellipse(LAKE, 4, 140, .045, 5);
    let o = `<path d="${superellipse({ ...LAKE, a: LAKE.a + 26, b: LAKE.b + 22 }, 4, 140, .04, 6)}" fill="#c9b98f" opacity=".55" filter="url(#inkEdge)"/>`;
    o += `<path d="${p}" fill="url(#lakeG)" stroke="#4f7f92" stroke-width="5" filter="url(#inkEdge)"/>`;
    const R = rng(21);
    for (let i = 0; i < 60; i++) { const x = LAKE.cx + (R() - .5) * LAKE.a * 1.9, y = LAKE.cy + (R() - .5) * LAKE.b * 1.9; if (!inSE(LAKE, x, y, .95)) continue; o += `<path d="M${x} ${y} q 8 -5 16 0 t 16 0" stroke="#e8f4f6" stroke-width="2" fill="none" opacity=".7"/>`; }
    for (let i = 0; i < 26; i++) { const t = R() * Math.PI * 2; const x = LAKE.cx + Math.cos(t) * LAKE.a * .93, y = LAKE.cy + Math.sin(t) * LAKE.b * .93; if (y > 1120 && x > 1150 && x < 2050) continue; o += TREE.lotus(x, y, .9 + R() * .6, R); }
    return o;
  }
  function paths() {
    const ring = superellipse(RING, 4, 160);
    let o = '';
    const road = d => `<path d="${d}" fill="none" stroke="#a88d5c" stroke-width="34" stroke-linecap="round" stroke-linejoin="round" opacity=".9"/><path d="${d}" fill="none" stroke="#ead8aa" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="#c9ad74" stroke-width="2" stroke-dasharray="12 12"/>`;
    o += road(ring);
    const br = [
      [ringPoint(222), [900, 612]], [ringPoint(318), [2320, 620]], [ringPoint(180), [900, 960]], [ringPoint(0), [2300, 1000]],
      [ringPoint(150), [730, 1380]], [[PLAZA.x, PLAZA.y], ringPoint(90)], [[GATE.x, GATE.y - 40], [PLAZA.x, PLAZA.y]],
      [[PLAZA.x - 40, PLAZA.y + 20], [1590, 1580]], [[PLAZA.x + 40, PLAZA.y + 20], [1750, 1580]], [ringPoint(30), [2290, 1420]],
    ];
    br.forEach(([a, b]) => o += road(`M${a[0]} ${a[1]} L${b[0]} ${b[1]}`));
    // staff path (hidden service road) around the outside
    o += `<path d="M30 640 L30 1960 L3170 1960 L3170 640" fill="none" stroke="#7d7465" stroke-width="5" stroke-dasharray="3 9" opacity=".55"/>`;
    return o;
  }
  function plazaGate() {
    let o = '';
    // moon-gate plaza
    o += `<circle cx="${PLAZA.x}" cy="${PLAZA.y}" r="78" fill="#ead8aa" stroke="#a88d5c" stroke-width="5"/>
      <circle cx="${PLAZA.x}" cy="${PLAZA.y}" r="56" fill="none" stroke="#c9ad74" stroke-width="2" stroke-dasharray="4 6"/>
      <g transform="translate(${PLAZA.x} ${PLAZA.y - 6})"><circle r="30" fill="none" stroke="#9b2a22" stroke-width="10"/><path d="M-46 30 L46 30" stroke="#6b4e30" stroke-width="6"/><path d="M-48 -32 Q0 -46 48 -32 L40 -28 L-40 -28Z" fill="#2f2a22"/></g>
      <text x="${PLAZA.x}" y="${PLAZA.y + 62}" text-anchor="middle" font-family="${FONT_CN}" font-weight="700" font-size="22" fill="#6b4e30">月門廣場</text>`;
    // paifang gate
    o += `<g transform="translate(${GATE.x} ${GATE.y - 8})">
      <rect x="-120" y="-10" width="240" height="22" rx="4" fill="#d6c093" stroke="#a88d5c"/>
      ${[-80, -30, 30, 80].map(x => `<rect x="${x - 6}" y="-92" width="12" height="90" fill="#b8322a" stroke="#7a1d16"/>`).join('')}
      <path d="M-120 -92 Q0 -112 120 -92 L108 -84 L-108 -84Z" fill="#2f2a22"/><path d="M-70 -122 Q0 -138 70 -122 L60 -114 L-60 -114Z" fill="#2f2a22"/>
      <rect x="-90" y="-84" width="180" height="10" fill="#c4473a"/><rect x="-40" y="-114" width="80" height="24" fill="#c4473a" stroke="#d4ad55" stroke-width="2"/>
      <text y="-96" text-anchor="middle" font-family="${FONT_CN}" font-weight="700" font-size="17" fill="#ffe2a6">玉谷</text>
    </g>
    <g><rect x="${GATE.x - 120}" y="${GATE.y + 14}" width="240" height="40" rx="6" fill="#2a1f17"/><text x="${GATE.x}" y="${GATE.y + 41}" text-anchor="middle" font-family="${FONT_TH_HEAD}" font-weight="700" font-size="20" fill="#f3e6c8">牌坊 ทางเข้า · ENTRANCE</text></g>`;
    return o;
  }
  function palaceBuilding() {
    const r = ZR.palace;
    let o = '';
    // island platform
    o += `<rect x="${r.x - 40}" y="${r.y - 10}" width="${r.w + 80}" height="${COURT.y + COURT.h - r.y + 40}" rx="40" fill="#d8ccb0" stroke="#8a7a5a" stroke-width="4" filter="url(#inkEdge)"/>`;
    o += `<rect x="${r.x - 26}" y="${r.y + 4}" width="${r.w + 52}" height="${COURT.y + COURT.h - r.y + 12}" rx="30" fill="#ece2c8"/>`;
    // hall
    o += `<rect x="${r.x}" y="${r.y + 56}" width="${r.w}" height="${r.h - 50}" rx="10" fill="#fbf4e2" stroke="#9b2a22" stroke-width="5"/>`;
    o += `<rect x="${r.x + 8}" y="${r.y + 64}" width="${r.w - 16}" height="${r.h - 66}" rx="6" fill="none" stroke="#d4ad55" stroke-width="2"/>`;
    // roof tiers
    o += `<path d="M${r.x - 50} ${r.y + 62} Q${r.x + 40} ${r.y + 40} ${r.x + 80} ${r.y + 6} L${r.x + r.w - 80} ${r.y + 6} Q${r.x + r.w - 40} ${r.y + 40} ${r.x + r.w + 50} ${r.y + 62} L${r.x + r.w - 10} ${r.y + 56} L${r.x + 10} ${r.y + 56}Z" fill="#2f2a22" stroke="#d4ad55" stroke-width="3"/>`;
    o += `<rect x="${r.x + 260}" y="${r.y - 46}" width="${r.w - 520}" height="50" fill="#b8322a" stroke="#d4ad55" stroke-width="3"/>`;
    o += `<path d="M${r.x + 200} ${r.y - 40} Q${r.x + 260} ${r.y - 52} ${r.x + 290} ${r.y - 82} L${r.x + r.w - 290} ${r.y - 82} Q${r.x + r.w - 260} ${r.y - 52} ${r.x + r.w - 200} ${r.y - 40} L${r.x + r.w - 250} ${r.y - 44} L${r.x + 250} ${r.y - 44}Z" fill="#2f2a22" stroke="#d4ad55" stroke-width="3"/>`;
    o += `<path d="M${r.x + r.w / 2} ${r.y - 82} L${r.x + r.w / 2} ${r.y - 98}" stroke="#d4ad55" stroke-width="6"/><circle cx="${r.x + r.w / 2}" cy="${r.y - 100}" r="8" fill="#d4ad55"/>`;
    o += `<text x="${r.x + r.w / 2}" y="${r.y - 10}" text-anchor="middle" font-family="${FONT_CN}" font-weight="700" font-size="34" fill="#ffe2a6" letter-spacing="6">西湖龍宮</text>`;
    o += `<text x="${r.x + r.w / 2}" y="${r.y + 88}" text-anchor="middle" font-family="${FONT_TH_HEAD}" font-weight="700" font-size="20" fill="#9b2a22">วังมังกร · อาควาเรียม <tspan font-size="15" fill="#6b6252" font-weight="500">· ${window.ZONES.find(z => z.id === 'palace').count} ชนิด · ตัดผนังให้เห็นตู้ข้างใน</tspan></text>`;
    // dragon pillars
    [r.x + 14, r.x + r.w - 14].forEach(x => o += `<rect x="${x - 7}" y="${r.y + 56}" width="14" height="${r.h - 50}" fill="#b8322a"/><path d="M${x} ${r.y + 70} q 10 20 0 40 t 0 40 t 0 40 t 0 40" stroke="#d4ad55" stroke-width="3" fill="none"/>`);
    // courtyard
    o += `<text x="${COURT.x + COURT.w - 6}" y="${COURT.y + COURT.h + 20}" text-anchor="end" font-family="${FONT_TH}" font-size="13" fill="#6b6252">ลานหน้าวัง · ริมทะเลสาบ</text>`;
    return o;
  }
  function zoneBlob(z) {
    const r = ZR[z.id]; const seed = z.id.length * 97 + r.x;
    const d = blobPath(r, seed, 80, 18);
    return `<path d="${d}" fill="${z.fill}" opacity=".88" filter="url(#wc)"/>
      <path d="${d}" fill="url(#paperTex)" opacity=".35"/>
      <path d="${d}" fill="none" stroke="${z.ink}" stroke-width="7" opacity=".55" filter="url(#brush)"/>
      <path d="${d}" fill="none" stroke="#2a251d" stroke-width="2" opacity=".55" filter="url(#brush)"/>`;
  }
  function zoneTitle(z) {
    const r = ZR[z.id]; if (z.id === 'palace') return '';
    const x = r.x + 36, y = r.y + 72;
    return `<g class="zone-hit" data-z="${z.id}">
      <text x="${x}" y="${y}" font-family="${FONT_CN}" font-weight="700" font-size="60" fill="#2a251d" opacity=".9" paint-order="stroke" stroke="${z.fill}" stroke-width="6">${z.cn}</text>
      <text class="zt-th" data-x0="${x}" x="${x + z.cn.length * 64 + 18}" y="${y - 24}" font-family="${FONT_TH_HEAD}" font-weight="700" font-size="24" fill="${z.ink}">${esc(z.th)}</text>
      <text class="zt-th" data-x0="${x}" x="${x + z.cn.length * 64 + 18}" y="${y + 2}" font-family="${FONT_TH}" font-size="15" fill="#6b6252">${esc(z.biome)} · ${z.count} ชนิด</text>
    </g>`;
  }
  function scatter(z, occupied) {
    const r = ZR[z.id]; const R = rng(r.x * 3 + r.y); const kinds = ZONE_TREES[z.id]; if (!kinds) return '';
    let o = []; const n = Math.round(r.w * r.h / 5200);
    for (let i = 0; i < n * 3 && o.length < n; i++) {
      const x = r.x + 26 + R() * (r.w - 52), y = r.y + 40 + R() * (r.h - 56);
      if (occupied.some(p => x > p.x - 26 && x < p.x + p.w + 26 && y > p.y - 4 && y < p.y + p.h + 50)) continue;
      if (x < r.x + 70 && y < r.y + 70) continue;
      o.push([y, TREE[kinds[Math.floor(R() * kinds.length)]](x, y, .8 + R() * .5, R)]);
    }
    return o.sort((a, b) => a[0] - b[0]).map(v => v[1]).join('');
  }
  function backgroundTrees() {
    const R = rng(99); const rects = Object.values(ZR); let o = [];
    for (let i = 0; i < 1300; i++) {
      const x = R() * W, y = 230 + R() * (H - 260);
      if (rects.some(r => x > r.x - 18 && x < r.x + r.w + 18 && y > r.y - 8 && y < r.y + r.h + 46)) continue;
      if (inSE(RING, x, y, 1.08)) continue;
      if (Math.abs(x - PLAZA.x) < 110 && y > 1400) continue;
      if (y < 380 && x > 1060 && x < 2140) { if (R() > .4) continue; }
      const kind = y < 700 ? (R() > .4 ? 'pine' : 'round') : y > 1450 ? (R() > .5 ? 'jungle' : 'palm') : (R() > .5 ? 'round' : 'pine');
      o.push([y, TREE[kind](x, y, .7 + R() * .45, R)]);
    }
    return o.sort((a, b) => a[0] - b[0]).map(v => v[1]).join('');
  }
  function landmarks() {
    const s = [];
    s.push(LAND.temple(860, 245, 1.1), LAND.flags(700, 200, 1.1), LAND.waterfall(930, 150, .9));
    s.push(LAND.wall(2620, 640, 1.4), LAND.fort(3050, 250, 1.1), LAND.yurt(2960, 560, 1.1), LAND.yurt(3040, 580, .9));
    s.push(LAND.pavilion(870, 700, 1.2), LAND.bridge(760, 1240, .9));
    s.push(LAND.tower(3080, 760, 1.3), LAND.tower(2330, 1490, 1));
    s.push(LAND.boat(330, 1700, 1.3), LAND.boat(800, 1530, 1), LAND.pavilion(870, 1360, 1));
    s.push(LAND.shrine(1520, 1900, 1.2), LAND.waterfall(1000, 1520, .8), LAND.shrine(3090, 1600, 1.3), LAND.waterfall(3100, 1880, .7));
    s.push(LAND.pagoda(2210, 1450, 1.1), LAND.pagoda(990, 470, 1));
    // bridges where the ring crosses the river
    s.push(LAND.bridge(1150, 520, 1.1, -30), LAND.bridge(1010, 1320, 1.1, 40), LAND.bridge(1600, 1395, 1.1, 90));
    return s.join('');
  }
  function cartouche() {
    const x = 1150, y = 26, w = 900, h = 190;
    return `<g>
      <rect x="${x - 14}" y="${y + 10}" width="28" height="${h - 20}" rx="14" fill="#8a5a2a"/><rect x="${x + w - 14}" y="${y + 10}" width="28" height="${h - 20}" rx="14" fill="#8a5a2a"/>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fbf4e2" stroke="#9b2a22" stroke-width="4"/>
      <rect x="${x + 10}" y="${y + 10}" width="${w - 20}" height="${h - 20}" fill="none" stroke="#d4ad55" stroke-width="2"/>
      <text x="${x + 40}" y="${y + 128}" font-family="${FONT_CN}" font-weight="700" font-size="104" fill="#b8322a" letter-spacing="4">玉谷萬獸園</text>
      <text x="${x + 600}" y="${y + 74}" font-family="${FONT_TH_HEAD}" font-weight="700" font-size="34" fill="#2a251d">สวนสัตว์หุบเขาหยก</text>
      <text x="${x + 600}" y="${y + 108}" font-family="${FONT_TH}" font-size="17" fill="#6b6252">Jade Valley Zoo · Planet Zoo 2</text>
      <text x="${x + 600}" y="${y + 136}" font-family="${FONT_TH}" font-size="17" fill="#6b6252">136 ชนิด · 8 โซน · วังมังกรกลางทะเลสาบ</text>
      <text x="${x + 600}" y="${y + 164}" font-family="${FONT_TH}" font-size="15" fill="#9b2a22">北 ↑ ทิศเหนืออยู่ด้านบน</text>
    </g>`;
  }
  function seal() {
    return `<g transform="translate(3040 1905) rotate(-6)"><rect x="-80" y="-80" width="160" height="160" rx="10" fill="#b8322a" filter="url(#inkEdge)"/><rect x="-68" y="-68" width="136" height="136" rx="4" fill="none" stroke="#fbe9e3" stroke-width="3"/>
      <text x="-30" y="-8" text-anchor="middle" font-family="${FONT_CN}" font-weight="700" font-size="56" fill="#fbe9e3">玉</text><text x="30" y="-8" text-anchor="middle" font-family="${FONT_CN}" font-weight="700" font-size="56" fill="#fbe9e3">萬</text>
      <text x="-30" y="54" text-anchor="middle" font-family="${FONT_CN}" font-weight="700" font-size="56" fill="#fbe9e3">谷</text><text x="30" y="54" text-anchor="middle" font-family="${FONT_CN}" font-weight="700" font-size="56" fill="#fbe9e3">獸</text></g>`;
  }
  function compass() {
    return `<g transform="translate(100 90)"><circle r="56" fill="#fbf4e2" stroke="#6b4e30" stroke-width="2.5"/><circle r="46" fill="none" stroke="#d4ad55" stroke-width="1.5"/>
      <path d="M0 -50 L10 0 L0 50 L-10 0Z" fill="#2a251d"/><path d="M0 -50 L10 0 L-10 0Z" fill="#b8322a"/><path d="M-50 0 L0 -8 L50 0 L0 8Z" fill="#6b6252" opacity=".6"/>
      <text y="-60" text-anchor="middle" font-family="${FONT_CN}" font-weight="700" font-size="24" fill="#b8322a">北</text></g>`;
  }
  function tempBar() {
    const x = 3166, y0 = 230, y1 = 1780;
    return `<g><rect x="${x - 9}" y="${y0}" width="18" height="${y1 - y0}" rx="9" fill="url(#tempG)" stroke="#2a251d" stroke-width="1.5"/>
      <text x="${x}" y="${y0 - 34}" text-anchor="middle" font-family="${FONT_CN}" font-weight="700" font-size="30" fill="#2f6f8c">寒</text><text x="${x}" y="${y0 - 12}" text-anchor="middle" font-family="${FONT_TH}" font-size="13" fill="#2f6f8c">หนาว</text>
      <text x="${x}" y="${y1 + 34}" text-anchor="middle" font-family="${FONT_CN}" font-weight="700" font-size="30" fill="#b8322a">熱</text><text x="${x}" y="${y1 + 54}" text-anchor="middle" font-family="${FONT_TH}" font-size="13" fill="#b8322a">ร้อนชื้น</text></g>`;
  }
  function legendStrip() {
    const y = 1972; let x = 60; const it = [];
    const add = (svg, label, w) => { it.push(`<g transform="translate(${x} ${y})">${svg}<text x="34" y="5" font-family="${FONT_TH}" font-size="14" fill="#2a251d">${label}</text></g>`); x += w; };
    add(`<rect x="0" y="-9" width="26" height="18" rx="4" fill="#fffaf0" stroke="#2f7d5d" stroke-width="4"/>`, 'กรงรวม', 100);
    add(`<rect x="0" y="-9" width="26" height="18" rx="4" fill="#fffaf0" stroke="#5a5040" stroke-width="1.5"/>`, 'กรงเดี่ยว', 110);
    add(`<rect x="0" y="-9" width="26" height="18" rx="2" fill="#f7eef6" stroke="#7b4f8a" stroke-width="2.5"/>`, 'อาคาร Exhibit', 150);
    add(`<rect x="0" y="-9" width="26" height="18" rx="4" fill="#9cc7d3" stroke="#2f6f8c" stroke-width="2.5"/>`, 'ตู้อาควาเรียม', 150);
    ['L', 'F', 'A', 'E'].forEach(k => add(`<g transform="translate(13 0)"><circle r="11" fill="${TC[k]}"/><text y="4.5" text-anchor="middle" font-family="${FONT_CN}" font-weight="700" font-size="12" fill="#fff">${TYPE_CN[k]}</text></g>`, window.Z.TYPE[k], 120));
    add(`<rect x="4" y="-9" width="18" height="18" rx="3" fill="#b8322a"/><text x="13" y="5" text-anchor="middle" font-family="${FONT_CN}" font-weight="700" font-size="12" fill="#fff">亞</text>`, 'ถิ่นเอเชีย', 120);
    return `<rect x="40" y="1948" width="${x - 10}" height="46" rx="10" fill="#fbf4e2" stroke="#a88d5c" stroke-width="2" opacity=".95"/>` + it.join('');
  }

  const defs = `<defs>
    <filter id="wc" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".014" numOctaves="3" seed="3" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="26" xChannelSelector="R" yChannelSelector="G" result="d"/><feGaussianBlur in="d" stdDeviation="1.4"/></filter>
    <filter id="brush" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves="2" seed="8" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="7" xChannelSelector="R" yChannelSelector="G"/></filter>
    <filter id="inkEdge" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".02" numOctaves="3" seed="12" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="14" xChannelSelector="R" yChannelSelector="G"/></filter>
    <filter id="blur18"><feGaussianBlur stdDeviation="18"/></filter>
    <filter id="paperN" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="2"/><feColorMatrix values="0 0 0 0 .45  0 0 0 0 .36  0 0 0 0 .22  0 0 0 .22 0"/></filter>
    <pattern id="paperTex" width="240" height="240" patternUnits="userSpaceOnUse"><rect width="240" height="240" filter="url(#paperN)"/></pattern>
    <pattern id="mesh" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M0 12 L12 0 M-3 3 L3 -3 M9 15 L15 9" stroke="#b0862c" stroke-width=".7" opacity=".35"/><path d="M0 0 L12 12" stroke="#b0862c" stroke-width=".7" opacity=".35"/></pattern>
    <linearGradient id="tank" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9eff4"/><stop offset=".35" stop-color="#a9d3df"/><stop offset="1" stop-color="#5f9fb4"/></linearGradient>
    <radialGradient id="lakeG" cx=".5" cy=".45" r=".65"><stop offset="0" stop-color="#b6dbe3"/><stop offset=".7" stop-color="#8cc0cf"/><stop offset="1" stop-color="#6aa3b6"/></radialGradient>
    <linearGradient id="mtn0" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9aa6a6"/><stop offset="1" stop-color="#e7dcc2" stop-opacity="0"/></linearGradient>
    <linearGradient id="mtn1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5f6e70"/><stop offset="1" stop-color="#e7dcc2" stop-opacity="0"/></linearGradient>
    <linearGradient id="mtn2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2f3b3d"/><stop offset=".8" stop-color="#e7dcc2" stop-opacity="0"/></linearGradient>
    <linearGradient id="tempG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a7fa8"/><stop offset=".3" stop-color="#9cc7d3"/><stop offset=".55" stop-color="#d0a23a"/><stop offset=".8" stop-color="#d9733a"/><stop offset="1" stop-color="#c0392b"/></linearGradient>
    <radialGradient id="paperV" cx=".5" cy=".5" r=".75"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#5a4020" stop-opacity=".22"/></radialGradient>
    <clipPath id="cc" clipPathUnits="objectBoundingBox"><circle cx=".5" cy=".5" r=".5"/></clipPath>
  </defs>`;

  /* ---------- assemble ---------- */
  let built = false;
  function build(svg) {
    layout();
    const occupiedByZone = {};
    CAGES.forEach(c => (occupiedByZone[c.zone.id] = occupiedByZone[c.zone.id] || []).push(c));
    let s = defs;
    s += `<rect width="${W}" height="${H}" fill="#efe4c9"/><rect width="${W}" height="${H}" fill="url(#paperTex)" opacity=".7"/>`;
    s += `<g id="L-bg">${mountains()}${backgroundTrees()}</g>`;
    s += `<g id="L-zones">${window.ZONES.filter(z => z.id !== 'palace').map(zoneBlob).join('')}</g>`;
    s += `<g id="L-water">${river()}${lake()}</g>`;
    s += `<g id="L-paths">${paths()}</g>`;
    s += `<g id="L-scenery">${window.ZONES.map(z => scatter(z, occupiedByZone[z.id] || [])).join('')}${landmarks()}</g>`;
    s += `<g id="L-mist">${mist()}</g>`;
    s += `<g id="L-palace">${palaceBuilding()}</g>`;
    s += `<g id="L-plaza">${plazaGate()}</g>`;
    s += `<g id="L-titles">${window.ZONES.map(zoneTitle).join('')}</g>`;
    s += `<g id="L-cages">${CAGES.map(c => drawCage(c)).join('')}</g>`;
    s += `<g id="L-route" style="display:none">${routeLayer()}</g>`;
    s += `<g id="L-frame">${cartouche()}${compass()}${tempBar()}${seal()}${legendStrip()}<rect width="${W}" height="${H}" fill="url(#paperV)" pointer-events="none"/><rect x="6" y="6" width="${W - 12}" height="${H - 12}" fill="none" stroke="#6b4e30" stroke-width="6" pointer-events="none"/></g>`;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = s;
    built = true;
    const fixTitles = () => svg.querySelectorAll('.zone-hit').forEach(g => { const cn = g.querySelector('text'); const w = cn.getComputedTextLength(); g.querySelectorAll('.zt-th').forEach(t => t.setAttribute('x', +t.dataset.x0 + w + 18)); });
    fixTitles(); if (document.fonts) document.fonts.ready.then(fixTitles);
  }

  /* route overlay */
  const STOP = {
    gate: [GATE.x, GATE.y - 70], plaza: [PLAZA.x, PLAZA.y], koi: [1420, 1250], world: [1250, 1560], river: [560, 1460], bamboo: [520, 960],
    snow: [560, 420], bridge: [1150, 520], silk: [2560, 430], savannah: [2700, 1080], asia: [2420, 1700], palace: [1600, 820],
  };
  const ROUTE_WAY = [
    STOP.gate, STOP.plaza, ringPoint(95), STOP.koi, ringPoint(120), STOP.world, ringPoint(135), ringPoint(150), STOP.river, ringPoint(165), ringPoint(180), STOP.bamboo,
    ringPoint(200), ringPoint(222), STOP.snow, ringPoint(235), STOP.bridge, ringPoint(270), ringPoint(300), ringPoint(318), STOP.silk, ringPoint(330), ringPoint(345),
    ringPoint(0), STOP.savannah, ringPoint(20), ringPoint(35), STOP.asia, ringPoint(60), ringPoint(85), [1600, 1395], STOP.palace,
  ];
  const SPUR = { koi: 100, world: 122, river: 150, bamboo: 180, snow: 222, bridge: 240, silk: 318, savannah: 360, asia: 32 };
  function routeLayer() {
    // main loop: plaza → west → north → east → back south (clockwise in screen space)
    const arc = []; for (let d = 92; d <= 448; d += 2) arc.push(ringPoint(d % 360));
    const loop = 'M' + arc.map(p => p.map(v => v.toFixed(1)).join(' ')).join('L');
    let o = `<path d="${loop}" fill="none" stroke="#fff" stroke-width="24" stroke-linecap="round" opacity=".7"/><path d="${loop}" fill="none" stroke="#b8322a" stroke-width="10" stroke-linecap="round" stroke-dasharray="28 16"/>`;
    // direction arrows
    [140, 200, 270, 330, 20].forEach(d => { const p = ringPoint(d), q = ringPoint(d + 2); const ang = Math.atan2(q[1] - p[1], q[0] - p[0]) * 180 / Math.PI; o += `<path d="M-16 -14 L14 0 L-16 14Z" transform="translate(${p[0]} ${p[1]}) rotate(${ang})" fill="#b8322a" stroke="#fff" stroke-width="3"/>`; });
    const spur = (a, b) => (o += `<path d="M${a[0]} ${a[1]} L${b[0]} ${b[1]}" stroke="#fff" stroke-width="16" stroke-linecap="round" opacity=".7"/><path d="M${a[0]} ${a[1]} L${b[0]} ${b[1]}" stroke="#b8322a" stroke-width="7" stroke-dasharray="14 10" stroke-linecap="round"/>`);
    spur(STOP.gate, STOP.plaza); spur(STOP.plaza, ringPoint(90));
    for (const k in SPUR) spur(ringPoint(SPUR[k] % 360), STOP[k]);
    spur(ringPoint(90), [1600, 1300]); spur([1600, 1300], STOP.palace);
    window.ROUTE.forEach(r => { const [x, y] = STOP[r.at]; o += `<g class="stop" data-at="${r.at}" transform="translate(${x} ${y})"><circle r="30" fill="#b8322a" stroke="#fff" stroke-width="5"/><text y="10" text-anchor="middle" font-family="'IBM Plex Mono',monospace" font-weight="600" font-size="28" fill="#fff">${r.n}</text></g>`; });
    return o;
  }

  /* ---------- pan / zoom ---------- */
  let view = { x: 0, y: 0, w: W, h: H }, svgEl;
  function apply() { svgEl.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`); }
  function clampView() {
    const minW = 420; view.w = Math.max(minW, Math.min(W * 1.4, view.w)); view.h = view.w * H / W;
    view.x = Math.max(-view.w * .3, Math.min(W - view.w * .7, view.x)); view.y = Math.max(-view.h * .3, Math.min(H - view.h * .7, view.y));
  }
  function toSvg(cx, cy) { const r = svgEl.getBoundingClientRect(); const sc = Math.max(view.w / r.width, view.h / r.height); const ox = (r.width * sc - view.w) / 2, oy = (r.height * sc - view.h) / 2; return [view.x - ox + (cx - r.left) * sc, view.y - oy + (cy - r.top) * sc]; }
  function zoomAt(f, cx, cy) { const [px, py] = toSvg(cx, cy); view.x = px - (px - view.x) * f; view.y = py - (py - view.y) * f; view.w *= f; view.h *= f; clampView(); apply(); }
  function zoomTo(x, y, w) { view.w = w; view.h = w * H / W; view.x = x - view.w / 2; view.y = y - view.h / 2; clampView(); animate(); }
  let animFrom = null;
  function animate() { const target = { ...view }; const cur = svgEl.viewBox.baseVal; const from = { x: cur.x, y: cur.y, w: cur.width, h: cur.height }; const t0 = performance.now();
    const step = t => { const k = Math.min(1, (t - t0) / 380), e = 1 - Math.pow(1 - k, 3); svgEl.setAttribute('viewBox', ['x', 'y', 'w', 'h'].map(p => from[p] + (target[p] - from[p]) * e).join(' ')); if (k < 1) requestAnimationFrame(step); };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || document.hidden) apply(); else { requestAnimationFrame(step); setTimeout(apply, 450); } }
  function fit() { view = { x: 0, y: 0, w: W, h: H }; animate(); }

  function initInteract(svg, handlers) {
    svgEl = svg;
    const pts = new Map(); let drag = null, moved = 0, pinch = null;
    svg.addEventListener('wheel', e => { e.preventDefault(); zoomAt(Math.exp(e.deltaY * .0015), e.clientX, e.clientY); }, { passive: false });
    svg.addEventListener('pointerdown', e => {
      pts.set(e.pointerId, [e.clientX, e.clientY]); moved = 0;
      if (pts.size === 1) drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), w: view.w }; drag = null; }
    });
    svg.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pinch && pts.size === 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); const f = (pinch.w * pinch.d / d) / view.w; zoomAt(f, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); moved = 99; return; }
      if (!drag) return; const r = svg.getBoundingClientRect(); const sc = Math.max(view.w / r.width, view.h / r.height);
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y; moved = Math.max(moved, Math.hypot(dx, dy));
      if (moved > 4) { if (!svg.classList.contains('dragging')) { try { svg.setPointerCapture(e.pointerId); } catch (_) {} } svg.classList.add('dragging'); view.x = drag.vx - dx * sc; view.y = drag.vy - dy * sc; clampView(); apply(); }
    });
    const end = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (!pts.size) { drag = null; svg.classList.remove('dragging'); } };
    svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
    svg.addEventListener('click', e => {
      if (moved > 4) { e.stopPropagation(); return; }
      const el = document.elementFromPoint(e.clientX, e.clientY) || e.target;
      const t = el.closest('.tok'); if (t) return handlers.animal(t.dataset.s, e);
      const c = el.closest('.cage'); if (c) return handlers.cage(c.dataset.c);
      const z = el.closest('.zone-hit'); if (z) return handlers.zone(z.dataset.z);
      const st = el.closest('.stop'); if (st) return handlers.stop(st.dataset.at);
    }, true);
    svg.addEventListener('dblclick', e => { e.preventDefault(); zoomAt(.5, e.clientX, e.clientY); });
  }

  function cageCenter(id) { const c = CAGES.find(c => c.id === id); return c ? [c.x + c.w / 2, c.y + c.h / 2, c] : null; }

  /* ---------- export PNG with embedded fonts ---------- */
  async function exportPng(svg, scale = 1.25) {
    const clone = svg.cloneNode(true);
    clone.setAttribute('viewBox', `0 0 ${W} ${H}`); clone.setAttribute('width', W * scale); clone.setAttribute('height', H * scale);
    clone.querySelectorAll('.cage.dim').forEach(n => n.classList.remove('dim'));
    const text = [...new Set(clone.textContent.replace(/\s+/g, ''))].join('');
    const fams = [['LXGW WenKai TC', '700'], ['Noto Sans Thai', '400;500;700'], ['Noto Serif Thai', '700'], ['IBM Plex Mono', '600']];
    let css = '';
    for (const [f, w] of fams) {
      try {
        const u = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(f)}:wght@${w}&text=${encodeURIComponent(text)}`;
        let fc = await (await fetch(u)).text();
        const urls = [...fc.matchAll(/url\((https:[^)]+)\)/g)].map(m => m[1]);
        for (const url of urls) { const b = await (await fetch(url)).blob(); const data = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); }); fc = fc.split(url).join(data); }
        css += fc;
      } catch (e) { console.warn('font embed failed', f, e); }
    }
    const st = document.createElementNS(NS, 'style'); st.textContent = css; clone.insertBefore(st, clone.firstChild);
    const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob); const im = new Image();
    await new Promise((res, rej) => { im.onload = res; im.onerror = rej; im.src = url; });
    const cv = document.createElement('canvas'); cv.width = W * scale; cv.height = H * scale;
    cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url);
    return new Promise(r => cv.toBlob(r, 'image/png'));
  }

  window.ZooMap = { build, initInteract, zoomTo, fit, zoomBy: f => { const r = svgEl.getBoundingClientRect(); zoomAt(f, r.left + r.width / 2, r.top + r.height / 2); }, cageCenter, STOP, exportPng, W, H, ZR, routeLayer, defs, RING, superellipse, smooth, ROUTE_WAY, LAKE };
})();
