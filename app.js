/* Cabal Dashboard — frontend logic (CRM-style, logo-matched theme).
 * Each page sets window.DASH_PRODUCT before loading this file.
 * Paste your deployed Apps Script Web App URL into WEB_APP_URL below.
 */

// ---- Config ----------------------------------------------------------------
var WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbzm5ABDvDdRCos_cr3zlb39KxxmNWV6Uz9RgeylYV1S3H-L7rDMQeQ6DYIu5Vojr4o/exec';

// Read themed colors from CSS so charts match the per-product accent.
function cssVar(name) {
  return getComputedStyle(document.body).getPropertyValue(name).trim();
}
var ACCENT, ACCENT2, GRID, TICK, PRODUCT, CUR;

// Monthly revenue targets + currency unit per product.
var TARGETS  = { 'CBPC-TH': 6000000, 'CBPC-SEA': 200000 };
var CURRENCY = { 'CBPC-TH': '฿', 'CBPC-SEA': '$' };

// ---- Boot ------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', function () {
  ACCENT  = cssVar('--accent')   || '#2ee59d';
  ACCENT2 = cssVar('--accent-2') || '#0f9b6c';
  GRID = 'rgba(255,255,255,0.05)';
  TICK = cssVar('--muted') || '#8c9b94';

  installGlowDefaults();

  var url = WEB_APP_URL || 'sample-data.json'; // local preview fallback
  fetch(url)
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function (data) { render(window.DASH_PRODUCT, data); })
    .catch(function (err) { showStatus('โหลดข้อมูลไม่ได้: ' + err.message, true); });
});

function showStatus(msg, isError) {
  var el = document.getElementById('status');
  if (!el) return;
  el.textContent = msg; el.className = isError ? 'error' : ''; el.style.display = 'block';
}

// ---- Render ----------------------------------------------------------------
function render(product, data) {
  var p = data.products[product];
  if (!p) return showStatus('ไม่พบข้อมูล product: ' + product, true);
  document.getElementById('status').style.display = 'none';

  var meta = document.getElementById('updatedAt');
  if (meta && data.updatedAt) meta.textContent = formatUpdated(data.updatedAt);

  var labels = data.days.map(shortDate);

  PRODUCT = product;
  CUR = CURRENCY[product] || '';

  renderKpis(product, p, data.days);
  drawMain(labels, p['DAU'] || [], p['CCU'] || []);
  drawArea('revChart',   labels, p['Revenue']   || [], colorFor('Revenue'));
  drawArea('alzChart',   labels, p['ALZ Daily'] || [], colorFor('ALZ Daily'), true);
  drawArea('alz30Chart', labels, p['ALZ 30D']   || [], colorFor('ALZ 30D'),   true);
  drawArea('fgChart',    labels, p['FG Daily']  || [], colorFor('FG Daily'),  true);
  drawArea('fg30Chart',  labels, p['FG 30D']    || [], colorFor('FG 30D'),    true);
  drawBar(p['Revenue'] || [], data.days);
  drawTarget(product, p, data.days);
}

function renderKpis(product, p, days) {
  var wrap = document.getElementById('kpis');
  wrap.innerHTML = '';
  wrap.appendChild(heroCard('DAU', 'Daily Active Users', kpi(p['DAU']), 'a'));
  wrap.appendChild(heroCard('CCU', 'Concurrent Users',   kpi(p['CCU']), 'b'));
  wrap.appendChild(statCard('💰', 'Revenue', kpi(p['Revenue']), true));
  wrap.appendChild(targetCard(product, p, days));
}

// month-to-date revenue (sum of latest calendar month in the window)
function revenueMTD(p, days) {
  var rev = p['Revenue'] || [];
  if (!days.length) return 0;
  var month = days[days.length - 1].slice(0, 7); // "YYYY-MM"
  var sum = 0;
  for (var i = 0; i < days.length; i++) {
    if (days[i].slice(0, 7) === month && rev[i] != null) sum += rev[i];
  }
  return sum;
}

function targetCard(product, p, days) {
  var target = TARGETS[product] || 0;
  var mtd = revenueMTD(p, days);
  var pct = target ? (mtd / target) * 100 : 0;
  var div = document.createElement('div');
  div.className = 'stat target';
  div.innerHTML =
    '<div class="row"><div class="ic red">🎯</div>' +
    '<div class="label">Revenue Target (เดือนนี้)</div>' +
    '<div class="pill down">' + pct.toFixed(1) + '%</div></div>' +
    '<div class="value">' + fmtMoney(mtd) + '</div>' +
    '<div class="target-bar"><span style="width:' + Math.min(100, pct).toFixed(1) + '%"></span></div>' +
    '<div class="target-sub">เป้า ' + fmtMoney(target) + '</div>';
  return div;
}

function kpi(series) {
  series = series || [];
  var latest = lastNonNull(series);
  var prev = lastNonNull(series, latest.index);
  var delta = (latest.value != null && prev.value != null && prev.value !== 0)
    ? ((latest.value - prev.value) / Math.abs(prev.value)) * 100 : null;
  return { value: latest.value, delta: delta };
}

