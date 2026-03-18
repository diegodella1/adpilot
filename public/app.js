const API = '';
let TOKEN = localStorage.getItem('adpilot_token') || '';
let currentConvId = null;
let sending = false;

// Auth
function headers() {
  const h = { 'Content-Type': 'application/json' };
  if (TOKEN) h['Authorization'] = `Bearer ${TOKEN}`;
  return h;
}

// Prompt for token if not set
if (!TOKEN) {
  TOKEN = prompt('Token de acceso:') || '';
  if (TOKEN) localStorage.setItem('adpilot_token', TOKEN);
}

// Views
function showView(view) {
  document.querySelectorAll('.header-actions button').forEach(b => b.classList.remove('active'));
  document.getElementById(`btn-${view}`).classList.add('active');
  document.getElementById('view-chat').style.display = view === 'chat' ? 'flex' : 'none';
  document.getElementById('view-logs').style.display = view === 'logs' ? 'block' : 'none';
  document.getElementById('view-knowledge').style.display = view === 'knowledge' ? 'block' : 'none';
  document.getElementById('view-admin').style.display = view === 'admin' ? 'block' : 'none';
  if (view === 'logs') loadLogs();
  if (view === 'knowledge') loadKnowledge();
  if (view === 'admin') loadSettings();
}

// --- Conversations ---

async function loadConversations() {
  try {
    const res = await fetch(`${API}/api/conversations`, { headers: headers() });
    const list = await res.json();
    const el = document.getElementById('conv-list');
    el.innerHTML = list.map(c => `
      <div class="conv-item ${c.id === currentConvId ? 'active' : ''}"
           onclick="openConversation('${c.id}')">
        <span>${formatDate(c.updated_at || c.created_at)}</span>
        <span class="state">${c.state}</span>
      </div>
    `).join('');
  } catch (e) { console.error(e); }
}

async function newConversation() {
  try {
    const res = await fetch(`${API}/api/conversations`, { method: 'POST', headers: headers() });
    const conv = await res.json();
    currentConvId = conv.id;
    await loadConversations();
    renderMessages([]);
    updateState('intake');
  } catch (e) { console.error(e); }
}

async function openConversation(id) {
  currentConvId = id;
  try {
    const res = await fetch(`${API}/api/conversations/${id}`, { headers: headers() });
    const conv = await res.json();
    renderMessages(conv.messages || []);
    updateState(conv.state);
    loadConversations();
  } catch (e) { console.error(e); }
}

// --- Messages ---

function renderMessages(messages) {
  const el = document.getElementById('messages');
  if (!messages.length) {
    el.innerHTML = '<div class="empty-state">Describí la campaña que querés crear</div>';
    return;
  }
  el.innerHTML = messages.map(m => `
    <div class="message ${m.role}">${escapeHtml(m.content)}</div>
  `).join('');
  el.scrollTop = el.scrollHeight;
}

function addMessage(role, content) {
  const el = document.getElementById('messages');
  // Remove empty state
  const empty = el.querySelector('.empty-state');
  if (empty) empty.remove();
  const div = document.createElement('div');
  div.className = `message ${role}`;
  div.textContent = content;
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
}

async function send() {
  const input = document.getElementById('input');
  const msg = input.value.trim();
  if (!msg || sending || !currentConvId) return;
  input.value = '';
  await sendMessage(msg);
}

async function sendMessage(msg) {
  if (sending) return;
  sending = true;
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

    // Remove "thinking" message
    const messages = document.getElementById('messages');
    const last = messages.lastElementChild;
    if (last?.classList.contains('system')) last.remove();

    if (data.error) {
      addMessage('system', `Error: ${data.error}`);
    } else {
      addMessage('assistant', data.message);
      updateState(data.state);
    }

    loadConversations();
  } catch (e) {
    const messages = document.getElementById('messages');
    const last = messages.lastElementChild;
    if (last?.classList.contains('system')) last.remove();
    addMessage('system', `Error de conexión: ${e.message}`);
  } finally {
    sending = false;
    document.getElementById('send-btn').disabled = false;
    document.getElementById('input').focus();
  }
}

async function approveAndExecute() {
  // Send confirmation message, then execute
  await sendMessage('Dale, mandalo');

  // Wait a tick, then execute
  addMessage('system', 'Ejecutando en Google Ads...');
  try {
    const res = await fetch(`${API}/api/conversations/${currentConvId}/execute`, {
      method: 'POST',
      headers: headers(),
    });
    const data = await res.json();
    const messages = document.getElementById('messages');
    const last = messages.lastElementChild;
    if (last?.classList.contains('system')) last.remove();

    if (data.success) {
      addMessage('system', `Campaña creada! ID: ${data.campaignId}`);
      if (data.warnings?.length) {
        addMessage('system', `Warnings: ${data.warnings.map(w => w.error).join(', ')}`);
      }
      updateState('done');
    } else {
      addMessage('system', `Error: ${data.errors?.map(e => e.error || e).join(', ')}`);
      updateState('reviewing');
    }
    loadConversations();
  } catch (e) {
    addMessage('system', `Error de ejecución: ${e.message}`);
  }
}

// --- State ---

