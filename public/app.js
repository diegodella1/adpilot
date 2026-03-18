const API = '';
let TOKEN = localStorage.getItem('adpilot_token') || '';
let USER = JSON.parse(localStorage.getItem('adpilot_user') || 'null');
let currentConvId = null;
let sending = false;
let analysisConvId = null;
let pendingAction = null;
let globalChart = null;

// ===================== TOAST SYSTEM =====================

function showToast(msg, type = 'info') {
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

// ===================== CONFIRM MODAL =====================

let confirmResolve = null;

function showConfirm(msg, okLabel = 'Eliminar') {
  return new Promise(resolve => {
    confirmResolve = resolve;
    document.getElementById('confirm-message').textContent = msg;
    document.getElementById('confirm-ok-btn').textContent = okLabel;
    document.getElementById('confirm-overlay').classList.add('show');
  });
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('confirm-ok-btn').addEventListener('click', () => {
    document.getElementById('confirm-overlay').classList.remove('show');
    if (confirmResolve) { confirmResolve(true); confirmResolve = null; }
  });
  document.getElementById('confirm-cancel-btn').addEventListener('click', () => {
    document.getElementById('confirm-overlay').classList.remove('show');
    if (confirmResolve) { confirmResolve(false); confirmResolve = null; }
  });
});

// ===================== LOADING HELPER =====================

async function withLoading(btn, fn) {
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

// ===================== AUTH =====================

function headers() {
  const h = { 'Content-Type': 'application/json' };
  if (TOKEN) h['Authorization'] = `Bearer ${TOKEN}`;
  return h;
}

function isAdmin() {
  return USER && USER.role === 'admin';
}

function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('main-header').style.display = 'flex';
  document.getElementById('main-app').style.display = 'flex';

  // Show user info
  const display = document.getElementById('user-display');
  if (USER) {
    display.textContent = USER.name || USER.email;
  }

  // Show/hide admin-only sections in header
  // Admin platform section visibility is handled in loadSettings

  loadConversations();
}

function showLogin() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('main-header').style.display = 'none';
  document.getElementById('main-app').style.display = 'none';
}

let setupMode = false;

function toggleSetupMode() {
  setupMode = !setupMode;
  document.getElementById('login-btn').style.display = setupMode ? 'none' : 'block';
  document.getElementById('setup-btn').style.display = setupMode ? 'block' : 'none';
  document.getElementById('setup-name').style.display = setupMode ? 'block' : 'none';
  document.getElementById('login-subtitle').textContent = setupMode ? 'Crear primer admin' : 'Inicia sesion';
  document.getElementById('setup-link').textContent = setupMode ? 'Volver al login' : 'Primer uso? Crear admin';
}

async function doLogin() {
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
    TOKEN = data.token;
    USER = data.user;
    localStorage.setItem('adpilot_token', TOKEN);
    localStorage.setItem('adpilot_user', JSON.stringify(USER));
    document.getElementById('login-error').textContent = '';
    showApp();
  } catch (e) {
    document.getElementById('login-error').textContent = 'Error de conexion';
  } finally {
    document.getElementById('login-btn').disabled = false;
  }
}

async function doSetup() {
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
    TOKEN = data.token;
    USER = data.user;
    localStorage.setItem('adpilot_token', TOKEN);
    localStorage.setItem('adpilot_user', JSON.stringify(USER));
    document.getElementById('login-error').textContent = '';
    showToast('Admin creado exitosamente', 'success');
    showApp();
  } catch (e) {
    document.getElementById('login-error').textContent = 'Error de conexion';
  } finally {
    document.getElementById('setup-btn').disabled = false;
  }
}

function doLogout() {
  TOKEN = '';
  USER = null;
  localStorage.removeItem('adpilot_token');
  localStorage.removeItem('adpilot_user');
  showLogin();
}

// Validate token on load
async function validateToken() {
  if (!TOKEN) { showLogin(); return; }
  try {
    const res = await fetch(`${API}/api/auth/me`, { headers: headers() });
    if (!res.ok) { doLogout(); return; }
    const data = await res.json();
    USER = data.user;
    localStorage.setItem('adpilot_user', JSON.stringify(USER));
    showApp();
  } catch (e) {
    doLogout();
  }
}

// Init
validateToken();

// ===================== VIEWS =====================

const ALL_VIEWS = ['chat', 'dashboard', 'analyze', 'optimizer', 'logs', 'knowledge', 'keywords', 'admin', 'docs'];

function showView(view) {
  document.querySelectorAll('.header-actions button:not(.btn-logout)').forEach(b => b.classList.remove('active'));
  document.getElementById(`btn-${view}`).classList.add('active');
  for (const v of ALL_VIEWS) {
    const el = document.getElementById(`view-${v}`);
    if (el) el.style.display = v === view ? (v === 'chat' || v === 'analyze' ? 'flex' : 'block') : 'none';
  }
  document.querySelector('.sidebar').style.display = (view === 'chat') ? 'flex' : 'none';

  if (view === 'logs') loadLogs();
  if (view === 'knowledge') loadKnowledge();
  if (view === 'admin') loadSettings();
  if (view === 'dashboard') loadDashboard();
  if (view === 'optimizer') loadOptimizer();
  if (view === 'docs') renderDocs();
}

