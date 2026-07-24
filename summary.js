/* ============================================================================
 * summary.js — Report Summary page (ภาพรวมรายเดือนตั้งแต่เปิดเซิร์ฟ)
 * ข้อมูลจากชีต "Monthly Report Summary" ผ่าน endpoint ?sum=1&p=<product>
 * ==========================================================================*/

var WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbzm5ABDvDdRCos_cr3zlb39KxxmNWV6Uz9RgeylYV1S3H-L7rDMQeQ6DYIu5Vojr4o/exec';
var ACCESS_KEY  = 'pqvCqYRiD5DlHTqpDIFfS6LyCZie';
function apiUrl(extra) {
  if (!WEB_APP_URL) return '';
  return WEB_APP_URL + '?key=' + encodeURIComponent(ACCESS_KEY) + (extra || '');
}

var TH_MO = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
var PRODUCT, DATA, CHARTS = [], CUR = '฿', FX = 33;

document.addEventListener('DOMContentLoaded', function () {
  PRODUCT = new URLSearchParams(location.search).get('p') || 'CBPC-TH';
  applyTheme(); wireNav(); wireChrome();
  load();
});

function applyTheme() {
  var sea = PRODUCT === 'CBPC-SEA';
  document.body.setAttribute('data-theme', sea ? 'sea' : 'th');
  var logo = sea ? 'logo_CBPC-SEA.png' : 'logo_CBPC_TH.png';
  document.getElementById('brandLogo').src = logo;
  document.getElementById('brandSub').textContent = PRODUCT;
  document.querySelector('link[rel=icon]').href = logo;
  document.getElementById('title').textContent = PRODUCT + ' · Report Summary';
  [].forEach.call(document.querySelectorAll('#srvToggle button'), function (b) {
    b.classList.toggle('active', b.getAttribute('data-p') === PRODUCT);
  });
}

function wireNav() {
  document.getElementById('navTH').href  = 'summary.html?p=CBPC-TH';
  document.getElementById('navSEA').href = 'summary.html?p=CBPC-SEA';
  document.getElementById('navTH').classList.toggle('active', PRODUCT === 'CBPC-TH');
  document.getElementById('navSEA').classList.toggle('active', PRODUCT === 'CBPC-SEA');
  var over = PRODUCT === 'CBPC-SEA' ? 'sea.html' : 'th.html';
  [].forEach.call(document.querySelectorAll('#navMetrics a'), function (a) {
    var g = a.getAttribute('data-g');
    if (g === 'overview') a.href = over;
    else if (g === 'source') a.href = 'source.html?p=' + encodeURIComponent(PRODUCT);
    else if (g === 'summary') a.href = 'summary.html?p=' + encodeURIComponent(PRODUCT);
    else a.href = 'detail.html?p=' + encodeURIComponent(PRODUCT) + '&g=' + g;
  });
  document.getElementById('srvToggle').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    location.href = 'summary.html?p=' + encodeURIComponent(b.getAttribute('data-p'));
  });
}

function wireChrome() {
  var sh = document.querySelector('.shell');
  var t = document.getElementById('toggleSide'), s = document.getElementById('showSide');
  if (t) t.onclick = function () { sh.classList.add('collapsed'); };
  if (s) s.onclick = function () { sh.classList.remove('collapsed'); };
  var rf = document.getElementById('refresh');
  if (rf) rf.addEventListener('click', function () {
    rf.classList.add('spin'); load(true);
    setTimeout(function () { rf.classList.remove('spin'); }, 900);
  });
}

function load(fresh) {
  fetch(apiUrl('&sum=1&p=' + encodeURIComponent(PRODUCT) + (fresh ? '&fresh=1' : '')))
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function (d) {
      if (d.error) throw new Error(d.error);
      DATA = d;
      CUR = d.currency === 'USD' ? '$' : '฿';
      FX  = parseFloat(d.fxUSDTHB) > 0 ? parseFloat(d.fxUSDTHB) : 33;
      document.getElementById('status').style.display = 'none';
      if (d.updatedAt) document.getElementById('updatedAt').textContent = '⏱ อัปเดตล่าสุด ' + plainDate(d.updatedAt);
      render();
    })
    .catch(function (e) { showErr('โหลดข้อมูลไม่ได้: ' + e.message); });
}

