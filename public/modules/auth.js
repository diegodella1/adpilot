import { API, USER, TOKEN, setupMode, setToken, setUser, setSetupMode } from './state.js';
import { headers } from './api.js';
import { showToast } from './ui.js';
import { loadConversations } from './chat.js';

export function isAdmin() {
  return USER && USER.role === 'admin';
}

export function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  const shell = document.getElementById('app-shell');
  if (shell) shell.style.display = 'flex';
  document.getElementById('main-app').style.display = 'flex';

  const display = document.getElementById('user-display');
  if (USER) {
    display.textContent = USER.name || USER.email;
  }

  loadConversations();
}

export function showLogin() {
  document.getElementById('login-screen').style.display = 'block';
  const shell = document.getElementById('app-shell');
  if (shell) shell.style.display = 'none';
  document.getElementById('main-app').style.display = 'none';
}

export function toggleSetupMode() {
  setSetupMode(!setupMode);
  _applySetupMode();
}

function _applySetupMode() {
  document.getElementById('login-btn').style.display = setupMode ? 'none' : 'block';
  document.getElementById('setup-btn').style.display = setupMode ? 'block' : 'none';
  document.getElementById('setup-name').style.display = setupMode ? 'block' : 'none';
  const h3 = document.querySelector('.rv-login-modal h3');
  if (h3) h3.textContent = setupMode ? 'Crear primer admin' : 'Iniciar sesión';
  document.getElementById('setup-link').textContent = setupMode ? 'Volver al login' : '¿Primer uso? Crear admin';
}

export function toggleLoginPanel() {
  const overlay = document.getElementById('login-card');
  if (overlay.style.display === 'flex') {
    overlay.style.display = 'none';
    document.body.style.overflow = '';
  } else {
    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    setTimeout(() => document.getElementById('login-email').focus(), 100);
  }
}

export function showLoginFromLead() {
  toggleLoginPanel();
}

export async function submitLead() {
  const name = document.getElementById('lead-name').value.trim();
  const email = document.getElementById('lead-email').value.trim();
  const role = document.getElementById('lead-role').value;
  const use_case = document.getElementById('lead-usecase').value.trim();
  const errorEl = document.getElementById('lead-error');
  const btn = document.getElementById('lead-submit-btn');

  if (!email) { errorEl.textContent = 'El email es obligatorio'; return; }
  if (!email.includes('@')) { errorEl.textContent = 'Email inválido'; return; }

  btn.disabled = true;
  btn.textContent = 'Enviando...';
  errorEl.textContent = '';

  try {
    await fetch(`${API}/api/auth/lead`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, use_case, role }),
    });
    document.getElementById('lead-success').style.display = 'block';
    btn.style.display = 'none';
    document.getElementById('lead-name').disabled = true;
    document.getElementById('lead-email').disabled = true;
    document.getElementById('lead-role').disabled = true;
    document.getElementById('lead-usecase').disabled = true;
  } catch (e) {
    errorEl.textContent = 'Error de conexión. Intenta de nuevo.';
    btn.disabled = false;
    btn.textContent = 'Quiero probar AdPilot';
  }
}

export async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value.trim();
  if (!email || !password) {
    document.getElementById('login-error').textContent = 'Email y password requeridos';
    return;
  }

  document.getElementById('login-btn').disabled = true;
  try {
    const res = await fetch(`${API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (data.error) {
      document.getElementById('login-error').textContent = data.error;
      return;
    }
    setToken(data.token);
    setUser(data.user);
    localStorage.setItem('adpilot_token', data.token);
    localStorage.setItem('adpilot_user', JSON.stringify(data.user));
    document.getElementById('login-error').textContent = '';
    showApp();
  } catch (e) {
    document.getElementById('login-error').textContent = 'Error de conexion';
  } finally {
    document.getElementById('login-btn').disabled = false;
  }
}

export async function doSetup() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value.trim();
  const name = document.getElementById('setup-name').value.trim();
  if (!email || !password) {
    document.getElementById('login-error').textContent = 'Email y password requeridos';
    return;
  }

  document.getElementById('setup-btn').disabled = true;
  try {
    const res = await fetch(`${API}/api/auth/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    });
    const data = await res.json();
    if (data.error) {
      document.getElementById('login-error').textContent = data.error;
      return;
    }
    setToken(data.token);
    setUser(data.user);
    localStorage.setItem('adpilot_token', data.token);
    localStorage.setItem('adpilot_user', JSON.stringify(data.user));
    document.getElementById('login-error').textContent = '';
    showToast('Admin creado exitosamente', 'success');
    showApp();
  } catch (e) {
    document.getElementById('login-error').textContent = 'Error de conexion';
  } finally {
    document.getElementById('setup-btn').disabled = false;
  }
}

export function doLogout() {
  setToken('');
  setUser(null);
  localStorage.removeItem('adpilot_token');
  localStorage.removeItem('adpilot_user');
  showLogin();
}

export async function validateToken() {
  if (!TOKEN) { showLogin(); return; }
  try {
    const res = await fetch(`${API}/api/auth/me`, { headers: headers() });
    if (!res.ok) { doLogout(); return; }
    const data = await res.json();
    setUser(data.user);
    localStorage.setItem('adpilot_user', JSON.stringify(data.user));
    showApp();
  } catch (e) {
    doLogout();
  }
}

export function initAuthListeners() {
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      const overlay = document.getElementById('login-card');
      if (overlay && overlay.style.display === 'flex') toggleLoginPanel();
    }
  });
}