// ===================== CONVERSATIONS =====================

async function loadConversations() {
  try {
    const res = await fetch(`${API}/api/conversations`, { headers: headers() });
    if (res.status === 401) { doLogout(); return; }
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
    showView('chat');
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

// ===================== MESSAGES =====================

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

function addMessage(role, content, containerId = 'messages') {
  const el = document.getElementById(containerId);
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
  if (!msg || sending) return;

  if (!currentConvId) {
    try {
      const res = await fetch(`${API}/api/conversations`, { method: 'POST', headers: headers() });
      const conv = await res.json();
      currentConvId = conv.id;
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
    sending = false;
    document.getElementById('send-btn').disabled = false;
    document.getElementById('input').focus();
  }
}

async function approveAndExecute() {
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

// ===================== DASHBOARD =====================

async function loadDashboard() {
  const days = parseInt(document.getElementById('dash-period').value);

  try {
    const [sumRes, globalRes] = await Promise.all([
      fetch(`${API}/api/dashboard/summaries`, { headers: headers() }),
      fetch(`${API}/api/dashboard/global?days=${days}`, { headers: headers() }),
    ]);
    const summaries = await sumRes.json();
    const global = await globalRes.json();

    renderKPIs(summaries, days);
    renderGlobalChart(global);
    renderCampaignsTable(summaries, days);
    renderAlerts(summaries);
  } catch (e) {
    console.error(e);
    document.getElementById('kpi-cards').innerHTML = '<div style="color:var(--text-dim)">No se pudieron cargar las metricas. Configura Google Ads primero.</div>';
  }
}

function renderKPIs(summaries, days) {
  const suffix = days <= 7 ? '7d' : '30d';
  let totalSpend = 0, totalClicks = 0, totalConv = 0, totalImp = 0;
  for (const s of summaries) {
    totalSpend += Number(s[`spend_${suffix}_micros`]) || 0;
    totalClicks += Number(s[`clicks_${suffix}`]) || 0;
    totalConv += Number(s[`conversions_${suffix}`]) || 0;
    totalImp += Number(s[`impressions_${suffix}`]) || 0;
  }
  const cpa = totalConv > 0 ? totalSpend / totalConv / 1_000_000 : 0;
  const ctr = totalImp > 0 ? (totalClicks / totalImp * 100) : 0;

  document.getElementById('kpi-cards').innerHTML = [
    kpiCard('Spend', `$${(totalSpend / 1_000_000).toFixed(2)}`, 'var(--accent)'),
    kpiCard('Clicks', totalClicks.toLocaleString(), 'var(--green)'),
    kpiCard('Conversiones', totalConv.toFixed(1), 'var(--green)'),
    kpiCard('CPA', cpa > 0 ? `$${cpa.toFixed(2)}` : 'N/A', cpa > 10 ? 'var(--red)' : 'var(--green)'),
    kpiCard('CTR', `${ctr.toFixed(2)}%`, ctr < 1 ? 'var(--red)' : 'var(--green)'),
    kpiCard('Campanas', summaries.length, 'var(--text-dim)'),
  ].join('');
}

function kpiCard(label, value, color) {
  return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:16px">
    <div style="font-size:12px;color:var(--text-dim);margin-bottom:4px">${label}</div>
    <div style="font-size:24px;font-weight:600;color:${color}">${value}</div>
  </div>`;
}

function renderGlobalChart(data) {
  const ctx = document.getElementById('global-chart').getContext('2d');
  if (globalChart) globalChart.destroy();

  globalChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map(d => d.date.slice(5)),
      datasets: [
        {
          label: 'Spend ($)',
          data: data.map(d => d.cost_micros / 1_000_000),
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59,130,246,0.1)',
          fill: true, tension: 0.3,
          yAxisID: 'y',
        },
        {
          label: 'Conversiones',
          data: data.map(d => d.conversions),
          borderColor: '#22c55e',
          backgroundColor: 'rgba(34,197,94,0.1)',
          fill: false, tension: 0.3,
          yAxisID: 'y1',
        },
      ],
    },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { labels: { color: '#888' } } },
      scales: {
        x: { ticks: { color: '#888' }, grid: { color: '#1e1e1e' } },
        y: { position: 'left', ticks: { color: '#3b82f6' }, grid: { color: '#1e1e1e' },
             title: { display: true, text: 'Spend ($)', color: '#3b82f6' } },
        y1: { position: 'right', ticks: { color: '#22c55e' }, grid: { display: false },
              title: { display: true, text: 'Conversiones', color: '#22c55e' } },
      },
    },
  });
}

function renderCampaignsTable(summaries, days) {
  const suffix = days <= 7 ? '7d' : '30d';
  const micro = (v) => `$${(Number(v) / 1_000_000).toFixed(2)}`;
  const pct = (v) => `${(Number(v) * 100).toFixed(2)}%`;

  let html = `<table style="width:100%;border-collapse:collapse;font-size:13px">
    <thead><tr style="border-bottom:1px solid var(--border);text-align:left">
      <th style="padding:8px">Campana</th>
      <th style="padding:8px">Status</th>
      <th style="padding:8px">Spend</th>
      <th style="padding:8px">Clicks</th>
      <th style="padding:8px">Conv.</th>
      <th style="padding:8px">CPA</th>
      <th style="padding:8px">CTR</th>
      <th style="padding:8px">ROAS</th>
      <th style="padding:8px"></th>
    </tr></thead><tbody>`;

  for (const s of summaries) {
    const status = s.campaign_status === 'ENABLED'
      ? '<span style="color:var(--green)">Active</span>'
      : `<span style="color:var(--text-dim)">${s.campaign_status}</span>`;
    const hasAlerts = s.alerts?.length > 0;

    html += `<tr style="border-bottom:1px solid var(--border)">
      <td style="padding:8px">${hasAlerts ? '<span style="color:var(--red)">!</span> ' : ''}${escapeHtml(s.campaign_name)}</td>
      <td style="padding:8px">${status}</td>
      <td style="padding:8px">${micro(s[`spend_${suffix}_micros`])}</td>
      <td style="padding:8px">${s[`clicks_${suffix}`]}</td>
      <td style="padding:8px">${Number(s[`conversions_${suffix}`]).toFixed(1)}</td>
      <td style="padding:8px">${micro(s[`cpa_${suffix}_micros`])}</td>
      <td style="padding:8px">${pct(s[`ctr_${suffix}`])}</td>
      <td style="padding:8px">${Number(s[`roas_${suffix}`])?.toFixed(2) || 'N/A'}</td>
      <td style="padding:8px">
        <button onclick="analyzeCampaign('${s.campaign_id}')" style="background:none;border:1px solid var(--accent);color:var(--accent);border-radius:4px;padding:2px 8px;cursor:pointer;font-size:11px">Analizar</button>
      </td>
    </tr>`;
  }
  html += '</tbody></table>';
  if (!summaries.length) html = '<div style="color:var(--text-dim);font-size:13px;padding:12px">Sin datos. Configura Google Ads y hace un sync.</div>';

  document.getElementById('campaigns-table').innerHTML = html;
}

function renderAlerts(summaries) {
  const allAlerts = [];
  for (const s of summaries) {
    for (const a of s.alerts || []) {
      allAlerts.push({ campaign: s.campaign_name, ...a });
    }
  }

  const section = document.getElementById('alerts-section');
  if (!allAlerts.length) { section.style.display = 'none'; return; }

  section.style.display = 'block';
  document.getElementById('alerts-content').innerHTML = allAlerts.map(a => `
    <div class="log-entry" style="border-left:3px solid ${a.severity === 'high' ? 'var(--red)' : 'var(--yellow)'}">
      <strong>${escapeHtml(a.campaign)}</strong>: ${escapeHtml(a.message)}
    </div>
  `).join('');
}

async function syncMetrics(btn) {
  await withLoading(btn, async () => {
    try {
      const res = await fetch(`${API}/api/dashboard/sync`, { method: 'POST', headers: headers() });
      const data = await res.json();
      if (data.error) showToast('Sync error: ' + data.error, 'error');
      else showToast(`Sync completo: ${data.synced} filas`, 'success');
      loadDashboard();
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
  });
}

// ===================== ANALYSIS CHAT =====================

function analyzeCampaign(campaignId) {
  analysisConvId = null;
  pendingAction = null;
  document.getElementById('analysis-messages').innerHTML = '<div class="empty-state">Cargando datos de la campana...</div>';
  document.getElementById('analysis-actions').style.display = 'none';
  showView('analyze');
  sendAnalysisMessage(`Analiza la campana ${campaignId} y dame recomendaciones`, campaignId);
}

async function sendAnalysis() {
  const input = document.getElementById('analysis-input');
  const msg = input.value.trim();
  if (!msg || sending) return;
  input.value = '';
  input.style.height = 'auto';
  await sendAnalysisMessage(msg);
}

async function sendAnalysisMessage(msg, campaignId = null) {
  if (sending) return;
  sending = true;

  addMessage('user', msg, 'analysis-messages');
  addMessage('system', 'Analizando...', 'analysis-messages');

  try {
    const body = { message: msg };
    if (analysisConvId) body.conversation_id = analysisConvId;
    if (campaignId) body.campaign_id = campaignId;

    const res = await fetch(`${API}/api/analysis/chat`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify(body),
    });
    const data = await res.json();
    removeLastSystem('analysis-messages');

    if (data.error) {
      addMessage('system', `Error: ${data.error}`, 'analysis-messages');
    } else {
      analysisConvId = data.conversation_id;
      addMessage('assistant', data.message, 'analysis-messages');

      if (data.action) {
        pendingAction = data.action;
        document.getElementById('analysis-actions').style.display = 'flex';
      } else {
        document.getElementById('analysis-actions').style.display = 'none';
      }
    }
  } catch (e) {
    removeLastSystem('analysis-messages');
    addMessage('system', `Error: ${e.message}`, 'analysis-messages');
  } finally {
    sending = false;
  }
}

async function executeAnalysisAction() {
  if (!pendingAction) return;
  addMessage('system', 'Ejecutando accion...', 'analysis-messages');
  try {
    const res = await fetch(`${API}/api/analysis/execute-action`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ action: pendingAction }),
    });
    const data = await res.json();
    removeLastSystem('analysis-messages');
    if (data.success) {
      addMessage('system', 'Accion ejecutada correctamente', 'analysis-messages');
    } else {
      addMessage('system', `Error: ${data.error}`, 'analysis-messages');
    }
  } catch (e) {
    removeLastSystem('analysis-messages');
    addMessage('system', `Error: ${e.message}`, 'analysis-messages');
  }
  pendingAction = null;
  document.getElementById('analysis-actions').style.display = 'none';
}

function dismissAnalysisAction() {
  pendingAction = null;
  document.getElementById('analysis-actions').style.display = 'none';
}

// ===================== OPTIMIZER =====================

async function loadOptimizer() {
  await Promise.all([loadRules(), loadRecommendations(), loadOptimLogs()]);
}

async function loadRules() {
  try {
    const res = await fetch(`${API}/api/optimizer/rules`, { headers: headers() });
    const rules = await res.json();
    const el = document.getElementById('rules-list');
    if (!rules.length) {
      el.innerHTML = '<div style="color:var(--text-dim);font-size:13px">Sin reglas definidas</div>';
      return;
    }
    el.innerHTML = rules.map(r => `
      <div class="log-entry" style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <strong>${escapeHtml(r.name)}</strong>
          <span style="color:var(--text-dim);font-size:12px;margin-left:8px">
            ${r.condition.metric} ${r.condition.operator} ${r.condition.value} -> ${r.action.type}
          </span>
          ${r.auto_execute ? '<span style="color:var(--yellow);font-size:11px;margin-left:8px">AUTO</span>' : ''}
          ${!r.enabled ? '<span style="color:var(--text-dim);font-size:11px;margin-left:8px">DISABLED</span>' : ''}
        </div>
        <div style="display:flex;gap:4px">
          <button onclick="toggleRule('${r.id}', ${!r.enabled})" style="background:none;border:1px solid var(--border);color:var(--text-dim);border-radius:4px;padding:2px 8px;cursor:pointer;font-size:11px">
            ${r.enabled ? 'Desactivar' : 'Activar'}
          </button>
          <button onclick="removeRule('${r.id}')" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:14px">x</button>
        </div>
      </div>
    `).join('');
  } catch (e) { console.error(e); }
}

async function loadRecommendations() {
  try {
    const res = await fetch(`${API}/api/optimizer/recommendations`, { headers: headers() });
    const recs = await res.json();
    const el = document.getElementById('recs-content');
    if (!recs.length) {
      el.innerHTML = '<div style="color:var(--text-dim);font-size:13px">Sin recomendaciones pendientes</div>';
      return;
    }
    el.innerHTML = recs.map(r => `
      <div class="log-entry" style="border-left:3px solid var(--yellow)">
        <div style="margin-bottom:8px">${escapeHtml(r.recommendation || r.action)}</div>
        <div style="display:flex;gap:8px">
          <button onclick="resolveRec('${r.id}', true)" class="btn-approve" style="padding:4px 12px;font-size:12px;border-radius:4px">Aprobar</button>
          <button onclick="resolveRec('${r.id}', false)" class="btn-cancel" style="padding:4px 12px;font-size:12px;border-radius:4px">Rechazar</button>
        </div>
      </div>
    `).join('');
  } catch (e) { console.error(e); }
}

async function loadOptimLogs() {
  const el = document.getElementById('optim-logs');
  el.innerHTML = '<div style="color:var(--text-dim);font-size:13px">Los logs se muestran en la pestana Logs</div>';
}

async function createRule(btn) {
  await withLoading(btn, async () => {
    const name = document.getElementById('rule-name').value.trim();
    const metric = document.getElementById('rule-metric').value;
    const operator = document.getElementById('rule-operator').value;
    const value = parseFloat(document.getElementById('rule-value').value);
    const actionType = document.getElementById('rule-action').value;
    const autoExec = document.getElementById('rule-auto').checked;

    if (!name || isNaN(value)) { showToast('Nombre y valor requeridos', 'error'); return; }

    try {
      const res = await fetch(`${API}/api/optimizer/rules`, {
        method: 'POST', headers: headers(),
        body: JSON.stringify({
          name,
          condition: { metric, operator, value },
          action: { type: actionType },
          auto_execute: autoExec,
        }),
      });
      const data = await res.json();
      if (data.error) { showToast('Error: ' + data.error, 'error'); return; }
      showToast('Regla creada', 'success');
      document.getElementById('rule-name').value = '';
      document.getElementById('rule-value').value = '';
      loadRules();
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
  });
}

async function toggleRule(id, enabled) {
  try {
    await fetch(`${API}/api/optimizer/rules/${id}`, {
      method: 'PUT', headers: headers(),
      body: JSON.stringify({ enabled }),
    });
    loadRules();
  } catch (e) { console.error(e); }
}

async function removeRule(id) {
  if (!await showConfirm('Eliminar esta regla?')) return;
  try {
    await fetch(`${API}/api/optimizer/rules/${id}`, { method: 'DELETE', headers: headers() });
    showToast('Regla eliminada', 'success');
    loadRules();
  } catch (e) { console.error(e); }
}

async function resolveRec(id, approved) {
  try {
    await fetch(`${API}/api/optimizer/recommendations/${id}/resolve`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ approved }),
    });
    showToast(approved ? 'Recomendacion aprobada' : 'Recomendacion rechazada', 'info');
    loadRecommendations();
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

async function evaluateRules(btn) {
  await withLoading(btn, async () => {
    try {
      const res = await fetch(`${API}/api/optimizer/evaluate`, { method: 'POST', headers: headers() });
      const data = await res.json();
      showToast(`${data.triggered} reglas disparadas`, 'info');
      loadRecommendations();
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
  });
}

// ===================== LOGS =====================

async function loadLogs() {
  try {
    const res = await fetch(`${API}/api/admin/logs`, { headers: headers() });
    const logs = await res.json();
    const el = document.getElementById('logs-content');
    if (!logs.length) {
      el.innerHTML = '<div class="empty-state">Sin logs todavia</div>';
      return;
    }
    el.innerHTML = logs.map(l => `
      <div class="log-entry">
        <div class="log-header">
          <span>${l.action} - ${formatDate(l.created_at)}</span>
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

// ===================== KNOWLEDGE =====================

async function loadKnowledge() {
  try {
    const res = await fetch(`${API}/api/knowledge`, { headers: headers() });
    const items = await res.json();
    const el = document.getElementById('knowledge-list');
    if (!items.length) {
      el.innerHTML = '<div style="color:var(--text-dim);font-size:13px">Sin conocimiento cargado todavia</div>';
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

async function addKnowledge(btn) {
  await withLoading(btn, async () => {
    const category = document.getElementById('k-category').value;
    const title = document.getElementById('k-title').value.trim();
    const content = document.getElementById('k-content').value.trim();
    if (!title || !content) { showToast('Titulo y contenido requeridos', 'error'); return; }
    try {
      const res = await fetch(`${API}/api/knowledge`, {
        method: 'POST', headers: headers(),
        body: JSON.stringify({ category, title, content }),
      });
      const data = await res.json();
      if (data.error) { showToast('Error: ' + data.error, 'error'); return; }
      showToast('Conocimiento agregado', 'success');
      document.getElementById('k-title').value = '';
      document.getElementById('k-content').value = '';
      loadKnowledge();
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
  });
}

async function deleteKnowledge(id) {
  if (!await showConfirm('Eliminar este conocimiento?')) return;
  try {
    await fetch(`${API}/api/knowledge/${id}`, { method: 'DELETE', headers: headers() });
    showToast('Conocimiento eliminado', 'success');
    loadKnowledge();
  } catch (e) { console.error(e); }
}

// ===================== KEYWORDS =====================

let lastKeywordResults = [];

async function searchKeywords(btn) {
  await withLoading(btn, async () => {
    const seedsRaw = document.getElementById('kw-seeds').value.trim();
    const url = document.getElementById('kw-url').value.trim();
    const geo = document.getElementById('kw-geo').value;
    const language = document.getElementById('kw-lang').value;

    const keywords = seedsRaw.split('\n').map(s => s.trim()).filter(Boolean);
    if (!keywords.length && !url) {
      showToast('Ingresa al menos una keyword o URL', 'error');
      return;
    }

    try {
      const res = await fetch(`${API}/api/keywords/ideas`, {
        method: 'POST', headers: headers(),
        body: JSON.stringify({ keywords, url: url || undefined, geo, language }),
      });
      const data = await res.json();
      if (data.error) { showToast('Error: ' + data.error, 'error'); return; }
      lastKeywordResults = data;
      renderKeywordResults(data);
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
  });
}

function renderKeywordResults(ideas) {
  const section = document.getElementById('kw-results-section');
  const el = document.getElementById('kw-results');

  if (!ideas.length) {
    section.style.display = 'block';
    el.innerHTML = '<div style="color:var(--text-dim);font-size:13px;padding:8px">Sin resultados</div>';
    return;
  }

  const micro = (v) => `$${(Number(v) / 1_000_000).toFixed(2)}`;
  const compLabel = { LOW: 'Baja', MEDIUM: 'Media', HIGH: 'Alta', UNSPECIFIED: '-' };

  let html = `<table class="kw-table">
    <thead><tr>
      <th style="width:32px"><input type="checkbox" onchange="toggleAllKeywords(this)"></th>
      <th>Keyword</th>
      <th>Vol. mensual</th>
      <th>Competencia</th>
      <th>Idx</th>
      <th>CPC bajo</th>
      <th>CPC alto</th>
    </tr></thead><tbody>`;

  for (let i = 0; i < ideas.length; i++) {
    const r = ideas[i];
    html += `<tr>
      <td><input type="checkbox" class="kw-check" data-idx="${i}"></td>
      <td>${escapeHtml(r.keyword)}</td>
      <td style="text-align:right">${r.avg_monthly_searches.toLocaleString()}</td>
      <td>${compLabel[r.competition] || r.competition}</td>
      <td style="text-align:right">${r.competition_index}</td>
      <td style="text-align:right">${micro(r.low_cpc_micros)}</td>
      <td style="text-align:right">${micro(r.high_cpc_micros)}</td>
    </tr>`;
  }
  html += '</tbody></table>';

  section.style.display = 'block';
  el.innerHTML = html;
}

function toggleAllKeywords(master) {
  document.querySelectorAll('.kw-check').forEach(cb => cb.checked = master.checked);
}

function copySelectedKeywords() {
  const checked = document.querySelectorAll('.kw-check:checked');
  if (!checked.length) { showToast('Selecciona al menos una keyword', 'error'); return; }
  const selected = Array.from(checked).map(cb => lastKeywordResults[cb.dataset.idx].keyword);
  navigator.clipboard.writeText(selected.join('\n'))
    .then(() => showToast(`${selected.length} keywords copiadas`, 'success'))
    .catch(() => showToast('No se pudo copiar al clipboard', 'error'));
}

// ===================== ADMIN =====================

async function loadSettings() {
  // Show admin-only sections
  const platformSection = document.getElementById('admin-platform-section');
  if (platformSection) {
    platformSection.style.display = isAdmin() ? 'block' : 'none';
  }

  try {
    const res = await fetch(`${API}/api/admin/settings`, { headers: headers() });
    const s = await res.json();

    // Per-user settings
    document.getElementById('s-gads-client-id').value = s.gads_client_id || '';
    document.getElementById('s-gads-client-secret').value = s.gads_client_secret || '';
    document.getElementById('s-gads-dev-token').value = s.gads_dev_token || '';
    document.getElementById('s-gads-refresh-token').value = s.gads_refresh_token || '';
    document.getElementById('s-gads-customer-id').value = s.gads_customer_id || '';
    document.getElementById('s-gads-login-customer-id').value = s.gads_login_customer_id || '';
    document.getElementById('s-business-context').value = s.business_context || '';

    // Global settings (admin only)
    if (isAdmin()) {
      document.getElementById('s-llm-provider').value = s.llm_provider || 'openai';
      document.getElementById('s-llm-api-key').value = s.llm_api_key || '';
      document.getElementById('s-llm-model').value = s.llm_model || 'gpt-4o-mini';
      document.getElementById('s-openrouter-api-key').value = s.openrouter_api_key || '';
      document.getElementById('s-openrouter-model').value = s.openrouter_model || 'openai/gpt-4o-mini';
      document.getElementById('s-master-prompt').value = s.master_prompt || '';

      loadUsers();
      loadUsage();
    }
  } catch (e) { console.error(e); }
}

async function saveGoogleAds(btn) {
  await withLoading(btn, async () => {
    try {
      const settings = {
        gads_client_id: document.getElementById('s-gads-client-id').value,
        gads_client_secret: document.getElementById('s-gads-client-secret').value,
        gads_dev_token: document.getElementById('s-gads-dev-token').value,
        gads_refresh_token: document.getElementById('s-gads-refresh-token').value,
        gads_customer_id: document.getElementById('s-gads-customer-id').value,
        gads_login_customer_id: document.getElementById('s-gads-login-customer-id').value,
      };
      const res = await fetch(`${API}/api/admin/settings`, {
        method: 'PUT', headers: headers(),
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (data.ok) showToast('Google Ads guardado', 'success');
      else showToast('Error: ' + (data.error || 'unknown'), 'error');
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
  });
}

async function saveBusinessContext(btn) {
  await withLoading(btn, async () => {
    try {
      const res = await fetch(`${API}/api/admin/settings`, {
        method: 'PUT', headers: headers(),
        body: JSON.stringify({ business_context: document.getElementById('s-business-context').value }),
      });
      const data = await res.json();
      if (data.ok) showToast('Detalles del negocio guardados', 'success');
      else showToast('Error: ' + (data.error || 'unknown'), 'error');
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
  });
}

async function saveLLMSettings(btn) {
  await withLoading(btn, async () => {
    try {
      const settings = {
        llm_provider: document.getElementById('s-llm-provider').value,
        llm_api_key: document.getElementById('s-llm-api-key').value,
        llm_model: document.getElementById('s-llm-model').value,
        openrouter_api_key: document.getElementById('s-openrouter-api-key').value,
        openrouter_model: document.getElementById('s-openrouter-model').value,
      };
      const res = await fetch(`${API}/api/admin/settings/global`, {
        method: 'PUT', headers: headers(),
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (data.ok) showToast('LLM settings guardados', 'success');
      else showToast('Error: ' + (data.error || 'unknown'), 'error');
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
  });
}

async function saveMasterPrompt(btn) {
  await withLoading(btn, async () => {
    try {
      const res = await fetch(`${API}/api/admin/settings/global`, {
        method: 'PUT', headers: headers(),
        body: JSON.stringify({ master_prompt: document.getElementById('s-master-prompt').value }),
      });
      const data = await res.json();
      if (data.ok) showToast('Master prompt guardado', 'success');
      else showToast('Error: ' + (data.error || 'unknown'), 'error');
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
  });
}

// ===================== USER MANAGEMENT (admin) =====================

async function loadUsers() {
  try {
    const res = await fetch(`${API}/api/admin/users`, { headers: headers() });
    const users = await res.json();
    const el = document.getElementById('users-list');
    if (!users.length) {
      el.innerHTML = '<div style="color:var(--text-dim);font-size:13px">Sin usuarios</div>';
      return;
    }
    el.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="border-bottom:1px solid var(--border);text-align:left">
        <th style="padding:8px">Email</th>
        <th style="padding:8px">Nombre</th>
        <th style="padding:8px">Rol</th>
        <th style="padding:8px">Limite USD/mes</th>
        <th style="padding:8px">Consumo mes</th>
        <th style="padding:8px">Estado</th>
        <th style="padding:8px"></th>
      </tr></thead><tbody>` +
      users.map(u => `<tr style="border-bottom:1px solid var(--border)">
        <td style="padding:8px">${escapeHtml(u.email)}</td>
        <td style="padding:8px">${escapeHtml(u.name || '-')}</td>
        <td style="padding:8px">${u.role}</td>
        <td style="padding:8px">
          <input type="number" value="${u.llm_monthly_limit_usd}" step="1" min="0" style="width:70px;padding:2px 6px;border:1px solid var(--border);border-radius:4px;background:var(--surface2);color:var(--text);font-size:12px"
            onchange="updateUserLimit('${u.id}', this.value)">
        </td>
        <td style="padding:8px">$${u.llm_usage_this_month_usd}</td>
        <td style="padding:8px">${u.enabled ? '<span style="color:var(--green)">Activo</span>' : '<span style="color:var(--red)">Deshabilitado</span>'}</td>
        <td style="padding:8px">
          ${u.role !== 'admin' ? `<button onclick="toggleUserEnabled('${u.id}', ${!u.enabled})" style="background:none;border:1px solid var(--border);color:var(--text-dim);border-radius:4px;padding:2px 8px;cursor:pointer;font-size:11px">${u.enabled ? 'Deshabilitar' : 'Habilitar'}</button>` : ''}
        </td>
      </tr>`).join('') +
      '</tbody></table>';
  } catch (e) { console.error(e); }
}

async function createUser(btn) {
  await withLoading(btn, async () => {
    const email = document.getElementById('new-user-email').value.trim();
    const name = document.getElementById('new-user-name').value.trim();
    const password = document.getElementById('new-user-password').value;
    if (!email || !password) { showToast('Email y password requeridos', 'error'); return; }
    if (password.length < 6) { showToast('Password min 6 caracteres', 'error'); return; }

    try {
      const res = await fetch(`${API}/api/admin/users`, {
        method: 'POST', headers: headers(),
        body: JSON.stringify({ email, password, name }),
      });
      const data = await res.json();
      if (data.error) { showToast('Error: ' + data.error, 'error'); return; }
      showToast('Usuario creado', 'success');
      document.getElementById('new-user-email').value = '';
      document.getElementById('new-user-name').value = '';
      document.getElementById('new-user-password').value = '';
      loadUsers();
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
  });
}

async function toggleUserEnabled(id, enabled) {
  try {
    await fetch(`${API}/api/admin/users/${id}`, {
      method: 'PUT', headers: headers(),
      body: JSON.stringify({ enabled }),
    });
    loadUsers();
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

async function updateUserLimit(id, limit) {
  try {
    await fetch(`${API}/api/admin/users/${id}`, {
      method: 'PUT', headers: headers(),
      body: JSON.stringify({ llm_monthly_limit_usd: parseFloat(limit) }),
    });
    showToast('Limite actualizado', 'success');
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

async function loadUsage() {
  try {
    const res = await fetch(`${API}/api/admin/usage`, { headers: headers() });
    const data = await res.json();
    const el = document.getElementById('usage-content');
    if (!data.length) {
      el.innerHTML = '<div style="color:var(--text-dim);font-size:13px">Sin consumo este mes</div>';
      return;
    }

    // Aggregate by user
    const byUser = {};
    for (const row of data) {
      if (!byUser[row.user_id]) byUser[row.user_id] = { tokens: 0, cost: 0, calls: 0 };
      byUser[row.user_id].tokens += row.total_tokens;
      byUser[row.user_id].cost += Number(row.estimated_cost_usd);
      byUser[row.user_id].calls++;
    }

    el.innerHTML = Object.entries(byUser).map(([uid, stats]) => `
      <div class="log-entry" style="display:flex;justify-content:space-between">
        <span style="font-size:12px;color:var(--text-dim)">${uid.slice(0, 8)}...</span>
        <span>${stats.calls} calls | ${stats.tokens.toLocaleString()} tokens | $${stats.cost.toFixed(4)}</span>
      </div>
    `).join('');
  } catch (e) { console.error(e); }
}

// ===================== DOCS =====================

function renderDocs() {
  document.getElementById('docs-content').innerHTML = `
    <div class="admin-section" style="max-width:800px">
      <h2 style="font-size:22px;margin-bottom:4px">AdPilot</h2>
      <p style="color:var(--text-dim);margin-bottom:20px">Agente conversacional para Google Ads. Crea, analiza y optimiza campanas con LLM.</p>

      <div style="background:var(--surface2);border-radius:8px;padding:16px;margin-bottom:20px">
        <h3 style="margin-bottom:8px;color:var(--accent)">Setup inicial</h3>
        <ol style="padding-left:20px;line-height:1.8;color:var(--text-dim)">
          <li>Hacer click en "Primer uso? Crear admin" en la pantalla de login para crear la cuenta admin.</li>
          <li>Ir a <strong>Admin > Plataforma</strong> y configurar un LLM provider (OpenAI directo u OpenRouter) con su API key y modelo.</li>
          <li>Configurar las credenciales de <strong>Google Ads</strong> en la seccion "Mi cuenta" del Admin.</li>
          <li>Sin Google Ads configurado, AdPilot igual funciona como copiloto: genera estructuras de campana que podes crear manualmente.</li>
        </ol>
      </div>

      <h3 style="color:var(--accent);margin-bottom:12px">Secciones</h3>

      <div style="display:grid;gap:12px">
        <div style="background:var(--surface2);border-radius:8px;padding:16px">
          <h4 style="margin-bottom:6px">Chat - Crear campanas</h4>
          <p style="color:var(--text-dim);font-size:13px;line-height:1.6">
            Describis lo que necesitas en lenguaje natural. El agente te pregunta lo que falta, genera la estructura completa de campana en JSON,
            y te la muestra para que revises. Cuando estas conforme, apretas <strong>Aprobar y ejecutar</strong> y se crea la campana en Google Ads (pausada).
          </p>
        </div>

        <div style="background:var(--surface2);border-radius:8px;padding:16px">
          <h4 style="margin-bottom:6px">Dashboard - Metricas</h4>
          <p style="color:var(--text-dim);font-size:13px;line-height:1.6">
            KPIs globales (spend, clicks, conversiones, CPA, CTR) y grafico de tendencia diaria.
            Tabla con todas las campanas y sus metricas. Boton <strong>Sync ahora</strong> para forzar sincronizacion.
          </p>
        </div>

        <div style="background:var(--surface2);border-radius:8px;padding:16px">
          <h4 style="margin-bottom:6px">Admin</h4>
          <p style="color:var(--text-dim);font-size:13px;line-height:1.6">
            <strong>Mi cuenta:</strong> Credenciales de Google Ads y detalles del negocio (se inyectan al LLM).<br>
            <strong>Plataforma (admin):</strong> LLM provider, master prompt global, gestion de usuarios y consumo.
          </p>
        </div>
      </div>

      <div style="margin-top:24px;padding:16px;border-top:1px solid var(--border);color:var(--text-dim);font-size:12px">
        <strong>Stack:</strong> Node.js (Express) + Supabase (PostgreSQL + pgvector) + Chart.js<br>
        <strong>LLM:</strong> Configurable (OpenAI / OpenRouter / cualquier provider compatible)<br>
        <strong>API:</strong> Google Ads API v18<br>
        <strong>Auth:</strong> JWT (bcrypt + jsonwebtoken)<br>
        <strong>Hosting:</strong> Raspberry Pi 5 via Cloudflare Tunnel
      </div>
    </div>
  `;
}

// ===================== UTILS =====================

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) + ' '
    + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function removeLastSystem(containerId) {
  const el = document.getElementById(containerId);
  const last = el.lastElementChild;
  if (last?.classList.contains('system')) last.remove();
}

// Auto-resize textareas
for (const ta of document.querySelectorAll('textarea')) {
  ta.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
  });
}