function showErr(msg) {
  var el = document.getElementById('status');
  el.style.display = 'block';
  el.innerHTML = '<div class="card" style="color:#ff8a8a">' + msg + '</div>';
}

// ---------- render ----------
function render() {
  var months = (DATA.months || []).filter(function (m) { return hasData(m); });
  var now = new Date();
  var curYm  = ym(now.getFullYear(), now.getMonth() + 1);
  var prevD  = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  var lastYm = ym(prevD.getFullYear(), prevD.getMonth() + 1);

  var byYm = {}; months.forEach(function (m) { byYm[m.ym] = m; });
  var idx = months.map(function (m) { return m.ym; });

  renderHero(byYm[lastYm], months[idx.indexOf(lastYm) - 1]);
  renderNow(byYm[curYm] || findRaw(curYm), now);

  destroyCharts();
  drawRevenue(months);
  drawUsers(months);
  drawPaying(months);
  drawArpu(months);

  renderTable(months);
  renderYearly();
}

function findRaw(v) { return (DATA.months || []).filter(function (m) { return m.ym === v; })[0] || null; }
function hasData(m) { return m && (m.revenue != null || m.mau != null || m.dau != null); }
function ym(y, mo) { return y + '-' + ('0' + mo).slice(-2); }
function moLabel(v) { var p = v.split('-'); return TH_MO[+p[1] - 1] + ' ' + (+p[0] % 100); }
function moLabelFull(v) { var p = v.split('-'); return TH_MO[+p[1] - 1] + ' ' + p[0]; }

function renderHero(m, prev) {
  var el = document.getElementById('heroWrap');
  if (!m) { el.innerHTML = '<div class="card">ยังไม่มีข้อมูลของเดือนที่ผ่านมา</div>'; return; }
  var pct = m.pct != null ? m.pct : (m.target ? m.revenue / m.target * 100 : null);

  var kpis = [
    ['MAU', m.mau, prev && prev.mau, 0],
    ['Avg DAU', m.dau, prev && prev.dau, 0],
    ['Avg Peak CCU', m.ccu, prev && prev.ccu, 0],
    ['Avg NRU', m.nru, prev && prev.nru, 0],
    ['Paying User', m.payingUser, prev && prev.payingUser, 0],
    ['% Paying', m.pctPaying != null ? m.pctPaying * 100 : null, prev && prev.pctPaying != null ? prev.pctPaying * 100 : null, 2, '%'],
    ['ARPU', m.arpu, prev && prev.arpu, 0, CUR],
    ['ARPPU', m.arppu, prev && prev.arppu, 0, CUR]
  ];

  el.innerHTML =
    '<div class="hero-mo">' +
      '<div class="hero-top">' +
        '<div><div class="hero-eyebrow">สรุปเดือนที่ผ่านมา</div><h2>' + moLabelFull(m.ym) + '</h2></div>' +
        '<div class="hero-rev"><div class="big">' + money(m.revenue) + '</div>' +
          bahtLine(m.revenue) +
          '<div class="sub">เป้าหมาย ' + money(m.target) + '</div></div>' +
      '</div>' +
      (pct != null ?
        '<div class="hero-bar"><span style="width:' + Math.min(100, Math.max(0, pct)).toFixed(1) + '%"></span></div>' +
        '<div class="hero-bar-lbl"><span>' + pct.toFixed(1) + '% ของเป้าหมาย</span><span>' +
          (m.left != null ? (m.left > 0 ? 'เหลืออีก ' + money(m.left) : 'เกินเป้า ' + money(-m.left)) : '') + '</span></div>' : '') +
      '<div class="hero-kpis">' + kpis.map(function (k) {
          return '<div class="hk"><div class="l">' + k[0] + '</div>' +
                 '<div class="v">' + (k[1] == null ? '—' : (k[4] === CUR ? CUR + ' ' : '') + num(k[1], k[3]) + (k[4] === '%' ? '%' : '')) + '</div>' +
                 delta(k[1], k[2]) + '</div>';
        }).join('') + '</div>' +
    '</div>';
}

