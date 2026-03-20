import { API, campaignsCache, activeCampaignId, setCampaignsCache, setActiveCampaignId } from './state.js';
import { headers } from './api.js';
import { showToast, escapeHtml } from './ui.js';

export async function loadCampaignsView() {
  const content = document.getElementById('campaigns-mgmt-content');
  const detail = document.getElementById('campaign-detail-panel');
  detail.style.display = 'none';
  content.innerHTML = '<p style="color:var(--text-dim);padding:20px">Cargando campanas...</p>';
  try {
    const res = await fetch(`${API}/api/campaigns`, { headers: headers() });
    if (!res.ok) {
      let msg = 'Error cargando campanas';
      try { const err = await res.json(); msg = err.error || msg; } catch {}
      throw new Error(msg);
    }
    setCampaignsCache(await res.json());
    renderCampaignsList();
  } catch (e) {
    content.innerHTML = `<div class="glass-card">
      <p style="color:var(--text-secondary);margin-bottom:8px">${escapeHtml(e.message)}</p>
      <p style="color:var(--text-dim);font-size:13px">Verifica que las credenciales de Google Ads esten configuradas en Admin. Si no tenes campanas activas, crea una desde el Chat.</p>
    </div>`;
  }
}

function renderCampaignsList() {
  const content = document.getElementById('campaigns-mgmt-content');
  if (!campaignsCache.length) {
    content.innerHTML = '<div class="glass-card"><p style="color:var(--text-dim)">No hay campanas. Crea una desde el Chat.</p></div>';
    return;
  }
  const micro = v => `$${(Number(v || 0) / 1_000_000).toFixed(2)}`;
  content.innerHTML = `
    <div class="campaigns-list">
      ${campaignsCache.map(c => `
        <div class="campaign-row glass-card" onclick="openCampaignDetail('${c.id}')">
          <div class="campaign-row-info">
            <div class="campaign-row-name">${escapeHtml(c.name)}</div>
            <div class="campaign-row-meta">
              <span class="campaign-status-badge campaign-status-${(c.status||'').toLowerCase()}">${c.status}</span>
              <span style="color:var(--text-dim);font-size:12px">Budget: ${micro(c.budget_micros)}/dia</span>
              <span style="color:var(--text-dim);font-size:12px">ID: ${c.id}</span>
            </div>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" stroke-width="2" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
      `).join('')}
    </div>`;
}