function deltaInfo(d) {
  if (d == null) return { cls: 'flat', html: '—' };
  var cls = d > 0.05 ? 'up' : (d < -0.05 ? 'down' : 'flat');
  var arrow = cls === 'up' ? '▲' : (cls === 'down' ? '▼' : '—');
  return { cls: cls, html: arrow + ' ' + Math.abs(d).toFixed(1) + '%' };
}

function heroCard(label, sub, k, variant) {
  var d = deltaInfo(k.delta);
  var div = document.createElement('div');
  div.className = 'hero ' + variant;
  div.innerHTML =
    '<div class="label">' + label + ' · ' + sub + '</div>' +
    '<div class="big">' + (k.value == null ? '—' : fmtNum(k.value)) + '</div>' +
    '<div class="delta">' + d.html + ' vs วันก่อน</div>';
  return div;
}

function statCard(icon, label, k, isMoney) {
  var d = deltaInfo(k.delta);
  var div = document.createElement('div');
  div.className = 'stat';
  var val = k.value == null ? '—' : (isMoney ? fmtMoney(k.value) : fmtNum(k.value));
  div.innerHTML =
    '<div class="row"><div class="ic">' + icon + '</div>' +
    '<div class="label">' + label + '</div>' +
    '<div class="pill ' + d.cls + '">' + d.html + '</div></div>' +
    '<div class="value">' + val + '</div>';
  return div;
}

// ---- Charts ----------------------------------------------------------------
function baseOpts(extra) {
  var o = {
    responsive: true, maintainAspectRatio: false,
    interaction: { intersect: false, mode: 'index' },
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: function (c) {
        return c.dataset.label + ': ' + (c.parsed.y == null ? '—' : fmtNum(c.parsed.y)); } } }
    },
    scales: {
      x: { grid: { color: GRID }, ticks: { color: TICK, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
      y: { grid: { color: GRID }, ticks: { color: TICK, callback: function (v) { return fmtNum(v); } } }
    }
  };
  return Object.assign(o, extra || {});
}

// Distinct hue per metric so the dashboard isn't all-green.
var METRIC_COLOR = {
  'DAU': '#2ee59d', 'CCU': '#37c6ff', 'Revenue': '#ffce5c',
  'ALZ Daily': '#2ee59d', 'ALZ 30D': '#37c6ff',
  'FG Daily': '#b98bff', 'FG 30D': '#ff7ab6'
};
function colorFor(metric) {
  if (metric === 'DAU') return ACCENT; // keep per-product identity on the main chart
  return METRIC_COLOR[metric] || ACCENT;
}

// Shift a hex toward a lighter companion for gradient strokes.
function lighten(hex, amt) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(function (x) { return x + x; }).join('');
  var n = parseInt(hex, 16);
  var r = Math.min(255, ((n >> 16) & 255) + amt), g = Math.min(255, ((n >> 8) & 255) + amt), b = Math.min(255, (n & 255) + amt);
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}

function gradientFill(ctx, hex) {
  var g = ctx.createLinearGradient(0, 0, 0, 300);
  g.addColorStop(0, hexToRgba(hex, 0.40));
  g.addColorStop(1, hexToRgba(hex, 0.01));
  return g;
}

// Horizontal gradient along the line for a "ไล่สี" look.
function strokeGradient(ctx, w, c1, c2) {
  var g = ctx.createLinearGradient(0, 0, w || 600, 0);
  g.addColorStop(0, c1);
  g.addColorStop(1, c2);
  return g;
}

function drawMain(labels, dau, ccu) {
  var c = document.getElementById('mainChart');
  var ctx = c.getContext('2d');
  var w = c.clientWidth || 600;
  var dauStroke = strokeGradient(ctx, w, colorFor('DAU'), colorFor('CCU')); // emerald -> sky
  new Chart(c, {
    type: 'line',
    data: { labels: labels, datasets: [
      { label: 'DAU', data: dau, borderColor: dauStroke, backgroundColor: gradientFill(ctx, colorFor('DAU')),
        fill: true, tension: .4, pointRadius: 0, borderWidth: 3, spanGaps: true },
      { label: 'CCU', data: ccu, borderColor: colorFor('CCU'), backgroundColor: 'transparent',
        fill: false, tension: .4, pointRadius: 0, borderWidth: 2, borderDash: [5, 4], spanGaps: true }
    ] },
    options: baseOpts()
  });
}

function drawArea(id, labels, series, color, allowNeg) {
  var c = document.getElementById(id);
  var money = (id === 'revChart'); // Revenue trend shows currency unit
  var f = money ? fmtMoney : fmtNum;
  new Chart(c, {
    type: 'line',
    data: { labels: labels, datasets: [
      { label: id, data: series, borderColor: color, backgroundColor: gradientFill(c.getContext('2d'), color),
        fill: true, tension: .4, pointRadius: 0, borderWidth: 2.5, spanGaps: true }
    ] },
    options: baseOpts({
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (x) {
        return (x.parsed.y == null ? '—' : f(x.parsed.y)); } } } },
      scales: {
        x: { grid: { color: GRID }, ticks: { color: TICK, maxRotation: 0, autoSkip: true, maxTicksLimit: 6 } },
        y: { grid: { color: GRID, drawBorder: false }, ticks: { color: TICK, maxTicksLimit: 5, callback: function (v) { return f(v); } },
             beginAtZero: !allowNeg }
      }
    })
  });
}

