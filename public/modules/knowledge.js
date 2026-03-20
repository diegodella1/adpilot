import { API } from './state.js';
import { headers } from './api.js';
import { showToast, showConfirm, escapeHtml, withLoading } from './ui.js';

export async function loadKnowledge() {
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

export async function addKnowledge(btn) {
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

export async function deleteKnowledge(id) {
  if (!await showConfirm('Eliminar este conocimiento?')) return;
  try {
    await fetch(`${API}/api/knowledge/${id}`, { method: 'DELETE', headers: headers() });
    showToast('Conocimiento eliminado', 'success');
    loadKnowledge();
  } catch (e) { console.error(e); }
}