export async function openCampaignDetail(campaignId) {
  setActiveCampaignId(campaignId);
  const content = document.getElementById('campaigns-mgmt-content');
  const detail = document.getElementById('campaign-detail-panel');
  content.style.display = 'none';
  detail.style.display = 'block';
  detail.innerHTML = '<p style="color:var(--text-dim);padding:20px">Cargando detalle...</p>';

  try {
    const [detailRes, agRes] = await Promise.all([
      fetch(`${API}/api/campaigns/${campaignId}`, { headers: headers() }),
      fetch(`${API}/api/campaigns/${campaignId}/ad-groups`, { headers: headers() }),
    ]);
    const campaign = await detailRes.json();
    const adGroups = await agRes.json();

    const micro = v => `$${(Number(v || 0) / 1_000_000).toFixed(2)}`;

    detail.innerHTML = `
      <div style="margin-bottom:16px">
        <button class="btn-ghost" onclick="backToCampaignsList()" style="margin-bottom:12px">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          Volver a campanas
        </button>
        <div class="panel-header" style="margin-bottom:0">
          <div>
            <h2>${escapeHtml(campaign.name)}</h2>
            <p class="panel-subtitle">ID: ${campaign.id}</p>
          </div>
          <div class="panel-actions" style="gap:8px">
            <span class="campaign-status-badge campaign-status-${(campaign.status||'').toLowerCase()}">${campaign.status}</span>
            ${campaign.status === 'ENABLED' ?
              `<button class="btn-secondary" onclick="toggleCampaignStatus('${campaignId}','PAUSED')">Pausar</button>` :
              `<button class="btn-primary" onclick="toggleCampaignStatus('${campaignId}','ENABLED')">Activar</button>`
            }
          </div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;margin-bottom:16px">
        <div class="glass-card">
          <h3 style="margin-bottom:10px;font-size:14px">Budget diario</h3>
          <div style="display:flex;gap:8px;align-items:center">
            <input type="number" id="edit-budget" value="${Math.round((campaign.budget_micros || 0) / 1_000_000)}" min="1" max="500"
              style="flex:1;padding:8px 12px;background:var(--surface2);border:1px solid var(--border-strong);border-radius:var(--radius-sm);color:var(--text);font-family:inherit;font-size:14px">
            <span style="color:var(--text-dim)">USD/dia</span>
            <button class="btn-primary" style="padding:8px 16px" onclick="saveCampaignBudget('${campaignId}')">Guardar</button>
          </div>
        </div>

        <div class="glass-card">
          <h3 style="margin-bottom:10px;font-size:14px">Bidding strategy</h3>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <select id="edit-bidding" style="flex:1;padding:8px 12px;background:var(--surface2);border:1px solid var(--border-strong);border-radius:var(--radius-sm);color:var(--text);font-family:inherit;font-size:13px">
              <option value="MAXIMIZE_CLICKS" ${campaign.bidding_strategy_type === 2 ? 'selected' : ''}>Maximize Clicks</option>
              <option value="MAXIMIZE_CONVERSIONS" ${campaign.bidding_strategy_type === 10 ? 'selected' : ''}>Maximize Conversions</option>
              <option value="TARGET_CPA" ${campaign.bidding_strategy_type === 6 ? 'selected' : ''}>Target CPA</option>
              <option value="TARGET_ROAS" ${campaign.bidding_strategy_type === 11 ? 'selected' : ''}>Target ROAS</option>
            </select>
            <input type="number" id="edit-bidding-value" value="${Math.round((campaign.target_cpa_micros || 0) / 1_000_000)}" min="0"
              placeholder="Valor" style="width:80px;padding:8px;background:var(--surface2);border:1px solid var(--border-strong);border-radius:var(--radius-sm);color:var(--text);font-family:inherit;font-size:13px">
            <button class="btn-primary" style="padding:8px 16px" onclick="saveCampaignBidding('${campaignId}')">Guardar</button>
          </div>
        </div>
      </div>

      <div class="glass-card" style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <h3 style="margin-bottom:0;font-size:14px">Geo Targets (${campaign.geo_targets?.length || 0})</h3>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">
          ${(campaign.geo_targets || []).map(g => `
            <span class="landing-feature-tag" style="font-size:11px">${g.geo_target_constant || g.criterion_id}</span>
          `).join('') || '<span style="color:var(--text-dim);font-size:13px">Sin geo targets</span>'}
        </div>
        <details>
          <summary class="details-trigger" style="font-size:13px">Editar geo targets</summary>
          <div class="details-body">
            <div style="display:flex;gap:8px;margin-bottom:8px">
              <input type="text" id="geo-search-input" placeholder="Buscar ciudad (ej: miami)" style="flex:1;padding:8px 12px;background:var(--surface2);border:1px solid var(--border-strong);border-radius:var(--radius-sm);color:var(--text);font-family:inherit;font-size:13px">
              <button class="btn-secondary" onclick="searchGeoLocations()">Buscar</button>
            </div>
            <div id="geo-search-results"></div>
            <div style="margin-top:8px">
              <label style="font-size:12px;color:var(--text-dim)">IDs de ubicacion (separados por coma)</label>
              <div style="display:flex;gap:8px;margin-top:4px">
                <input type="text" id="geo-targets-input" placeholder="2840, 1023191, 1016367"
                  value="${(campaign.geo_targets || []).map(g => g.criterion_id).join(', ')}"
                  style="flex:1;padding:8px 12px;background:var(--surface2);border:1px solid var(--border-strong);border-radius:var(--radius-sm);color:var(--text);font-family:inherit;font-size:13px">
                <button class="btn-primary" style="padding:8px 16px" onclick="saveCampaignGeoTargets('${campaignId}')">Aplicar</button>
              </div>
            </div>
          </div>
        </details>
      </div>

      <div class="glass-card" style="margin-bottom:12px">
        <details>
          <summary class="details-trigger" style="font-size:14px;font-weight:600">UTM Tracking</summary>
          <div class="details-body">
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-bottom:8px">
              <input type="text" id="utm-source" placeholder="source (google)" style="padding:8px;background:var(--surface2);border:1px solid var(--border-strong);border-radius:var(--radius-sm);color:var(--text);font-family:inherit;font-size:13px">
              <input type="text" id="utm-medium" placeholder="medium (cpc)" style="padding:8px;background:var(--surface2);border:1px solid var(--border-strong);border-radius:var(--radius-sm);color:var(--text);font-family:inherit;font-size:13px">
              <input type="text" id="utm-campaign" placeholder="campaign" style="padding:8px;background:var(--surface2);border:1px solid var(--border-strong);border-radius:var(--radius-sm);color:var(--text);font-family:inherit;font-size:13px">
              <input type="text" id="utm-content" placeholder="content" style="padding:8px;background:var(--surface2);border:1px solid var(--border-strong);border-radius:var(--radius-sm);color:var(--text);font-family:inherit;font-size:13px">
              <input type="text" id="utm-term" placeholder="term ({keyword})" style="padding:8px;background:var(--surface2);border:1px solid var(--border-strong);border-radius:var(--radius-sm);color:var(--text);font-family:inherit;font-size:13px">
            </div>
            <button class="btn-primary" onclick="applyCampaignUtm('${campaignId}')">Aplicar UTMs a todos los ads</button>
            <p style="color:var(--text-dim);font-size:11px;margin-top:6px">Nota: Los ads RSA son inmutables. Se crean ads nuevos con las URLs actualizadas y se pausan los anteriores.</p>
          </div>
        </details>
      </div>

      <div class="glass-card" style="margin-bottom:12px">
        <details>
          <summary class="details-trigger" style="font-size:14px;font-weight:600">Device Bid Adjustments</summary>
          <div class="details-body" id="device-bids-section">
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:8px">
              <div>
                <label style="font-size:12px;color:var(--text-dim)">Desktop</label>
                <input type="number" id="device-desktop" value="1.0" step="0.1" min="0" max="5" style="width:100%;padding:8px;background:var(--surface2);border:1px solid var(--border-strong);border-radius:var(--radius-sm);color:var(--text);font-family:inherit;font-size:13px">
              </div>
              <div>
                <label style="font-size:12px;color:var(--text-dim)">Mobile</label>
                <input type="number" id="device-mobile" value="1.0" step="0.1" min="0" max="5" style="width:100%;padding:8px;background:var(--surface2);border:1px solid var(--border-strong);border-radius:var(--radius-sm);color:var(--text);font-family:inherit;font-size:13px">
              </div>
              <div>
                <label style="font-size:12px;color:var(--text-dim)">Tablet</label>
                <input type="number" id="device-tablet" value="1.0" step="0.1" min="0" max="5" style="width:100%;padding:8px;background:var(--surface2);border:1px solid var(--border-strong);border-radius:var(--radius-sm);color:var(--text);font-family:inherit;font-size:13px">
              </div>
            </div>
            <p style="color:var(--text-dim);font-size:11px;margin-bottom:8px">1.0 = sin cambio, 0.8 = -20%, 1.3 = +30%, 0 = excluir</p>
            <button class="btn-primary" onclick="saveDeviceBids('${campaignId}')">Guardar device bids</button>
          </div>
        </details>
      </div>

      <div class="glass-card">
        <h3 style="margin-bottom:12px;font-size:14px">Ad Groups (${adGroups.length})</h3>
        <div id="ad-groups-list">
          ${adGroups.map(ag => `
            <div class="ag-row">
              <div class="ag-row-header" onclick="toggleAdGroupDetail(this, '${campaignId}', '${ag.id}')">
                <div>
                  <span style="font-weight:500">${escapeHtml(ag.name)}</span>
                  <span class="campaign-status-badge campaign-status-${(ag.status||'').toLowerCase()}" style="margin-left:8px;font-size:10px">${ag.status}</span>
                </div>
                <div style="display:flex;align-items:center;gap:8px">
                  ${ag.status === 'ENABLED' ?
                    `<button class="btn-ghost" style="font-size:11px;padding:4px 10px" onclick="event.stopPropagation();toggleAdGroupStatus('${campaignId}','${ag.id}','PAUSED')">Pausar</button>` :
                    `<button class="btn-ghost" style="font-size:11px;padding:4px 10px" onclick="event.stopPropagation();toggleAdGroupStatus('${campaignId}','${ag.id}','ENABLED')">Activar</button>`
                  }
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" stroke-width="2" stroke-linecap="round" class="ag-chevron"><polyline points="6 9 12 15 18 9"/></svg>
                </div>
              </div>
              <div class="ag-row-detail" style="display:none"></div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    loadDeviceBids(campaignId);
  } catch (e) {
    detail.innerHTML = `<div class="glass-card"><p style="color:var(--red)">Error: ${escapeHtml(e.message)}</p></div>`;
  }
}

