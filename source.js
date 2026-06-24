/* Cabal Dashboard — ALZ/FG Source breakdown page.
 * URL: source.html?p=CBPC-TH | CBPC-SEA
 * Lazy-fetches the source endpoint (?src=1&p=...); falls back to sample-source.json.
 */
var WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbzm5ABDvDdRCos_cr3zlb39KxxmNWV6Uz9RgeylYV1S3H-L7rDMQeQ6DYIu5Vojr4o/exec';
var LOGOS = { 'CBPC-TH': 'logo_CBPC_TH.png', 'CBPC-SEA': 'logo_CBPC-SEA.png' };
var RED = ['#ff4d4d','#ff6b3d','#ff8a3d','#ffa14d','#ffb86b','#e0563d','#c0392b','#ff7e7e'];
var GREEN = ['#1fd67a','#38e08a','#2ee59d','#0fb37a','#5af2c8','#27c98f','#1aa86a','#7bf0b8'];
var GRAY = '#5b6b64';

var DATA, PRODUCT, CUR = 'ALZ', charts = [], ANCHOR = 0, START = 0, END = 0;

function qs(n, d) { var m = new RegExp('[?&]' + n + '=([^&]+)').exec(location.search); return m ? decodeURIComponent(m[1]) : d; }

document.addEventListener('DOMContentLoaded', function () {
  PRODUCT = qs('p', 'CBPC-TH');
  document.body.dataset.theme = (PRODUCT === 'CBPC-SEA') ? 'sea' : 'th';
  document.getElementById('brandLogo').src = LOGOS[PRODUCT] || LOGOS['CBPC-TH'];
  document.getElementById('brandSub').textContent = PRODUCT;
  document.getElementById('title').textContent = 'ALZ / FG Source — ' + PRODUCT;
  var fav = document.createElement('link'); fav.rel = 'icon'; fav.href = LOGOS[PRODUCT]; document.head.appendChild(fav);

  // sidebar nav
  var ov = (PRODUCT === 'CBPC-SEA') ? 'sea.html' : 'th.html';
  document.getElementById('navTH').href = 'th.html';
  document.getElementById('navSEA').href = 'sea.html';
  document.getElementById('navTH').className = PRODUCT === 'CBPC-TH' ? 'active' : '';
  document.getElementById('navSEA').className = PRODUCT === 'CBPC-SEA' ? 'active' : '';
  [].forEach.call(document.querySelectorAll('#navMetrics a'), function (a) {
    var g = a.getAttribute('data-g');
    a.href = g === 'overview' ? ov : (g === 'source' ? ('source.html?p=' + encodeURIComponent(PRODUCT)) : ('detail.html?p=' + encodeURIComponent(PRODUCT) + '&g=' + g));
  });

  wireChrome(); wireControls();

  fetch((WEB_APP_URL ? WEB_APP_URL + '?src=1&p=' + encodeURIComponent(PRODUCT) : 'sample-source.json'))
    .then(function (r) { if (!r.ok) throw 0; return r.json(); })
    .then(function (d) { if (!d || !d.ALZ) throw 0; boot(d); })
    .catch(function () { fetch('sample-source.json').then(function (r) { return r.json(); }).then(boot)
      .catch(function () { document.getElementById('status').textContent = 'โหลดข้อมูลไม่ได้'; }); });
});

function boot(d) {
  DATA = d;
  ANCHOR = lastDataIdx();
  END = ANCHOR;
  START = Math.max(0, ANCHOR - 6);   // default last 7 days
  restoreRange();
  document.getElementById('status').style.display = 'none';
  if (d.updatedAt) document.getElementById('updatedAt').textContent = '⏱ อัปเดต ' + plain(d.updatedAt);
  // Start/End pickers — only days that have data
  var sp = document.getElementById('startPick'), ep = document.getElementById('endPick');
  d.days.slice(0, ANCHOR + 1).forEach(function (iso, i) {
    sp.appendChild(new Option(thDate(iso), i)); ep.appendChild(new Option(thDate(iso), i));
  });
  sp.value = START; ep.value = END;
  renderSourceAI();
  render();
}

