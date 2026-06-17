/* Cabal Dashboard — overview (reference-style polish).
 * window.DASH_PRODUCT set per page before this loads.
 */

var WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbzm5ABDvDdRCos_cr3zlb39KxxmNWV6Uz9RgeylYV1S3H-L7rDMQeQ6DYIu5Vojr4o/exec';

var TARGETS  = { 'CBPC-TH': 6000000, 'CBPC-SEA': 200000 };
var CURRENCY = { 'CBPC-TH': '฿', 'CBPC-SEA': '$' };
var METRICS_ALL = ['DAU', 'CCU', 'ALZ Daily', 'ALZ 30D', 'FG Daily', 'FG 30D', 'Revenue'];
var METRIC_COLOR = {
  'DAU': '#2ee59d', 'CCU': '#37c6ff', 'Revenue': '#ffce5c',
  'ALZ Daily': '#2ee59d', 'ALZ 30D': '#37c6ff', 'FG Daily': '#b98bff', 'FG 30D': '#ff7ab6'
};
// inline SVG icons (currentColor)
var SVG = {
  money: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9.5" cy="7" r="3.5"/><path d="M22 21v-2a4 4 0 0 0-3-3.85"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="7.5" r="3.7"/><path d="M5 21v-1.5A5.5 5.5 0 0 1 10.5 14h3A5.5 5.5 0 0 1 19 19.5V21"/></svg>',
  target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>',
  coin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.2c0-1.1 1.1-1.7 2.5-1.7s2.5.7 2.5 1.7-1.1 1.6-2.5 1.6-2.5.6-2.5 1.7 1.1 1.7 2.5 1.7 2.5-.6 2.5-1.7"/></svg>',
  stack: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></svg>',
  gem: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M6 3h12l4 6-10 12L2 9z"/><path d="M2 9h20M9 3 6 9l6 12M15 3l3 6-6 12"/></svg>'
};
var METRIC_ICON = { 'ALZ Daily': SVG.coin, 'ALZ 30D': SVG.stack, 'FG Daily': SVG.gem, 'FG 30D': SVG.gem };
var METRIC_CAP = {
  'ALZ Daily': 'จำนวนเหรียญ/วัน', 'ALZ 30D': 'ยอดสะสม 30 วัน',
  'FG Daily': 'Force Gem รายวัน', 'FG 30D': 'Force Gem สะสม 30 วัน'
};

var ACCENT, ACCENT2, GRID, TICK, PRODUCT, CUR, FULL, WINDOW = 30, CHARTS = [];

function cssVar(n) { return getComputedStyle(document.body).getPropertyValue(n).trim(); }
function colorFor(m) { return m === 'DAU' ? ACCENT : (METRIC_COLOR[m] || ACCENT); }

document.addEventListener('DOMContentLoaded', function () {
  ACCENT = cssVar('--accent') || '#2ee59d'; ACCENT2 = cssVar('--accent-2') || '#0f9b6c';
  GRID = 'rgba(255,255,255,0.05)'; TICK = cssVar('--muted') || '#8c9b94';
  installPlugins(); wireRange(); wireChrome();
  load();
});

function load() {
  fetch(WEB_APP_URL || 'sample-data.json')
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function (data) { boot(window.DASH_PRODUCT, data); })
    .catch(function (err) { showStatus('โหลดข้อมูลไม่ได้: ' + err.message, true); });
}

function boot(product, data) {
  if (!data.products[product]) return showStatus('ไม่พบข้อมูล product: ' + product, true);
  PRODUCT = product; CUR = CURRENCY[product] || ''; FULL = data;
  document.getElementById('status').style.display = 'none';
  var meta = document.getElementById('updatedAt');
  if (meta && data.updatedAt) meta.textContent = '⏱ อัปเดตล่าสุด ' + plainUpdated(data.updatedAt);
  renderInsights();
  applyWindow(WINDOW);
}

// ---- top-bar chrome: refresh + sidebar collapse ----
function wireChrome() {
  var rf = document.getElementById('refresh');
  if (rf) rf.addEventListener('click', function () { rf.classList.add('spin'); load(); setTimeout(function () { rf.classList.remove('spin'); }, 800); });
  var t = document.getElementById('toggleSide'), sh = document.querySelector('.shell'), show = document.getElementById('showSide');
  if (t) t.addEventListener('click', function () { sh.classList.add('collapsed'); });
  if (show) show.addEventListener('click', function () { sh.classList.remove('collapsed'); });
}