function delta(cur, prev) {
  if (cur == null || prev == null || !prev) return '<div class="d flat">—</div>';
  var p = (cur - prev) / Math.abs(prev) * 100;
  var cls = p > 0.05 ? 'up' : (p < -0.05 ? 'dn' : 'flat');
  var arrow = p > 0.05 ? '▲' : (p < -0.05 ? '▼' : '—');
  return '<div class="d ' + cls + '">' + arrow + ' ' + Math.abs(p).toFixed(1) + '% MoM</div>';
}

function renderNow(m, now) {
  var el = document.getElementById('nowWrap');
  var dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  var day = now.getDate();
  var dateStr = day + ' ' + TH_MO[now.getMonth()] + ' ' + now.getFullYear() +
                ' · ' + ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2);

  if (!m) {
    el.innerHTML = '<div class="now-card"><div class="now-head"><div class="t">เดือนปัจจุบัน · ' +
      TH_MO[now.getMonth()] + ' ' + now.getFullYear() + '</div><div class="date">ณ ' + dateStr + '</div></div>' +
      '<div class="cap" style="margin-top:10px">ยังไม่มีข้อมูลของเดือนนี้ในชีต</div></div>';
    return;
  }

  var pct  = m.target ? (m.revenue || 0) / m.target * 100 : null;
  var proj = (m.revenue != null && day > 0) ? m.revenue / day * dim : null;
  var projPct = (proj != null && m.target) ? proj / m.target * 100 : null;

  el.innerHTML =
    '<div class="now-card">' +
      '<div class="now-head">' +
        '<div class="t">เดือนปัจจุบัน · ' + moLabelFull(m.ym) + '</div>' +
        '<div class="date">ณ ' + dateStr + ' · วันที่ ' + day + '/' + dim + '</div>' +
      '</div>' +
      '<div class="now-grid">' +
        '<div class="ng"><div class="l">รายได้สะสมเดือนนี้</div><div class="v">' + money(m.revenue) + '</div>' + bahtLine(m.revenue) + '</div>' +
        '<div class="ng"><div class="l">เป้าหมายเดือนนี้</div><div class="v">' + money(m.target) + '</div></div>' +
        '<div class="ng"><div class="l">คิดเป็น</div><div class="v">' + (pct != null ? pct.toFixed(1) + '%' : '—') + '</div></div>' +
        '<div class="ng"><div class="l">คาดการณ์สิ้นเดือน</div><div class="v">' + money(proj) + '</div>' +
          '<div class="l" style="margin-top:2px">' + (projPct != null ? '≈ ' + projPct.toFixed(0) + '% ของเป้า' : '') + '</div></div>' +
      '</div>' +
      (pct != null ? '<div class="now-bar"><span style="width:' + Math.min(100, Math.max(0, pct)).toFixed(1) + '%"></span></div>' : '') +
    '</div>';
}

// ---------- charts ----------
function destroyCharts() { CHARTS.forEach(function (c) { try { c.destroy(); } catch (e) {} }); CHARTS = []; }
function track(c) { CHARTS.push(c); return c; }
function grid() { return 'rgba(255,255,255,0.05)'; }
function tick() { return getComputedStyle(document.body).getPropertyValue('--muted').trim() || '#8c9b94'; }

function baseOpts(extra) {
  var o = {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false }, ticks: { color: tick(), maxRotation: 0, autoSkipPadding: 12 } },
      y: { grid: { color: grid() }, ticks: { color: tick(), callback: function (v) { return compact(v); } }, beginAtZero: true }
    }
  };
  if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
  return o;
}

function drawRevenue(ms) {
  var labels = ms.map(function (m) { return moLabel(m.ym); });
  var o = baseOpts();
  o.plugins.tooltip = { callbacks: { label: function (x) { return x.dataset.label + ': ' + money(x.parsed.y); } } };
  track(new Chart(document.getElementById('revChart'), {
    data: {
      labels: labels,
      datasets: [
        { type: 'bar', label: 'Revenue', data: ms.map(function (m) { return m.revenue; }),
          backgroundColor: 'rgba(255,206,92,.75)', borderRadius: 4, order: 2 },
        { type: 'line', label: 'Target', data: ms.map(function (m) { return m.target; }),
          borderColor: '#ff5d5d', borderWidth: 2, borderDash: [5, 4], pointRadius: 0, tension: .2, order: 1 }
      ]
    },
    options: o
  }));
}