export function backToCampaignsList() {
  document.getElementById('campaigns-mgmt-content').style.display = 'block';
  document.getElementById('campaign-detail-panel').style.display = 'none';
  setActiveCampaignId(null);
}

export async function toggleCampaignStatus(id, status) {
  try {
    const res = await fetch(`${API}/api/campaigns/${id}/status`, {
      method: 'PUT', headers: headers(), body: JSON.stringify({ status })
    });
    if (!res.ok) throw new Error('Error cambiando status');
    showToast(`Campana ${status === 'PAUSED' ? 'pausada' : 'activada'}`, 'success');
    openCampaignDetail(id);
  } catch (e) { showToast(e.message, 'error'); }
}

export async function saveCampaignBudget(id) {
  const val = Number(document.getElementById('edit-budget').value);
  if (!val || val <= 0) { showToast('Budget invalido', 'error'); return; }
  try {
    const res = await fetch(`${API}/api/campaigns/${id}/budget`, {
      method: 'PUT', headers: headers(), body: JSON.stringify({ budget_micros: val * 1_000_000 })
    });
    if (!res.ok) throw new Error('Error actualizando budget');
    showToast('Budget actualizado', 'success');
  } catch (e) { showToast(e.message, 'error'); }
}

export async function saveCampaignBidding(id) {
  const strategy = document.getElementById('edit-bidding').value;
  const val = Number(document.getElementById('edit-bidding-value').value);
  try {
    const res = await fetch(`${API}/api/campaigns/${id}/bidding`, {
      method: 'PUT', headers: headers(),
      body: JSON.stringify({ strategy, value_micros: val ? val * 1_000_000 : undefined })
    });
    if (!res.ok) throw new Error('Error actualizando bidding');
    showToast('Bidding actualizado', 'success');
  } catch (e) { showToast(e.message, 'error'); }
}