function wireRange() {
  var box = document.getElementById('range'); if (!box) return;
  [].forEach.call(box.querySelectorAll('button'), function (b) {
    b.addEventListener('click', function () { WINDOW = parseInt(b.getAttribute('data-n'), 10); applyWindow(WINDOW); });
  });
}

function windowed(N) {
  var p = FULL.products[PRODUCT], days = FULL.days, start = Math.max(0, days.length - N);
  var di = days.slice(start), sl = {};
  METRICS_ALL.forEach(function (m) { sl[m] = (p[m] || []).slice(start); });
  var first = 0;
  for (var i = 0; i < di.length; i++) { if (METRICS_ALL.some(function (m) { return sl[m][i] != null; })) { first = i; break; } }
  var out = { days: di.slice(first) };
  METRICS_ALL.forEach(function (m) { out[m] = sl[m].slice(first); });
  return out;
}

function applyWindow(N) {
  var box = document.getElementById('range');
  if (box) [].forEach.call(box.querySelectorAll('button'), function (b) { b.className = (parseInt(b.getAttribute('data-n'), 10) === N) ? 'active' : ''; });
  var w = windowed(N), labels = w.days.map(shortDate), p = FULL.products[PRODUCT];
  destroyCharts();
  renderKpis(p, w);
  drawMain(labels, w['DAU'], w['CCU']);
  drawArea('revChart', labels, w['Revenue'], colorFor('Revenue'), false, true);
  renderMetricCards(w);
  renderRev7(p['Revenue'] || [], FULL.days);
}

function destroyCharts() { CHARTS.forEach(function (c) { try { c.destroy(); } catch (e) {} }); CHARTS = []; }
function track(c) { CHARTS.push(c); return c; }

// ---- insights ----
function renderInsights() {
  var box = document.getElementById('insights'); if (!box) return;
  var p = FULL.products[PRODUCT], days = FULL.days, chips = [];
  var dau = wow(p['DAU']); if (dau) chips.push(chip('DAU', dau.arrow + ' ' + Math.abs(dau.pct).toFixed(1) + '% WoW', dau.cls));
  var pct = targetPct(p, days); chips.push(chip('Revenue', pct.toFixed(1) + '% ของเป้าเดือนนี้', pct >= 100 ? 'good' : 'bad'));
  var alz = lastNonNull(p['ALZ Daily'] || []);
  if (alz.value != null) chips.push(chip('ALZ flow', alz.value < 0 ? 'burn ออกได้ดี' : 'เงินเข้า > ระบาย', alz.value < 0 ? 'good' : 'bad'));
  box.innerHTML = chips.join('');
}
function chip(l, v, c) { return '<span class="ins ' + (c || '') + '"><b>' + l + '</b> ' + v + '</span>'; }

// ---- KPI row ----
function renderKpis(p, w) {
  var wrap = document.getElementById('kpis'); wrap.innerHTML = '';
  var labels = w.days.map(shortDate);
  wrap.appendChild(revenueTodayCard(p));
  wrap.appendChild(kpiChartCard('DAU', SVG.users, '#37c6ff', colorFor('DAU'), p['DAU']));
  wrap.appendChild(kpiChartCard('CCU', SVG.user, '#37c6ff', '#37c6ff', p['CCU']));
  wrap.appendChild(targetCard(p, FULL.days));
  drawMini('spark_revtoday', labels, w['Revenue'], ACCENT, true);
  drawMini('c_DAU', labels, w['DAU'], colorFor('DAU'));
  drawMini('c_CCU', labels, w['CCU'], '#37c6ff');
  drawTarget(p, FULL.days);
}

// DAU/CCU: index beside title + interactive mini chart (hover tooltip)
function kpiChartCard(label, icon, iconColor, lineColor, series) {
  var w = wow(series) || { value: null, pct: 0, cls: 'flat', arrow: '—' };
  var val = w.value == null ? '—' : fmtNum(w.value);
  var div = document.createElement('div'); div.className = 'card kpi-chart';
  div.innerHTML =
    '<div class="metric-head">' +
      '<div class="mh-left"><h3><span class="ic2 mini" style="color:' + iconColor + ';background:' + hexToRgba(iconColor, .15) + '">' + icon + '</span> ' + label + '</h3></div>' +
      '<div class="metric-idx"><span class="mi-val">' + val + '</span>' +
        '<span class="delta ' + w.cls + '">' + w.arrow + ' ' + Math.abs(w.pct).toFixed(1) + '% vs เมื่อวาน</span></div>' +
    '</div>' +
    '<div class="chart-wrap mini"><canvas id="c_' + label + '"></canvas></div>';
  return div;
}

