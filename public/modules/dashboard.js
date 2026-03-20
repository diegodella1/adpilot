import { API, globalChart, setGlobalChart } from './state.js';
import { headers } from './api.js';
import { showToast, escapeHtml, withLoading } from './ui.js';

export async function loadDashboard() {
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

  setGlobalChart(new Chart(ctx, {
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
  }));
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

export async function syncMetrics(btn) {
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
