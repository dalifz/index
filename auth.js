/* ============================================================================
 * auth.js — access gate for the dashboard pages
 *
 * Loaded in <head> BEFORE any other script so an unauthenticated visitor is
 * redirected before the page renders.
 *
 * Scope note: the dashboard is a static site, so this check runs in the
 * browser. It keeps casual visitors out of the UI; it is not server-side
 * authentication. The data endpoint has its own access key.
 *
 * ---- Changing the password -------------------------------------------------
 * Run this in the browser console (F12), replace NEWPASSWORD, then paste the
 * printed hash into AUTH_USERS below:
 *
 *   crypto.subtle.digest('SHA-256', new TextEncoder().encode('cabal-dash-2026' + 'NEWPASSWORD'))
 *     .then(b => console.log([...new Uint8Array(b)].map(x => x.toString(16).padStart(2,'0')).join('')))
 * ==========================================================================*/

var AUTH_SALT = 'cabal-dash-2026';

// username -> SHA-256(salt + password).  Default password: cabal2026  (change it)
var AUTH_USERS = {
  'admin': '9579a8b7aaed78afbb065f9b46a161944516594d5de54648a154e11b3bcff628'
};

var AUTH_KEY   = 'cabal_session';
var AUTH_HOURS = 8;                 // session length
var LOGIN_PAGE = 'login.html';

// ---- session helpers ----
function authSession() {
  try {
    var s = JSON.parse(localStorage.getItem(AUTH_KEY) || 'null');
    if (!s || !s.u || !s.exp || Date.now() > s.exp) return null;
    return s;
  } catch (e) { return null; }
}

function authStart(user) {
  localStorage.setItem(AUTH_KEY, JSON.stringify({ u: user, exp: Date.now() + AUTH_HOURS * 3600 * 1000 }));
}

function authLogout() {
  localStorage.removeItem(AUTH_KEY);
  location.replace(LOGIN_PAGE);
}

// ---- password check (SHA-256 via Web Crypto) ----
function authVerify(user, password) {
  var expected = AUTH_USERS[String(user || '').trim().toLowerCase()];
  if (!expected) return Promise.resolve(false);
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(AUTH_SALT + password))
    .then(function (buf) {
      var hex = Array.prototype.map.call(new Uint8Array(buf), function (b) {
        return b.toString(16).padStart(2, '0');
      }).join('');
      return hex === expected;
    });
}

// ---- guard: redirect to login when there is no valid session ----
function authGuard() {
  if (authSession()) return;
  var next = location.pathname.split('/').pop() + location.search;
  location.replace(LOGIN_PAGE + '?next=' + encodeURIComponent(next));
}

// ---- sidebar: show who is signed in + a sign-out button ----
function authMountSidebar() {
  var s = authSession(); if (!s) return;
  var foot = document.querySelector('.side-foot'); if (!foot) return;

  var name = foot.querySelector('.pname');
  if (name) name.textContent = s.u.charAt(0).toUpperCase() + s.u.slice(1);

  if (foot.querySelector('#logoutBtn')) return;
  var btn = document.createElement('button');
  btn.id = 'logoutBtn';
  btn.className = 'side-btn';
  btn.type = 'button';
  btn.textContent = '⏻ ออกจากระบบ';
  btn.style.cssText = 'margin-top:8px;width:100%;color:#ff8a8a;border-color:rgba(255,138,138,.35)';
  btn.addEventListener('click', authLogout);
  foot.appendChild(btn);
}

// run the guard immediately (script is in <head>), mount the sidebar on load
if (!/login\.html$/i.test(location.pathname)) {
  authGuard();
  document.addEventListener('DOMContentLoaded', authMountSidebar);
}
