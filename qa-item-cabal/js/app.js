(function () {
  'use strict';

  var STORAGE = {
    history: 'qaitem_history_v1',
    token: 'qaitem_gh_token',
    theme: 'qaitem_theme'
  };
  var FINDING_BATCH = 100;
  var SEVERITY_TH = { error: 'ผิด', warn: 'น่าสงสัย', info: 'ข้อมูล' };
  var GAME_LABEL = { pc: 'Cabal PC', mobile: 'Cabal Mobile' };
  var state = {
    game: 'pc',
    view: 'check',
    source: null,
    detectedGame: null,
    result: null,
    resultContext: null,
    lastWorkbook: null,
    filteredFindings: [],
    findingLimit: FINDING_BATCH,
    validation: null,
    validationNonce: 0,
    rules: {}
  };

  function byId(id) { return document.getElementById(id); }
  function all(selector, root) { return Array.prototype.slice.call((root || document).querySelectorAll(selector)); }
  function node(tag, className, text) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined && text !== null) el.textContent = String(text);
    return el;
  }
  function announce(message) { byId('global-status').textContent = message || ''; }
  function formatNumber(value) { return new Intl.NumberFormat('th-TH').format(Number(value || 0)); }
  function safeStorageGet(key, fallback) {
    try {
      var value = localStorage.getItem(key);
      return value === null ? fallback : value;
    } catch (e) { return fallback; }
  }
  function safeStorageSet(key, value) {
    try { localStorage.setItem(key, value); return true; } catch (e) { return false; }
  }
  function errorMessage(error, fallback) {
    if (!error) return fallback || 'เกิดข้อผิดพลาดที่ไม่คาดคิด';
    if (error.message === 'wrong-password') return 'รหัสผ่านไม่ถูกต้อง กรุณาตรวจแล้วลองอีกครั้ง';
    if (error.name === 'TypeError' && /fetch|network|load/i.test(error.message || '')) {
      return 'เชื่อมต่อไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง';
    }
    return error.message || fallback || 'ทำรายการไม่สำเร็จ กรุณาลองอีกครั้ง';
  }
  function showInline(id, message) {
    var el = byId(id);
    if (!el) return;
    el.textContent = message || '';
    el.hidden = !message;
  }
  function toast(message, type) {
    var el = node('div', 'toast' + (type === 'error' ? ' is-error' : ''), message);
    byId('toast-region').appendChild(el);
    window.setTimeout(function () {
      el.style.opacity = '0';
      window.setTimeout(function () { el.remove(); }, 220);
    }, 3600);
  }
  function withBusy(button, busy, label) {
    if (!button) return;
    if (busy) {
      if (!button.dataset.originalHtml) button.dataset.originalHtml = button.innerHTML;
      button.disabled = true;
      button.textContent = label || 'กำลังดำเนินการ…';
      button.setAttribute('aria-busy', 'true');
    } else {
      if (button.dataset.originalHtml) button.innerHTML = button.dataset.originalHtml;
      button.removeAttribute('aria-busy');
      button.disabled = false;
    }
  }
  function debounce(fn, wait) {
    var timer;
    return function () {
      var args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(null, args); }, wait);
    };
  }
  function unique(values) {
    return Array.from(new Set(values.filter(function (value) { return value !== undefined && value !== null && value !== ''; })));
  }
  function textValue(value, empty) {
    return value === undefined || value === null || value === '' ? (empty || '—') : String(value);
  }

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    safeStorageSet(STORAGE.theme, theme);
    byId('theme-toggle').setAttribute('aria-label', theme === 'dark' ? 'เปลี่ยนเป็นธีมสว่าง' : 'เปลี่ยนเป็นธีมมืด');
  }

  function setupStaticEvents() {
    var savedTheme = safeStorageGet(STORAGE.theme, '');
    if (savedTheme === 'light' || savedTheme === 'dark') document.documentElement.dataset.theme = savedTheme;

    byId('retry-init').addEventListener('click', initEngine);
    byId('unlock-form').addEventListener('submit', unlock);
    byId('lock-button').addEventListener('click', lockApp);
    byId('theme-toggle').addEventListener('click', function () {
      var current = document.documentElement.dataset.theme;
      if (!current) current = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      setTheme(current === 'dark' ? 'light' : 'dark');
    });
    all('[data-toggle-password]').forEach(function (button) {
      button.addEventListener('click', function () {
        var input = byId(button.dataset.togglePassword);
        var visible = input.type === 'text';
        input.type = visible ? 'password' : 'text';
        button.querySelector('span').textContent = visible ? 'ดู' : 'ซ่อน';
        button.setAttribute('aria-label', visible ? 'แสดงข้อมูล' : 'ซ่อนข้อมูล');
      });
    });
    all('[data-game]').forEach(function (button) {
      button.addEventListener('click', function () { changeGame(button.dataset.game); });
    });
    all('[data-view]').forEach(function (button) {
      button.addEventListener('click', function () { showView(button.dataset.view); });
    });
    all('[data-nav]').forEach(function (link) {
      link.addEventListener('click', function (event) {
        event.preventDefault();
        showView(link.dataset.nav);
      });
    });

    setupSourceEvents();
    setupResultEvents();
    setupItemEvents();
    setupAddItemEvents();
    setupHistoryEvents();

    document.addEventListener('keydown', function (event) {
      if (event.key === '/' && !/input|textarea|select/i.test(document.activeElement.tagName)) {
        if (state.view === 'items') {
          event.preventDefault();
          byId('item-search').focus();
        } else if (state.result && !byId('results-screen').hidden) {
          event.preventDefault();
          byId('filter-text').focus();
        }
      }
    });
  }

  async function initEngine() {
    var retry = byId('retry-init');
    retry.hidden = true;
    showInline('loading-error', '');
    byId('loading-step').textContent = 'กำลังเตรียมระบบตรวจสอบ';
    byId('loading-progress').style.width = '4%';
    byId('loading-screen').querySelector('[role="progressbar"]').setAttribute('aria-valuenow', '4');
    try {
      if (!window.QAEngine) throw new Error('ไม่พบ QAEngine กรุณาตรวจไฟล์ js/engine.js');
      await window.QAEngine.init(function (step, percent) {
        var pct = Math.max(4, Math.min(100, Number(percent) || 0));
        byId('loading-step').textContent = step || 'กำลังเตรียมระบบตรวจสอบ';
        byId('loading-progress').style.width = pct + '%';
        byId('loading-screen').querySelector('[role="progressbar"]').setAttribute('aria-valuenow', String(pct));
      });
      state.rules = window.QAEngine.rules() || {};
      if (window.QAEngine.isUnlocked()) enterApp();
      else showUnlock();
    } catch (error) {
      showInline('loading-error', errorMessage(error, 'โหลดระบบตรวจสอบไม่สำเร็จ'));
      retry.hidden = false;
      announce('โหลดระบบตรวจสอบไม่สำเร็จ');
    }
  }

  function showUnlock() {
    byId('loading-screen').hidden = true;
    byId('app-shell').hidden = true;
    byId('unlock-screen').hidden = false;
    byId('team-password').focus();
  }

  async function unlock(event) {
    event.preventDefault();
    var button = byId('unlock-button');
    var password = byId('team-password').value;
    showInline('unlock-error', '');
    if (!password) {
      showInline('unlock-error', 'กรุณาใส่รหัสผ่านทีม');
      byId('team-password').focus();
      return;
    }
    withBusy(button, true, 'กำลังเปิดฐานข้อมูล…');
    try {
      await window.QAEngine.unlock(password);
      enterApp();
    } catch (error) {
      showInline('unlock-error', errorMessage(error, 'เปิดฐานข้อมูลไม่สำเร็จ'));
      byId('team-password').select();
    } finally {
      withBusy(button, false);
    }
  }

  function enterApp() {
    byId('loading-screen').hidden = true;
    byId('unlock-screen').hidden = true;
    byId('app-shell').hidden = false;
    document.body.dataset.game = state.game;
    var token = safeStorageGet(STORAGE.token, '');
    byId('github-token').value = token;
    updateGameUI();
    updateSheetCapability();
    showView(state.view);
    announce('ระบบพร้อมใช้งาน ฐานข้อมูล ' + GAME_LABEL[state.game]);
  }

  function lockApp() {
    window.QAEngine.lock();
    state.result = null;
    state.resultContext = null;
    state.lastWorkbook = null;
    state.filteredFindings = [];
    state.view = 'check';
    clearSource();
    byId('results-screen').hidden = true;
    byId('check-workspace').hidden = false;
    byId('findings-root').replaceChildren();
    byId('item-table-body').replaceChildren();
    byId('team-password').value = '';
    showInline('unlock-error', '');
    showUnlock();
    announce('ล็อกฐานข้อมูลแล้ว');
  }

  function changeGame(game) {
    if (game !== 'pc' && game !== 'mobile') return;
    if (state.game === game) return;
    state.game = game;
    document.body.dataset.game = game;
    state.validationNonce += 1;
    updateGameUI();
    updateMismatch();
    if (state.view === 'items') renderItems();
    if (state.view === 'history') renderHistory();
    if (state.view === 'add') scheduleValidation();
    if (state.result && !byId('results-screen').hidden) {
      closeResults();
      toast('เปลี่ยนฐานข้อมูลแล้ว กรุณาตรวจเอกสารอีกครั้ง');
    }
    announce('เปลี่ยนเป็นฐานข้อมูล ' + GAME_LABEL[game]);
  }

  function updateGameUI() {
    all('.game-option').forEach(function (button) {
      var active = button.dataset.game === state.game;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    var stats;
    try { stats = window.QAEngine.stats(state.game); } catch (error) { return; }
    byId('top-db-items').textContent = formatNumber(stats.items);
    byId('top-db-date').textContent = 'อัปเดต ' + formatBuiltDate(stats.built_at);
    byId('items-total').textContent = formatNumber(stats.items);
    byId('items-game-label').textContent = state.game.toUpperCase();
    byId('add-game-badge').textContent = GAME_LABEL[state.game].toUpperCase();
    var pending = Number(stats.pending || 0);
    byId('top-db-pending').hidden = pending === 0;
    byId('top-db-pending').textContent = 'รออัปเดต ' + formatNumber(pending);
    var manifest = window.QAEngine.manifest ? window.QAEngine.manifest() : null;
    var engineLabel = manifest && manifest.engine ? 'ตัวตรวจ v' + manifest.engine : 'ตัวตรวจ';
    byId('engine-version').textContent = pending ? engineLabel + ' · รออัปเดตออนไลน์ ' + pending : engineLabel + ' พร้อมใช้งาน';
  }

  function formatBuiltDate(value) {
    if (!value) return 'ไม่ระบุ';
    var date = new Date(value);
    if (isNaN(date.getTime())) return String(value).slice(0, 10);
    return new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }).format(date);
  }

  function updateSheetCapability() {
    var enabled = false;
    try { enabled = window.QAEngine.hasSheetApi(); } catch (e) { enabled = false; }
    byId('sheet-url').disabled = !enabled;
    byId('load-sheets-button').disabled = !enabled;
    byId('google-disabled-note').hidden = enabled;
    byId('google-source-card').classList.toggle('is-disabled', !enabled);
  }

  function showView(view) {
    if (!byId('view-' + view)) view = 'check';
    state.view = view;
    all('[data-view-panel]').forEach(function (panel) {
      var active = panel.dataset.viewPanel === view;
      panel.hidden = !active;
      panel.classList.toggle('is-active', active);
    });
    all('.nav-item').forEach(function (button) { button.classList.toggle('is-active', button.dataset.view === view); });
    all('.nav-item').forEach(function (button) {
      if (button.dataset.view === view) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    if (view === 'items') renderItems();
    if (view === 'history') renderHistory();
    if (view === 'add') scheduleValidation();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------------------------------------------------------------- source */
  function setupSourceEvents() {
    byId('google-form').addEventListener('submit', loadGoogleSheetList);
    byId('excel-file').addEventListener('change', function () {
      if (this.files && this.files[0]) loadExcel(this.files[0]);
    });
    var drop = byId('file-drop');
    ['dragenter', 'dragover'].forEach(function (name) {
      drop.addEventListener(name, function (event) { event.preventDefault(); drop.classList.add('is-dragging'); });
    });
    ['dragleave', 'drop'].forEach(function (name) {
      drop.addEventListener(name, function (event) { event.preventDefault(); drop.classList.remove('is-dragging'); });
    });
    drop.addEventListener('drop', function (event) {
      var file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
      if (file) loadExcel(file);
    });
    drop.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); byId('excel-file').click(); }
    });
    byId('clear-source').addEventListener('click', clearSource);
    byId('show-hidden-sheets').addEventListener('change', renderSheetPicker);
    byId('select-all-sheets').addEventListener('change', function () {
      var visibleOnly = !byId('show-hidden-sheets').checked;
      all('.sheet-option input', byId('sheet-list')).forEach(function (input) {
        var sheet = state.source.sheets[Number(input.dataset.index)];
        if (!visibleOnly || !sheet.hidden) input.checked = byId('select-all-sheets').checked;
      });
      updateSheetSelection();
    });
    byId('sheet-list').addEventListener('change', updateSheetSelection);
    byId('switch-detected-game').addEventListener('click', function () {
      if (state.detectedGame) changeGame(state.detectedGame);
    });
    byId('run-check').addEventListener('click', runCheck);
  }

  async function loadGoogleSheetList(event) {
    event.preventDefault();
    var url = byId('sheet-url').value.trim();
    var button = byId('load-sheets-button');
    showInline('google-error', '');
    if (!url) {
      showInline('google-error', 'กรุณาวางลิงก์ Google Sheet');
      return;
    }
    withBusy(button, true, 'กำลังโหลด…');
    try {
      var listed = await window.QAEngine.listGoogleSheet(url);
      state.source = {
        type: 'google',
        url: url,
        id: listed.id || extractSheetId(url),
        title: listed.title || 'Google Sheet',
        sheets: (listed.sheets || []).map(function (sheet) {
          return {
            name: sheet.name,
            gid: sheet.gid,
            hidden: !!sheet.hidden,
            rows: Number(sheet.rows || 0),
            cols: Number(sheet.cols || 0)
          };
        })
      };
      presentSource();
    } catch (error) {
      showInline('google-error', errorMessage(error, 'อ่านรายชื่อชีทไม่สำเร็จ'));
    } finally {
      withBusy(button, false);
      updateSheetCapability();
    }
  }

  async function loadExcel(file) {
    showInline('excel-error', '');
    var drop = byId('file-drop');
    drop.setAttribute('aria-busy', 'true');
    var original = drop.querySelector('span:last-child').innerHTML;
    drop.querySelector('span:last-child').textContent = 'กำลังอ่านไฟล์…';
    try {
      if (!/\.(xlsx|xls|xlsm)$/i.test(file.name || '')) throw new Error('กรุณาเลือกไฟล์ Excel .xlsx หรือ .xls');
      var workbook = await window.QAEngine.readExcel(file);
      state.source = {
        type: 'excel',
        title: workbook.source || file.name,
        file: file,
        workbook: workbook,
        sheets: (workbook.sheets || []).map(function (sheet) {
          return {
            name: sheet.name,
            hidden: !!sheet.hidden,
            rows: (sheet.values || []).length,
            cols: (sheet.values || []).reduce(function (max, row) { return Math.max(max, row.length); }, 0)
          };
        })
      };
      presentSource();
    } catch (error) {
      showInline('excel-error', errorMessage(error, 'อ่านไฟล์ Excel ไม่สำเร็จ'));
    } finally {
      drop.removeAttribute('aria-busy');
      drop.querySelector('span:last-child').innerHTML = original;
      byId('excel-file').value = '';
    }
  }

  function presentSource() {
    if (!state.source) return;
    byId('source-title').textContent = state.source.title;
    var count = state.source.sheets.length;
    byId('source-meta').textContent = (state.source.type === 'google' ? 'Google Sheet' : 'Excel') + ' · ' + formatNumber(count) + ' ชีท';
    byId('source-inputs').hidden = true;
    byId('sheet-picker-panel').hidden = false;
    byId('show-hidden-sheets').checked = false;
    byId('select-all-sheets').checked = true;
    state.detectedGame = detectGame([state.source.title].concat(state.source.sheets.map(function (sheet) { return sheet.name; })));
    renderSheetPicker();
    updateMismatch();
    showInline('check-error', '');
    byId('sheet-picker-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function clearSource() {
    state.source = null;
    state.detectedGame = null;
    byId('source-inputs').hidden = false;
    byId('sheet-picker-panel').hidden = true;
    byId('sheet-url').value = '';
    showInline('google-error', '');
    showInline('excel-error', '');
    showInline('check-error', '');
  }

  function renderSheetPicker() {
    var root = byId('sheet-list');
    root.replaceChildren();
    if (!state.source) return;
    var showHidden = byId('show-hidden-sheets').checked;
    state.source.sheets.forEach(function (sheet, index) {
      if (sheet.hidden && !showHidden) return;
      var label = node('label', 'sheet-option');
      var input = node('input');
      input.type = 'checkbox';
      input.dataset.index = index;
      input.checked = !sheet.hidden;
      input.setAttribute('aria-label', 'เลือกชีท ' + sheet.name);
      label.appendChild(input);
      label.appendChild(node('span', 'sheet-option__name', sheet.name));
      if (sheet.hidden) label.appendChild(node('span', 'hidden-tag', 'ซ่อนอยู่'));
      label.appendChild(node('span', 'sheet-option__meta', formatNumber(sheet.rows) + ' แถว'));
      root.appendChild(label);
    });
    updateSheetSelection();
  }

  function selectedSheetIndexes() {
    return all('.sheet-option input:checked', byId('sheet-list')).map(function (input) { return Number(input.dataset.index); });
  }

  function updateSheetSelection() {
    if (!state.source) return;
    var indexes = selectedSheetIndexes();
    var rows = indexes.reduce(function (sum, index) { return sum + Number(state.source.sheets[index].rows || 0); }, 0);
    byId('selected-sheet-count').textContent = formatNumber(indexes.length) + ' ชีทที่เลือก';
    byId('selected-row-count').textContent = formatNumber(rows) + ' แถวโดยประมาณ';
    byId('run-check').disabled = indexes.length === 0;
    var visibleInputs = all('.sheet-option input', byId('sheet-list'));
    byId('select-all-sheets').checked = visibleInputs.length > 0 && visibleInputs.every(function (input) { return input.checked; });
    byId('select-all-sheets').indeterminate = visibleInputs.some(function (input) { return input.checked; }) && !byId('select-all-sheets').checked;
  }

  function detectGame(parts) {
    var text = parts.join(' ').toUpperCase();
    var pc = /\[(?:PCTH|PCSEA)\]/.test(text);
    var mobile = /\[(?:MTH|MSEA)\]/.test(text);
    if (pc === mobile) return null;
    return pc ? 'pc' : 'mobile';
  }

  function updateMismatch() {
    var mismatch = state.detectedGame && state.detectedGame !== state.game;
    byId('game-mismatch').hidden = !mismatch;
    if (!mismatch) return;
    byId('mismatch-title').textContent = 'ชื่อเอกสารดูเหมือนเป็น ' + GAME_LABEL[state.detectedGame];
    byId('mismatch-copy').textContent = 'ขณะนี้เลือกฐานข้อมูล ' + GAME_LABEL[state.game] + ' หากตรวจต่อ ผลอาจอ้างอิงไอเทมคนละเกม';
    byId('switch-detected-game').textContent = 'เปลี่ยนเป็น ' + GAME_LABEL[state.detectedGame];
  }

  async function runCheck() {
    if (!state.source) return;
    var indexes = selectedSheetIndexes();
    if (!indexes.length) {
      showInline('check-error', 'กรุณาเลือกอย่างน้อย 1 ชีท');
      return;
    }
    var names = indexes.map(function (index) { return state.source.sheets[index].name; });
    var button = byId('run-check');
    var checkGame = state.game;
    withBusy(button, true, 'กำลังตรวจด้วย Python…');
    all('.game-option').forEach(function (option) { option.disabled = true; });
    showInline('check-error', '');
    try {
      var workbook;
      if (state.source.type === 'google') {
        workbook = await window.QAEngine.readGoogleSheet(state.source.url, names);
      } else {
        var selected = new Set(names);
        workbook = {
          source: state.source.workbook.source,
          sheets: state.source.workbook.sheets.filter(function (sheet) { return selected.has(sheet.name); })
        };
      }
      state.lastWorkbook = workbook;
      state.resultContext = {
        type: state.source.type,
        url: state.source.url || null,
        id: state.source.id || extractSheetId(state.source.url || ''),
        gidMap: state.source.sheets.reduce(function (map, sheet) {
          if (sheet.gid !== undefined && sheet.gid !== null) map[sheet.name] = sheet.gid;
          return map;
        }, {})
      };
      var result = await window.QAEngine.check(checkGame, workbook);
      showResults(result);
    } catch (error) {
      showInline('check-error', errorMessage(error, 'ตรวจเอกสารไม่สำเร็จ'));
    } finally {
      withBusy(button, false);
      all('.game-option').forEach(function (option) { option.disabled = false; });
      updateSheetSelection();
    }
  }

  /* ---------------------------------------------------------------- results */
  function setupResultEvents() {
    byId('back-to-check').addEventListener('click', closeResults);
    byId('rerun-check').addEventListener('click', rerunCheck);
    byId('copy-report').addEventListener('click', copyReport);
    byId('download-csv').addEventListener('click', downloadCSV);
    all('[data-severity]').forEach(function (input) { input.addEventListener('change', applyFindingFilters); });
    ['filter-sheet', 'filter-pack', 'filter-rule'].forEach(function (id) { byId(id).addEventListener('change', applyFindingFilters); });
    byId('filter-text').addEventListener('input', debounce(applyFindingFilters, 140));
    byId('load-more-findings').addEventListener('click', function () {
      state.findingLimit += FINDING_BATCH;
      renderFindings();
    });
  }

  function showResults(result) {
    state.result = result;
    state.findingLimit = FINDING_BATCH;
    byId('check-workspace').hidden = true;
    byId('results-screen').hidden = false;
    renderResultSummary();
    renderResultNotes();
    populateFindingFilters();
    applyFindingFilters();
    saveHistory(result);
    byId('results-screen').scrollIntoView({ behavior: 'smooth', block: 'start' });
    announce(result.summary.errors ? 'ตรวจเสร็จ พบ ' + result.summary.errors + ' จุดผิด' : 'ตรวจเสร็จ ไม่พบจุดผิด');
  }

  function renderResultSummary() {
    var result = state.result;
    var summary = result.summary || {};
    var errors = Number(summary.errors || 0);
    var warnings = Number(summary.warnings || 0);
    var pass = errors === 0;
    byId('result-hero').classList.toggle('is-pass', pass);
    byId('verdict-icon').textContent = pass ? '✓' : '!';
    byId('result-source').textContent = (result.game || state.game).toUpperCase() + ' · ' + (result.source || 'เอกสาร');
    byId('results-title').textContent = pass ? 'ส่งต่อได้' : 'พบจุดที่ต้องแก้';
    byId('result-subtitle').textContent = pass
      ? (warnings ? 'ไม่พบข้อผิด แต่มี ' + formatNumber(warnings) + ' จุดน่าสงสัยที่ควรทบทวน' : 'ตรวจครบทุกแถวแล้ว ไม่พบข้อผิดพลาด')
      : 'พบ ' + formatNumber(errors) + ' จุดผิดใน ' + formatNumber(summary.rows_error) + ' แถว กรุณาแก้ก่อนส่งต่อ';
    byId('summary-rows').textContent = formatNumber(summary.rows);
    byId('summary-error-rows').textContent = formatNumber(summary.rows_error);
    byId('summary-warn-rows').textContent = formatNumber(summary.rows_warn);
    byId('summary-ok-rows').textContent = formatNumber(summary.rows_ok);
    byId('count-errors').textContent = formatNumber(summary.errors);
    byId('count-warnings').textContent = formatNumber(summary.warnings);
    byId('count-infos').textContent = formatNumber(summary.infos);
    byId('perfect-state').hidden = (result.findings || []).length !== 0;
    byId('finding-tools').hidden = (result.findings || []).length === 0;
    byId('findings-root').hidden = (result.findings || []).length === 0;
    byId('findings-empty').hidden = true;
  }

  function renderResultNotes() {
    var root = byId('result-notes');
    root.replaceChildren();
    var notes = state.result.notes || [];
    root.hidden = notes.length === 0;
    notes.forEach(function (note) {
      var text;
      if (typeof note === 'string') text = note;
      else if (note && note.message) {
        text = (note.sheet ? 'ชีท ' + note.sheet : '') + (note.row ? ' แถว ' + note.row : '') +
          (note.sheet || note.row ? ': ' : '') + note.message;
      }
      else text = JSON.stringify(note);
      root.appendChild(node('div', 'notice-item', 'อ่านข้อมูลบางส่วนไม่ได้ — ' + text));
    });
  }

  function fillSelect(select, placeholder, entries) {
    var previous = select.value;
    select.replaceChildren();
    var first = node('option', '', placeholder);
    first.value = '';
    select.appendChild(first);
    entries.forEach(function (entry) {
      var option = node('option', '', entry.label);
      option.value = entry.value;
      select.appendChild(option);
    });
    if (entries.some(function (entry) { return entry.value === previous; })) select.value = previous;
  }

  function populateFindingFilters() {
    var findings = state.result.findings || [];
    fillSelect(byId('filter-sheet'), 'ทุกชีท', unique(findings.map(function (f) { return f.sheet; })).sort().map(function (v) { return { value: v, label: v }; }));
    fillSelect(byId('filter-pack'), 'ทุกโปรโมชั่น', unique(findings.map(function (f) { return f.pack; })).sort().map(function (v) { return { value: v, label: v }; }));
    var rules = {};
    findings.forEach(function (f) { rules[f.code] = f.rule || state.rules[f.code] || f.code; });
    fillSelect(byId('filter-rule'), 'ทุกกฎ', Object.keys(rules).sort().map(function (code) { return { value: code, label: code + ' · ' + rules[code] }; }));
    all('[data-severity]').forEach(function (input) { input.checked = input.dataset.severity !== 'info'; });
    byId('filter-text').value = '';
  }

  function applyFindingFilters() {
    if (!state.result) return;
    var allowed = new Set(all('[data-severity]:checked').map(function (input) { return input.dataset.severity; }));
    var sheet = byId('filter-sheet').value;
    var pack = byId('filter-pack').value;
    var rule = byId('filter-rule').value;
    var query = byId('filter-text').value.trim().toLocaleLowerCase('th');
    state.filteredFindings = (state.result.findings || []).filter(function (finding) {
      if (!allowed.has(finding.severity)) return false;
      if (sheet && finding.sheet !== sheet) return false;
      if (pack && finding.pack !== pack) return false;
      if (rule && finding.code !== rule) return false;
      if (query) {
        var haystack = [finding.sheet, finding.pack, finding.row, finding.cell, finding.field, finding.item,
          finding.value, finding.expected, finding.message, finding.rule, finding.code].join(' ').toLocaleLowerCase('th');
        if (haystack.indexOf(query) < 0) return false;
      }
      return true;
    });
    state.findingLimit = FINDING_BATCH;
    renderFindings();
  }

  function renderFindings() {
    var root = byId('findings-root');
    root.replaceChildren();
    var findings = state.filteredFindings || [];
    var shown = findings.slice(0, state.findingLimit);
    byId('filtered-count').textContent = 'แสดง ' + formatNumber(shown.length) + ' จาก ' + formatNumber(findings.length) + ' รายการ';
    byId('findings-empty').hidden = findings.length !== 0 || (state.result.findings || []).length === 0;
    root.hidden = findings.length === 0;
    byId('load-more-findings').hidden = shown.length >= findings.length;
    if (!shown.length) return;

    var grouped = new Map();
    shown.forEach(function (finding) {
      if (!grouped.has(finding.sheet)) grouped.set(finding.sheet, new Map());
      var packs = grouped.get(finding.sheet);
      if (!packs.has(finding.pack)) packs.set(finding.pack, new Map());
      var rows = packs.get(finding.pack);
      var rowKey = String(finding.row);
      if (!rows.has(rowKey)) rows.set(rowKey, []);
      rows.get(rowKey).push(finding);
    });

    grouped.forEach(function (packs, sheetName) {
      var sheetEl = node('section', 'sheet-group');
      var sheetHeading = node('div', 'sheet-heading');
      sheetHeading.appendChild(node('h3', '', sheetName));
      var sheetCount = 0;
      packs.forEach(function (rows) { rows.forEach(function (list) { sheetCount += list.length; }); });
      sheetHeading.appendChild(node('span', '', formatNumber(sheetCount) + ' รายการ'));
      sheetEl.appendChild(sheetHeading);

      packs.forEach(function (rows, packName) {
        var packEl = node('div', 'pack-group');
        var packHeading = node('div', 'pack-heading');
        packHeading.appendChild(node('h4', '', packName || 'ไม่ระบุโปรโมชั่น'));
        packHeading.appendChild(node('span', '', formatNumber(rows.size) + ' แถว'));
        packEl.appendChild(packHeading);
        rows.forEach(function (rowFindings, rowNumber) {
          packEl.appendChild(renderFindingRow(rowFindings, rowNumber));
        });
        sheetEl.appendChild(packEl);
      });
      root.appendChild(sheetEl);
    });
  }

  function renderFindingRow(findings, rowNumber) {
    var row = node('article', 'row-card');
    var anchor = node('div', 'row-anchor');
    anchor.appendChild(node('small', '', 'แถว'));
    anchor.appendChild(node('strong', '', rowNumber));
    anchor.appendChild(node('span', '', formatNumber(findings.length) + ' จุด'));
    row.appendChild(anchor);
    var list = node('div', 'row-findings');
    findings.forEach(function (finding) { list.appendChild(renderFinding(finding)); });
    row.appendChild(list);
    return row;
  }

  function renderFinding(finding) {
    var el = node('div', 'finding');
    var field = node('div', 'finding-field');
    field.appendChild(node('span', 'severity-badge severity-badge--' + finding.severity, SEVERITY_TH[finding.severity] || finding.severity));
    var link = exactCellLink(finding);
    if (link) {
      var a = node('a', 'cell-link', (finding.cell || 'เซลล์') + ' ↗');
      a.href = link;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.title = 'เปิดเซลล์ ' + finding.cell + ' ใน Google Sheet';
      field.appendChild(a);
    } else {
      field.appendChild(node('span', 'cell-static', finding.cell || '—'));
    }
    el.appendChild(field);

    var item = node('div', 'finding-item');
    item.appendChild(node('strong', '', finding.item || 'ไม่ระบุชื่อไอเทม'));
    item.appendChild(node('span', '', (finding.field || 'ไม่ระบุช่อง') + ' · ' + (finding.code || finding.rule || 'กฎตรวจ')));
    el.appendChild(item);

    var detail = node('div', 'finding-detail');
    var diff = node('div', 'diff');
    var wrong = node('del', 'diff-value', textValue(finding.value, '(ว่าง)'));
    diff.appendChild(wrong);
    if (finding.expected !== undefined && finding.expected !== null && String(finding.expected) !== '') {
      diff.appendChild(node('span', 'diff-arrow', '→'));
      diff.appendChild(node('ins', 'diff-value', finding.expected));
    }
    detail.appendChild(diff);
    detail.appendChild(node('p', 'finding-message', finding.message || finding.rule || ''));
    el.appendChild(detail);
    return el;
  }

  function extractSheetId(url) {
    var match = String(url || '').match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : '';
  }

  function exactCellLink(finding) {
    var context = state.resultContext;
    if (!context || context.type !== 'google' || !context.id) return '';
    var gid = context.gidMap && context.gidMap[finding.sheet];
    if (gid === undefined || gid === null || !finding.cell) return '';
    return 'https://docs.google.com/spreadsheets/d/' + encodeURIComponent(context.id) + '/edit#gid=' + encodeURIComponent(gid) + '&range=' + encodeURIComponent(finding.cell);
  }

  function closeResults() {
    byId('results-screen').hidden = true;
    byId('check-workspace').hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function rerunCheck() {
    if (!state.lastWorkbook) { closeResults(); return; }
    var button = byId('rerun-check');
    var checkGame = state.result.game || state.game;
    withBusy(button, true, 'กำลังตรวจใหม่…');
    all('.game-option').forEach(function (option) { option.disabled = true; });
    try {
      var result = await window.QAEngine.check(checkGame, state.lastWorkbook);
      showResults(result);
      toast('ตรวจเอกสารใหม่เรียบร้อย');
    } catch (error) {
      toast(errorMessage(error, 'ตรวจใหม่ไม่สำเร็จ'), 'error');
    } finally {
      withBusy(button, false);
      all('.game-option').forEach(function (option) { option.disabled = false; });
    }
  }

  async function copyReport() {
    if (!state.result) return;
    var button = byId('copy-report');
    withBusy(button, true, 'กำลังคัดลอก…');
    try {
      var text = window.QAEngine.reportText(state.result);
      await navigator.clipboard.writeText(text);
      toast('คัดลอกรายงานแล้ว พร้อมวางในแชต');
    } catch (error) {
      toast('คัดลอกไม่สำเร็จ กรุณาอนุญาต clipboard แล้วลองอีกครั้ง', 'error');
    } finally {
      withBusy(button, false);
    }
  }

  async function downloadCSV() {
    if (!state.result) return;
    var button = byId('download-csv');
    withBusy(button, true, 'กำลังสร้าง CSV…');
    try {
      var includeInfo = !!document.querySelector('[data-severity="info"]:checked');
      var csv = await window.QAEngine.reportCSV(state.result, includeInfo);
      var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      var base = String(state.result.source || 'qaitem-report').replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]+/g, '-');
      a.href = url;
      a.download = base + '-ผลตรวจ.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast('ดาวน์โหลดรายงาน CSV แล้ว');
    } catch (error) {
      toast(errorMessage(error, 'สร้างไฟล์ CSV ไม่สำเร็จ'), 'error');
    } finally {
      withBusy(button, false);
    }
  }

  /* ---------------------------------------------------------------- items */
  function setupItemEvents() {
    byId('item-search').addEventListener('input', debounce(renderItems, 150));
  }

  function renderItems() {
    if (!window.QAEngine || !window.QAEngine.isUnlocked()) return;
    var query = byId('item-search').value.trim();
    var items;
    try { items = window.QAEngine.searchItems(state.game, query, 100) || []; }
    catch (error) {
      toast(errorMessage(error, 'ค้นหาฐานข้อมูลไม่สำเร็จ'), 'error');
      return;
    }
    var body = byId('item-table-body');
    body.replaceChildren();
    var fragment = document.createDocumentFragment();
    items.forEach(function (item) {
      var tr = node('tr');
      ['kind', 'index', 'option', 'duration'].forEach(function (field) { tr.appendChild(node('td', 'num', textValue(item[field]))); });
      ['stackable', 'itemmove'].forEach(function (field) {
        var td = node('td');
        td.appendChild(node('span', 'boolean-pill', booleanText(item[field])));
        tr.appendChild(td);
      });
      ['name', 'display_name', 'period'].forEach(function (field) {
        var td = node('td', '', textValue(item[field]));
        td.title = textValue(item[field]);
        tr.appendChild(td);
      });
      fragment.appendChild(tr);
    });
    body.appendChild(fragment);
    byId('items-empty').hidden = items.length !== 0;
    byId('item-result-count').textContent = query
      ? 'พบ ' + formatNumber(items.length) + (items.length === 100 ? '+ รายการ · แสดง 100 รายการแรก' : ' รายการ')
      : 'แสดง 100 รายการแรก';
    updateGameUI();
  }

  function booleanText(value) {
    if (value === true || value === 1 || String(value).toLowerCase() === 'yes') return 'Yes';
    if (value === false || value === 0 || String(value).toLowerCase() === 'no') return 'No';
    return textValue(value);
  }

  /* ---------------------------------------------------------------- add */
  var scheduleValidation = debounce(validateAddForm, 320);

  function setupAddItemEvents() {
    var form = byId('add-item-form');
    form.addEventListener('input', function (event) {
      if (event.target.id === 'github-token') {
        safeStorageSet(STORAGE.token, event.target.value);
        return;
      }
      scheduleValidation();
    });
    form.addEventListener('change', function (event) {
      if (event.target.id !== 'github-token') scheduleValidation();
    });
    form.addEventListener('submit', saveItem);
  }

  function addItemData() {
    var form = byId('add-item-form');
    var data = new FormData(form);
    return {
      kind: data.get('kind') || '',
      index: data.get('index') || '',
      option: data.get('option') || '',
      duration: data.get('duration') || '',
      stackable: data.get('stackable') || '',
      itemmove: data.get('itemmove') || '',
      name: data.get('name') || '',
      display_name: data.get('display_name') || '',
      period: data.get('period') || ''
    };
  }

  function requiredAddFieldsPresent(item) {
    return ['kind', 'index', 'option', 'duration', 'stackable', 'itemmove', 'name'].every(function (field) {
      return String(item[field] === undefined || item[field] === null ? '' : item[field]).trim() !== '';
    });
  }

  async function validateAddForm() {
    if (!window.QAEngine || !window.QAEngine.isUnlocked()) return null;
    var item = addItemData();
    var nonce = ++state.validationNonce;
    byId('add-success').hidden = true;
    showInline('add-error', '');
    if (!requiredAddFieldsPresent(item)) {
      state.validation = null;
      byId('validation-idle').hidden = false;
      byId('validation-running').hidden = true;
      byId('validation-result').hidden = true;
      byId('save-item').disabled = true;
      return null;
    }
    byId('validation-idle').hidden = true;
    byId('validation-running').hidden = false;
    byId('validation-result').hidden = true;
    byId('save-item').disabled = true;
    try {
      var result = await window.QAEngine.validateItem(state.game, item);
      if (nonce !== state.validationNonce) return null;
      state.validation = result;
      renderValidation(result);
      return result;
    } catch (error) {
      if (nonce !== state.validationNonce) return null;
      state.validation = null;
      byId('validation-running').hidden = true;
      showInline('add-error', errorMessage(error, 'ตรวจข้อมูลไอเทมไม่สำเร็จ'));
      return null;
    }
  }

  function renderValidation(result) {
    byId('validation-idle').hidden = true;
    byId('validation-running').hidden = true;
    byId('validation-result').hidden = false;
    var stateEl = byId('validation-state');
    stateEl.className = 'validation-state ' + (result.ok ? 'is-valid' : 'is-invalid');
    stateEl.textContent = result.ok ? '✓ ผ่านกฎบังคับ บันทึกได้' : '! พบข้อมูลที่ต้องแก้';
    renderMessageList(byId('validation-errors'), result.errors || []);
    renderMessageList(byId('validation-warnings'), result.warnings || []);
    byId('save-item').disabled = !result.ok;
  }

  function renderMessageList(root, messages) {
    root.replaceChildren();
    root.hidden = messages.length === 0;
    messages.forEach(function (message) { root.appendChild(node('li', '', message)); });
  }

  async function saveItem(event) {
    event.preventDefault();
    var button = byId('save-item');
    var token = byId('github-token').value.trim();
    safeStorageSet(STORAGE.token, token);
    showInline('add-error', '');
    byId('add-success').hidden = true;
    withBusy(button, true, 'กำลังตรวจและบันทึก…');
    try {
      var validation = await window.QAEngine.validateItem(state.game, addItemData());
      state.validation = validation;
      renderValidation(validation);
      if (!validation.ok) throw new Error('ข้อมูลยังไม่ผ่านกฎบังคับ กรุณาแก้ช่องที่แจ้งก่อนบันทึก');
      if (!token) throw new Error('กรุณาใส่ GitHub token ของ admin');
      var result = await window.QAEngine.addItem(state.game, validation.item, token);
      updateGameUI();
      var success = byId('add-success');
      success.replaceChildren();
      var title = node('strong', '', 'บันทึกไอเทมแล้ว ใช้งานในแท็บนี้ได้ทันที');
      success.appendChild(title);
      success.appendChild(document.createElement('br'));
      success.appendChild(document.createTextNode('ฐานข้อมูลออนไลน์จะอัปเดตภายใน 1–2 นาที'));
      if (result.commit_url) {
        success.appendChild(document.createElement('br'));
        var link = node('a', '', 'เปิด commit บน GitHub ↗');
        link.href = result.commit_url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        success.appendChild(link);
      }
      success.hidden = false;
      toast('เพิ่มไอเทมเรียบร้อย');
    } catch (error) {
      showInline('add-error', errorMessage(error, 'บันทึกไอเทมไม่สำเร็จ'));
    } finally {
      withBusy(button, false);
      button.disabled = !(state.validation && state.validation.ok);
    }
  }

  /* ---------------------------------------------------------------- history */
  function setupHistoryEvents() {
    byId('clear-history').addEventListener('click', function () {
      var history = readHistory();
      if (!(history[state.game] || []).length) return;
      if (!window.confirm('ล้างประวัติการตรวจของ ' + GAME_LABEL[state.game] + ' ในเบราว์เซอร์นี้หรือไม่?')) return;
      history[state.game] = [];
      writeHistory(history);
      renderHistory();
      toast('ล้างประวัติของ ' + GAME_LABEL[state.game] + ' แล้ว');
    });
  }

  function readHistory() {
    try {
      var data = JSON.parse(safeStorageGet(STORAGE.history, '{}'));
      return { pc: Array.isArray(data.pc) ? data.pc : [], mobile: Array.isArray(data.mobile) ? data.mobile : [] };
    } catch (error) { return { pc: [], mobile: [] }; }
  }

  function writeHistory(history) { safeStorageSet(STORAGE.history, JSON.stringify(history)); }

  function saveHistory(result) {
    var history = readHistory();
    var game = result.game || state.game;
    history[game].unshift({
      source: result.source || 'ไม่ระบุชื่อเอกสาร',
      url: result.url || (state.resultContext && state.resultContext.url) || null,
      time: result.checked_at || new Date().toISOString(),
      rows: Number(result.summary && result.summary.rows || 0),
      errors: Number(result.summary && result.summary.errors || 0),
      warnings: Number(result.summary && result.summary.warnings || 0)
    });
    history[game] = history[game].slice(0, 30);
    writeHistory(history);
  }

  function renderHistory() {
    var entries = readHistory()[state.game] || [];
    var root = byId('history-list');
    root.replaceChildren();
    entries.forEach(function (entry) {
      var sourceUrl = safeGoogleUrl(entry.url);
      var item = node(sourceUrl ? 'a' : 'div', 'history-item');
      if (sourceUrl) {
        item.href = sourceUrl;
        item.target = '_blank';
        item.rel = 'noopener noreferrer';
        item.title = 'เปิดเอกสารต้นฉบับ';
      }
      var main = node('div', 'history-main');
      var status = node('span', 'history-status' + (entry.errors ? ' has-error' : ''), entry.errors ? '!' : '✓');
      main.appendChild(status);
      var title = node('div', 'history-title');
      title.appendChild(node('strong', '', entry.source));
      title.appendChild(node('span', '', formatNumber(entry.rows) + ' แถว' + (sourceUrl ? ' · เปิดต้นฉบับ ↗' : ' · ไฟล์จากเครื่อง')));
      main.appendChild(title);
      item.appendChild(main);
      var counts = node('div', 'history-counts');
      counts.appendChild(node('span', 'history-error', formatNumber(entry.errors) + ' ผิด'));
      counts.appendChild(node('span', 'history-warn', formatNumber(entry.warnings) + ' สงสัย'));
      var time = node('time', '', formatHistoryTime(entry.time));
      time.dateTime = entry.time;
      counts.appendChild(time);
      item.appendChild(counts);
      root.appendChild(item);
    });
    byId('history-empty').hidden = entries.length !== 0;
    byId('clear-history').disabled = entries.length === 0;
  }

  function formatHistoryTime(value) {
    var date = new Date(value);
    if (isNaN(date.getTime())) return 'ไม่ระบุเวลา';
    return new Intl.DateTimeFormat('th-TH', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    }).format(date);
  }

  function safeGoogleUrl(value) {
    try {
      var url = new URL(String(value || ''));
      return url.protocol === 'https:' && url.hostname === 'docs.google.com' ? url.href : '';
    } catch (error) { return ''; }
  }

  setupStaticEvents();
  initEngine();
})();
