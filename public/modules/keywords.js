import { API, lastKeywordResults, setLastKeywordResults } from './state.js';
import { headers } from './api.js';
import { showToast, escapeHtml, withLoading } from './ui.js';

export async function searchKeywords(btn) {
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
      setLastKeywordResults(data);
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

export function toggleAllKeywords(master) {
  document.querySelectorAll('.kw-check').forEach(cb => cb.checked = master.checked);
}

export function copySelectedKeywords() {
  const checked = document.querySelectorAll('.kw-check:checked');
  if (!checked.length) { showToast('Selecciona al menos una keyword', 'error'); return; }
  const selected = Array.from(checked).map(cb => lastKeywordResults[cb.dataset.idx].keyword);
  navigator.clipboard.writeText(selected.join('\n'))
    .then(() => showToast(`${selected.length} keywords copiadas`, 'success'))
    .catch(() => showToast('No se pudo copiar al clipboard', 'error'));
}
