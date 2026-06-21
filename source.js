/* Cabal Dashboard — ALZ/FG Source breakdown page.
 * URL: source.html?p=CBPC-TH | CBPC-SEA
 * Lazy-fetches the source endpoint (?src=1&p=...); falls back to sample-source.json.
 */
var WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbzm5ABDvDdRCos_cr3zlb39KxxmNWV6Uz9RgeylYV1S3H-L7rDMQeQ6DYIu5Vojr4o/exec';
var LOGOS = { 'CBPC-TH': 'logo_CBPC_TH.png', 'CBPC-SEA': 'logo_CBPC-SEA.png' };
var RED = ['#ff4d4d','#ff6b3d','#ff8a3d','#ffa14d','#ffb86b','#e0563d','#c0392b','#ff7e7e'];
var GREEN = ['#1fd67a','#38e08a','#2ee59d','#0fb37a','#5af2c8','#27c98f','#1aa86a','#7bf0b8'];
var GRAY = '#5b6b64';

var DATA, PRODUCT, CUR = 'ALZ', WIN = 30, DAY = '', charts = [];

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
  document.getElementById('status').style.display = 'none';
  if (d.updatedAt) document.getElementById('updatedAt').textContent = '⏱ อัปเดต ' + plain(d.updatedAt);
  // day dropdown
  var sel = document.getElementById('dayPick');
  d.days.forEach(function (iso) { var o = document.createElement('option'); o.value = iso; o.textContent = thDate(iso); sel.appendChild(o); });
  renderSourceAI();
  render();
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
  return t.split(/\n+/).map(function (l) { l = l.trim().replace(/^[-•]\s*/, ''); return l ? '<div class="ai-line">' + l + '</div>' : ''; }).join('');
}

function wireChrome() {
  var sh = document.querySelector('.shell');
  var t = document.getElementById('toggleSide'), s = document.getElementById('showSide');
  if (t) t.onclick = function () { sh.classList.add('collapsed'); };
  if (s) s.onclick = function () { sh.classList.remove('collapsed'); };
}
function wireControls() {
  document.getElementById('range').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    WIN = parseInt(b.getAttribute('data-n'), 10); DAY = '';
    document.getElementById('dayPick').value = '';
    setActive(this, b); render();
  });
  document.getElementById('curToggle').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    CUR = b.getAttribute('data-cur'); setActive(this, b); render();
  });
  document.getElementById('dayPick').addEventListener('change', function () { DAY = this.value; render(); });
}
function setActive(box, b) { [].forEach.call(box.querySelectorAll('button'), function (x) { x.classList.toggle('active', x === b); }); }

// sum a {channel:[perDay]} over the active window or single day
function aggregate(obj) {
  var days = DATA.days, out = {};
  var idxs;
  if (DAY) { var di = days.indexOf(DAY); idxs = di < 0 ? [] : [di]; }
  else { var start = Math.max(0, days.length - WIN); idxs = []; for (var i = start; i < days.length; i++) idxs.push(i); }
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

function render() {
  charts.forEach(function (c) { c.destroy(); }); charts = [];
  // both nets
  ['ALZ', 'FG'].forEach(function (cur) {
    var inc = total(aggregate(DATA[cur].income)), out = total(aggregate(DATA[cur].outcome)), net = inc - out;
    var k = cur.toLowerCase();
    var el = document.getElementById(k + 'Net');
    el.textContent = (net >= 0 ? '+' : '') + fmt(net);
    el.style.color = net > 0 ? '#ff5d5d' : '#38e08a';
    document.getElementById(k + 'In').textContent = fmt(inc);
    document.getElementById(k + 'Out').textContent = fmt(out);
  });
  var inc = aggregate(DATA[CUR].income), out = aggregate(DATA[CUR].outcome);
  var ti = total(inc), to = total(out), tot = ti + to || 1;
  // ratio
  var ri = ti / tot * 100, ro = to / tot * 100;
  document.getElementById('ratio').innerHTML =
    '<span class="seg-in" style="width:' + ri + '%">เข้า ' + ri.toFixed(1) + '%</span>' +
    '<span class="seg-out" style="width:' + ro + '%">ออก ' + ro.toFixed(1) + '%</span>';
  // highlights
  var hi = topN(inc, 1)[0] || ['-', 0], ho = topN(out, 1)[0] || ['-', 0];
  document.getElementById('highlights').innerHTML =
    chip('เข้าเยอะสุด', hi[0] + ' · ' + fmt(hi[1]) + ' (' + (ti ? (hi[1] / ti * 100).toFixed(1) : 0) + '%)', '#ff5d5d') +
    chip('ออกเยอะสุด', ho[0] + ' · ' + fmt(ho[1]) + ' (' + (to ? (ho[1] / to * 100).toFixed(1) : 0) + '%)', '#38e08a') +
    chip('เข้า : ออก', to ? (ti / to).toFixed(2) + ' : 1' : '—', '') +
    chip('Net', ((ti - to) >= 0 ? '+' : '') + fmt(ti - to), (ti - to) > 0 ? '#ff5d5d' : '#38e08a');
  // donuts
  donut('inDonut', topN(inc, 8), RED);
  donut('outDonut', topN(out, 8), GREEN);
  // table
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
      plugins: { legend: { position: 'bottom', labels: { color: '#cdd6d2', boxWidth: 11, font: { size: 13 }, padding: 9 } },
        tooltip: { callbacks: { label: function (x) { var t = x.dataset.data.reduce(function (a, b) { return a + b; }, 0); return x.label + ': ' + fmt(x.parsed) + ' (' + (t ? (x.parsed / t * 100).toFixed(1) : 0) + '%)'; } } } } } }));
}

function fmt(n) { if (n == null) return '—'; var a = Math.abs(n); if (a >= 1e12) return (n / 1e12).toFixed(2) + 'T'; if (a >= 1e9) return (n / 1e9).toFixed(2) + 'B'; if (a >= 1e6) return (n / 1e6).toFixed(2) + 'M'; if (a >= 1e3) return Math.round(n).toLocaleString('en-US'); return '' + Math.round(n); }
function thDate(iso) { var mo = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']; var p = iso.split('-'); return (+p[2]) + ' ' + mo[(+p[1]) - 1]; }
function plain(iso) { var d = new Date(iso); return isNaN(d) ? iso : d.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }); }
