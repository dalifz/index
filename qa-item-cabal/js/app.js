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
    editOriginal: null,
    rules: {},
    auth: { client_id: '', api_url: '', allow_team_password: true },
    googleBusy: false,
    googleInitializedClient: '',
    sessionExpiryHandled: false
  };
  var googleIdentityPromise = null;

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
    if (handleSessionExpired(error)) return '';
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
    if (!message) return;
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
      if (button.dataset.nextLabel) {
        button.textContent = button.dataset.nextLabel;
      } else if (button.dataset.originalHtml) {
        button.innerHTML = button.dataset.originalHtml;
      }
      delete button.dataset.originalHtml;
      delete button.dataset.nextLabel;
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
    renderGoogleButton();
  }

  // Thai Kedmanee keyboard -> the English key in the same place. The team password is
  // English only, so typing it while the keyboard is still in Thai mode just works.
  var THAI_TO_EN = { 'ๅ': '1', 'ภ': '4', 'ถ': '5', 'ุ': '6', 'ึ': '7', 'ค': '8', 'ต': '9', 'จ': '0', 'ข': '-', 'ช': '=', 'ๆ': 'q', 'ไ': 'w', 'ำ': 'e', 'พ': 'r', 'ะ': 't', 'ั': 'y', 'ี': 'u', 'ร': 'i', 'น': 'o', 'ย': 'p', 'บ': '[', 'ล': ']', 'ฃ': '\\', 'ฟ': 'a', 'ห': 's', 'ก': 'd', 'ด': 'f', 'เ': 'g', '้': 'h', '่': 'j', 'า': 'k', 'ส': 'l', 'ว': ';', 'ง': '\'', 'ผ': 'z', 'ป': 'x', 'แ': 'c', 'อ': 'v', 'ิ': 'b', 'ื': 'n', 'ท': 'm', 'ม': ',', 'ใ': '.', 'ฝ': '/', '๑': '@', '๒': '#', '๓': '$', '๔': '%', 'ู': '^', '฿': '&', '๕': '*', '๖': '(', '๗': ')', '๘': '_', '๙': '+', '๐': 'Q', 'ฎ': 'E', 'ฑ': 'R', 'ธ': 'T', 'ํ': 'Y', '๊': 'U', 'ณ': 'I', 'ฯ': 'O', 'ญ': 'P', 'ฐ': '{', 'ฅ': '|', 'ฤ': 'A', 'ฆ': 'S', 'ฏ': 'D', 'โ': 'F', 'ฌ': 'G', '็': 'H', '๋': 'J', 'ษ': 'K', 'ศ': 'L', 'ซ': ':', 'ฉ': 'C', 'ฮ': 'V', 'ฺ': 'B', '์': 'N', 'ฒ': '<', 'ฬ': '>', 'ฦ': '?' };
  function thaiToEnglish(text) {
    return String(text || '').split('').map(function (ch) {
      return Object.prototype.hasOwnProperty.call(THAI_TO_EN, ch) ? THAI_TO_EN[ch] : ch;
    }).join('');
  }

  function googleSignInAvailable() {
    return !!(state.auth.client_id && state.auth.api_url);
  }

  function signedInUser() {
    try { return window.QAEngine && window.QAEngine.user ? window.QAEngine.user() : null; }
    catch (e) { return null; }
  }

  function canEditItems() {
    try {
      return !!(window.QAEngine && window.QAEngine.isUnlocked && window.QAEngine.isUnlocked() &&
        window.QAEngine.canEditItems && window.QAEngine.canEditItems());
    }
    catch (e) { return false; }
  }

  function googleIdentity() {
    return window.google && window.google.accounts && window.google.accounts.id;
  }

  function disableGoogleAutoSelect() {
    var identity = googleIdentity();
    if (identity && identity.disableAutoSelect) identity.disableAutoSelect();
  }

  function ensureGoogleIdentity() {
    if (!state.auth.client_id) return Promise.resolve(false);
    if (googleIdentity()) {
      try {
        initializeGoogleIdentity();
        return Promise.resolve(true);
      } catch (error) {
        return Promise.reject(error);
      }
    }
    if (googleIdentityPromise) return googleIdentityPromise;
    googleIdentityPromise = new Promise(function (resolve, reject) {
      var script = document.querySelector('script[data-google-identity]');
      if (!script) {
        script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.dataset.googleIdentity = 'true';
        document.head.appendChild(script);
      }
      script.addEventListener('load', function () {
        try {
          initializeGoogleIdentity();
          resolve(true);
        } catch (error) {
          googleIdentityPromise = null;
          reject(error);
        }
      }, { once: true });
      script.addEventListener('error', function () {
        googleIdentityPromise = null;
        reject(new Error('โหลด Google Sign-In ไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง'));
      }, { once: true });
    });
    return googleIdentityPromise;
  }

  function initializeGoogleIdentity() {
    var identity = googleIdentity();
    if (!identity || !state.auth.client_id) return;
    if (state.googleInitializedClient !== state.auth.client_id) {
      identity.initialize({
        client_id: state.auth.client_id,
        callback: function (response) { loginWithGoogle(response && response.credential); },
        auto_select: true,
        cancel_on_tap_outside: false
      });
      state.googleInitializedClient = state.auth.client_id;
    }
    renderGoogleButton();
  }

  function googleButtonTheme() {
    var theme = document.documentElement.dataset.theme;
    if (!theme) theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    return theme === 'dark' ? 'filled_black' : 'outline';
  }

  function renderGoogleButton() {
    var container = byId('google-signin-button');
    var identity = googleIdentity();
    if (!container || !identity || !googleSignInAvailable() || byId('google-auth-panel').hidden) return;
    container.replaceChildren();
    identity.renderButton(container, {
      theme: googleButtonTheme(),
      size: 'large',
      text: 'signin_with',
      shape: 'pill',
      locale: 'th'
    });
  }

  function setGoogleBusy(busy) {
    state.googleBusy = !!busy;
    byId('google-auth-panel').classList.toggle('is-busy', state.googleBusy);
    byId('google-auth-panel').setAttribute('aria-busy', state.googleBusy ? 'true' : 'false');
    byId('google-busy').hidden = !state.googleBusy;
  }

  async function loginWithGoogle(idToken) {
    if (!idToken || state.googleBusy) return;
    setGoogleBusy(true);
    showInline('google-auth-error', '');
    try {
      await window.QAEngine.loginWithGoogle(idToken);
      state.sessionExpiryHandled = false;
      enterApp();
    } catch (error) {
      disableGoogleAutoSelect();
      if (!handleSessionExpired(error)) {
        var message = error && error.message === 'not-allowed'
          ? 'อีเมล ' + textValue(error.email, 'นี้') + ' ยังไม่มีสิทธิ์ใช้งาน ติดต่อ admin (Dalif)'
          : errorMessage(error, 'Sign in with Google ไม่สำเร็จ');
        showInline('google-auth-error', message);
      }
    } finally {
      setGoogleBusy(false);
      renderGoogleButton();
    }
  }

  function setupStaticEvents() {
    var savedTheme = safeStorageGet(STORAGE.theme, '');
    if (savedTheme === 'light' || savedTheme === 'dark') document.documentElement.dataset.theme = savedTheme;

    byId('retry-init').addEventListener('click', initEngine);
    byId('unlock-form').addEventListener('submit', unlock);
    byId('show-team-password').addEventListener('click', showTeamPassword);
    byId('back-to-google').addEventListener('click', function () { showUnlock({ preferGoogle: true }); });
    byId('sheet-signin-button').addEventListener('click', returnToGoogleSignIn);
    var pw = byId('team-password');
    pw.addEventListener('input', function () {
      var fixed = thaiToEnglish(pw.value);
      if (fixed !== pw.value) {
        var caret = pw.selectionStart;
        pw.value = fixed;
        try { pw.setSelectionRange(caret, caret); } catch (e) { /* ignore */ }
        showInline('unlock-hint', 'คีย์บอร์ดยังเป็นภาษาไทย — แปลงเป็นตัวอังกฤษให้อัตโนมัติแล้ว');
      }
    });
    pw.addEventListener('keyup', function (event) {
      if (event.getModifierState && event.getModifierState('CapsLock')) {
        showInline('unlock-hint', 'Caps Lock เปิดอยู่ — รหัสผ่านแยกตัวพิมพ์เล็ก/ใหญ่');
      } else if (byId('unlock-hint').textContent.indexOf('Caps Lock') === 0) {
        showInline('unlock-hint', '');
      }
    });
    byId('lock-button').addEventListener('click', logoutApp);
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
        } else if (state.view === 'add' && !state.editOriginal) {
          event.preventDefault();
          byId('edit-item-search').focus();
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
      state.auth = window.QAEngine.authConfig ? window.QAEngine.authConfig() : state.auth;
      if (state.auth.client_id) {
        ensureGoogleIdentity().catch(function (error) {
          if (googleSignInAvailable()) showInline('google-auth-error', errorMessage(error, 'โหลด Google Sign-In ไม่สำเร็จ'));
        });
      }
      if (window.QAEngine.isUnlocked()) enterApp();
      else showUnlock();
    } catch (error) {
      showInline('loading-error', errorMessage(error, 'โหลดระบบตรวจสอบไม่สำเร็จ'));
      retry.hidden = false;
      announce('โหลดระบบตรวจสอบไม่สำเร็จ');
    }
  }

  function showUnlock(options) {
    options = options || {};
    var useGoogle = googleSignInAvailable() && options.preferTeam !== true;
    byId('loading-screen').hidden = true;
    byId('app-shell').hidden = true;
    byId('unlock-screen').hidden = false;
    showInline('unlock-error', '');
    showInline('unlock-hint', '');
    if (!options.keepGoogleError) showInline('google-auth-error', '');
    setGoogleBusy(false);
    byId('google-auth-panel').hidden = !useGoogle;
    byId('team-auth-panel').hidden = useGoogle;
    byId('show-team-password').hidden = !useGoogle || !state.auth.allow_team_password;
    byId('back-to-google').hidden = !googleSignInAvailable() || !state.auth.allow_team_password;
    if (useGoogle) {
      byId('unlock-eyebrow').textContent = 'บัญชีทีม QA';
      byId('unlock-title').textContent = 'Sign in เพื่อเริ่มตรวจเอกสาร';
      byId('unlock-copy').textContent = 'ใช้บัญชี Google ของคุณเพื่อระบุตัวตนและบันทึกประวัติการทำงานของทีม';
      ensureGoogleIdentity().then(renderGoogleButton).catch(function (error) {
        showInline('google-auth-error', errorMessage(error, 'โหลด Google Sign-In ไม่สำเร็จ'));
      });
    } else {
      byId('unlock-eyebrow').textContent = 'ฐานข้อมูลเข้ารหัส';
      byId('unlock-title').textContent = googleSignInAvailable() ? 'เปิดด้วยรหัสผ่านทีม' : 'เปิดฐานข้อมูลของทีม';
      byId('unlock-copy').textContent = 'ข้อมูลไอเทมถูกเข้ารหัส กรุณาใส่รหัสผ่านทีมเพื่อเริ่มตรวจเอกสาร';
      window.setTimeout(function () { byId('team-password').focus(); }, 0);
    }
  }

  function showTeamPassword() { showUnlock({ preferTeam: true }); }

  async function unlock(event) {
    event.preventDefault();
    var button = byId('unlock-button');
    var password = thaiToEnglish(byId('team-password').value);
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
    byId('google-auth-panel').hidden = true;
    byId('app-shell').hidden = false;
    document.body.dataset.game = state.game;
    var token = safeStorageGet(STORAGE.token, '');
    byId('github-token').value = token;
    state.sessionExpiryHandled = false;
    updateUserUI();
    updateRoleUI();
    updateSaveIdentityUI();
    updateGameUI();
    updateSheetCapability();
    showView(state.view);
    announce('ระบบพร้อมใช้งาน ฐานข้อมูล ' + GAME_LABEL[state.game]);
  }

  function resetWorkspace() {
    state.result = null;
    state.resultContext = null;
    state.lastWorkbook = null;
    state.filteredFindings = [];
    state.editOriginal = null;
    state.view = 'check';
    clearSource();
    byId('results-screen').hidden = true;
    byId('check-workspace').hidden = false;
    byId('findings-root').replaceChildren();
    byId('item-table-body').replaceChildren();
    clearItemForm();
    updateItemModeUI();
    resetItemValidation();
    byId('team-password').value = '';
    showInline('unlock-error', '');
    showInline('google-auth-error', '');
  }

  async function logoutApp() {
    var button = byId('lock-button');
    var user = signedInUser();
    withBusy(button, true, user ? 'กำลังออก…' : 'กำลังล็อก…');
    disableGoogleAutoSelect();
    try {
      if (user && window.QAEngine.logout) await window.QAEngine.logout();
      else window.QAEngine.lock();
    } finally {
      resetWorkspace();
      withBusy(button, false);
      showUnlock({ preferGoogle: true });
      announce(user ? 'ออกจากระบบแล้ว' : 'ล็อกฐานข้อมูลแล้ว');
    }
  }

  function returnToGoogleSignIn() {
    window.QAEngine.lock();
    resetWorkspace();
    showUnlock({ preferGoogle: true });
    announce('กรุณา Sign in with Google เพื่ออ่าน Google Sheet');
  }

  function handleSessionExpired(error) {
    if (!error || error.message !== 'session-expired') return false;
    if (state.sessionExpiryHandled) return true;
    state.sessionExpiryHandled = true;
    disableGoogleAutoSelect();
    if (window.QAEngine && window.QAEngine.logout) window.QAEngine.logout().catch(function () { /* session is already gone */ });
    resetWorkspace();
    showUnlock({ preferGoogle: true });
    toast('หมดเวลาการใช้งาน กรุณา sign in ใหม่', 'error');
    announce('หมดเวลาการใช้งาน กรุณา sign in ใหม่');
    return true;
  }

  function safePictureUrl(value) {
    try {
      var url = new URL(String(value || ''));
      return url.protocol === 'https:' ? url.href : '';
    } catch (e) { return ''; }
  }

  function updateUserUI() {
    var user = signedInUser();
    var avatar = byId('user-avatar');
    avatar.replaceChildren();
    if (user) {
      var displayName = textValue(user.name, user.email || 'ผู้ใช้งาน');
      var picture = safePictureUrl(user.picture);
      if (picture) {
        var image = node('img');
        image.src = picture;
        image.alt = '';
        image.referrerPolicy = 'no-referrer';
        image.addEventListener('error', function () {
          avatar.replaceChildren(node('span', '', displayName.charAt(0) || '?'));
        }, { once: true });
        avatar.appendChild(image);
      } else {
        avatar.textContent = displayName.charAt(0) || '?';
      }
      byId('user-name').textContent = displayName;
      byId('user-email').textContent = user.email || '';
      byId('user-email').hidden = !user.email;
      byId('user-role').textContent = user.role === 'admin' ? 'Admin' : 'QA';
      byId('user-role').className = 'role-badge ' + (user.role === 'admin' ? 'role-badge--admin' : 'role-badge--qa');
      byId('user-chip').setAttribute('aria-label', displayName + ' · ' + (user.role === 'admin' ? 'Admin' : 'QA'));
      byId('lock-icon').textContent = '↪';
      byId('lock-label').textContent = 'ออกจากระบบ';
      byId('lock-button').setAttribute('aria-label', 'ออกจากระบบ');
    } else {
      avatar.textContent = '⌁';
      byId('user-name').textContent = 'โหมดรหัสทีม';
      byId('user-email').textContent = '';
      byId('user-email').hidden = true;
      byId('user-role').textContent = 'รหัสทีม';
      byId('user-role').className = 'role-badge role-badge--team';
      byId('user-chip').setAttribute('aria-label', 'โหมดรหัสทีม');
      byId('lock-icon').textContent = '⌁';
      byId('lock-label').textContent = 'ล็อก';
      byId('lock-button').setAttribute('aria-label', 'ล็อกฐานข้อมูล');
    }
  }

  function updateRoleUI() {
    var editable = canEditItems();
    var user = signedInUser();
    document.body.dataset.role = user ? user.role : 'team';
    all('[data-admin-only]').forEach(function (element) { element.hidden = !editable; });
    if (!editable && state.view === 'add') state.view = 'check';
  }

  function updateSaveIdentityUI() {
    var user = signedInUser();
    byId('token-panel').hidden = !!user;
    byId('backend-save-panel').hidden = !user;
    if (!user) return;
    byId('save-as-email').textContent = user.email || user.name || 'บัญชี Google นี้';
    var canSave = false;
    try { canSave = !!window.QAEngine.canSaveViaBackend(); } catch (e) { canSave = false; }
    byId('backend-save-note').hidden = canSave;
  }

  function changeGame(game) {
    if (game !== 'pc' && game !== 'mobile') return;
    if (state.game === game) return;
    var cancelledEdit = !!state.editOriginal;
    if (cancelledEdit) cancelItemEdit({ silent: true });
    state.game = game;
    document.body.dataset.game = game;
    state.validationNonce += 1;
    updateGameUI();
    updateMismatch();
    if (state.view === 'items') renderItems();
    if (state.view === 'history') renderHistory();
    if (state.view === 'add') {
      clearEditSearch();
      scheduleValidation();
    }
    if (state.result && !byId('results-screen').hidden) {
      closeResults();
      toast('เปลี่ยนฐานข้อมูลแล้ว กรุณาตรวจเอกสารอีกครั้ง');
    }
    if (cancelledEdit) toast('ยกเลิกการแก้ไขแล้ว เพราะเปลี่ยนฐานข้อมูลเกม');
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
    var needsGoogleSignIn = !enabled && !!state.auth.api_url && !signedInUser() && googleSignInAvailable();
    byId('sheet-url').disabled = !enabled;
    byId('sheet-names').disabled = !enabled;
    byId('load-sheets-button').disabled = !enabled;
    byId('google-disabled-note').hidden = enabled;
    byId('google-disabled-copy').textContent = needsGoogleSignIn
      ? 'Sign in with Google เพื่ออ่านจาก Google Sheet'
      : 'ยังไม่ได้ตั้งค่าตัวอ่าน Google Sheet';
    byId('sheet-signin-button').hidden = !needsGoogleSignIn;
    byId('google-source-card').classList.toggle('is-disabled', !enabled);
  }

  function showView(view) {
    if (view === 'add' && !canEditItems()) view = 'check';
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
    var wanted = byId('sheet-names').value.split(/[,|\n]/).map(function (s) { return s.trim(); }).filter(Boolean);
    var gidMatch = url.match(/[#&?]gid=(\d+)/);
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
      // which tabs to check: names typed by the user, else the tab the link was copied from
      var key = function (s) { return String(s || '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase(); };
      var pre = new Set(), missing = [];
      wanted.forEach(function (name) {
        var i = state.source.sheets.findIndex(function (sheet) { return key(sheet.name) === key(name); });
        if (i < 0) missing.push(name); else pre.add(i);
      });
      if (missing.length) {
        var near = state.source.sheets.map(function (s) { return s.name; })
          .filter(function (n) { return missing.some(function (m) { return key(n).indexOf(key(m).slice(0, 6)) >= 0; }); })
          .slice(0, 5);
        throw new Error('ไม่พบชีท "' + missing.join('", "') + '" ในไฟล์นี้' + (near.length ? ' — ใกล้เคียง: ' + near.join(', ') : ''));
      }
      if (!pre.size && gidMatch) {
        var g = state.source.sheets.findIndex(function (sheet) { return String(sheet.gid) === gidMatch[1]; });
        if (g >= 0) pre.add(g);
      }
      state.source.preselect = pre.size ? pre : null;
      presentSource();
      if (wanted.length) await runCheck();   // names given -> go straight to the result
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
    byId('sheet-names').value = '';
    showInline('google-error', '');
    showInline('excel-error', '');
    showInline('check-error', '');
  }

  function renderSheetPicker() {
    var root = byId('sheet-list');
    root.replaceChildren();
    if (!state.source) return;
    var showHidden = byId('show-hidden-sheets').checked;
    var pre = state.source.preselect;
    state.source.sheets.forEach(function (sheet, index) {
      if (sheet.hidden && !showHidden && !(pre && pre.has(index))) return;
      var label = node('label', 'sheet-option');
      var input = node('input');
      input.type = 'checkbox';
      input.dataset.index = index;
      input.checked = pre ? pre.has(index) : !sheet.hidden;
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
      if (!handleSessionExpired(error)) toast('คัดลอกไม่สำเร็จ กรุณาอนุญาต clipboard แล้วลองอีกครั้ง', 'error');
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
  var ITEM_FIELDS = ['kind', 'index', 'option', 'duration', 'itemmove', 'name', 'display_name', 'period'];
  var ITEM_FIELD_LABELS = {
    kind: 'ItemKind', index: 'ItemIndex', option: 'ItemOption', duration: 'DurationIndex',
    itemmove: 'Trade', name: 'Item Name', display_name: 'Display Name', period: 'Period'
  };

  function setupItemEvents() {
    byId('item-search').addEventListener('input', debounce(renderItems, 150));
  }

  function renderItems() {
    if (!window.QAEngine || !window.QAEngine.isUnlocked()) return;
    var editable = canEditItems();
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
      var tradeCell = node('td');
      tradeCell.appendChild(node('span', 'boolean-pill', booleanText(item.itemmove)));
      tr.appendChild(tradeCell);
      ['name', 'display_name', 'period'].forEach(function (field) {
        var td = node('td', '', textValue(item[field]));
        td.title = textValue(item[field]);
        tr.appendChild(td);
      });
      if (editable) {
        var actionCell = node('td', 'row-action');
        var editButton = node('button', 'edit-row-button');
        editButton.type = 'button';
        editButton.title = 'แก้ไข ' + textValue(item.name, 'ไอเทมนี้');
        editButton.setAttribute('aria-label', 'แก้ไข ' + textValue(item.name, 'ไอเทม') + ' ItemIndex ' + textValue(item.index));
        editButton.appendChild(node('span', 'edit-row-icon', '✎'));
        editButton.appendChild(node('span', '', 'แก้ไข'));
        editButton.addEventListener('click', function () { beginItemEdit(item); });
        actionCell.appendChild(editButton);
        tr.appendChild(actionCell);
      }
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

  /* ----------------------------------------------------------- add / edit */
  var scheduleValidation = debounce(validateAddForm, 320);
  var scheduleEditSearch = debounce(renderEditSearchResults, 140);

  function setupAddItemEvents() {
    var form = byId('add-item-form');
    form.addEventListener('input', function (event) {
      if (event.target.id === 'github-token') {
        safeStorageSet(STORAGE.token, event.target.value);
        return;
      }
      state.validation = null;
      renderItemDiffs();
      updateSaveButtonState();
      scheduleValidation();
    });
    form.addEventListener('change', function (event) {
      if (event.target.id !== 'github-token') {
        state.validation = null;
        renderItemDiffs();
        updateSaveButtonState();
        scheduleValidation();
      }
    });
    form.addEventListener('submit', saveItem);
    byId('edit-item-search').addEventListener('input', scheduleEditSearch);
    byId('cancel-item-edit').addEventListener('click', function () {
      cancelItemEdit();
      byId('edit-item-search').focus();
    });
  }

  function renderEditSearchResults() {
    if (!window.QAEngine || !window.QAEngine.isUnlocked() || !canEditItems() || state.editOriginal) return;
    var query = byId('edit-item-search').value.trim();
    var results = byId('edit-search-results');
    var hint = byId('edit-search-hint');
    results.replaceChildren();
    if (!query) {
      results.hidden = true;
      hint.textContent = 'เลือกหนึ่งรายการเพื่อเปิดข้อมูลเดิมในฟอร์ม';
      return;
    }
    var items;
    try { items = window.QAEngine.searchItems(state.game, query, 8) || []; }
    catch (error) {
      results.hidden = true;
      hint.textContent = errorMessage(error, 'ค้นหาไอเทมไม่สำเร็จ');
      return;
    }
    items.forEach(function (item) {
      var button = node('button', 'quick-result');
      button.type = 'button';
      var copy = node('span', 'quick-result-copy');
      copy.appendChild(node('strong', '', textValue(item.name, item.display_name || 'ไม่ระบุชื่อ')));
      copy.appendChild(node('small', '', 'ItemIndex ' + textValue(item.index) + ' · ItemKind ' + textValue(item.kind)));
      button.appendChild(copy);
      button.appendChild(node('span', 'quick-result-action', 'แก้ไข →'));
      button.addEventListener('click', function () { beginItemEdit(item); });
      results.appendChild(button);
    });
    if (!items.length) results.appendChild(node('p', 'quick-result-empty', 'ไม่พบไอเทมที่ตรงกับคำค้นหา'));
    results.hidden = false;
    hint.textContent = items.length ? 'พบ ' + formatNumber(items.length) + ' รายการ เลือกรายการที่ต้องการแก้ไข' : 'ลองค้นหาด้วย ItemIndex หรือชื่อส่วนอื่น';
  }

  function beginItemEdit(item) {
    if (!item || !canEditItems()) return;
    state.editOriginal = item;
    state.validation = null;
    state.validationNonce += 1;
    fillItemForm(item);
    clearEditSearch();
    showInline('add-error', '');
    byId('add-success').hidden = true;
    updateItemModeUI();
    renderItemDiffs();
    showView('add');
    validateAddForm();
    window.requestAnimationFrame(function () {
      var banner = byId('edit-mode-banner');
      banner.setAttribute('tabindex', '-1');
      banner.focus();
    });
    announce('เปิดโหมดแก้ไข ' + textValue(item.name, 'ไอเทม') + ' ItemIndex ' + textValue(item.index));
  }

  function cancelItemEdit(options) {
    options = options || {};
    state.editOriginal = null;
    state.validationNonce += 1;
    clearItemForm();
    clearEditSearch();
    updateItemModeUI();
    renderItemDiffs();
    resetItemValidation();
    showInline('add-error', '');
    if (!options.keepSuccess) byId('add-success').hidden = true;
    if (!options.silent) announce('ยกเลิกการแก้ไข กลับสู่โหมดเพิ่มไอเทมใหม่');
  }

  function clearEditSearch() {
    var input = byId('edit-item-search');
    var results = byId('edit-search-results');
    if (input) input.value = '';
    if (results) {
      results.replaceChildren();
      results.hidden = true;
    }
    if (byId('edit-search-hint')) byId('edit-search-hint').textContent = 'เลือกหนึ่งรายการเพื่อเปิดข้อมูลเดิมในฟอร์ม';
  }

  function fillItemForm(item) {
    var form = byId('add-item-form');
    ITEM_FIELDS.forEach(function (field) {
      if (field === 'itemmove') return;
      var input = form.elements[field];
      if (input) input.value = item[field] === undefined || item[field] === null ? '' : String(item[field]);
    });
    var trade = booleanText(item.itemmove);
    var radio = form.querySelector('[name="itemmove"][value="' + (trade === 'No' ? 'No' : 'Yes') + '"]');
    if (radio) radio.checked = true;
  }

  function clearItemForm() {
    var form = byId('add-item-form');
    if (!form) return;
    ITEM_FIELDS.forEach(function (field) {
      if (field === 'itemmove') return;
      var input = form.elements[field];
      if (input) input.value = '';
    });
    var yes = form.querySelector('[name="itemmove"][value="Yes"]');
    if (yes) yes.checked = true;
  }

  function updateItemModeUI() {
    var editing = !!state.editOriginal;
    byId('add-mode-panel').hidden = editing;
    byId('edit-mode-banner').hidden = !editing;
    byId('item-form-title').textContent = editing ? 'แก้ไขข้อมูลไอเทม' : 'ข้อมูลไอเทมใหม่';
    setSaveButtonLabel(editing ? 'บันทึกการแก้ไข' : 'บันทึกไอเทมใหม่');
    if (!editing) return;
    byId('edit-item-name').textContent = textValue(state.editOriginal.name, state.editOriginal.display_name || 'ไม่ระบุชื่อ');
    byId('edit-item-index').textContent = textValue(state.editOriginal.index);
    var meta = [];
    if (state.editOriginal.seen !== undefined && state.editOriginal.seen !== null) {
      meta.push('พบในเอกสาร ' + formatNumber(state.editOriginal.seen) + ' ครั้ง');
    }
    if (state.editOriginal.source) meta.push('แหล่งที่มา: ' + String(state.editOriginal.source));
    byId('edit-item-meta').textContent = meta.length ? meta.join(' · ') : 'รายการจากคลังไอเทม ' + GAME_LABEL[state.game];
  }

  function setSaveButtonLabel(label) {
    var button = byId('save-item');
    if (button.getAttribute('aria-busy') === 'true') {
      button.dataset.nextLabel = label;
      return;
    }
    button.textContent = label;
    delete button.dataset.originalHtml;
    delete button.dataset.nextLabel;
  }

  function addItemData() {
    var form = byId('add-item-form');
    var data = new FormData(form);
    return {
      kind: data.get('kind') || '',
      index: data.get('index') || '',
      option: data.get('option') || '',
      duration: data.get('duration') || '',
      itemmove: data.get('itemmove') || '',
      name: data.get('name') || '',
      display_name: data.get('display_name') || '',
      period: data.get('period') || ''
    };
  }

  function comparableItemValue(value, field) {
    if (value === undefined || value === null) return '';
    var normalized = String(value).trim();
    if (field === 'itemmove') {
      if (/^(yes|true|1)$/i.test(normalized)) return 'Yes';
      if (/^(no|false|0)$/i.test(normalized)) return 'No';
    }
    return normalized;
  }

  function itemChanges(item, original) {
    if (!original) return [];
    return ITEM_FIELDS.filter(function (field) {
      return comparableItemValue(item[field], field) !== comparableItemValue(original[field], field);
    }).map(function (field) {
      return {
        field: field,
        label: ITEM_FIELD_LABELS[field],
        before: comparableItemValue(original[field], field),
        after: comparableItemValue(item[field], field)
      };
    });
  }

  function diffValue(value) { return value === '' ? '(ว่าง)' : value; }

  function renderItemDiffs() {
    var changes = itemChanges(addItemData(), state.editOriginal);
    var byField = {};
    changes.forEach(function (change) { byField[change.field] = change; });
    all('.item-field', byId('add-item-form')).forEach(function (container) {
      var field = container.dataset.itemField;
      var change = byField[field];
      var diff = container.querySelector('.field-diff');
      if (!diff) {
        diff = node('small', 'field-diff');
        diff.setAttribute('aria-live', 'polite');
        container.appendChild(diff);
      }
      container.classList.toggle('is-changed', !!change);
      diff.hidden = !change;
      diff.textContent = change ? 'เดิม: ' + diffValue(change.before) + ' → ใหม่: ' + diffValue(change.after) : '';
    });
    return changes;
  }

  function requiredAddFieldsPresent(item) {
    return ['kind', 'index', 'option', 'itemmove', 'name'].every(function (field) {
      return String(item[field] === undefined || item[field] === null ? '' : item[field]).trim() !== '';
    });
  }

  function resetItemValidation() {
    state.validation = null;
    byId('validation-idle').hidden = false;
    byId('validation-running').hidden = true;
    byId('validation-result').hidden = true;
    renderMessageList(byId('validation-errors'), []);
    renderMessageList(byId('validation-warnings'), []);
    byId('save-item').disabled = true;
  }

  function updateSaveButtonState() {
    var valid = !!(state.validation && state.validation.ok);
    var changed = !state.editOriginal || itemChanges(addItemData(), state.editOriginal).length > 0;
    byId('save-item').disabled = !canEditItems() || !valid || !changed;
  }

  async function validateAddForm() {
    if (!window.QAEngine || !window.QAEngine.isUnlocked() || !canEditItems()) return null;
    var item = addItemData();
    var nonce = ++state.validationNonce;
    byId('add-success').hidden = true;
    showInline('add-error', '');
    renderItemDiffs();
    if (!requiredAddFieldsPresent(item)) {
      resetItemValidation();
      return null;
    }
    byId('validation-idle').hidden = true;
    byId('validation-running').hidden = false;
    byId('validation-result').hidden = true;
    byId('save-item').disabled = true;
    try {
      var result = await window.QAEngine.validateItem(state.game, item, state.editOriginal || undefined);
      if (nonce !== state.validationNonce) return null;
      state.validation = result;
      renderValidation(result);
      return result;
    } catch (error) {
      if (nonce !== state.validationNonce) return null;
      state.validation = null;
      byId('validation-running').hidden = true;
      showInline('add-error', errorMessage(error, 'ตรวจข้อมูลไอเทมไม่สำเร็จ'));
      updateSaveButtonState();
      return null;
    }
  }

  function renderValidation(result) {
    byId('validation-idle').hidden = true;
    byId('validation-running').hidden = true;
    byId('validation-result').hidden = false;
    var stateEl = byId('validation-state');
    stateEl.className = 'validation-state ' + (result.ok ? 'is-valid' : 'is-invalid');
    if (result.ok && state.editOriginal && !itemChanges(addItemData(), state.editOriginal).length) {
      stateEl.textContent = '✓ ข้อมูลถูกต้อง แต่ยังไม่มีค่าที่เปลี่ยน';
    } else {
      stateEl.textContent = result.ok ? '✓ ผ่านกฎบังคับ บันทึกได้' : '! พบข้อมูลที่ต้องแก้';
    }
    renderMessageList(byId('validation-errors'), result.errors || []);
    renderMessageList(byId('validation-warnings'), result.warnings || []);
    updateSaveButtonState();
  }

  function renderMessageList(root, messages) {
    root.replaceChildren();
    root.hidden = messages.length === 0;
    messages.forEach(function (message) { root.appendChild(node('li', '', message)); });
  }

  function renderItemSaveSuccess(wasEdit, result, changes) {
    var success = byId('add-success');
    success.replaceChildren();
    success.appendChild(node('strong', '', wasEdit
      ? 'แก้ไขแล้ว: ' + textValue(result.item && result.item.name, 'ไอเทม')
      : 'บันทึกไอเทมใหม่แล้ว ใช้งานในแท็บนี้ได้ทันที'));
    if (wasEdit && changes.length) {
      var list = node('ul', 'saved-diff-list');
      changes.forEach(function (change) {
        list.appendChild(node('li', '', change.label + ': ' + diffValue(change.before) + ' → ' + diffValue(change.after)));
      });
      success.appendChild(list);
    }
    success.appendChild(node('p', 'success-note', 'ฐานข้อมูลออนไลน์จะอัปเดตภายใน 1–2 นาที'));
    if (result.commit_url) {
      var link = node('a', 'success-link', 'เปิด commit บน GitHub ↗');
      link.href = result.commit_url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      success.appendChild(link);
    }
    success.hidden = false;
  }

  function finishItemSave() {
    state.editOriginal = null;
    state.validationNonce += 1;
    clearItemForm();
    clearEditSearch();
    updateItemModeUI();
    renderItemDiffs();
    resetItemValidation();
  }

  async function saveItem(event) {
    event.preventDefault();
    var button = byId('save-item');
    var user = signedInUser();
    var token = byId('github-token').value.trim();
    var original = state.editOriginal;
    var wasEdit = !!original;
    var draft = addItemData();
    if (!user) safeStorageSet(STORAGE.token, token);
    showInline('add-error', '');
    byId('add-success').hidden = true;
    if (!canEditItems()) {
      showInline('add-error', 'บัญชี QA ไม่มีสิทธิ์เพิ่มหรือแก้ไขไอเทม');
      showView('check');
      return;
    }
    if (wasEdit && !itemChanges(draft, original).length) {
      updateSaveButtonState();
      return;
    }
    withBusy(button, true, wasEdit ? 'กำลังบันทึกการแก้ไข…' : 'กำลังตรวจและบันทึก…');
    try {
      var validation = await window.QAEngine.validateItem(state.game, draft, original || undefined);
      state.validation = validation;
      renderValidation(validation);
      if (!validation.ok) throw new Error('ข้อมูลยังไม่ผ่านกฎบังคับ กรุณาแก้ช่องที่แจ้งก่อนบันทึก');
      if (!user && !token) throw new Error('กรุณาใส่ GitHub token ของ admin');
      var result = wasEdit
        ? await window.QAEngine.updateItem(state.game, original, validation.item, user ? undefined : token)
        : await window.QAEngine.addItem(state.game, validation.item, user ? undefined : token);
      var changes = wasEdit ? itemChanges(result.item || validation.item, original) : [];
      finishItemSave();
      renderItems();
      renderItemSaveSuccess(wasEdit, result, changes);
      toast(wasEdit ? 'แก้ไขไอเทมเรียบร้อย' : 'บันทึกไอเทมใหม่เรียบร้อย');
      announce(wasEdit ? 'แก้ไขไอเทมสำเร็จ และกลับสู่โหมดเพิ่มใหม่แล้ว' : 'บันทึกไอเทมใหม่สำเร็จ');
    } catch (error) {
      if (error.validation) {
        state.validation = error.validation;
        renderValidation(error.validation);
      }
      showInline('add-error', errorMessage(error, wasEdit ? 'บันทึกการแก้ไขไม่สำเร็จ' : 'บันทึกไอเทมใหม่ไม่สำเร็จ'));
    } finally {
      withBusy(button, false);
      updateSaveButtonState();
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
