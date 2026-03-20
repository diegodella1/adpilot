import { API } from './state.js';
import { headers } from './api.js';
import { showToast, showConfirm, escapeHtml, withLoading } from './ui.js';

export async function loadOptimizer() {
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

export async function createRule(btn) {
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

export async function toggleRule(id, enabled) {
  try {
    await fetch(`${API}/api/optimizer/rules/${id}`, {
      method: 'PUT', headers: headers(),
      body: JSON.stringify({ enabled }),
    });
    loadRules();
  } catch (e) { console.error(e); }
}

export async function removeRule(id) {
  if (!await showConfirm('Eliminar esta regla?')) return;
  try {
    await fetch(`${API}/api/optimizer/rules/${id}`, { method: 'DELETE', headers: headers() });
    showToast('Regla eliminada', 'success');
    loadRules();
  } catch (e) { console.error(e); }
}

export async function resolveRec(id, approved) {
  try {
    await fetch(`${API}/api/optimizer/recommendations/${id}/resolve`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ approved }),
    });
    showToast(approved ? 'Recomendacion aprobada' : 'Recomendacion rechazada', 'info');
    loadRecommendations();
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

export async function evaluateRules(btn) {
  await withLoading(btn, async () => {
    try {
      const res = await fetch(`${API}/api/optimizer/evaluate`, { method: 'POST', headers: headers() });
      const data = await res.json();
      showToast(`${data.triggered} reglas disparadas`, 'info');
      loadRecommendations();
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
  });
}