function revenueTodayCard(p) {
  var d = dod(p['Revenue']);
  var div = document.createElement('div'); div.className = 'hero rev-today';
  div.innerHTML =
    '<div class="rt-head">' +
      '<div class="label"><span class="ic2 green">' + SVG.money + '</span> Revenue Today</div>' +
      '<div class="big money">' + (d.value == null ? '—' : fmtMoney(d.value)) + '</div>' +
      '<div class="delta ' + d.cls + '">' + d.arrow + ' ' + Math.abs(d.pct).toFixed(1) + '% vs เมื่อวาน</div>' +
    '</div>' +
    '<div class="chart-wrap mini"><canvas id="spark_revtoday"></canvas></div>';
  return div;
}

function metricKpiCard(id, label, icon, iconColor, series) {
  var w = wow(series) || { value: null, pct: 0, cls: 'flat', arrow: '—' };
  var div = document.createElement('div'); div.className = 'kpi-card';
  div.innerHTML =
    '<div class="row"><span class="label">' + label + '</span><span class="ic2" style="color:' + iconColor + ';background:' + hexToRgba(iconColor, .15) + '">' + icon + '</span></div>' +
    '<div class="value">' + (w.value == null ? '—' : fmtNum(w.value)) + '</div>' +
    '<div class="delta ' + w.cls + '">' + w.arrow + ' ' + Math.abs(w.pct).toFixed(1) + '% vs เมื่อวาน</div>' +
    '<canvas class="spark" id="spark_' + id + '"></canvas>';
  return div;
}

function targetCard(p, days) {
  var t = TARGETS[PRODUCT] || 0, mtd = revenueMTD(p, days), pct = t ? (mtd / t) * 100 : 0;
  var div = document.createElement('div'); div.className = 'kpi-card target';
  div.innerHTML =
    '<div class="row"><span class="label"><span class="ic2 red">' + SVG.target + '</span> Revenue Target</span></div>' +
    '<div class="t-body">' +
      '<div class="t-left">' +
        '<div class="value red">' + pct.toFixed(1) + '%</div>' +
        '<div class="sub">จากเป้าหมาย ' + fmtMoney(t) + '</div>' +
        '<div class="target-sub">' + fmtMoney(mtd) + ' / ' + fmtMoney(t) + '</div>' +
      '</div>' +
      '<div class="t-donut"><canvas id="targetChart"></canvas></div>' +
    '</div>';
  return div;
}

// ---- ALZ/FG full charts (hover tooltips) + small header index ----
function renderMetricCards(w) {
  var wrap = document.getElementById('metrics'); if (!wrap) return; wrap.innerHTML = '';
  var labels = w.days.map(shortDate);
  ['ALZ Daily', 'ALZ 30D', 'FG Daily', 'FG 30D'].forEach(function (m) {
    var is30 = /30D/.test(m);
    var ww = wow(w[m] || [], is30 ? 30 : 7);
    var color = colorFor(m);
    var cid = 'c_' + m.replace(/\s+/g, '_');
    var val = ww && ww.value != null ? fmtNum(ww.value) : '—';
    var dl = ww ? '<span class="delta ' + ww.cls + '">' + ww.arrow + ' ' + Math.abs(ww.pct).toFixed(1) + '% vs ' + (is30 ? '30' : '7') + 'ว.</span>' : '';
    var div = document.createElement('div'); div.className = 'card';
    div.innerHTML =
      '<div class="metric-head">' +
        '<div class="mh-left"><h3><span class="ic2 mini" style="color:' + color + ';background:' + hexToRgba(color, .15) + '">' + (METRIC_ICON[m] || '') + '</span> ' + m + '</h3>' +
        '<div class="cap">' + (METRIC_CAP[m] || '') + '</div></div>' +
        '<div class="metric-idx"><span class="mi-val" style="color:' + color + '">' + val + '</span>' + dl + '</div>' +
      '</div>' +
      '<div class="chart-wrap sm"><canvas id="' + cid + '"></canvas></div>';
    wrap.appendChild(div);
    drawArea(cid, labels, w[m] || [], color, true);
  });
}

