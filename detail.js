/* Cabal Dashboard — per-metric detail page (chart + data table).
 * URL params:  ?p=CBPC-TH|CBPC-SEA  &g=dauccu|alzfg|revenue
 * Shares the same data source as app.js.
 */

// ---- Config (keep in sync with app.js) ----
var WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbzm5ABDvDdRCos_cr3zlb39KxxmNWV6Uz9RgeylYV1S3H-L7rDMQeQ6DYIu5Vojr4o/exec';

var GROUPS = {
  dauccu:  { title: 'DAU / CCU Trend', metrics: ['DAU', 'CCU'] },
  alzfg:   { title: 'ALZ / FG',        metrics: ['ALZ Daily', 'ALZ 30D', 'FG Daily', 'FG 30D'] },
  revenue: { title: 'Revenue',         metrics: ['Revenue'] }
};

var LOGOS = { 'CBPC-TH': 'logo_CBPC_TH.png', 'CBPC-SEA': 'logo_CBPC-SEA.png' };

// Distinct hue per metric (keep in sync with app.js).
var METRIC_COLOR = {
  'DAU': '#2ee59d', 'CCU': '#37c6ff', 'Revenue': '#ffce5c',
  'ALZ Daily': '#2ee59d', 'ALZ 30D': '#37c6ff',
  'FG Daily': '#b98bff', 'FG 30D': '#ff7ab6'
};
var METRIC_CAP = {
  'DAU': 'Daily Active Users', 'CCU': 'Concurrent Users', 'Revenue': 'รายได้รายวัน',
  'ALZ Daily': 'เงินไหลเข้า/ออกต่อวัน', 'ALZ 30D': 'ยอดสะสม 30 วัน',
  'FG Daily': 'Force Gem รายวัน', 'FG 30D': 'Force Gem สะสม 30 วัน'
};
function colorFor(m) { return m === 'DAU' ? ACCENT : (METRIC_COLOR[m] || ACCENT); }
function capFor(m) { return METRIC_CAP[m] || ''; }

var TARGETS  = { 'CBPC-TH': 6000000, 'CBPC-SEA': 200000 };
var CURRENCY = { 'CBPC-TH': '฿', 'CBPC-SEA': '$' };
var CUR = '';
var FULLD, GROUPD, PRODUCTD, DCHARTS = [], ANCHORD = 0, STARTD = 0, ENDD = 0;

var ACCENT, ACCENT2, GRID, TICK;

function money(n, full) { if (n == null) return '—'; return CUR + (CUR === '฿' ? ' ' : '') + (full ? fmtFull(n) : fmtNum(n)); }
function trackD(c) { DCHARTS.push(c); return c; }

function qs(name, def) {
  var m = new RegExp('[?&]' + name + '=([^&]+)').exec(location.search);
  return m ? decodeURIComponent(m[1]) : def;
}

