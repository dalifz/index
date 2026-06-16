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
var ACCENT, ACCENT2, GRID, TICK;

function qs(name, def) {
  var m = new RegExp('[?&]' + name + '=([^&]+)').exec(location.search);
  return m ? decodeURIComponent(m[1]) : def;
}

document.addEventListener('DOMContentLoaded', function () {
  var product = qs('p', 'CBPC-TH');
  var groupKey = qs('g', 'dauccu');
  if (!GROUPS[groupKey]) groupKey = 'dauccu';
  var group = GROUPS[groupKey];

  // Theme + branding by product (before charts so CSS vars resolve).
  document.body.dataset.theme = (product === 'CBPC-SEA') ? 'sea' : 'th';
  document.getElementById('brandLogo').src = LOGOS[product] || LOGOS['CBPC-TH'];
  document.getElementById('brandSub').textContent = product;
  document.title = group.title + ' · ' + product;
  document.getElementById('detailTitle').textContent = product + ' — ' + group.title;

  // Sidebar nav state + links.
  var overviewHref = (product === 'CBPC-SEA') ? 'sea.html' : 'th.html';
  document.getElementById('navTH').className  = (product === 'CBPC-TH')  ? 'active' : '';
  document.getElementById('navSEA').className = (product === 'CBPC-SEA') ? 'active' : '';
  [].forEach.call(document.querySelectorAll('#navMetrics a'), function (a) {
    var g = a.getAttribute('data-g');
    a.href = (g === 'overview') ? overviewHref : ('detail.html?p=' + encodeURIComponent(product) + '&g=' + g);
    if (g === groupKey) a.className = 'active';
  });

  ACCENT  = cssVar('--accent')   || '#2ee59d';
  ACCENT2 = cssVar('--accent-2') || '#0f9b6c';
  GRID = 'rgba(255,255,255,0.05)';
  TICK = cssVar('--muted') || '#8c9b94';
  installGlow();

  fetch(WEB_APP_URL)
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function (data) { render(product, group, data); })
    .catch(function (err) { showStatus('โหลดข้อมูลไม่ได้: ' + err.message, true); });
});

function render(product, group, data) {
  var p = data.products[product];
  if (!p) return showStatus('ไม่พบข้อมูล product: ' + product, true);
  document.getElementById('status').style.display = 'none';

  var meta = document.getElementById('updatedAt');
  if (meta && data.updatedAt) meta.textContent = formatUpdated(data.updatedAt);

  var labels = data.days.map(shortDate);
  var grid = document.getElementById('charts');
  grid.className = 'row-' + (group.metrics.length >= 4 ? '4' : (group.metrics.length === 1 ? '3' : '3'));
  grid.innerHTML = '';

  group.metrics.forEach(function (metric, i) {
    var color = (i % 2 === 0) ? ACCENT : ACCENT2;
    var card = document.createElement('div');
    card.className = 'card';
    if (group.metrics.length === 1) card.className += ' span-2';
    var cid = 'c_' + metric.replace(/\s+/g, '_');
    card.innerHTML = '<h3>' + metric + '</h3><div class="chart-wrap sm"><canvas id="' + cid + '"></canvas></div>';
    grid.appendChild(card);
    drawArea(cid, labels, p[metric] || [], color);
  });

  buildTable(product, group, p, data.days);
}

function buildTable(product, group, p, days) {
  var t = document.getElementById('dataTable');
  var head = '<thead><tr><th>วันที่</th>';
  group.metrics.forEach(function (m) { head += '<th>' + m + '</th>'; });
  head += '</tr></thead>';

  var rows = '';
  for (var d = days.length - 1; d >= 0; d--) { // ล่าสุดอยู่บน
    rows += '<tr><td>' + days[d] + '</td>';
    group.metrics.forEach(function (m) {
      var v = (p[m] || [])[d];
      if (v == null) { rows += '<td class="na">—</td>'; return; }
      // ALZ/FG = in-game currency: ลบ = burn ออกดี = เขียว(pos), บวก = เฟ้อ = แดง(neg)
      var isCurrency = /^(ALZ|FG)/.test(m);
      var cls = isCurrency ? (v < 0 ? 'pos' : (v > 0 ? 'neg' : '')) : '';
      rows += '<td class="' + cls + '">' + fmtFull(v) + '</td>';
    });
    rows += '</tr>';
  }
  t.innerHTML = head + '<tbody>' + rows + '</tbody>';
}

// ---- Chart helpers ----
function cssVar(n) { return getComputedStyle(document.body).getPropertyValue(n).trim(); }

function drawArea(id, labels, series, color) {
  var c = document.getElementById(id);
  var ctx = c.getContext('2d');
  var g = ctx.createLinearGradient(0, 0, 0, 200);
  g.addColorStop(0, hexToRgba(color, 0.35)); g.addColorStop(1, hexToRgba(color, 0.01));
  new Chart(c, {
    type: 'line',
    data: { labels: labels, datasets: [
      { label: id, data: series, borderColor: color, backgroundColor: g,
        fill: true, tension: .4, pointRadius: 0, borderWidth: 2.5, spanGaps: true }
    ] },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (x) {
        return (x.parsed.y == null ? '—' : fmtFull(x.parsed.y)); } } } },
      scales: {
        x: { grid: { color: GRID }, ticks: { color: TICK, maxRotation: 0, autoSkip: true, maxTicksLimit: 7 } },
        y: { grid: { color: GRID }, ticks: { color: TICK, maxTicksLimit: 5, callback: function (v) { return fmtNum(v); } } }
      }
    }
  });
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
