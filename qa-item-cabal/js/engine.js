/* QA Item Cabal — browser engine bridge.
 *
 * All checking is done by the Python package qaitem/, run in the browser with
 * Pyodide. This file only moves data in and out: decrypts the item bundles,
 * reads Excel / Google Sheets into plain rows, calls Python, and commits new
 * items to the private data repo through the GitHub API.
 *
 * UI code talks to window.QAEngine only. Contract:
 *
 *   await QAEngine.init(onProgress)            load Python (≈ 3-6 s first time, cached after)
 *   await QAEngine.unlock(password)            decrypt data; throws Error('wrong-password')
 *   QAEngine.isUnlocked() / QAEngine.lock()
 *   QAEngine.stats(game)                       {game, items, indexes, durations, built_at}
 *   QAEngine.hasSheetApi()                     Google Sheet reader configured?
 *   await QAEngine.readExcel(File)             -> workbook
 *   await QAEngine.listGoogleSheet(url)        -> {title, id, sheets:[{name,gid,hidden,rows,cols}]}
 *   await QAEngine.readGoogleSheet(url, names) -> workbook
 *   await QAEngine.check(game, workbook)       -> result (see qaitem/api.py check_workbook)
 *   await QAEngine.reportCSV(result, info)     -> CSV text (UTF-8 BOM)
 *   QAEngine.reportText(result)                -> short text for chat (errors + warnings)
 *   QAEngine.searchItems(game, query, limit)   -> items
 *   await QAEngine.validateItem(game, item)    -> {ok, item, errors[], warnings[]}
 *   await QAEngine.addItem(game, item, token)  -> {commit_url}; item also usable at once
 *   await QAEngine.validateItem(game, item, original)  validate an EDIT of library row `original`
 *   await QAEngine.updateItem(game, original, item, token) -> {commit_url, item}; edit a library row
 *   QAEngine.rules()                           -> {CODE: Thai title}
 *   await QAEngine.teamHistory({limit, actions})  -> [{time, email, name, action, game, detail, before, after}] newest first
 *        actions: 'login' | 'login-denied' | 'check' | 'add-item' | 'edit-item' (signed-in only; reads the Log sheet)
 *   await QAEngine.addNewItems(game, items, token, onEach) -> {added:[item], failed:[{item, error}]}
 *        items = finding.new_item of UNKNOWN_ITEM findings ("ตรวจเจอไอเทมใหม่"); saved one by one
 *
 * Google sign-in (Apps Script backend, see apps-script/Code.gs):
 *   QAEngine.authConfig()                      -> {client_id, api_url, allow_team_password} (public, no secrets)
 *   await QAEngine.loginWithGoogle(idToken)    -> user {email, name, role:'qa'|'admin', picture}; also unlocks data
 *        throws Error('not-allowed') (err.email set) when the email is not in the Users sheet
 *   QAEngine.user()                            -> signed-in user or null (null when unlocked by team password)
 *   QAEngine.canEditItems()                    -> true for admin (via backend) or when a GitHub token is used
 *   await QAEngine.logout()                    ends every session of this user (all devices)
 *   Google sign-in is remembered for 15 days in this browser (localStorage); the data key is
 *   fetched again from the backend (whoami) when the page opens.
 *   await QAEngine.fixCell({url, sheet, cell, current, expected, game, item, code}) -> {value, already}
 *        "แก้ในชีท": writes one cell of a Google Sheet (signed-in users; backend checks the old value)
 *   Signed-in users: check / add / edit are written to the audit log automatically;
 *   addItem / updateItem go through the backend (token argument ignored).
 *
 * workbook = {source, url?, sheets:[{name, values:[[...]], display:[[...]], hidden}]}
 */