document.addEventListener('DOMContentLoaded', function () {
  var product = qs('p', 'CBPC-TH');
  var groupKey = qs('g', 'dauccu');
  if (!GROUPS[groupKey]) groupKey = 'dauccu';
  var group = GROUPS[groupKey];
  CUR = CURRENCY[product] || '';

  // Theme + branding by product (before charts so CSS vars resolve).
  document.body.dataset.theme = (product === 'CBPC-SEA') ? 'sea' : 'th';
  document.getElementById('brandLogo').src = LOGOS[product] || LOGOS['CBPC-TH'];
  var fav = document.createElement('link'); fav.rel = 'icon'; fav.href = LOGOS[product] || LOGOS['CBPC-TH']; document.head.appendChild(fav);
  document.getElementById('brandSub').textContent = product;
  document.title = group.title + ' · ' + product;
  document.getElementById('detailTitle').textContent = product + ' — ' + group.title;

  // Sidebar nav state + links.
  var overviewHref = (product === 'CBPC-SEA') ? 'sea.html' : 'th.html';
  document.getElementById('navTH').className  = (product === 'CBPC-TH')  ? 'active' : '';
  document.getElementById('navSEA').className = (product === 'CBPC-SEA') ? 'active' : '';
  [].forEach.call(document.querySelectorAll('#navMetrics a'), function (a) {
    var g = a.getAttribute('data-g');
    a.href = (g === 'overview') ? overviewHref
      : (g === 'source') ? ('source.html?p=' + encodeURIComponent(product))
      : ('detail.html?p=' + encodeURIComponent(product) + '&g=' + g);
    if (g === groupKey) a.className = 'active';
  });

  ACCENT  = cssVar('--accent')   || '#2ee59d';
  ACCENT2 = cssVar('--accent-2') || '#0f9b6c';
  GRID = 'rgba(255,255,255,0.05)';
  TICK = cssVar('--muted') || '#8c9b94';
  installGlow();

  wireRangeD();
  fetch(WEB_APP_URL)
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function (data) {
      var p = data.products[product];
      if (!p) return showStatus('ไม่พบข้อมูล product: ' + product, true);
      document.getElementById('status').style.display = 'none';
      var meta = document.getElementById('updatedAt');
      if (meta && data.updatedAt) meta.textContent = formatUpdated(data.updatedAt);
      FULLD = data; GROUPD = group; PRODUCTD = product;
      ANCHORD = lastDataIdxD(); ENDD = ANCHORD; STARTD = Math.max(0, ANCHORD - 6);
      restoreRangeD();
      var sp = document.getElementById('startPick'), ep = document.getElementById('endPick');
      if (sp && ep) {
        sp.innerHTML = ''; ep.innerHTML = '';
        FULLD.days.slice(0, ANCHORD + 1).forEach(function (iso, i) { sp.appendChild(new Option(shortDate(iso), i)); ep.appendChild(new Option(shortDate(iso), i)); });
        sp.value = STARTD; ep.value = ENDD;
      }
      applyRangeD();
    })
    .catch(function (err) { showStatus('โหลดข้อมูลไม่ได้: ' + err.message, true); });
});

function wireRangeD() {
  var sp = document.getElementById('startPick'), ep = document.getElementById('endPick');
  if (!sp || !ep) return;
  function onRange() {
    STARTD = parseInt(sp.value, 10); ENDD = parseInt(ep.value, 10);
    if (STARTD > ENDD) { var t = STARTD; STARTD = ENDD; ENDD = t; sp.value = STARTD; ep.value = ENDD; }
    saveRangeD();
    applyRangeD();
  }
  sp.addEventListener('change', onRange); ep.addEventListener('change', onRange);
}

// persist selected date range across pages (shared key with Overview/Source)
var RANGE_KEY = 'cabal_range';
function saveRangeD() {
  try { localStorage.setItem(RANGE_KEY, JSON.stringify({ s: FULLD.days[STARTD], e: FULLD.days[ENDD] })); } catch (e) {}
}
function restoreRangeD() {
  try {
    var r = JSON.parse(localStorage.getItem(RANGE_KEY) || 'null'); if (!r) return false;
    var si = FULLD.days.indexOf(r.s), ei = FULLD.days.indexOf(r.e);
    if (si < 0 || ei < 0) return false;
    if (si > ei) { var t = si; si = ei; ei = t; }
    ei = Math.min(ei, ANCHORD); si = Math.min(si, ei); // clamp to this group's available data
    STARTD = si; ENDD = ei; return true;
  } catch (e) { return false; }
}

// latest day index with data among this group's metrics
function lastDataIdxD() {
  var p = FULLD.products[PRODUCTD], days = FULLD.days, ms = GROUPD.metrics, last = 0;
  for (var i = days.length - 1; i >= 0; i--) { if (ms.some(function (m) { return (p[m] || [])[i] != null; })) { last = i; break; } }
  return last;
}

