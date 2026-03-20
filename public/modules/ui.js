import { confirmResolve, setConfirmResolve } from './state.js';

export function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  toast.offsetHeight;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
    toast.addEventListener('transitionend', () => toast.remove());
  }, 4000);
}

export function showConfirm(msg, okLabel = 'Eliminar') {
  return new Promise(resolve => {
    setConfirmResolve(resolve);
    document.getElementById('confirm-message').textContent = msg;
    document.getElementById('confirm-ok-btn').textContent = okLabel;
    document.getElementById('confirm-overlay').classList.add('show');
  });
}

export function initConfirmModal() {
  document.getElementById('confirm-ok-btn').addEventListener('click', () => {
    document.getElementById('confirm-overlay').classList.remove('show');
    const r = confirmResolve;
    if (r) { setConfirmResolve(null); r(true); }
  });
  document.getElementById('confirm-cancel-btn').addEventListener('click', () => {
    document.getElementById('confirm-overlay').classList.remove('show');
    const r = confirmResolve;
    if (r) { setConfirmResolve(null); r(false); }
  });
}

export async function withLoading(btn, fn) {
  if (!btn) return fn();
  btn.disabled = true;
  btn.classList.add('loading');
  try {
    return await fn();
  } finally {
    btn.disabled = false;
    btn.classList.remove('loading');
  }
}

export function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) + ' '
    + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

export function removeLastSystem(containerId) {
  const el = document.getElementById(containerId);
  const last = el.lastElementChild;
  if (last?.classList.contains('system')) last.remove();
}

export function addMessage(role, content, containerId = 'messages') {
  const el = document.getElementById(containerId);
  const empty = el.querySelector('.empty-state');
  if (empty) empty.remove();
  const div = document.createElement('div');
  div.className = `message ${role}`;
  div.textContent = content;
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
}
