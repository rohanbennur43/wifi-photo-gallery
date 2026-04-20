// Authentication module
import { $, sleep } from './utils.js';
import { DEMO } from './config.js';
import { startGallery } from './gallery.js';

let eyeOpen = false;

export function initAuth() {
  $('pw').addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin();
  });

  $('unlock-btn').addEventListener('click', doLogin);

  $('pw-eye').addEventListener('click', () => {
    eyeOpen = !eyeOpen;
    $('pw').type = eyeOpen ? 'text' : 'password';
    $('eye-slash').style.display = eyeOpen ? 'block' : 'none';
    $('pw-eye').style.color = eyeOpen ? 'rgba(255,255,255,.7)' : '';
  });

  // Auto-login if token exists
  if (!DEMO && localStorage.getItem('auth_token')) {
    $('login').classList.add('out');
    setTimeout(startGallery, 100);
  }
}

async function doLogin() {
  const pw = $('pw').value;
  if (!pw) {
    setErr('Enter your password');
    return;
  }

  $('unlock-btn').classList.add('loading');
  $('unlock-btn').textContent = 'Unlocking…';
  setErr('');

  try {
    let ok = false;
    let token = null;

    if (DEMO) {
      await sleep(550);
      ok = true;
    } else {
      const r = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'password=' + encodeURIComponent(pw),
        credentials: 'same-origin'
      });
      const d = await r.json();
      ok = d.success;
      token = d.token;
      if (!ok) setErr(d.error || 'Incorrect password');
    }

    if (ok) {
      if (token) localStorage.setItem('auth_token', token);
      $('login').classList.add('out');
      setTimeout(startGallery, 300);
    }
  } catch (e) {
    setErr('Cannot reach server');
  }

  $('unlock-btn').classList.remove('loading');
  $('unlock-btn').textContent = 'Unlock';
}

function setErr(msg) {
  const el = $('login-err');
  el.textContent = '';
  if (msg) requestAnimationFrame(() => { el.textContent = msg; });
}
