import { loadConversations } from './chat.js';
import { loadDashboard } from './dashboard.js';
import { loadOptimizer } from './optimizer.js';
import { loadCampaignsView } from './campaigns.js';
import { loadKnowledge } from './knowledge.js';
import { loadSettings } from './admin.js';
import { renderDocs } from './docs.js';

export const ALL_VIEWS = ['chat', 'campaigns', 'dashboard', 'analyze', 'optimizer', 'logs', 'knowledge', 'keywords', 'admin', 'docs'];

export function showView(view) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById(`btn-${view}`);
  if (btn) btn.classList.add('active');

  for (const v of ALL_VIEWS) {
    const el = document.getElementById(`view-${v}`);
    if (el) el.style.display = v === view ? (v === 'chat' || v === 'analyze' ? 'flex' : 'block') : 'none';
  }

  const sidebar = document.getElementById('chat-sidebar');
  if (sidebar) sidebar.style.display = (view === 'chat') ? 'flex' : 'none';

  if (view === 'logs') loadLogs();
  if (view === 'knowledge') loadKnowledge();
  if (view === 'admin') loadSettings();
  if (view === 'dashboard') loadDashboard();
  if (view === 'optimizer') loadOptimizer();
  if (view === 'campaigns') loadCampaignsView();
  if (view === 'docs') renderDocs();
}

async function loadLogs() {
  const { headers } = await import('./api.js');
  const { escapeHtml, formatDate } = await import('./ui.js');
  const { API } = await import('./state.js');
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
