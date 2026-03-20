import { API, currentConvId, sending, setCurrentConvId, setSending } from './state.js';
import { headers } from './api.js';
import { showToast, showConfirm, escapeHtml, formatDate, addMessage, removeLastSystem } from './ui.js';

export async function loadConversations() {
  try {
    const res = await fetch(`${API}/api/conversations`, { headers: headers() });
    if (res.status === 401) { const { doLogout } = await import('./auth.js'); doLogout(); return; }
    const list = await res.json();
    const el = document.getElementById('conv-list');
    el.innerHTML = list.map(c => `
      <div class="conv-item ${c.id === currentConvId ? 'active' : ''}"
           onclick="openConversation('${c.id}')">
        <span>${formatDate(c.updated_at || c.created_at)}</span>
        <div style="display:flex;align-items:center;gap:6px">
          <span class="state">${c.state}</span>
          <button class="conv-delete-btn" onclick="event.stopPropagation();deleteConversation('${c.id}')" title="Eliminar">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>
    `).join('');
  } catch (e) { console.error(e); }
}

export async function deleteConversation(id) {
  const ok = await showConfirm('Eliminar esta conversacion?', 'Eliminar');
  if (!ok) return;
  try {
    await fetch(`${API}/api/conversations/${id}`, { method: 'DELETE', headers: headers() });
    if (currentConvId === id) {
      setCurrentConvId(null);
      document.getElementById('messages').innerHTML = '<div class="empty-state"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.3;margin-bottom:12px"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>Crea una nueva conversacion para empezar</div>';
      document.getElementById('state-bar').style.display = 'none';
    }
    loadConversations();
    showToast('Conversacion eliminada', 'success');
  } catch (e) { showToast('Error eliminando conversacion', 'error'); }
}

export async function newConversation() {
  try {
    const res = await fetch(`${API}/api/conversations`, { method: 'POST', headers: headers() });
    const conv = await res.json();
    setCurrentConvId(conv.id);
    const { showView } = await import('./router.js');
    showView('chat');
    await loadConversations();
    renderMessages([]);
    updateState('intake');
  } catch (e) { console.error(e); }
}

export async function openConversation(id) {
  setCurrentConvId(id);
  try {
    const res = await fetch(`${API}/api/conversations/${id}`, { headers: headers() });
    const conv = await res.json();
    renderMessages(conv.messages || []);
    updateState(conv.state);
    loadConversations();
  } catch (e) { console.error(e); }
}

function renderMessages(messages) {
  const el = document.getElementById('messages');
  if (!messages.length) {
    el.innerHTML = '<div class="empty-state">Describi la campana que queres crear</div>';
    return;
  }
  el.innerHTML = messages.map(m => `
    <div class="message ${m.role}">${escapeHtml(m.content)}</div>
  `).join('');
  el.scrollTop = el.scrollHeight;
}

export async function send() {
  const input = document.getElementById('input');
  const msg = input.value.trim();
  if (!msg || sending) return;

  if (!currentConvId) {
    try {
      const res = await fetch(`${API}/api/conversations`, { method: 'POST', headers: headers() });
      const conv = await res.json();
      setCurrentConvId(conv.id);
      renderMessages([]);
      updateState('intake');
      loadConversations();
    } catch (e) {
      addMessage('system', 'Error creando conversacion: ' + e.message);
      return;
    }
  }

  input.value = '';
  input.style.height = 'auto';
  await sendMessage(msg);
}

export async function sendMessage(msg) {
  if (sending) return;
  setSending(true);
  document.getElementById('send-btn').disabled = true;

  addMessage('user', msg);
  addMessage('system', 'Pensando...');

  try {
    const res = await fetch(`${API}/api/conversations/${currentConvId}/messages`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ message: msg }),
    });
    const data = await res.json();
    removeLastSystem('messages');

    if (data.error) {
      addMessage('system', `Error: ${data.error}`);
    } else {
      addMessage('assistant', data.message);
      updateState(data.state);
    }
    loadConversations();
  } catch (e) {
    removeLastSystem('messages');
    addMessage('system', `Error de conexion: ${e.message}`);
  } finally {
    setSending(false);
    document.getElementById('send-btn').disabled = false;
    document.getElementById('input').focus();
  }
}

export async function approveAndExecute() {
  await sendMessage('Dale, mandalo');
  addMessage('system', 'Ejecutando en Google Ads...');
  try {
    const res = await fetch(`${API}/api/conversations/${currentConvId}/execute`, {
      method: 'POST', headers: headers(),
    });
    const data = await res.json();
    removeLastSystem('messages');
    if (data.success) {
      addMessage('system', `Campana creada! ID: ${data.campaignId}`);
      if (data.warnings?.length) addMessage('system', `Warnings: ${data.warnings.map(w => w.error).join(', ')}`);
      updateState('done');
    } else {
      addMessage('system', `Error: ${data.errors?.map(e => e.error || e).join(', ')}`);
      updateState('reviewing');
    }
    loadConversations();
  } catch (e) {
    addMessage('system', `Error de ejecucion: ${e.message}`);
  }
}

function updateState(state) {
  const bar = document.getElementById('state-bar');
  const dot = document.getElementById('state-dot');
  const text = document.getElementById('state-text');
  const actions = document.getElementById('action-buttons');
  if (!state) { bar.style.display = 'none'; return; }
  bar.style.display = 'flex';
  dot.className = `state-dot ${state}`;
  const labels = {
    intake: 'Esperando descripcion', clarifying: 'Recopilando informacion',
    reviewing: 'Revisando estructura', confirmed: 'Confirmado',
    executing: 'Ejecutando...', done: 'Campana creada', error: 'Error',
  };
  text.textContent = labels[state] || state;
  actions.style.display = state === 'reviewing' ? 'flex' : 'none';
}