export async function searchGeoLocations() {
  const q = document.getElementById('geo-search-input').value.trim();
  if (!q) return;
  const results = document.getElementById('geo-search-results');
  results.innerHTML = '<p style="color:var(--text-dim);font-size:12px">Buscando...</p>';
  try {
    const res = await fetch(`${API}/api/locations/search?q=${encodeURIComponent(q)}`, { headers: headers() });
    const data = await res.json();
    results.innerHTML = data.length ? data.slice(0, 10).map(l => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);font-size:12px">
        <span style="color:var(--text-secondary)">${escapeHtml(l.canonical_name)} <span style="color:var(--text-dim)">(${l.target_type})</span></span>
        <button class="btn-ghost" style="font-size:11px;padding:2px 8px" onclick="addGeoId(${l.id})">+ ${l.id}</button>
      </div>
    `).join('') : '<p style="color:var(--text-dim);font-size:12px">Sin resultados</p>';
  } catch (e) { results.innerHTML = `<p style="color:var(--red);font-size:12px">${e.message}</p>`; }
}

export function addGeoId(id) {
  const input = document.getElementById('geo-targets-input');
  const current = input.value.split(',').map(s => s.trim()).filter(Boolean);
  if (!current.includes(String(id))) {
    current.push(String(id));
    input.value = current.join(', ');
  }
}

export async function saveCampaignGeoTargets(id) {
  const raw = document.getElementById('geo-targets-input').value;
  const targets = raw.split(',').map(s => s.trim()).filter(Boolean).map(s => {
    const n = Number(s);
    return isNaN(n) ? s : n;
  });
  if (!targets.length) { showToast('Agrega al menos un geo target', 'error'); return; }
  try {
    const res = await fetch(`${API}/api/campaigns/${id}/geo-targets`, {
      method: 'PUT', headers: headers(), body: JSON.stringify({ targets })
    });
    if (!res.ok) throw new Error('Error actualizando geo targets');
    showToast('Geo targets actualizados', 'success');
    openCampaignDetail(id);
  } catch (e) { showToast(e.message, 'error'); }
}

export async function applyCampaignUtm(id) {
  const params = {
    source: document.getElementById('utm-source').value.trim() || undefined,
    medium: document.getElementById('utm-medium').value.trim() || undefined,
    campaign: document.getElementById('utm-campaign').value.trim() || undefined,
    content: document.getElementById('utm-content').value.trim() || undefined,
    term: document.getElementById('utm-term').value.trim() || undefined,
  };
  Object.keys(params).forEach(k => !params[k] && delete params[k]);
  if (!Object.keys(params).length) { showToast('Completa al menos un campo UTM', 'error'); return; }
  try {
    const res = await fetch(`${API}/api/campaigns/${id}/utm`, {
      method: 'PUT', headers: headers(), body: JSON.stringify({ utm_params: params })
    });
    if (!res.ok) throw new Error('Error aplicando UTMs');
    const data = await res.json();
    showToast(`UTMs aplicados a ${data.updatedCount} ads`, 'success');
  } catch (e) { showToast(e.message, 'error'); }
}

async function loadDeviceBids(campaignId) {
  try {
    const res = await fetch(`${API}/api/campaigns/${campaignId}/devices`, { headers: headers() });
    if (res.ok) {
      const bids = await res.json();
      if (bids.desktop !== undefined) document.getElementById('device-desktop').value = bids.desktop;
      if (bids.mobile !== undefined) document.getElementById('device-mobile').value = bids.mobile;
      if (bids.tablet !== undefined) document.getElementById('device-tablet').value = bids.tablet;
    }
  } catch (e) {}
}

export async function saveDeviceBids(id) {
  const adjustments = {
    desktop: Number(document.getElementById('device-desktop').value),
    mobile: Number(document.getElementById('device-mobile').value),
    tablet: Number(document.getElementById('device-tablet').value),
  };
  try {
    const res = await fetch(`${API}/api/campaigns/${id}/devices`, {
      method: 'PUT', headers: headers(), body: JSON.stringify({ adjustments })
    });
    if (!res.ok) throw new Error('Error actualizando device bids');
    showToast('Device bids actualizados', 'success');
  } catch (e) { showToast(e.message, 'error'); }
}

export async function toggleAdGroupStatus(campaignId, agId, status) {
  try {
    const res = await fetch(`${API}/api/campaigns/${campaignId}/ad-groups/${agId}/status`, {
      method: 'PUT', headers: headers(), body: JSON.stringify({ status })
    });
    if (!res.ok) throw new Error('Error');
    showToast(`Ad group ${status === 'PAUSED' ? 'pausado' : 'activado'}`, 'success');
    openCampaignDetail(campaignId);
  } catch (e) { showToast(e.message, 'error'); }
}

export async function toggleAdGroupDetail(header, campaignId, agId) {
  const detail = header.nextElementSibling;
  const chevron = header.querySelector('.ag-chevron');
  if (detail.style.display !== 'none') {
    detail.style.display = 'none';
    chevron.style.transform = '';
    return;
  }
  chevron.style.transform = 'rotate(180deg)';
  detail.style.display = 'block';
  detail.innerHTML = '<p style="color:var(--text-dim);font-size:12px;padding:8px">Cargando...</p>';

  try {
    const [kwRes, adRes] = await Promise.all([
      fetch(`${API}/api/campaigns/${campaignId}/ad-groups/${agId}/keywords`, { headers: headers() }),
      fetch(`${API}/api/campaigns/${campaignId}/ad-groups/${agId}/ads`, { headers: headers() }),
    ]);
    const keywords = await kwRes.json();
    const ads = await adRes.json();

    detail.innerHTML = `
      <div style="padding:12px 0">
        <h4 style="font-size:13px;margin-bottom:8px;color:var(--text-secondary)">Keywords (${keywords.length})</h4>
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">
          ${keywords.map(kw => `
            <span class="kw-tag ${kw.negative ? 'kw-negative' : ''} kw-status-${(kw.status||'').toLowerCase()}">
              ${kw.negative ? '- ' : ''}${escapeHtml(kw.text || '')} <span style="opacity:0.6">[${kw.match_type}]</span>
              <button class="kw-remove" onclick="removeKeyword('${campaignId}','${agId}','${kw.criterion_id}')" title="Eliminar">&times;</button>
            </span>
          `).join('') || '<span style="color:var(--text-dim);font-size:12px">Sin keywords</span>'}
        </div>
        <details>
          <summary class="details-trigger" style="font-size:12px">+ Agregar keywords</summary>
          <div class="details-body">
            <div style="display:flex;gap:8px;margin-bottom:6px">
              <input type="text" id="new-kw-${agId}" placeholder="keyword (Enter para agregar)" style="flex:1;padding:6px 10px;background:var(--surface2);border:1px solid var(--border-strong);border-radius:var(--radius-sm);color:var(--text);font-family:inherit;font-size:12px"
                onkeydown="if(event.key==='Enter'){event.preventDefault();addKeywordToGroup('${campaignId}','${agId}')}">
              <select id="new-kw-match-${agId}" style="padding:6px;background:var(--surface2);border:1px solid var(--border-strong);border-radius:var(--radius-sm);color:var(--text);font-family:inherit;font-size:12px">
                <option value="BROAD">Broad</option>
                <option value="PHRASE">Phrase</option>
                <option value="EXACT">Exact</option>
              </select>
              <button class="btn-secondary" style="font-size:12px;padding:6px 12px" onclick="addKeywordToGroup('${campaignId}','${agId}')">Agregar</button>
            </div>
            <div style="display:flex;gap:8px">
              <input type="text" id="new-neg-kw-${agId}" placeholder="keyword negativa" style="flex:1;padding:6px 10px;background:var(--surface2);border:1px solid var(--border-strong);border-radius:var(--radius-sm);color:var(--text);font-family:inherit;font-size:12px"
                onkeydown="if(event.key==='Enter'){event.preventDefault();addNegKeyword('${campaignId}','${agId}')}">
              <button class="btn-secondary" style="font-size:12px;padding:6px 12px" onclick="addNegKeyword('${campaignId}','${agId}')">+ Negativa</button>
            </div>
          </div>
        </details>

        <h4 style="font-size:13px;margin:16px 0 8px;color:var(--text-secondary)">Ads (${ads.length})</h4>
        ${ads.map(ad => `
          <div class="ad-card">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
              <span class="campaign-status-badge campaign-status-${(ad.status||'').toLowerCase()}" style="font-size:10px">${ad.status}</span>
              ${ad.status === 'ENABLED' ?
                `<button class="btn-ghost" style="font-size:11px;padding:2px 8px" onclick="toggleAdStatus('${campaignId}','${agId}','${ad.ad_id}','PAUSED')">Pausar</button>` :
                ad.status === 'PAUSED' ?
                `<button class="btn-ghost" style="font-size:11px;padding:2px 8px" onclick="toggleAdStatus('${campaignId}','${agId}','${ad.ad_id}','ENABLED')">Activar</button>` : ''
              }
            </div>
            <div style="font-size:12px;color:var(--text)">
              ${(ad.headlines || []).map(h => `<div style="color:var(--accent);margin-bottom:2px">${escapeHtml(h)}</div>`).join('')}
              ${(ad.descriptions || []).map(d => `<div style="color:var(--text-secondary)">${escapeHtml(d)}</div>`).join('')}
            </div>
            ${ad.final_urls?.length ? `<div style="font-size:11px;color:var(--text-dim);margin-top:4px;word-break:break-all">${escapeHtml(ad.final_urls[0])}</div>` : ''}
          </div>
        `).join('') || '<p style="color:var(--text-dim);font-size:12px">Sin ads</p>'}
      </div>
    `;
  } catch (e) {
    detail.innerHTML = `<p style="color:var(--red);font-size:12px;padding:8px">${e.message}</p>`;
  }
}

export async function addKeywordToGroup(campaignId, agId) {
  const input = document.getElementById(`new-kw-${agId}`);
  const match = document.getElementById(`new-kw-match-${agId}`).value;
  const text = input.value.trim();
  if (!text) return;
  try {
    const res = await fetch(`${API}/api/campaigns/${campaignId}/ad-groups/${agId}/keywords`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ keywords: [{ text, match_type: match }] })
    });
    if (!res.ok) throw new Error('Error');
    input.value = '';
    showToast('Keyword agregada', 'success');
    const header = input.closest('.ag-row-detail').previousElementSibling;
    toggleAdGroupDetail(header, campaignId, agId);
    toggleAdGroupDetail(header, campaignId, agId);
  } catch (e) { showToast(e.message, 'error'); }
}

export async function addNegKeyword(campaignId, agId) {
  const input = document.getElementById(`new-neg-kw-${agId}`);
  const text = input.value.trim();
  if (!text) return;
  try {
    const res = await fetch(`${API}/api/campaigns/${campaignId}/ad-groups/${agId}/negative-keywords`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ keywords: [text] })
    });
    if (!res.ok) throw new Error('Error');
    input.value = '';
    showToast('Keyword negativa agregada', 'success');
    const header = input.closest('.ag-row-detail').previousElementSibling;
    toggleAdGroupDetail(header, campaignId, agId);
    toggleAdGroupDetail(header, campaignId, agId);
  } catch (e) { showToast(e.message, 'error'); }
}

export async function removeKeyword(campaignId, agId, kwId) {
  try {
    const res = await fetch(`${API}/api/campaigns/${campaignId}/ad-groups/${agId}/keywords/${kwId}`, {
      method: 'DELETE', headers: headers()
    });
    if (!res.ok) throw new Error('Error');
    showToast('Keyword eliminada', 'success');
    openCampaignDetail(campaignId);
  } catch (e) { showToast(e.message, 'error'); }
}

export async function toggleAdStatus(campaignId, agId, adId, status) {
  try {
    const res = await fetch(`${API}/api/campaigns/${campaignId}/ad-groups/${agId}/ads/${adId}/status`, {
      method: 'PUT', headers: headers(), body: JSON.stringify({ status })
    });
    if (!res.ok) throw new Error('Error');
    showToast(`Ad ${status === 'PAUSED' ? 'pausado' : 'activado'}`, 'success');
    openCampaignDetail(campaignId);
  } catch (e) { showToast(e.message, 'error'); }
}