// persist selected date range across pages (shared key with Overview/Detail)
var RANGE_KEY = 'cabal_range';
function saveRange() {
  try { localStorage.setItem(RANGE_KEY, JSON.stringify({ s: DATA.days[START], e: DATA.days[END] })); } catch (e) {}
}
function restoreRange() {
  try {
    var r = JSON.parse(localStorage.getItem(RANGE_KEY) || 'null'); if (!r) return false;
    var si = DATA.days.indexOf(r.s), ei = DATA.days.indexOf(r.e);
    if (si < 0 || ei < 0) return false;
    if (si > ei) { var t = si; si = ei; ei = t; }
    ei = Math.min(ei, ANCHOR); si = Math.min(si, ei); // clamp to this server's available data
    START = si; END = ei; return true;
  } catch (e) { return false; }
}

// latest day index that has any ALZ/FG data (window anchors here, not "today")
function lastDataIdx() {
  var last = 0;
  ['ALZ', 'FG'].forEach(function (cur) {
    ['income', 'outcome'].forEach(function (t) {
      var o = DATA[cur][t];
      Object.keys(o).forEach(function (ch) {
        var arr = o[ch];
        for (var i = arr.length - 1; i > last; i--) { if (arr[i] > 0) { last = i; break; } }
      });
    });
  });
  return last;
}