// ---- Revenue 7 Days panel ----
function renderRev7(revenue, days) {
  var wrap = document.getElementById('rev7'); if (!wrap) return;
  var end = revenue.length - 1; while (end >= 0 && revenue[end] == null) end--; // last day with data
  if (end < 0) end = revenue.length - 1;
  var startI = Math.max(0, end - 6);
  var data = revenue.slice(startI, end + 1).map(function (x) { return x == null ? 0 : x; });
  var dys = days.slice(startI, end + 1);
  var total = data.reduce(function (a, b) { return a + b; }, 0);
  var avg = data.length ? total / data.length : 0;
  var bestI = 0; for (var i = 1; i < data.length; i++) if (data[i] > data[bestI]) bestI = i;
  var w7 = wow(revenue, 7);

  wrap.innerHTML =
    '<div class="card rev7">' +
      '<div class="rev7-left">' +
        '<h3>Revenue 7 Days</h3><div class="cap">รายได้รวม 7 วันล่าสุด (' + (CUR === '฿' ? 'บาท' : 'USD') + ')</div>' +
        '<div class="rev7-total">' + fmtMoney(total) + '</div>' +
        (w7 ? '<div class="delta ' + w7.cls + '">' + w7.arrow + ' ' + Math.abs(w7.pct).toFixed(1) + '% vs 7 วันก่อน</div>' : '') +
        '<div class="rev7-stats">' +
          '<div class="box"><div class="bl">Avg / Day</div><div class="bv">' + fmtMoney(avg) + '</div></div>' +
          '<div class="box"><div class="bl">Best Day</div><div class="bv">' + fmtMoney(data[bestI]) + '</div><div class="bd">' + thDate(dys[bestI]) + '</div></div>' +
        '</div>' +
      '</div>' +
      '<div class="rev7-right"><div class="chart-wrap"><canvas id="barChart"></canvas></div></div>' +
    '</div>';
  drawBar(data, dys, avg);
}

// ---- charts ----
function gradientFill(ctx, hex) { var g = ctx.createLinearGradient(0, 0, 0, 300); g.addColorStop(0, hexToRgba(hex, .40)); g.addColorStop(1, hexToRgba(hex, .01)); return g; }
function strokeGradient(ctx, w, c1, c2) { var g = ctx.createLinearGradient(0, 0, w || 600, 0); g.addColorStop(0, c1); g.addColorStop(1, c2); return g; }

function baseOpts(extra) {
  return Object.assign({
    responsive: true, maintainAspectRatio: false, animation: { duration: 600 },
    interaction: { intersect: false, mode: 'index' },
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (c) { return c.dataset.label + ': ' + (c.parsed.y == null ? '—' : fmtNum(c.parsed.y)); } } } },
    scales: { x: { grid: { color: GRID }, ticks: { color: TICK, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
      y: { grid: { color: GRID }, ticks: { color: TICK, callback: function (v) { return fmtNum(v); } } } }
  }, extra || {});
}

function drawMain(labels, dau, ccu) {
  var c = document.getElementById('mainChart'); if (!c) return; var ctx = c.getContext('2d');
  track(new Chart(c, { type: 'line', data: { labels: labels, datasets: [
    { label: 'DAU', data: dau, borderColor: colorFor('DAU'), backgroundColor: gradientFill(ctx, colorFor('DAU')), fill: true, tension: .4, pointRadius: 0, borderWidth: 3, spanGaps: true },
    { label: 'CCU', data: ccu, borderColor: '#37c6ff', backgroundColor: 'transparent', fill: false, tension: .4, pointRadius: 0, borderWidth: 2, borderDash: [5, 4], spanGaps: true }
  ] }, options: baseOpts() }));
}

