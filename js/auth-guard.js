// NOKKA — shared session guard. Include in <head> of every protected page.
(function () {
  const TOKEN_KEY = 'nokka_user_token', USER_KEY = 'nokka_user';
  const clear = () => ['nokka_user_token', 'nokka_user', 'nokka_user_info'].forEach(k => localStorage.removeItem(k));
  const toLogin = () => {
    const back = location.pathname.split('/').pop() + location.search;
    location.replace('login.html?redirect=' + encodeURIComponent(back));
  };
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) { toLogin(); return; }

  window.nokkaToken = () => localStorage.getItem(TOKEN_KEY);
  window.nokkaUser = () => { try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch (e) { return null; } };
  window.nokkaAuthHeaders = (extra) => Object.assign({ Authorization: 'Bearer ' + localStorage.getItem(TOKEN_KEY) }, extra || {});
  window.nokkaLogout = function () { clear(); location.href = 'login.html'; };

  // Any API call that comes back 401 (expired / blocked / bad token) signs the user out.
  const _fetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const mine = url.startsWith('/api/') && !url.startsWith('/api/admin') && !url.startsWith('/api/auth/login');
    if (mine) {
      init = Object.assign({}, init);
      init.headers = Object.assign({ Authorization: 'Bearer ' + localStorage.getItem(TOKEN_KEY) }, init.headers || {});
    }
    return _fetch.call(this, input, init).then(r => {
      if (r.status === 401 && mine && url.startsWith('/api/auth/me')) { clear(); toLogin(); }
      return r;
    });
  };

  // Validate the token with the server (catches expired, tampered or blocked accounts).
  fetch('/api/auth/me').then(r => r.ok ? r.json() : Promise.reject()).then(d => {
    localStorage.setItem(USER_KEY, JSON.stringify(Object.assign({}, window.nokkaUser(), d.user)));
    paint();
  }).catch(() => { clear(); toLogin(); });

  // Put the user's name + Sign Out in the nav.
  function paint() {
    const u = window.nokkaUser(); if (!u) return;
    const link = document.getElementById('authLink');
    const nav = document.querySelector('nav.links');
    if (link) link.remove();
    if (nav && !document.getElementById('nokkaSignOut')) {
      const hi = document.createElement('span');
      hi.textContent = 'Hi, ' + String(u.name || 'there').split(' ')[0];
      hi.style.cssText = 'font-weight:600;margin-left:8px;';
      const out = document.createElement('a');
      out.id = 'nokkaSignOut'; out.href = '#'; out.textContent = 'Sign Out';
      out.style.cssText = 'color:var(--rust);cursor:pointer;margin-left:8px;';
      out.onclick = (e) => { e.preventDefault(); window.nokkaLogout(); };
      nav.appendChild(hi); nav.appendChild(out);
    }
  }
  document.addEventListener('DOMContentLoaded', paint);
})();