function drawUsers(ms) {
  var o = baseOpts();
  o.plugins.tooltip = { callbacks: { label: function (x) { return x.dataset.label + ': ' + num(x.parsed.y, 0); } } };
  track(new Chart(document.getElementById('userChart'), {
    type: 'line',
    data: {
      labels: ms.map(function (m) { return moLabel(m.ym); }),
      datasets: [
        line_('MAU', ms.map(function (m) { return m.mau; }), '#2ee59d'),
        line_('Avg DAU', ms.map(function (m) { return m.dau; }), '#37c6ff'),
        line_('Avg Peak CCU', ms.map(function (m) { return m.ccu; }), '#b98bff')
      ]
    },
    options: o
  }));
}

function drawPaying(ms) {
  var o = baseOpts();
  o.scales.y1 = { position: 'right', grid: { display: false }, beginAtZero: true,
    ticks: { color: tick(), callback: function (v) { return v.toFixed(0) + '%'; } } };
  o.plugins.tooltip = { callbacks: { label: function (x) {
    return x.dataset.label + ': ' + (x.dataset.yAxisID === 'y1' ? x.parsed.y.toFixed(2) + '%' : num(x.parsed.y, 0)); } } };
  track(new Chart(document.getElementById('payChart'), {
    data: {
      labels: ms.map(function (m) { return moLabel(m.ym); }),
      datasets: [
        { type: 'bar', label: 'Paying User', data: ms.map(function (m) { return m.payingUser; }),
          backgroundColor: 'rgba(37,211,192,.7)', borderRadius: 4, yAxisID: 'y' },
        { type: 'line', label: '% Paying', yAxisID: 'y1',
          data: ms.map(function (m) { return m.pctPaying != null ? m.pctPaying * 100 : null; }),
          borderColor: '#ffce5c', borderWidth: 2, pointRadius: 0, tension: .3 }
      ]
    },
    options: o
  }));
}

function drawArpu(ms) {
  var o = baseOpts();
  o.scales.y1 = { position: 'right', grid: { display: false }, beginAtZero: true,
    ticks: { color: tick(), callback: function (v) { return compact(v); } } };
  o.plugins.tooltip = { callbacks: { label: function (x) { return x.dataset.label + ': ' + money(x.parsed.y); } } };
  track(new Chart(document.getElementById('arpuChart'), {
    type: 'line',
    data: {
      labels: ms.map(function (m) { return moLabel(m.ym); }),
      datasets: [
        line_('ARPU', ms.map(function (m) { return m.arpu; }), '#37c6ff'),
        Object.assign(line_('ARPPU', ms.map(function (m) { return m.arppu; }), '#ff9f45'), { yAxisID: 'y1' })
      ]
    },
    options: o
  }));
}

function line_(label, data, color) {
  return { label: label, data: data, borderColor: color, backgroundColor: color,
           borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: .3, fill: false };
}

// ---------- table ----------
function renderTable(ms) {
  var rows = ms.slice().reverse();   // ล่าสุดอยู่บน
  var head = ['เดือน', 'MAU', 'Avg Peak CCU', 'Avg DAU', 'Avg NRU', 'Paying User',
              'Target', 'Revenue', 'Left', '%', 'ARPU', 'ARPPU', '% Paying'];
  var html = '<thead><tr>' + head.map(function (h, i) {
    return '<th' + (i ? ' style="text-align:right"' : '') + '>' + h + '</th>';
  }).join('') + '</tr></thead><tbody>';

  rows.forEach(function (m) {
    html += '<tr>' +
      '<td style="font-weight:700;white-space:nowrap">' + moLabelFull(m.ym) + '</td>' +
      td(m.mau) + td(m.ccu) + td(m.dau) + td(m.nru) + td(m.payingUser) +
      td(m.target, 1) + td(m.revenue, 1) + td(m.left, 1) +
      pctCell(m.pct) +
      td(m.arpu, 1) + td(m.arppu, 1) +
      '<td class="num">' + (m.pctPaying == null ? '—' : (m.pctPaying * 100).toFixed(2) + '%') + '</td>' +
      '</tr>';
  });
  document.getElementById('sumTable').innerHTML = html + '</tbody>';
  document.getElementById('tblCap').textContent =
    'ทุกเดือนตั้งแต่เปิดเซิร์ฟ · ' + rows.length + ' เดือน · ล่าสุดอยู่บน' +
    (CUR === '$' ? ' · จำนวนเงินเป็น USD' : '');
}