function drawArea(id, labels, series, color, allowNeg, money) {
  var c = document.getElementById(id); if (!c) return; var ctx = c.getContext('2d');
  var f = money ? fmtMoney : fmtNum;
  var ds = [{ label: id, data: series, borderColor: color, backgroundColor: gradientFill(ctx, color), fill: true, tension: .4, pointRadius: 0, borderWidth: 2.5, spanGaps: true }];
  if (money) { var dt = dailyTarget(); if (dt) ds.push({ label: 'เป้า/วัน', data: series.map(function () { return dt; }), borderColor: '#ff6b6b', borderDash: [6, 5], borderWidth: 1.5, pointRadius: 0, fill: false }); }
  track(new Chart(c, { type: 'line', data: { labels: labels, datasets: ds }, options: baseOpts({
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (x) { return x.dataset.label + ': ' + (x.parsed.y == null ? '—' : f(x.parsed.y)); } } } },
    scales: { x: { grid: { color: GRID }, ticks: { color: TICK, maxRotation: 0, autoSkip: true, maxTicksLimit: 6 } },
      y: { grid: { color: GRID }, ticks: { color: TICK, maxTicksLimit: 5, callback: function (v) { return f(v); } }, beginAtZero: !allowNeg } }
  }) }));
}

function dailyTarget() { var t = TARGETS[PRODUCT] || 0; if (!t || !FULL.days.length) return 0; var d = FULL.days[FULL.days.length - 1].split('-'); return t / new Date(+d[0], +d[1], 0).getDate(); }

function drawBar(data, dys, avg) {
  var c = document.getElementById('barChart'); if (!c) return; var ctx = c.getContext('2d');
  var g = ctx.createLinearGradient(0, 0, 0, 280); g.addColorStop(0, ACCENT); g.addColorStop(1, hexToRgba(ACCENT2, .5));
  track(new Chart(c, { type: 'bar', data: { labels: dys.map(thDate), datasets: [
    { label: 'Revenue', data: data, backgroundColor: g, borderRadius: 8, maxBarThickness: 46, order: 2 },
    { label: 'Avg (7 Days)', data: data.map(function () { return avg; }), type: 'line', borderColor: '#ff5d5d', borderDash: [6, 5], borderWidth: 2, pointRadius: 0, fill: false, order: 1 }
  ] }, options: baseOpts({
    layout: { padding: { top: 22 } },
    plugins: { legend: { display: true, labels: { color: TICK, usePointStyle: true, boxWidth: 8 } },
      tooltip: { callbacks: { label: function (x) { return x.dataset.label + ': ' + fmtMoney(x.parsed.y); } } },
      barValues: { color: '#e9f1ee' } },
    scales: { x: { grid: { display: false }, ticks: { color: TICK } },
      y: { grid: { color: GRID }, ticks: { color: TICK, maxTicksLimit: 5, callback: function (v) { return fmtMoney(v); } }, beginAtZero: true } }
  }) }));
}