// slice group metrics over selected STARTD..ENDD
function windowedD() {
  var p = FULLD.products[PRODUCTD], ms = GROUPD.metrics;
  var out = { days: FULLD.days.slice(STARTD, ENDD + 1) };
  ms.forEach(function (m) { out[m] = (p[m] || []).slice(STARTD, ENDD + 1); });
  return out;
}

function applyRangeD() {
  DCHARTS.forEach(function (c) { try { c.destroy(); } catch (e) {} }); DCHARTS = [];

  var w = windowedD(), labels = w.days.map(shortDate), group = GROUPD;
  var grid = document.getElementById('charts');
  grid.className = (group.metrics.length === 1) ? 'charts-1' : 'charts-2';
  grid.innerHTML = '';

  group.metrics.forEach(function (metric) {
    var card = document.createElement('div');
    card.className = 'card';
    var cid = 'c_' + metric.replace(/\s+/g, '_');
    card.innerHTML = '<h3>' + metric + '</h3><div class="cap">' + capFor(metric) + '</div>' +
      '<div class="chart-wrap lg"><canvas id="' + cid + '"></canvas></div>';
    grid.appendChild(card);
    drawArea(cid, labels, w[metric] || [], colorFor(metric));
  });

  if (group.metrics.indexOf('Revenue') !== -1) {
    var bcard = document.createElement('div');
    bcard.className = 'card';
    bcard.innerHTML = '<h3>Revenue / 7 วันล่าสุด</h3><div class="cap">รายได้รายวัน + trend line</div>' +
      '<div class="chart-wrap lg"><canvas id="c_RevenueBar"></canvas></div>';
    grid.appendChild(bcard);
    drawRevenueBar('c_RevenueBar', FULLD.products[PRODUCTD]['Revenue'] || [], FULLD.days);
  }

  buildTable(group, w);
}

function buildTable(group, w) {
  var t = document.getElementById('dataTable');
  var head = '<thead><tr><th>วันที่</th>';
  group.metrics.forEach(function (m) { head += '<th>' + m + '</th>'; });
  head += '</tr></thead>';

  var rows = '';
  for (var d = w.days.length - 1; d >= 0; d--) { // ล่าสุดอยู่บน
    rows += '<tr><td>' + w.days[d] + '</td>';
    group.metrics.forEach(function (m) {
      var v = (w[m] || [])[d];
      if (v == null) { rows += '<td class="na">—</td>'; return; }
      // ALZ/FG = in-game currency: ลบ = burn ออกดี = เขียว(pos), บวก = เฟ้อ = แดง(neg)
      var isCurrency = /^(ALZ|FG)/.test(m);
      var cls = isCurrency ? (v < 0 ? 'pos' : (v > 0 ? 'neg' : '')) : '';
      var disp = (m === 'Revenue') ? money(v, true) : fmtFull(v);
      rows += '<td class="' + cls + '">' + disp + '</td>';
    });
    rows += '</tr>';
  }
  t.innerHTML = head + '<tbody>' + rows + '</tbody>';
}

// ---- Chart helpers ----
function cssVar(n) { return getComputedStyle(document.body).getPropertyValue(n).trim(); }

function drawArea(id, labels, series, color) {
  var c = document.getElementById(id);
  var isMoney = (id === 'c_Revenue');
  var ctx = c.getContext('2d');
  var g = ctx.createLinearGradient(0, 0, 0, 360);
  g.addColorStop(0, hexToRgba(color, 0.40)); g.addColorStop(1, hexToRgba(color, 0.01));
  var stroke = strokeGradient(ctx, c.clientWidth || 600, color, lighten(color, 70));
  trackD(new Chart(c, {
    type: 'line',
    data: { labels: labels, datasets: [
      { label: id, data: series, borderColor: stroke, backgroundColor: g,
        fill: true, tension: .4, pointRadius: 0, borderWidth: 3, spanGaps: true }
    ] },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 500 },
      interaction: { intersect: false, mode: 'index' },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (x) {
        return (x.parsed.y == null ? '—' : (isMoney ? money(x.parsed.y) : fmtFull(x.parsed.y))); } } } },
      scales: {
        x: { grid: { color: GRID }, ticks: { color: TICK, maxRotation: 0, autoSkip: true, maxTicksLimit: 7 } },
        y: { grid: { color: GRID }, ticks: { color: TICK, maxTicksLimit: 5, callback: function (v) { return isMoney ? money(v) : fmtNum(v); } } }
      }
    }
  }));
}

