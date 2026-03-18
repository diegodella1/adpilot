const API = '';
let TOKEN = localStorage.getItem('adpilot_token') || '';
let currentConvId = null;
let sending = false;
let analysisConvId = null;
let pendingAction = null;
let globalChart = null;

// Auth
function headers() {
  const h = { 'Content-Type': 'application/json' };
  if (TOKEN) h['Authorization'] = `Bearer ${TOKEN}`;
  return h;
}

if (!TOKEN) {
  TOKEN = prompt('Token de acceso:') || '';
  if (TOKEN) localStorage.setItem('adpilot_token', TOKEN);
}

// Views
const ALL_VIEWS = ['chat', 'dashboard', 'analyze', 'optimizer', 'logs', 'knowledge', 'admin'];

function showView(view) {
  document.querySelectorAll('.header-actions button').forEach(b => b.classList.remove('active'));
  document.getElementById(`btn-${view}`).classList.add('active');
  for (const v of ALL_VIEWS) {
    const el = document.getElementById(`view-${v}`);
    if (el) el.style.display = v === view ? (v === 'chat' || v === 'analyze' ? 'flex' : 'block') : 'none';
  }
  // Sidebar only visible in chat mode
  document.querySelector('.sidebar').style.display = (view === 'chat') ? 'flex' : 'none';

  if (view === 'logs') loadLogs();
  if (view === 'knowledge') loadKnowledge();
  if (view === 'admin') loadSettings();
  if (view === 'dashboard') loadDashboard();
  if (view === 'optimizer') loadOptimizer();
}

// ===================== CONVERSATIONS =====================

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
    el.innerHTML = '<div class="empty-state">Describí la campaña que querés crear</div>';
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
  if (!msg || sending || !currentConvId) return;
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
    addMessage('system', `Error de conexión: ${e.message}`);
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
      addMessage('system', `Campaña creada! ID: ${data.campaignId}`);
      if (data.warnings?.length) addMessage('system', `Warnings: ${data.warnings.map(w => w.error).join(', ')}`);
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

function updateState(state) {
  const bar = document.getElementById('state-bar');
  const dot = document.getElementById('state-dot');
  const text = document.getElementById('state-text');
  const actions = document.getElementById('action-buttons');
  if (!state) { bar.style.display = 'none'; return; }
  bar.style.display = 'flex';
  dot.className = `state-dot ${state}`;
  const labels = {
    intake: 'Esperando descripción', clarifying: 'Recopilando información',
    reviewing: 'Revisando estructura', confirmed: 'Confirmado',
    executing: 'Ejecutando...', done: 'Campaña creada', error: 'Error',
  };
  text.textContent = labels[state] || state;
  actions.style.display = state === 'reviewing' ? 'flex' : 'none';
}

// ===================== DASHBOARD =====================

async function loadDashboard() {
  const days = parseInt(document.getElementById('dash-period').value);

  // Load summaries + global metrics in parallel
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
    document.getElementById('kpi-cards').innerHTML = '<div style="color:var(--text-dim)">No se pudieron cargar las métricas. Configurá Google Ads primero.</div>';
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
    kpiCard('Campañas', summaries.length, 'var(--text-dim)'),
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
      labels: data.map(d => d.date.slice(5)), // MM-DD
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
      <th style="padding:8px">Campaña</th>
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
  if (!summaries.length) html = '<div style="color:var(--text-dim);font-size:13px;padding:12px">Sin datos. Configurá Google Ads y hacé un sync.</div>';

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

async function syncMetrics() {
  try {
    const res = await fetch(`${API}/api/dashboard/sync`, { method: 'POST', headers: headers() });
    const data = await res.json();
    if (data.error) alert('Sync error: ' + data.error);
    else alert(`Sync completo: ${data.synced} filas`);
    loadDashboard();
  } catch (e) { alert('Error: ' + e.message); }
}

// ===================== ANALYSIS CHAT =====================

function analyzeCampaign(campaignId) {
  analysisConvId = null; // new conversation
  pendingAction = null;
  document.getElementById('analysis-messages').innerHTML = '<div class="empty-state">Cargando datos de la campaña...</div>';
  document.getElementById('analysis-actions').style.display = 'none';
  showView('analyze');
  // Auto-send initial analysis request
  sendAnalysisMessage(`Analizá la campaña ${campaignId} y dame recomendaciones`, campaignId);
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
  addMessage('system', 'Ejecutando acción...', 'analysis-messages');
  try {
    const res = await fetch(`${API}/api/analysis/execute-action`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ action: pendingAction }),
    });
    const data = await res.json();
    removeLastSystem('analysis-messages');
    if (data.success) {
      addMessage('system', 'Acción ejecutada correctamente', 'analysis-messages');
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
            ${r.condition.metric} ${r.condition.operator} ${r.condition.value} → ${r.action.type}
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
  try {
    const res = await fetch(`${API}/api/admin/logs`, { headers: headers() });
    const logs = await res.json();
    // Also fetch optimization-specific logs
    // For now reuse campaign logs
    const el = document.getElementById('optim-logs');
    el.innerHTML = '<div style="color:var(--text-dim);font-size:13px">Los logs se muestran en la pestaña Logs</div>';
  } catch (e) { console.error(e); }
}

async function createRule() {
  const name = document.getElementById('rule-name').value.trim();
  const metric = document.getElementById('rule-metric').value;
  const operator = document.getElementById('rule-operator').value;
  const value = parseFloat(document.getElementById('rule-value').value);
  const actionType = document.getElementById('rule-action').value;
  const autoExec = document.getElementById('rule-auto').checked;

  if (!name || isNaN(value)) return alert('Nombre y valor requeridos');

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
    if (data.error) return alert('Error: ' + data.error);
    document.getElementById('rule-name').value = '';
    document.getElementById('rule-value').value = '';
    loadRules();
  } catch (e) { alert('Error: ' + e.message); }
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
  if (!confirm('Eliminar esta regla?')) return;
  try {
    await fetch(`${API}/api/optimizer/rules/${id}`, { method: 'DELETE', headers: headers() });
    loadRules();
  } catch (e) { console.error(e); }
}

async function resolveRec(id, approved) {
  try {
    await fetch(`${API}/api/optimizer/recommendations/${id}/resolve`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ approved }),
    });
    loadRecommendations();
  } catch (e) { alert('Error: ' + e.message); }
}

async function evaluateRules() {
  try {
    const res = await fetch(`${API}/api/optimizer/evaluate`, { method: 'POST', headers: headers() });
    const data = await res.json();
    alert(`${data.triggered} reglas disparadas`);
    loadRecommendations();
  } catch (e) { alert('Error: ' + e.message); }
}

// ===================== LOGS =====================

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

// ===================== KNOWLEDGE =====================

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
      method: 'POST', headers: headers(),
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

// ===================== ADMIN =====================

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
      method: 'PUT', headers: headers(),
      body: JSON.stringify(settings),
    });
    const data = await res.json();
    if (data.ok) alert('Settings guardados');
    else alert('Error: ' + (data.error || 'unknown'));
  } catch (e) { alert('Error: ' + e.message); }
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

// Init
loadConversations();