function renderSourceAI() {
  var el = document.getElementById('srcAiCard'); if (!el) return;
  var a = DATA.aiSummary;
  if (!a || !a.byProduct || !a.byProduct[PRODUCT]) { el.style.display = 'none'; return; }
  el.innerHTML =
    '<div class="ai-head"><span class="ai-ic">🤖</span> สรุปเศรษฐกิจรายสัปดาห์' +
      '<span class="ai-range">' + thDate(a.weekStart) + ' – ' + thDate(a.weekEnd) + ' · Next Analysis ' + thDate(addDaysIso(a.weekEnd, 8)) + '</span></div>' +
    '<div class="ai-body">' + mdLite(a.byProduct[PRODUCT]) + '</div>';
  el.style.display = 'block';
}
function addDaysIso(iso, n) { var p = iso.split('-'); var d = new Date(+p[0], +p[1] - 1, +p[2]); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
function mdLite(t) {
  t = String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  return t.split(/\n+/).map(function (l) {
    l = l.trim(); if (!l || l === '---') return '';
    var m = l.match(/^(#{1,3})\s*(.*)/);
    if (m) return '<div class="ai-h' + (m[1].length === 1 ? '1' : '2') + '">' + m[2] + '</div>';
    l = l.replace(/^[-•]\s*/, '');
    return '<div class="ai-line">' + l + '</div>';
  }).join('');
}

function wireChrome() {
  var sh = document.querySelector('.shell');
  var t = document.getElementById('toggleSide'), s = document.getElementById('showSide');
  if (t) t.onclick = function () { sh.classList.add('collapsed'); };
  if (s) s.onclick = function () { sh.classList.remove('collapsed'); };
}
function wireControls() {
  var sp = document.getElementById('startPick'), ep = document.getElementById('endPick');
  function onRange() {
    START = parseInt(sp.value, 10); END = parseInt(ep.value, 10);
    if (START > END) { var t = START; START = END; END = t; sp.value = START; ep.value = END; } // keep start <= end
    saveRange();
    render();
  }
  sp.addEventListener('change', onRange);
  ep.addEventListener('change', onRange);
  document.getElementById('curToggle').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    CUR = b.getAttribute('data-cur'); setActive(this, b); render();
  });
}
function setActive(box, b) { [].forEach.call(box.querySelectorAll('button'), function (x) { x.classList.toggle('active', x === b); }); }

// sum a {channel:[perDay]} over the selected START..END range
function aggregate(obj) {
  var out = {}, idxs = [];
  for (var i = START; i <= END; i++) idxs.push(i);
  Object.keys(obj).forEach(function (ch) {
    var s = 0; idxs.forEach(function (i) { s += (obj[ch][i] || 0); });
    if (s > 0) out[ch] = s;
  });
  return out;
}
function total(o) { var s = 0; for (var k in o) s += o[k]; return s; }
function topN(o, n) {
  var arr = Object.keys(o).map(function (k) { return [k, o[k]]; }).sort(function (a, b) { return b[1] - a[1]; });
  var top = arr.slice(0, n), rest = arr.slice(n), other = rest.reduce(function (s, x) { return s + x[1]; }, 0);
  if (other > 0) top.push(['อื่นๆ (' + rest.length + ')', other]);
  return top;
}

// pull NPC Shop Sell churn out of income/outcome (storage behavior, not real flow)
function splitChurn(incObj, outObj) {
  var inc = {}, out = {};
  Object.keys(incObj).forEach(function (k) { inc[k] = incObj[k]; });
  Object.keys(outObj).forEach(function (k) { out[k] = outObj[k]; });
  var sell = inc['NPC Shop Sell'] || 0, restore = out['NPC Shop Sell Restore'] || 0;
  delete inc['NPC Shop Sell']; delete out['NPC Shop Sell Restore'];
  return { inc: inc, out: out, sell: sell, restore: restore, tru: sell - restore, has: (sell > 0 || restore > 0) };
}

function render() {
  charts.forEach(function (c) { c.destroy(); }); charts = [];
  // both net cards — REAL economy (churn netted into True, fake pair removed)
  ['ALZ', 'FG'].forEach(function (cur) {
    var S = splitChurn(aggregate(DATA[cur].income), aggregate(DATA[cur].outcome));
    var inR = total(S.inc) + (S.tru > 0 ? S.tru : 0), outR = total(S.out) + (S.tru < 0 ? -S.tru : 0), net = inR - outR;
    var k = cur.toLowerCase();
    var el = document.getElementById(k + 'Net');
    el.textContent = (net >= 0 ? '+' : '') + fmt(net);
    el.style.color = net > 0 ? '#ff5d5d' : '#38e08a';
    document.getElementById(k + 'In').textContent = fmt(inR);
    document.getElementById(k + 'Out').textContent = fmt(outR);
  });

  var S = splitChurn(aggregate(DATA[CUR].income), aggregate(DATA[CUR].outcome));
  var inc = S.inc, out = S.out;                       // donut/table/highlights = non-NPC channels
  var ti = total(inc), to = total(out), tot = ti + to || 1;
  var inR = ti + (S.tru > 0 ? S.tru : 0), outR = to + (S.tru < 0 ? -S.tru : 0), netR = inR - outR; // real (incl True)
  // ratio — real (incl True selling)
  var ri = inR / (inR + outR || 1) * 100, ro = outR / (inR + outR || 1) * 100;
  document.getElementById('ratio').innerHTML =
    '<span class="seg-in" style="width:' + ri + '%">เข้า ' + ri.toFixed(1) + '%</span>' +
    '<span class="seg-out" style="width:' + ro + '%">ออก ' + ro.toFixed(1) + '%</span>';
  // highlights — top non-NPC channels + real net
  var hi = topN(inc, 1)[0] || ['-', 0], ho = topN(out, 1)[0] || ['-', 0];
  document.getElementById('highlights').innerHTML =
    chip('เข้าเยอะสุด (ไม่รวม NPC)', hi[0] + ' · ' + fmt(hi[1]) + ' (' + (ti ? (hi[1] / ti * 100).toFixed(1) : 0) + '%)', '#ff5d5d') +
    chip('ออกเยอะสุด (ไม่รวม Restore)', ho[0] + ' · ' + fmt(ho[1]) + ' (' + (to ? (ho[1] / to * 100).toFixed(1) : 0) + '%)', '#38e08a') +
    chip('NPC Shop Sell True', (S.tru >= 0 ? '+' : '') + fmt(S.tru), S.tru >= 0 ? '#b98bff' : '#38e08a') +
    chip('Net (จริง)', (netR >= 0 ? '+' : '') + fmt(netR), netR > 0 ? '#ff5d5d' : '#38e08a');
  // main donuts (non-NPC)
  donut('inDonut', topN(inc, 8), RED);
  donut('outDonut', topN(out, 8), GREEN);
  // 3rd donut — NPC Shop Sell storage churn
  var cw = document.getElementById('churnWrap'), row = document.getElementById('donutsRow');
  if (row) row.style.gridTemplateColumns = S.has ? '1fr 1fr 1fr' : '1fr 1fr';
  if (S.has) {
    cw.style.display = '';
    donut('churnDonut', [['ขายเข้า (Sell)', S.sell], ['ดึงคืน (Restore)', S.restore]], ['#b98bff', '#7c5cd6']);
    document.getElementById('churnTrue').textContent = (S.tru >= 0 ? '+' : '') + fmt(S.tru);
    document.getElementById('churnTrue').style.color = S.tru >= 0 ? '#b98bff' : '#38e08a';
    document.getElementById('churnSub').textContent = 'ขายเข้า ' + fmt(S.sell) + ' − ดึงคืน ' + fmt(S.restore);
  } else { cw.style.display = 'none'; }
  // table (non-NPC channels)
  var rows = [];
  Object.keys(inc).forEach(function (k) { rows.push(['Income', k, inc[k], ti]); });
  Object.keys(out).forEach(function (k) { rows.push(['Outcome', k, out[k], to]); });
  rows.sort(function (a, b) { return b[2] - a[2]; });
  var h = '<thead><tr><th>ประเภท</th><th>Channel</th><th>จำนวน</th><th>% ในกลุ่ม</th><th>สัดส่วน</th></tr></thead><tbody>';
  rows.forEach(function (r) {
    var isIn = r[0] === 'Income', pct = r[3] ? r[2] / r[3] * 100 : 0, col = isIn ? '#ff5d5d' : '#38e08a';
    h += '<tr><td>' + (isIn ? 'เข้า' : 'ออก') + '</td><td>' + r[1] + '</td>' +
      '<td class="' + (isIn ? 'pos' : 'neg') + '">' + (isIn ? '+' : '−') + fmt(r[2]) + '</td>' +
      '<td>' + pct.toFixed(1) + '%</td>' +
      '<td><div class="bar-mini"><span style="width:' + Math.min(100, pct) + '%;background:' + col + '"></span></div></td></tr>';
  });
  document.getElementById('tbl').innerHTML = h + '</tbody>';
}

function chip(l, v, c) { return '<div class="chip"><b>' + l + '</b><span class="v"' + (c ? ' style="color:' + c + '"' : '') + '>' + v + '</span></div>'; }

function donut(id, data, palette) {
  var c = document.getElementById(id);
  var labels = data.map(function (d) { return d[0]; }), vals = data.map(function (d) { return d[1]; });
  var cols = labels.map(function (l, i) { return l.indexOf('อื่นๆ') === 0 ? GRAY : palette[i % palette.length]; });
  charts.push(new Chart(c, { type: 'doughnut', data: { labels: labels, datasets: [{ data: vals, backgroundColor: cols, borderColor: 'transparent', cutout: '58%' }] },
    options: { responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { color: '#cdd6d2', boxWidth: 12, font: { size: 15 }, padding: 10 } },
        tooltip: { callbacks: { label: function (x) { var t = x.dataset.data.reduce(function (a, b) { return a + b; }, 0); return x.label + ': ' + fmt(x.parsed) + ' (' + (t ? (x.parsed / t * 100).toFixed(1) : 0) + '%)'; } } } } } }));
}

function fmt(n) { if (n == null) return '—'; var a = Math.abs(n); if (a >= 1e12) return (n / 1e12).toFixed(2) + 'T'; if (a >= 1e9) return (n / 1e9).toFixed(2) + 'B'; if (a >= 1e6) return (n / 1e6).toFixed(2) + 'M'; if (a >= 1e3) return Math.round(n).toLocaleString('en-US'); return '' + Math.round(n); }
function thDate(iso) { var mo = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']; var p = iso.split('-'); return (+p[2]) + ' ' + mo[(+p[1]) - 1]; }
function plain(iso) { var d = new Date(iso); return isNaN(d) ? iso : d.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }); }