function drawRevenueBar(id, revenue, days) {
  var n = Math.min(7, revenue.length);
  var data = revenue.slice(revenue.length - n);
  var labels = days.slice(days.length - n).map(shortDate);
  var c = document.getElementById(id);
  var ctx = c.getContext('2d');
  var g = ctx.createLinearGradient(0, 0, 0, 360);
  g.addColorStop(0, ACCENT); g.addColorStop(1, hexToRgba(ACCENT, 0.25));
  trackD(new Chart(c, {
    type: 'bar',
    data: { labels: labels, datasets: [
      { label: 'Revenue', data: data, backgroundColor: g, borderRadius: 6, maxBarThickness: 40, order: 2 },
      { label: 'Trend', data: data, type: 'line', borderColor: '#ffce5c', backgroundColor: 'transparent',
        borderWidth: 2.5, tension: .35, pointRadius: 3, pointBackgroundColor: '#ffce5c', fill: false, order: 1 }
    ] },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (x) {
        return x.dataset.label + ': ' + money(x.parsed.y); } } } },
      scales: {
        x: { grid: { display: false }, ticks: { color: TICK } },
        y: { grid: { color: GRID }, ticks: { color: TICK, maxTicksLimit: 5, callback: function (v) { return money(v); } }, beginAtZero: true }
      }
    }
  }));
}

function installGlow() {
  if (!window.Chart) return;
  Chart.register({
    id: 'lineGlow',
    beforeDatasetDraw: function (chart, args) {
      var ds = chart.data.datasets[args.index];
      if (chart.config.type === 'line' && ds.fill) {
        var ctx = chart.ctx; ctx.save(); ctx.shadowColor = ds.borderColor; ctx.shadowBlur = 12; ctx.shadowOffsetY = 3;
      }
    },
    afterDatasetDraw: function (chart) { chart.ctx.restore(); }
  });
}

// ---- Utils ----
function showStatus(msg, isError) {
  var el = document.getElementById('status');
  if (!el) return; el.textContent = msg; el.className = isError ? 'error' : ''; el.style.display = 'block';
}
function fmtNum(n) {
  if (n == null) return '—';
  var a = Math.abs(n);
  if (a >= 1e12) return (n / 1e12).toFixed(2) + 'T';
  if (a >= 1e9)  return (n / 1e9).toFixed(2) + 'B';
  if (a >= 1e6)  return (n / 1e6).toFixed(2) + 'M';
  if (a >= 1e3)  return Math.round(n).toLocaleString('en-US');
  return n.toLocaleString('en-US');
}
function fmtFull(n) { return n == null ? '—' : n.toLocaleString('en-US'); }
function shortDate(iso) { var p = iso.split('-'); return p[2] + '/' + p[1]; }
function formatUpdated(iso) {
  var d = new Date(iso); if (isNaN(d)) return iso;
  return 'อัปเดต ' + d.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
}
function hexToRgba(hex, a) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(function (x) { return x + x; }).join('');
  var n = parseInt(hex, 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}
function lighten(hex, amt) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(function (x) { return x + x; }).join('');
  var n = parseInt(hex, 16);
  var r = Math.min(255, ((n >> 16) & 255) + amt), g = Math.min(255, ((n >> 8) & 255) + amt), b = Math.min(255, (n & 255) + amt);
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}
function strokeGradient(ctx, w, c1, c2) {
  var g = ctx.createLinearGradient(0, 0, w || 600, 0);
  g.addColorStop(0, c1); g.addColorStop(1, c2);
  return g;
}
