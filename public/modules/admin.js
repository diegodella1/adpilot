import { API } from './state.js';
import { headers } from './api.js';
import { showToast, escapeHtml, withLoading } from './ui.js';
import { isAdmin } from './auth.js';

export async function loadSettings() {
  const platformSection = document.getElementById('admin-platform-section');
  if (platformSection) {
    platformSection.style.display = isAdmin() ? 'block' : 'none';
  }

  try {
    const res = await fetch(`${API}/api/admin/settings`, { headers: headers() });
    const s = await res.json();

    document.getElementById('s-gads-client-id').value = s.gads_client_id || '';
    document.getElementById('s-gads-client-secret').value = s.gads_client_secret || '';
    document.getElementById('s-gads-dev-token').value = s.gads_dev_token || '';
    document.getElementById('s-gads-refresh-token').value = s.gads_refresh_token || '';
    document.getElementById('s-gads-customer-id').value = s.gads_customer_id || '';
    document.getElementById('s-gads-login-customer-id').value = s.gads_login_customer_id || '';
    document.getElementById('s-business-context').value = s.business_context || '';

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

export async function saveGoogleAds(btn) {
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

export async function saveBusinessContext(btn) {
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

export async function saveLLMSettings(btn) {
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

export async function saveMasterPrompt(btn) {
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

export async function createUser(btn) {
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

export async function toggleUserEnabled(id, enabled) {
  try {
    await fetch(`${API}/api/admin/users/${id}`, {
      method: 'PUT', headers: headers(),
      body: JSON.stringify({ enabled }),
    });
    loadUsers();
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

export async function updateUserLimit(id, limit) {
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
