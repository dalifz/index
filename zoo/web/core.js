/* Shared helpers: derived cage data, climate classes, saved progress. */
(function () {
  const A = window.ANIMALS;
  const TYPE = { L: 'Habitat', F: 'Aviary', A: 'Aquarium', E: 'Exhibit' };
  const TYPE_CN = { L: '獸', F: '禽', A: '水', E: '館' };
  const TYPE_TH = { L: 'กรงสัตว์บก', F: 'กรงนก (Aviary)', A: 'ตู้ปลา', E: 'อาคาร Exhibit' };
  const STATUS_TH = { LC: 'ไม่น่ากังวล', NT: 'ใกล้ถูกคุกคาม', VU: 'มีแนวโน้มสูญพันธุ์', EN: 'ใกล้สูญพันธุ์', CR: 'ใกล้สูญพันธุ์อย่างยิ่ง', DD: 'ข้อมูลไม่พอ', NE: 'ยังไม่ประเมิน', DO: 'สัตว์เลี้ยง', EW: 'สูญพันธุ์ในธรรมชาติ' };

  /* climate class by an animal's comfortable range */
  const CLIM = [
    { id: 'frost', cn: '寒', th: 'เย็นจัด', range: 'สูงสุด ≤ 15°C', color: '#4a7fa8', test: a => a.hi <= 15,
      tip: 'ต้อง Cooler เกือบทั้งปี ยกเว้นแผนที่หนาวจริง วางบนเขาสูงสุด' },
    { id: 'cold', cn: '涼', th: 'ทนหนาว', range: 'ต่ำสุด ≤ −5°C', color: '#6fa3c4', test: a => a.lo <= -5,
      tip: 'แทบไม่ต้อง Heater · ระวังหน้าร้อนถ้าสูงสุดของสัตว์ต่ำกว่าแผนที่' },
    { id: 'mild', cn: '溫', th: 'อบอุ่นกลาง', range: 'ต่ำสุด −4 ถึง 13°C', color: '#6aa36f', test: a => a.lo < 14,
      tip: 'อยู่ได้เกือบทุกแผนที่ เหมาะเริ่มเกม' },
    { id: 'warm', cn: '暖', th: 'ร้อนแห้ง (ทุ่งหญ้า)', range: 'ต่ำสุด 14–17°C', color: '#d0a23a', test: a => a.lo < 18,
      tip: 'Heater เฉพาะหน้าหนาว · ทนร้อนถึง 36–41°C' },
    { id: 'hot', cn: '熱', th: 'ร้อนชื้น (ป่าฝน)', range: 'ต่ำสุด 18–22°C', color: '#d9733a', test: a => a.lo < 23,
      tip: 'Heater ตลอดหน้าหนาวและกลางคืน · จับรวมโซนป่าฝน' },
    { id: 'tropic', cn: '炎', th: 'ร้อนจัด', range: 'ต่ำสุด ≥ 23°C', color: '#c0392b', test: () => true,
      tip: 'ส่วนใหญ่อยู่ในตู้ Exhibit / Aquarium ที่ตั้งอุณหภูมิได้เอง' },
  ];
  const climOf = a => CLIM.find(c => c.test(a));

  /* build flat cage list with derived stats */
  const CAGES = [];
  const WHERE = {};
  window.ZONES.forEach(z => {
    z.cages.forEach((c, i) => {
      c.id = `${z.id}-${i}`; c.zone = z;
      c.sp = c.m.map(s => { const a = A[s]; if (!a) throw new Error('no animal ' + s); return a; });
      const tys = [...new Set(c.sp.map(a => a.ty))];
      c.kind = c.ex ? 'E' : tys.includes('A') ? 'A' : (tys.includes('F') || c.aviary) ? 'F' : 'L';
      c.mixed = !c.ex && c.m.length > 1;
      const sum = k => c.sp.reduce((s, a) => s + (a[k] || 0), 0);
      c.lo = Math.max(...c.sp.map(a => a.lo)); c.hi = Math.min(...c.sp.map(a => a.hi));
      if (c.ex) { c.lo = Math.min(...c.sp.map(a => a.lo)); c.hi = Math.max(...c.sp.map(a => a.hi)); }
      c.land = sum('land'); c.dw = sum('dw'); c.aq = sum('aq'); c.fl = sum('fl'); c.cl = sum('cl'); c.shelter = sum('shelter');
      c.food = sum('food'); c.g = Math.max(...c.sp.map(a => a.g)); c.bh = Math.max(...c.sp.map(a => a.h));
      c.walk = c.sp.every(a => a.walk);
      c.sal = c.kind === 'A' ? (c.sp.every(a => /Fresh|Any/i.test(a.sal)) ? 'น้ำจืด' : c.sp.every(a => /Salt|Brack|Any/i.test(a.sal)) ? 'น้ำเค็ม' : 'ผสม') : '';
      c.lv = Math.min(...c.m.map(s => window.LEVEL_OF[s]));
      c.title = c.cn ? c.th : c.sp[0].n;
      c.controlled = c.ex || c.kind === 'A';
      c.clim = c.controlled ? null : climOf({ lo: c.lo, hi: c.hi });
      c.m.forEach(s => (WHERE[s] = c));
      CAGES.push(c);
    });
    z.count = z.cages.reduce((s, c) => s + c.m.length, 0);
  });

  /* relationship between two animals */
  function rel(a, b) {
    if (a.thr.includes(b.slug) || b.thr.includes(a.slug)) return 'T';
    if (a.neu.includes(b.slug) || b.neu.includes(a.slug)) return 'N';
    return 'X';
  }

  /* ---------- saved progress (localStorage, guarded) ---------- */
  const KEY = 'jvz-zoo-tools-v1';
  let S = { owned: {}, build: {}, tools: {}, amb: [2, 30], open: {} };
  try { const raw = localStorage.getItem(KEY); if (raw) S = Object.assign(S, JSON.parse(raw)); } catch (e) { /* storage blocked */ }
  const listeners = [];
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} listeners.forEach(f => f()); }

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => Math.round(n).toLocaleString('en-US');
  const img = s => window.IMG[s] || `img/${s}.png`;
  const zp = a => `https://www.planetzoogame.com/2/zoopedia/${encodeURIComponent(a.zslug || a.slug)}`;

  window.Z = {
    A, TYPE, TYPE_CN, TYPE_TH, STATUS_TH, CLIM, climOf, CAGES, WHERE, rel, esc, fmt, img, zp,
    state: S,
    owned: s => !!S.owned[s],
    setOwned(s, v) { if (v) S.owned[s] = 1; else delete S.owned[s]; save(); },
    setBuild(k, v) { if (v) S.build[k] = 1; else delete S.build[k]; save(); },
    setTool(k, v) { if (v) S.tools[k] = 1; else delete S.tools[k]; save(); },
    setAmb(lo, hi) { S.amb = [lo, hi]; save(); },
    onChange: f => listeners.push(f),
    replaceState(obj) { Object.keys(S).forEach(k => delete S[k]); Object.assign(S, { owned: {}, build: {}, tools: {}, amb: [2, 30], open: {} }, obj); save(); },
    save,
    levelOf: s => window.LEVEL_OF[s],
    LVC: lv => (window.LEVELS[lv - 1] || {}).color || '#888',
  };
})();