function updateState(state) {
  const bar = document.getElementById('state-bar');
  const dot = document.getElementById('state-dot');
  const text = document.getElementById('state-text');
  const actions = document.getElementById('action-buttons');

  if (!state) { bar.style.display = 'none'; return; }

  bar.style.display = 'flex';
  dot.className = `state-dot ${state}`;
  const labels = {
    intake: 'Esperando descripción',
    clarifying: 'Recopilando información',
    reviewing: 'Revisando estructura',
    confirmed: 'Confirmado',
    executing: 'Ejecutando...',
    done: 'Campaña creada',
    error: 'Error',
  };
  text.textContent = labels[state] || state;

  // Show approve button only in reviewing state
  actions.style.display = state === 'reviewing' ? 'flex' : 'none';
}

// --- Logs ---

async function loadLogs() {
  try {
    const res = await fetch(`${API}/api/admin/logs`, { headers: headers() });
    const logs = await res.json();
    const el = document.getElementById('logs-content');
    if (!logs.length) {
      el.innerHTML = '<div class="empty-state">Sin logs todavía</div>';
      return;
    }
    el.innerHTML = logs.map(l => `
      <div class="log-entry">
        <div class="log-header">
          <span>${l.action} — ${formatDate(l.created_at)}</span>
          <span class="log-status ${l.status}">${l.status}</span>
        </div>
        <details>
          <summary style="cursor:pointer;color:var(--text-dim);font-size:12px">Payload</summary>
          <pre style="margin-top:8px;font-size:11px;color:var(--text-dim);overflow-x:auto">${escapeHtml(JSON.stringify(l.payload, null, 2))}</pre>
        </details>
      </div>
    `).join('');
  } catch (e) { console.error(e); }
}

// --- Knowledge ---

async function loadKnowledge() {
  try {
    const res = await fetch(`${API}/api/knowledge`, { headers: headers() });
    const items = await res.json();
    const el = document.getElementById('knowledge-list');
    if (!items.length) {
      el.innerHTML = '<div style="color:var(--text-dim);font-size:13px">Sin conocimiento cargado todavía</div>';
      return;
    }
    el.innerHTML = items.map(k => `
      <div class="log-entry" style="display:flex;justify-content:space-between;align-items:flex-start">
        <div style="flex:1">
          <div style="display:flex;gap:8px;align-items:center;margin-bottom:4px">
            <span class="log-status started">${k.category}</span>
            <strong>${escapeHtml(k.title)}</strong>
          </div>
          <div style="color:var(--text-dim);font-size:12px">${escapeHtml(k.content).slice(0, 200)}${k.content.length > 200 ? '...' : ''}</div>
        </div>
        <button onclick="deleteKnowledge('${k.id}')" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:16px;padding:4px 8px" title="Eliminar">x</button>
      </div>
    `).join('');
  } catch (e) { console.error(e); }
}

async function addKnowledge() {
  const category = document.getElementById('k-category').value;
  const title = document.getElementById('k-title').value.trim();
  const content = document.getElementById('k-content').value.trim();
  if (!title || !content) return alert('Título y contenido requeridos');

  try {
    const res = await fetch(`${API}/api/knowledge`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ category, title, content }),
    });
    const data = await res.json();
    if (data.error) return alert('Error: ' + data.error);
    document.getElementById('k-title').value = '';
    document.getElementById('k-content').value = '';
    loadKnowledge();
  } catch (e) { alert('Error: ' + e.message); }
}

async function deleteKnowledge(id) {
  if (!confirm('Eliminar este conocimiento?')) return;
  try {
    await fetch(`${API}/api/knowledge/${id}`, { method: 'DELETE', headers: headers() });
    loadKnowledge();
  } catch (e) { console.error(e); }
}

// --- Admin Settings ---

async function loadSettings() {
  try {
    const res = await fetch(`${API}/api/admin/settings`, { headers: headers() });
    const s = await res.json();
    document.getElementById('s-llm-provider').value = s.llm_provider || 'openai';
    document.getElementById('s-llm-api-key').value = s.llm_api_key || '';
    document.getElementById('s-llm-model').value = s.llm_model || 'gpt-4o-mini';
    document.getElementById('s-openrouter-api-key').value = s.openrouter_api_key || '';
    document.getElementById('s-openrouter-model').value = s.openrouter_model || 'openai/gpt-4o-mini';
  } catch (e) { console.error(e); }
}

async function saveSettings() {
  try {
    const settings = {
      llm_provider: document.getElementById('s-llm-provider').value,
      llm_api_key: document.getElementById('s-llm-api-key').value,
      llm_model: document.getElementById('s-llm-model').value,
      openrouter_api_key: document.getElementById('s-openrouter-api-key').value,
      openrouter_model: document.getElementById('s-openrouter-model').value,
    };
    const res = await fetch(`${API}/api/admin/settings`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify(settings),
    });
    const data = await res.json();
    if (data.ok) alert('Settings guardados');
    else alert('Error: ' + (data.error || 'unknown'));
  } catch (e) { alert('Error: ' + e.message); }
}

// --- Utils ---

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) + ' '
    + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

// Auto-resize textarea
document.getElementById('input').addEventListener('input', function () {
  this.style.height = 'auto';
  this.style.height = Math.min(this.scrollHeight, 120) + 'px';
});

// Init
loadConversations();