function drawMini(id, labels, series, color, money) {
  var c = document.getElementById(id); if (!c) return; var ctx = c.getContext('2d');
  var f = money ? fmtMoney : fmtNum;
  var lbl = id.replace('c_', '').replace('spark_revtoday', 'Revenue');
  track(new Chart(c, { type: 'line', data: { labels: labels, datasets: [
    { label: lbl, data: series, borderColor: color, backgroundColor: gradientFill(ctx, color), fill: true, tension: .4, pointRadius: 0, borderWidth: 2.5, spanGaps: true }
  ] }, options: {
    responsive: true, maintainAspectRatio: false, animation: { duration: 500 }, interaction: { intersect: false, mode: 'index' },
    plugins: { legend: { display: false }, tooltip: { enabled: false, external: externalTip, callbacks: { label: function (x) { return x.dataset.label + ': ' + (x.parsed.y == null ? '—' : f(x.parsed.y)); } } } },
    scales: {
      x: { display: true, grid: { display: false }, ticks: { color: TICK, font: { size: 9 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 5 } },
      y: { display: true, grid: { color: GRID }, ticks: { color: TICK, font: { size: 9 }, maxTicksLimit: 3, callback: function (v) { return f(v); } } }
    }
  } }));
}

// HTML tooltip rendered outside the canvas (mini charts are too short to fit Chart.js tooltips)
function externalTip(ctx) {
  var el = document.getElementById('chartTip');
  if (!el) { el = document.createElement('div'); el.id = 'chartTip'; document.body.appendChild(el); }
  var tt = ctx.tooltip;
  if (!tt || tt.opacity === 0) { el.style.opacity = 0; return; }
  var title = (tt.title && tt.title[0]) || '';
  var lines = (tt.body || []).map(function (b) { return b.lines.join(''); });
  el.innerHTML = '<div class="tt-title">' + title + '</div>' + lines.map(function (l) { return '<div class="tt-line">' + l + '</div>'; }).join('');
  var r = ctx.chart.canvas.getBoundingClientRect();
  el.style.opacity = 1;
  el.style.left = (window.scrollX + r.left + tt.caretX) + 'px';
  el.style.top = (window.scrollY + r.top + tt.caretY) + 'px';
}

function drawTarget(p, days) {
  var c = document.getElementById('targetChart'); if (!c) return;
  var dpr = window.devicePixelRatio || 1, SZ = 182;
  c.width = SZ * dpr; c.height = SZ * dpr; c.style.width = SZ + 'px'; c.style.height = SZ + 'px';
  var t = TARGETS[PRODUCT] || 0, mtd = revenueMTD(p, days), pct = t ? (mtd / t) * 100 : 0;
  var ctx = c.getContext('2d');
  var grad = ctx.createLinearGradient(0, 0, SZ * dpr, SZ * dpr);
  grad.addColorStop(0, '#ff4d4d'); grad.addColorStop(.5, '#ffb13d'); grad.addColorStop(1, '#2ee59d');
  var col = lerpColor('#ff4d4d', '#2ee59d', Math.max(0, Math.min(1, pct / 100)));
  track(new Chart(c, { type: 'doughnut', data: { labels: ['ทำได้', 'เหลือ'], datasets: [{ data: [Math.max(0, Math.min(t, mtd)), Math.max(0, t - mtd)], backgroundColor: [grad, 'rgba(255,255,255,.08)'], borderColor: 'transparent', cutout: '70%' }] },
    options: { responsive: false, maintainAspectRatio: false, devicePixelRatio: dpr, animation: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (x) { return x.label + ': ' + fmtMoney(x.parsed); } } }, centerText: { pct: pct, color: col } } } }));
}

function drawSpark(id, series, color, fill) {
  var c = document.getElementById(id); if (!c) return; var ctx = c.getContext('2d');
  var n = Math.min(14, series.length), data = (series || []).slice(series.length - n);
  track(new Chart(c, { type: 'line', data: { labels: data.map(function () { return ''; }), datasets: [{ data: data, borderColor: hexToRgba(color, .95), borderWidth: 2, pointRadius: 0, tension: .4, spanGaps: true, fill: !!fill, backgroundColor: fill ? gradientFill(ctx, color) : 'transparent' }] },
    options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: false }, tooltip: { enabled: false } }, scales: { x: { display: false }, y: { display: false } } } }));
}

// ---- plugins ----
function installPlugins() {
  if (!window.Chart) return;
  Chart.register({ id: 'lineGlow',
    beforeDatasetDraw: function (chart, args) { var ds = chart.data.datasets[args.index]; if (chart.config.type === 'line' && ds.fill) { var x = chart.ctx; x.save(); x.shadowColor = typeof ds.borderColor === 'string' ? ds.borderColor : '#2ee59d'; x.shadowBlur = 12; x.shadowOffsetY = 3; } },
    afterDatasetDraw: function (chart) { chart.ctx.restore(); } });
  Chart.register({ id: 'centerText', afterDraw: function (chart) {
    var opt = chart.config.options.plugins && chart.config.options.plugins.centerText; if (!opt) return;
    var a = chart.chartArea, ctx = chart.ctx, cx = (a.left + a.right) / 2, cy = (a.top + a.bottom) / 2;
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = opt.color || '#ff5d5d'; ctx.font = '800 30px -apple-system, Segoe UI, Roboto, sans-serif'; ctx.fillText(opt.pct.toFixed(1) + '%', cx, cy);
    ctx.restore(); } });
  Chart.register({ id: 'barValues', afterDatasetsDraw: function (chart) {
    var opt = chart.config.options.plugins && chart.config.options.plugins.barValues; if (!opt) return;
    var ctx = chart.ctx, meta = chart.getDatasetMeta(0);
    ctx.save(); ctx.fillStyle = opt.color || '#fff'; ctx.font = '600 11px -apple-system, Segoe UI, Roboto, sans-serif'; ctx.textAlign = 'center';
    meta.data.forEach(function (bar, i) { var v = chart.data.datasets[0].data[i]; if (v != null) ctx.fillText(fmtNum(v), bar.x, bar.y - 6); });
    ctx.restore(); } });
}