function drawBar(revenue, days) {
  var n = Math.min(7, revenue.length);
  var data = revenue.slice(revenue.length - n);
  var labels = days.slice(days.length - n).map(shortDate);
  var c = document.getElementById('barChart');
  var ctx = c.getContext('2d');
  var g = ctx.createLinearGradient(0, 0, 0, 180);
  g.addColorStop(0, ACCENT); g.addColorStop(1, hexToRgba(ACCENT2, 0.6));
  new Chart(c, {
    type: 'bar',
    data: { labels: labels, datasets: [
      { label: 'Revenue', data: data, backgroundColor: g, borderRadius: 6, maxBarThickness: 30, order: 2 },
      { label: 'Trend', data: data, type: 'line', borderColor: '#ffce5c', backgroundColor: 'transparent',
        borderWidth: 2.5, tension: .35, pointRadius: 3, pointBackgroundColor: '#ffce5c', fill: false, order: 1 }
    ] },
    options: baseOpts({
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (x) {
        return x.dataset.label + ': ' + fmtMoney(x.parsed.y); } } } },
      scales: {
        x: { grid: { display: false }, ticks: { color: TICK } },
        y: { grid: { color: GRID }, ticks: { color: TICK, maxTicksLimit: 5, callback: function (v) { return fmtMoney(v); } }, beginAtZero: true }
      }
    })
  });
}

// Donut gauge: month-to-date revenue vs target (red = achieved).
function drawTarget(product, p, days) {
  var c = document.getElementById('targetChart');
  if (!c) return;
  var target = TARGETS[product] || 0;
  var mtd = revenueMTD(p, days);
  var pct = target ? (mtd / target) * 100 : 0;
  var achieved = Math.max(0, Math.min(target, mtd));
  var remaining = Math.max(0, target - mtd);
  new Chart(c, {
    type: 'doughnut',
    data: { labels: ['ทำได้', 'เหลือ'], datasets: [{
      data: [achieved, remaining],
      backgroundColor: ['#ff4d4d', 'rgba(255,255,255,.07)'],
      borderColor: 'transparent', cutout: '72%'
    }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: function (x) { return x.label + ': ' + fmtMoney(x.parsed); } } },
        centerText: { pct: pct, sub: fmtMoney(mtd) + ' / ' + fmtMoney(target) }
      }
    }
  });
}

/* Neon glow under lines — mimics the reference dashboard. */
function installGlowDefaults() {
  if (!window.Chart) return;
  Chart.register({
    id: 'lineGlow',
    beforeDatasetDraw: function (chart, args) {
      var ds = chart.data.datasets[args.index];
      if (chart.config.type === 'line' && ds.fill) {
        var ctx = chart.ctx;
        ctx.save();
        ctx.shadowColor = ds.borderColor;
        ctx.shadowBlur = 14;
        ctx.shadowOffsetY = 4;
      }
    },
    afterDatasetDraw: function (chart) { chart.ctx.restore(); }
  });

  // Center % label for the target doughnut gauge.
  Chart.register({
    id: 'centerText',
    afterDraw: function (chart) {
      var opt = chart.config.options.plugins && chart.config.options.plugins.centerText;
      if (!opt) return;
      var a = chart.chartArea, ctx = chart.ctx;
      var cx = (a.left + a.right) / 2, cy = (a.top + a.bottom) / 2;
      ctx.save();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ff5d5d';
      ctx.font = '700 30px -apple-system, Segoe UI, Roboto, sans-serif';
      ctx.fillText(opt.pct.toFixed(1) + '%', cx, cy - 8);
      ctx.fillStyle = '#9aa3b2';
      ctx.font = '500 11px -apple-system, Segoe UI, Roboto, sans-serif';
      ctx.fillText('ของเป้า', cx, cy + 16);
      ctx.restore();
    }
  });
}

// ---- Utils -----------------------------------------------------------------
function lastNonNull(arr, beforeIndex) {
  var start = (beforeIndex == null ? arr.length : beforeIndex) - 1;
  for (var i = start; i >= 0; i--) if (arr[i] != null) return { value: arr[i], index: i };
  return { value: null, index: -1 };
}
function fmtMoney(n) {
  if (n == null) return '—';
  return (CUR || '') + fmtNum(n);
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
function shortDate(iso) { var p = iso.split('-'); return p[2] + '/' + p[1]; }
function formatUpdated(iso) {
  var d = new Date(iso);
  if (isNaN(d)) return iso;
  return 'อัปเดต ' + d.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
}
function hexToRgba(hex, a) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(function (x) { return x + x; }).join('');
  var n = parseInt(hex, 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}