function td(v, isMoney) {
  return '<td class="num">' + (v == null ? '—' : (isMoney ? money(v) : num(v, 0))) + '</td>';
}

// สีไล่ตามค่า: 0% แดง -> 50% เหลืองส้ม -> 100% เขียว (เกิน 100 คงเขียว)
function pctColor(p) {
  var v = Math.max(0, Math.min(100, p));
  var h = v <= 50 ? (v / 50) * 45 : 45 + ((v - 50) / 50) * 95;   // hue 0 -> 45 -> 140
  return 'hsl(' + Math.round(h) + ',75%,52%)';
}

// ช่อง % = ตัวเลข + บาร์ solid สีตามค่า · ถึงเป้า (>=100%) เป็นสีรุ้ง
function pctCell(p) {
  if (p == null) return '<td class="pctcell"><div class="pv">—</div></td>';
  var hit = p >= 100, col = pctColor(p), w = Math.max(2, Math.min(100, p));
  return '<td class="pctcell' + (hit ? ' rainbow' : '') + '">' +
    '<div class="pv"' + (hit ? '' : ' style="color:' + col + '"') + '>' + p.toFixed(1) + '%</div>' +
    '<div class="pbar"><span style="width:' + w.toFixed(1) + '%' + (hit ? '' : ';background:' + col) + '"></span></div>' +
    '</td>';
}

function renderYearly() {
  var y = DATA.yearly || {}, keys = Object.keys(y).sort();
  if (!keys.length) { document.getElementById('yearWrap').innerHTML = ''; return; }
  var html = '<div class="card"><h3>สรุปรายปี</h3><div class="cap">รายได้รวมทั้งปีเทียบเป้าหมายรายปี</div>' +
    '<div class="tw-scroll"><table class="data"><thead><tr><th>ปี</th>' +
    '<th style="text-align:right">Revenue รวม</th><th style="text-align:right">Target</th>' +
    '<th style="text-align:right">%</th><th style="text-align:right">Left</th></tr></thead><tbody>';
  keys.forEach(function (k) {
    var o = y[k];
    html += '<tr><td style="font-weight:700">' + k + '</td>' +
      '<td class="num">' + money(o.revenue) + '</td>' +
      '<td class="num">' + (o.target == null ? '—' : money(o.target)) + '</td>' +
      pctCell(o.pct) +
      '<td class="num">' + (o.left == null ? '—' : money(o.left)) + '</td></tr>';
  });
  document.getElementById('yearWrap').innerHTML = html + '</tbody></table></div></div>';
}

// ---------- format ----------
function num(n, dp) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: dp || 0, maximumFractionDigits: dp || 0 });
}
function money(n) { if (n == null || isNaN(n)) return '—'; return CUR + ' ' + num(n, 0); }
function compact(n) {
  var a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (a >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (a >= 1e3) return (n / 1e3).toFixed(0) + 'K';
  return String(n);
}
// SEA: บรรทัดบาทเล็กใต้ตัวเลข USD
function bahtLine(usd) {
  if (CUR !== '$' || usd == null) return '';
  return '<span class="baht">≈ ฿ ' + num(usd * FX, 0) + ' <span style="font-weight:500;opacity:.7">@' + FX.toFixed(2) + '</span></span>';
}
function plainDate(iso) {
  var d = new Date(iso); if (isNaN(d)) return iso;
  return d.getDate() + ' ' + TH_MO[d.getMonth()] + ' ' + (d.getFullYear() + 543) + ' ' +
         ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
}