(function () {
  'use strict';

  var PYODIDE_VERSION = '0.26.4';
  var PYODIDE_URL = 'https://cdn.jsdelivr.net/pyodide/v' + PYODIDE_VERSION + '/full/';
  // GitHub Pages (Jekyll) hides files starting with '_', so __init__.py is served as pkg_init.py
  var PY_FILES = ['pkg_init.py', 'normalize.py', 'sheet.py', 'db.py', 'checker.py', 'api.py'];
  var GAMES = ['pc', 'mobile'];
  var SESSION_KEY = 'qaitem_pw';
  var AUTH_KEY = 'qaitem_auth';

  var src = (document.currentScript && document.currentScript.src) || '';
  var base = src ? src.replace(/js\/engine\.js.*$/, '') : './';
  var ver = (src.match(/[?&]v=([^&]+)/) || [])[1] || String(Date.now());

  var py = null, initPromise = null;
  var state = { bundles: {}, config: null, manifest: null, pending: { pc: [], mobile: [] },
                edits: { pc: [], mobile: [] }, auth: {}, session: null, user: null, canSave: false };

  function progress(cb, step, pct) { if (cb) try { cb(step, pct); } catch (e) { /* ignore */ } }

  function loadScript(src) {
    return new Promise(function (ok, fail) {
      var s = document.createElement('script');
      s.src = src; s.onload = ok; s.onerror = function () { fail(new Error('load ' + src)); };
      document.head.appendChild(s);
    });
  }

  // ---------------------------------------------------------------- init
  function init(onProgress) {
    if (initPromise) return initPromise;
    initPromise = (async function () {
      progress(onProgress, 'กำลังโหลด Python engine', 10);
      if (!window.loadPyodide) await loadScript(PYODIDE_URL + 'pyodide.js');
      py = await window.loadPyodide({ indexURL: PYODIDE_URL });
      progress(onProgress, 'กำลังโหลดกฎตรวจ', 70);
      py.FS.mkdirTree('/app/qaitem');
      var files = await Promise.all(PY_FILES.map(function (f) {
        return fetch(base + 'py/qaitem/' + f + '?v=' + ver, { cache: 'no-cache' }).then(function (r) {
          if (!r.ok) throw new Error('โหลด ' + f + ' ไม่ได้');
          return r.text();
        });
      }));
      files.forEach(function (src, i) {
        var name = PY_FILES[i] === 'pkg_init.py' ? '__init__.py' : PY_FILES[i];
        py.FS.writeFile('/app/qaitem/' + name, src);
      });
      py.runPython('import sys\nsys.path.insert(0, "/app")\nimport qaitem.api as qa\nimport json');
      state.manifest = await fetch(base + 'data/manifest.json', { cache: 'no-cache' })
        .then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
      state.auth = await fetch(base + 'data/auth.json?v=' + ver, { cache: 'no-cache' })
        .then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; });
      try {
        var a = JSON.parse(localStorage.getItem(AUTH_KEY) || 'null');
        if (a && a.session && a.exp > Date.now()) { state.session = a.session; state.user = a.user; state.canSave = !!a.can_save; }
        else if (a) localStorage.removeItem(AUTH_KEY);
      } catch (e) { /* ignore */ }
      progress(onProgress, 'พร้อมใช้งาน', 100);
      if (!isUnlocked()) {
        var saved = null;
        try { saved = sessionStorage.getItem(SESSION_KEY); } catch (e) { /* ignore */ }
        if (saved) { try { await unlock(saved); } catch (e) { /* ask again */ } }
      }
      if (!isUnlocked() && state.session) {
        // remembered Google sign-in: ask the backend for the data key again (also re-checks the Users sheet)
        progress(onProgress, 'กำลังเข้าสู่ระบบด้วยบัญชี Google เดิม', 100);
        try {
          var who = await backend('whoami');
          if (who.user) { state.user = who.user; saveAuth(state.session, who.user, state.canSave, null); }
          if (who.data_password) await unlock(who.data_password);
        } catch (e) { /* session over -> sign in again */ }
      }
      return true;
    })();
    initPromise.catch(function () { initPromise = null; });
    return initPromise;
  }

  // ------------------------------------------------------------- crypto
  function b64(s) { return Uint8Array.from(atob(s), function (c) { return c.charCodeAt(0); }); }

  async function decryptEnvelope(env, password) {
    var km = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    var key = await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: b64(env.salt), iterations: env.iter },
      km, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    var plain;
    try {
      plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(env.iv) }, key, b64(env.ct));
    } catch (e) { throw new Error('wrong-password'); }
    if (env.gzip) {
      var stream = new Blob([plain]).stream().pipeThrough(new DecompressionStream('gzip'));
      plain = await new Response(stream).arrayBuffer();
    }
    return JSON.parse(new TextDecoder().decode(plain));
  }

  async function unlock(password) {
    var fetchJSON = function (name) {
      return fetch(base + 'data/' + name, { cache: 'no-cache' }).then(function (r) {
        if (!r.ok) throw new Error('ไม่พบไฟล์ข้อมูล ' + name);
        return r.json();
      });
    };
    var envs = await Promise.all(['config'].concat(GAMES).map(function (g) { return fetchJSON(g + '.enc.json'); }));
    var config = await decryptEnvelope(envs[0], password);
    var bundles = {};
    for (var i = 0; i < GAMES.length; i++) bundles[GAMES[i]] = await decryptEnvelope(envs[i + 1], password);
    state.config = config; state.bundles = bundles;
    try { sessionStorage.setItem(SESSION_KEY, password); } catch (e) { /* ignore */ }
    return true;
  }

  function isUnlocked() { return !!state.bundles.pc; }
  function lock() {
    state.bundles = {}; state.config = null;
    state.session = null; state.user = null; state.canSave = false;
    try { sessionStorage.removeItem(SESSION_KEY); localStorage.removeItem(AUTH_KEY); } catch (e) { /* ignore */ }
  }

  // ------------------------------------------------------- Google sign-in
  function authConfig() {
    var a = state.auth || {};
    return { client_id: a.client_id || '', api_url: a.api_url || '',
             allow_team_password: a.allow_team_password !== false };
  }

  // POST with a text/plain body = "simple" CORS request, no preflight (Apps Script cannot answer OPTIONS)
  async function backend(action, payload) {
    var url = authConfig().api_url;
    if (!url) throw new Error('ยังไม่ได้ตั้งค่า Apps Script');
    var body = Object.assign({ action: action, session: state.session }, payload || {});
    var r = await fetch(url, { method: 'POST', body: JSON.stringify(body), redirect: 'follow' });
    if (!r.ok) throw new Error('ติดต่อ Apps Script ไม่ได้ (' + r.status + ')');
    var j = await r.json();
    if (!j.ok) {
      if (j.error === 'session-expired') {
        state.session = null; state.user = null;
        try { localStorage.removeItem(AUTH_KEY); } catch (e) { /* ignore */ }
        throw new Error('session-expired');
      }
      var err = new Error(j.error || 'Apps Script ตอบกลับผิดพลาด');
      if (j.email) err.email = j.email;
      throw err;
    }
    return j;
  }

  async function loginWithGoogle(idToken) {
    var j = await backend('login', { id_token: idToken });
    state.session = j.session; state.user = j.user; state.canSave = !!j.can_save;
    saveAuth(j.session, j.user, j.can_save, Date.now() + (j.expires_in || 21600) * 1000);
    if (!j.data_password) throw new Error('Apps Script ยังไม่ได้ตั้ง DATA_PASSWORD');
    await unlock(j.data_password);
    return j.user;
  }

  function saveAuth(session, user, canSave, exp) {
    try {
      if (exp === null) {
        var old = JSON.parse(localStorage.getItem(AUTH_KEY) || 'null');
        exp = old && old.exp ? old.exp : Date.now() + 3600 * 1000;
      }
      localStorage.setItem(AUTH_KEY, JSON.stringify({ session: session, user: user, can_save: !!canSave, exp: exp }));
    } catch (e) { /* private window: sign in each time */ }
  }

  // "แก้ในชีท": write the expected value into the one cell of a finding (Google Sheet only)
  async function fixCell(fix) {
    if (!state.session) throw new Error('ต้อง Sign in with Google ก่อนถึงจะแก้ในชีทได้');
    var j = await backend('fix_cell', { id: fix.url, sheet: fix.sheet, cell: fix.cell, current: fix.current,
                                        expected: fix.expected, game: fix.game || '', item: fix.item || '',
                                        code: fix.code || '' });
    return { value: j.value, already: !!j.already };
  }

  async function logout() {
    if (state.session) { try { await backend('logout'); } catch (e) { /* ignore */ } }
    lock();
  }

  function currentUser() { return state.user; }
  function canEditItems() { return state.user ? state.user.role === 'admin' : true; }

  function audit(event, game, detail) {
    if (!state.session) return;
    backend('log', { event: event, game: game, detail: detail }).catch(function () { /* never block the user */ });
  }

  function bundle(game) {
    if (GAMES.indexOf(game) < 0) throw new Error('game ต้องเป็น pc หรือ mobile');
    var b = state.bundles[game];
    if (!b) throw new Error('ยังไม่ได้ปลดล็อกข้อมูล');
    if (!state.pending[game].length && !state.edits[game].length) return b;
    var items = b.items.map(function (it) {
      var hit = null;
      state.edits[game].forEach(function (e) { if (identity(it) === e.from) hit = e.item; });
      return hit || it;
    });
    return Object.assign({}, b, { items: items.concat(state.pending[game]) });
  }

  function stats(game) {
    var b = bundle(game);
    var idx = {};
    b.items.forEach(function (i) { idx[i.index] = 1; });
    return { game: game, items: b.items.length, indexes: Object.keys(idx).length,
             durations: Object.keys(b.durations || {}).length, built_at: (b.meta || {}).built_at || null,
             pending: state.pending[game].length };
  }

  // same identity as qaitem.api.item_identity (numbers + name without spaces/case)
  function identity(it) {
    var nk = String(it.name || '').normalize('NFKC').toLowerCase().replace(/\s*[x×]\s*[\d,]+\s*$/, '')
      .replace(/[^0-9a-z\u0E00-\u0E7F]/g, '');
    return [it.kind, it.index, it.option, it.duration == null ? '' : it.duration].map(function (v) {
      return v == null || v === '' ? '' : String(Number(String(v).replace(/,/g, '')));
    }).join('|') + '|' + nk;
  }

  // -------------------------------------------------------------- python
  async function callPy(fn, a, b, c) {
    await init();
    py.globals.set('_a', a); py.globals.set('_b', b); py.globals.set('_c', c === undefined ? null : c);
    var out = py.runPython('qa.' + fn + (c === undefined ? '(_a, _b)' : '(_a, _b, _c)'));
    return out;
  }

  async function check(game, workbook) {
    var out = await callPy('check_workbook_json', JSON.stringify(bundle(game)), JSON.stringify(workbook));
    var res = JSON.parse(out);
    res.url = workbook.url || null;
    audit('check', game, { source: workbook.source, url: workbook.url || null,
                           sheets: (workbook.sheets || []).map(function (s) { return s.name; }),
                           rows: res.summary.rows, errors: res.summary.errors, warnings: res.summary.warnings,
                           new_items: res.findings.filter(function (f) { return f.code === 'UNKNOWN_ITEM'; }).length });
    return res;
  }

  async function reportCSV(result, includeInfo) {
    await init();
    py.globals.set('_a', JSON.stringify(result)); py.globals.set('_b', !!includeInfo);
    return py.runPython('qa.report_csv_json(_a, _b)');
  }

  async function validateItem(game, item, original) {
    return JSON.parse(await callPy('validate_item_json', JSON.stringify(bundle(game)), JSON.stringify(item),
                                   original ? JSON.stringify(original) : ''));
  }

  function rules() {
    if (!py) return {};
    return JSON.parse(py.runPython('json.dumps(qa.rule_catalogue(), ensure_ascii=False)'));
  }

  // --------------------------------------------------------------- Excel
  async function readExcel(file) {
    if (!window.XLSX) throw new Error('ยังไม่ได้โหลด SheetJS');
    if (file.size > 30 * 1024 * 1024) throw new Error('ไฟล์เกิน 30 MB');
    var wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellNF: true });
    var sheets = wb.SheetNames.map(function (name, i) {
      var ws = wb.Sheets[name];
      var hidden = !!(wb.Workbook && wb.Workbook.Sheets && wb.Workbook.Sheets[i] && wb.Workbook.Sheets[i].Hidden);
      if (!ws['!ref']) return { name: name, values: [], display: [], hidden: hidden };
      var range = XLSX.utils.decode_range(ws['!ref']);
      if (range.e.r > 100000 || range.e.c > 300) throw new Error('ชีท ' + name + ' ใหญ่เกินไป');
      var values = [], display = [];
      for (var r = 0; r <= range.e.r; r++) {
        var vr = [], dr = [];
        for (var c = 0; c <= range.e.c; c++) {
          var cell = ws[XLSX.utils.encode_cell({ r: r, c: c })];
          vr.push(cell ? (cell.t === 'e' ? '#ERROR' : cell.v) : null);
          dr.push(cell ? (cell.w != null ? String(cell.w) : String(cell.v)) : '');
        }
        values.push(vr); display.push(dr);
      }
      return { name: name, values: values, display: display, hidden: hidden };
    });
    return { source: file.name, sheets: sheets };
  }

  // -------------------------------------------------------- Google Sheet
  // Google Sheets are read by the Apps Script backend, which needs a signed-in Google user
  function hasSheetApi() { return !!(authConfig().api_url && state.session); }

  function listGoogleSheet(url) {
    if (!hasSheetApi()) return Promise.reject(new Error('ต้อง Sign in with Google ก่อนถึงจะอ่าน Google Sheet ได้'));
    return backend('list', { id: url });
  }

  async function readGoogleSheet(url, names) {
    if (!hasSheetApi()) throw new Error('ต้อง Sign in with Google ก่อนถึงจะอ่าน Google Sheet ได้');
    var j = await backend('read', { id: url, sheets: names || [] });
    return { source: j.title, url: url, sheets: j.sheets };
  }

  // ---------------------------------------------------------- item search
  function searchItems(game, query, limit) {
    var b = bundle(game), q = String(query || '').trim().toLowerCase(), n = limit || 50;
    if (!q) return b.items.slice(0, n);
    return b.items.filter(function (i) {
      return String(i.index) === q || String(i.kind) === q ||
        (i.name || '').toLowerCase().indexOf(q) >= 0 || (i.display_name || '').toLowerCase().indexOf(q) >= 0;
    }).slice(0, n);
  }

  // ------------------------------------------------------------- add item
  function utf8ToB64(s) {
    var bytes = new TextEncoder().encode(s), bin = '';
    for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function b64ToUtf8(s) { return new TextDecoder().decode(b64(s.replace(/\n/g, ''))); }

  async function addItem(game, item, token) {
    var res = await validateItem(game, item);
    if (!res.ok) { var e = new Error(res.errors.join('\n')); e.validation = res; throw e; }
    if (state.session) return saveViaBackend(game, res, null);
    if (!token) throw new Error('ต้องใส่ GitHub token ของ admin');
    return commitItems(game, token, function (data) {
      var it = Object.assign({}, res.item, { added_at: new Date().toISOString().slice(0, 10), source: 'web' });
      data.items.push(it);
      return { item: it, message: 'data(' + game + '): add ' + it.name + ' [' + it.index + ']' };
    }).then(function (done) {
      state.pending[game].push(done.item);
      return { commit_url: done.commit_url, item: done.item, warnings: res.warnings };
    });
  }

  // Edit a row that is already in the library (fix a wrong number / name).
  async function updateItem(game, original, item, token) {
    if (!original) throw new Error('ไม่รู้ว่าจะแก้ไอเทมตัวไหน');
    var res = await validateItem(game, item, original);
    if (!res.ok) { var e = new Error(res.errors.join('\n')); e.validation = res; throw e; }
    if (state.session) return saveViaBackend(game, res, original);
    if (!token) throw new Error('ต้องใส่ GitHub token ของ admin');
    var from = identity(original);
    return commitItems(game, token, function (data) {
      var i = data.items.findIndex(function (x) { return identity(x) === from; });
      if (i < 0) throw new Error('ไม่พบไอเทมเดิมในคลังบน GitHub (อาจมีคนแก้ไปแล้ว) โหลดหน้าใหม่แล้วลองอีกครั้ง');
      var old = data.items[i];
      var it = Object.assign({}, old, res.item, { edited_at: new Date().toISOString().slice(0, 10) });
      // keep the old spelling as an alias so documents written the old way still match
      if (old.name && old.name !== it.name) {
        it.aliases = (old.aliases || []).filter(function (a) { return a !== it.name; });
        if (it.aliases.indexOf(old.name) < 0) it.aliases.push(old.name);
      }
      data.items[i] = it;
      return { item: it, message: 'data(' + game + '): edit ' + it.name + ' [' + it.index + ']' };
    }).then(function (done) {
      state.edits[game].push({ from: from, item: done.item });
      return { commit_url: done.commit_url, item: done.item, warnings: res.warnings };
    });
  }

  // Team-wide history (who checked what, who added / edited which item) from the backend Log sheet.
  async function teamHistory(opts) {
    if (!state.session) throw new Error('ต้อง Sign in with Google ก่อนถึงจะดูประวัติของทีมได้');
    var j = await backend('history', { limit: (opts && opts.limit) || 200, actions: (opts && opts.actions) || null });
    return j.rows || [];
  }

  // "Add to data" from the check results: save each new item (validated by Python first).
  async function addNewItems(game, items, token, onEach) {
    var added = [], failed = [], seen = {};
    for (var i = 0; i < items.length; i++) {
      var it = items[i], key = identity(it);
      if (seen[key]) continue;                 // the same new item can appear on many rows
      seen[key] = true;
      try {
        var r = await addItem(game, it, token);
        added.push(r.item);
        if (onEach) onEach(it, null, r);
      } catch (e) {
        failed.push({ item: it, error: e.message, validation: e.validation || null });
        if (onEach) onEach(it, e, null);
        if (e.message === 'session-expired') break;
      }
    }
    return { added: added, failed: failed };
  }

  // Signed-in admin: the backend commits as the shared token and writes the audit log (before -> after).
  async function saveViaBackend(game, res, original) {
    if (!state.user || state.user.role !== 'admin') throw new Error('ต้องเป็น admin ถึงจะเพิ่ม/แก้ไอเทมได้');
    var j = await backend('save_item', { game: game, item: res.item, original: original || null });
    if (original) state.edits[game].push({ from: identity(original), item: j.item });
    else state.pending[game].push(j.item);
    return { commit_url: j.commit_url, item: j.item, warnings: res.warnings };
  }

  // Read data/<game>/items.json from the private repo, change it, write it back (retry on conflicts).
  async function commitItems(game, token, change) {
    var repo = (state.config && state.config.data_repo) || 'dalifz/qa-item-cabal';
    var path = 'data/' + game + '/items.json';
    var api = 'https://api.github.com/repos/' + repo + '/contents/' + path;
    var headers = { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json',
                    'X-GitHub-Api-Version': '2022-11-28' };
    for (var attempt = 0; attempt < 3; attempt++) {
      var meta = await fetch(api + '?ref=main', { headers: headers, cache: 'no-store' });
      if (meta.status === 401 || meta.status === 403) throw new Error('GitHub token ไม่มีสิทธิ์เขียน repo ข้อมูล');
      if (!meta.ok) throw new Error('อ่านไฟล์ข้อมูลบน GitHub ไม่ได้ (' + meta.status + ')');
      var m = await meta.json();
      var text = m.encoding === 'base64' && m.content ? b64ToUtf8(m.content) :
        await fetch(api + '?ref=main', { headers: Object.assign({}, headers, { Accept: 'application/vnd.github.raw+json' }) })
          .then(function (r) { return r.text(); });
      var data = JSON.parse(text);
      var ch = change(data);
      var put = await fetch(api, {
        method: 'PUT', headers: headers,
        body: JSON.stringify({ message: ch.message,
                               content: utf8ToB64(JSON.stringify(data, null, 1) + '\n'), sha: m.sha, branch: 'main' })
      });
      if (put.status === 409 || put.status === 422) continue; // someone else committed first, retry
      if (!put.ok) throw new Error('บันทึกขึ้น GitHub ไม่สำเร็จ (' + put.status + ')');
      var done = await put.json();
      return { commit_url: done.commit && done.commit.html_url, item: ch.item };
    }
    throw new Error('มีคนแก้ข้อมูลพร้อมกัน ลองใหม่อีกครั้ง');
  }

  // ------------------------------------------------------------- reports
  function reportText(result) {
    var sev = { error: 'ผิด', warn: 'น่าสงสัย' };
    var lines = ['ผลตรวจไอเทม ' + result.game.toUpperCase() + ' · ' + result.source,
      'ผิด ' + result.summary.errors + ' · น่าสงสัย ' + result.summary.warnings + ' · ทั้งหมด ' + result.summary.rows + ' แถว'];
    result.findings.filter(function (f) { return f.severity !== 'info'; }).forEach(function (f) {
      lines.push('[' + sev[f.severity] + '] ชีท ' + f.sheet + ' · ' + f.pack + ' · แถว ' + f.row + ' (' + f.cell + ') · ' +
        f.item + ' · ' + f.field + ': ' + (f.value || '(ว่าง)') + (f.expected ? ' → ควรเป็น ' + f.expected : '') + ' — ' + f.message);
    });
    return lines.join('\n');
  }

  window.QAEngine = {
    games: GAMES, init: init, unlock: unlock, lock: lock, isUnlocked: isUnlocked, stats: stats,
    hasSheetApi: hasSheetApi, readExcel: readExcel, listGoogleSheet: listGoogleSheet,
    readGoogleSheet: readGoogleSheet, check: check, reportCSV: reportCSV, reportText: reportText,
    searchItems: searchItems, validateItem: validateItem, addItem: addItem, updateItem: updateItem,
    authConfig: authConfig, loginWithGoogle: loginWithGoogle, logout: logout, user: currentUser,
    canEditItems: canEditItems, canSaveViaBackend: function () { return !!state.canSave; },
    addNewItems: addNewItems, teamHistory: teamHistory, fixCell: fixCell,
    identity: identity, rules: rules,
    manifest: function () { return state.manifest; }
  };
})();