// ---- helpers ----
function showStatus(msg, isError) { var el = document.getElementById('status'); if (!el) return; el.textContent = msg; el.className = isError ? 'error' : ''; el.style.display = 'block'; }
function lastNonNull(arr, beforeIndex) { var s = (beforeIndex == null ? arr.length : beforeIndex) - 1; for (var i = s; i >= 0; i--) if (arr[i] != null) return { value: arr[i], index: i }; return { value: null, index: -1 }; }
function dod(series) { // day-over-day
  series = series || []; var l = lastNonNull(series); if (l.value == null) return { value: null, pct: 0, cls: 'flat', arrow: '—' };
  var pn = lastNonNull(series, l.index); var prev = pn.value;
  if (prev == null || prev === 0) return { value: l.value, pct: 0, cls: 'flat', arrow: '—' };
  var pct = ((l.value - prev) / Math.abs(prev)) * 100;
  return { value: l.value, pct: pct, cls: pct > .05 ? 'up' : (pct < -.05 ? 'down' : 'flat'), arrow: pct > .05 ? '▲' : (pct < -.05 ? '▼' : '—') };
}
function wow(series, back) { back = back || 7; series = series || []; var l = lastNonNull(series); if (l.value == null) return null;
  var prev = null; for (var i = l.index - back; i >= 0 && prev == null; i--) if (series[i] != null) prev = series[i];
  if (prev == null) { var pn = lastNonNull(series, l.index); prev = pn.value; }
  if (prev == null || prev === 0) return { value: l.value, pct: 0, cls: 'flat', arrow: '—' };
  var pct = ((l.value - prev) / Math.abs(prev)) * 100;
  return { value: l.value, pct: pct, cls: pct > .05 ? 'up' : (pct < -.05 ? 'down' : 'flat'), arrow: pct > .05 ? '▲' : (pct < -.05 ? '▼' : '—') };
}
function targetPct(p, days) { var t = TARGETS[PRODUCT] || 0; return t ? (revenueMTD(p, days) / t) * 100 : 0; }
function revenueMTD(p, days) { var rev = p['Revenue'] || []; if (!days.length) return 0; var m = days[days.length - 1].slice(0, 7), s = 0; for (var i = 0; i < days.length; i++) if (days[i].slice(0, 7) === m && rev[i] != null) s += rev[i]; return s; }
function fmtMoney(n) { if (n == null) return '—'; return (CUR || '') + (CUR === '฿' ? ' ' : '') + fmtNum(n); }
function fmtNum(n) { if (n == null) return '—'; var a = Math.abs(n);
  if (a >= 1e12) return (n / 1e12).toFixed(2) + 'T'; if (a >= 1e9) return (n / 1e9).toFixed(2) + 'B'; if (a >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (a >= 1e3) return Math.round(n).toLocaleString('en-US'); return n.toLocaleString('en-US'); }
function shortDate(iso) { var p = iso.split('-'); return p[2] + '/' + p[1]; }
function thDate(iso) { if (!iso) return ''; var mo = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']; var p = iso.split('-'); return (+p[2]) + ' ' + mo[(+p[1]) - 1]; }
function plainUpdated(iso) { var d = new Date(iso); if (isNaN(d)) return iso; return d.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }); }
function lighten(hex, amt) { hex = hex.replace('#', ''); if (hex.length === 3) hex = hex.split('').map(function (x) { return x + x; }).join(''); var n = parseInt(hex, 16); return 'rgb(' + Math.min(255, ((n >> 16) & 255) + amt) + ',' + Math.min(255, ((n >> 8) & 255) + amt) + ',' + Math.min(255, (n & 255) + amt) + ')'; }
function hexToRgba(hex, a) { hex = hex.replace('#', ''); if (hex.length === 3) hex = hex.split('').map(function (x) { return x + x; }).join(''); var n = parseInt(hex, 16); return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'; }
function lerpColor(a, b, t) { a = parseInt(a.replace('#', ''), 16); b = parseInt(b.replace('#', ''), 16);
  var ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255, br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return 'rgb(' + Math.round(ar + (br - ar) * t) + ',' + Math.round(ag + (bg - ag) * t) + ',' + Math.round(ab + (bb - ab) * t) + ')'; }
