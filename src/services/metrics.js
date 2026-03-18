const supabase = require('../db/supabase');
const config = require('../config');

let syncInterval = null;

/**
 * Sync de métricas desde Google Ads (últimos 90 días)
 */
async function syncFromGoogleAds() {
  let customer;
  try {
    const { GoogleAdsApi } = require('google-ads-api');
    const gads = config.googleAds;
    if (!gads.clientId || !gads.developerToken || !gads.refreshToken) {
      console.log('Google Ads not configured, skipping sync');
      return { synced: 0, error: null };
    }
    const client = new GoogleAdsApi({
      client_id: gads.clientId,
      client_secret: gads.clientSecret,
      developer_token: gads.developerToken,
    });
    customer = client.Customer({
      customer_id: gads.customerId,
      login_customer_id: gads.loginCustomerId,
      refresh_token: gads.refreshToken,
    });
  } catch (e) {
    return { synced: 0, error: e.message };
  }

  try {
    // Últimos 90 días de métricas por campaña por día
    const rows = await customer.query(`
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        campaign_budget.amount_micros,
        campaign.bidding_strategy_type,
        segments.date,
        metrics.impressions,
        metrics.clicks,
        metrics.conversions,
        metrics.cost_micros,
        metrics.average_cpc,
        metrics.ctr,
        metrics.conversions_from_interactions_rate,
        metrics.cost_per_conversion,
        metrics.conversions_value
      FROM campaign
      WHERE segments.date DURING LAST_90_DAYS
        AND campaign.status != 'REMOVED'
      ORDER BY segments.date DESC
    `);

    let synced = 0;
    for (const row of rows) {
      const record = {
        campaign_id: String(row.campaign.id),
        campaign_name: row.campaign.name,
        campaign_status: row.campaign.status,
        date: row.segments.date,
        impressions: row.metrics.impressions || 0,
        clicks: row.metrics.clicks || 0,
        conversions: row.metrics.conversions || 0,
        cost_micros: row.metrics.cost_micros || 0,
        cpc_micros: row.metrics.average_cpc || 0,
        ctr: row.metrics.ctr || 0,
        conversion_rate: row.metrics.conversions_from_interactions_rate || 0,
        cpa_micros: row.metrics.cost_per_conversion || 0,
        conversion_value_micros: Math.round((row.metrics.conversions_value || 0) * 1_000_000),
        synced_at: new Date().toISOString(),
      };

      // Calcular ROAS
      if (record.cost_micros > 0 && record.conversion_value_micros > 0) {
        record.roas = record.conversion_value_micros / record.cost_micros;
      }

      await supabase.from('adpilot_metrics').upsert(record, {
        onConflict: 'campaign_id,date',
      });
      synced++;
    }

    // Actualizar summaries
    await updateSummaries();

    // Generar alertas
    await generateAlerts();

    console.log(`Metrics sync complete: ${synced} rows`);
    return { synced, error: null };
  } catch (e) {
    console.error('Metrics sync failed:', e.message);
    return { synced: 0, error: e.message };
  }
}

/**
 * Actualiza resúmenes por campaña (7d y 30d)
 */
async function updateSummaries() {
  // Obtener campañas únicas
  const { data: campaigns } = await supabase
    .from('adpilot_metrics')
    .select('campaign_id, campaign_name, campaign_status')
    .order('date', { ascending: false });

  const unique = new Map();
  for (const c of campaigns || []) {
    if (!unique.has(c.campaign_id)) unique.set(c.campaign_id, c);
  }

  const today = new Date();
  const d7 = new Date(today); d7.setDate(d7.getDate() - 7);
  const d30 = new Date(today); d30.setDate(d30.getDate() - 30);

  for (const [campaignId, info] of unique) {
    const agg = (days) => supabase
      .from('adpilot_metrics')
      .select('cost_micros, clicks, impressions, conversions, cpa_micros, conversion_value_micros')
      .eq('campaign_id', campaignId)
      .gte('date', days.toISOString().split('T')[0]);

    const { data: d7Data } = await agg(d7);
    const { data: d30Data } = await agg(d30);

    const sum = (arr, key) => (arr || []).reduce((s, r) => s + (Number(r[key]) || 0), 0);
    const spend7 = sum(d7Data, 'cost_micros');
    const conv7 = sum(d7Data, 'conversions');
    const clicks7 = sum(d7Data, 'clicks');
    const imp7 = sum(d7Data, 'impressions');
    const val7 = sum(d7Data, 'conversion_value_micros');
    const spend30 = sum(d30Data, 'cost_micros');
    const conv30 = sum(d30Data, 'conversions');
    const clicks30 = sum(d30Data, 'clicks');
    const imp30 = sum(d30Data, 'impressions');
    const val30 = sum(d30Data, 'conversion_value_micros');

    await supabase.from('adpilot_campaign_summary').upsert({
      campaign_id: campaignId,
      campaign_name: info.campaign_name,
      campaign_status: info.campaign_status,
      spend_7d_micros: spend7,
      clicks_7d: clicks7,
      impressions_7d: imp7,
      conversions_7d: conv7,
      cpa_7d_micros: conv7 > 0 ? Math.round(spend7 / conv7) : 0,
      ctr_7d: imp7 > 0 ? clicks7 / imp7 : 0,
      roas_7d: spend7 > 0 ? val7 / spend7 : 0,
      spend_30d_micros: spend30,
      clicks_30d: clicks30,
      impressions_30d: imp30,
      conversions_30d: conv30,
      cpa_30d_micros: conv30 > 0 ? Math.round(spend30 / conv30) : 0,
      ctr_30d: imp30 > 0 ? clicks30 / imp30 : 0,
      roas_30d: spend30 > 0 ? val30 / spend30 : 0,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'campaign_id' });
  }
}

/**
 * Genera alertas automáticas
 */
async function generateAlerts() {
  const { data: summaries } = await supabase
    .from('adpilot_campaign_summary')
    .select('*')
    .eq('campaign_status', 'ENABLED');

  for (const s of summaries || []) {
    const alerts = [];

    // CPA subió más de 50% vs 30d
    if (s.cpa_7d_micros > 0 && s.cpa_30d_micros > 0) {
      const ratio = s.cpa_7d_micros / s.cpa_30d_micros;
      if (ratio > 1.5) alerts.push({ type: 'cpa_spike', message: `CPA subió ${Math.round((ratio - 1) * 100)}% vs últimos 30d`, severity: 'high' });
    }

    // CTR cayó más de 30%
    if (s.ctr_7d > 0 && s.ctr_30d > 0) {
      const ratio = s.ctr_7d / s.ctr_30d;
      if (ratio < 0.7) alerts.push({ type: 'ctr_drop', message: `CTR cayó ${Math.round((1 - ratio) * 100)}% vs últimos 30d`, severity: 'medium' });
    }

    // Sin conversiones en 7d pero con gasto
    if (s.spend_7d_micros > 0 && s.conversions_7d === 0) {
      alerts.push({ type: 'no_conversions', message: 'Sin conversiones en últimos 7 días con gasto activo', severity: 'high' });
    }

    // ROAS bajo (menor a 1)
    if (s.roas_7d > 0 && s.roas_7d < 1) {
      alerts.push({ type: 'low_roas', message: `ROAS de ${s.roas_7d.toFixed(2)} (bajo 1.0)`, severity: 'high' });
    }

    if (alerts.length > 0 || (s.alerts && s.alerts.length > 0)) {
      await supabase.from('adpilot_campaign_summary')
        .update({ alerts })
        .eq('campaign_id', s.campaign_id);
    }
  }
}

/**
 * Obtiene resúmenes de campañas
 */
async function getSummaries() {
  const { data, error } = await supabase
    .from('adpilot_campaign_summary')
    .select('*')
    .order('spend_7d_micros', { ascending: false });
  if (error) throw error;
  return data || [];
}

/**
 * Obtiene métricas diarias para una campaña (para gráficos)
 */
async function getDailyMetrics(campaignId, days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const { data, error } = await supabase
    .from('adpilot_metrics')
    .select('date, impressions, clicks, conversions, cost_micros, cpa_micros, ctr, roas')
    .eq('campaign_id', campaignId)
    .gte('date', since.toISOString().split('T')[0])
    .order('date', { ascending: true });
  if (error) throw error;
  return data || [];
}

/**
 * Obtiene métricas agregadas globales (todas las campañas)
 */
async function getGlobalMetrics(days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const { data, error } = await supabase
    .from('adpilot_metrics')
    .select('date, impressions, clicks, conversions, cost_micros')
    .gte('date', since.toISOString().split('T')[0])
    .order('date', { ascending: true });
  if (error) throw error;

  // Agregar por día
  const byDate = new Map();
  for (const row of data || []) {
    const existing = byDate.get(row.date) || { date: row.date, impressions: 0, clicks: 0, conversions: 0, cost_micros: 0 };
    existing.impressions += row.impressions || 0;
    existing.clicks += row.clicks || 0;
    existing.conversions += Number(row.conversions) || 0;
    existing.cost_micros += Number(row.cost_micros) || 0;
    byDate.set(row.date, existing);
  }

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Inicia sync periódico
 */
function startPeriodicSync(intervalMs = 3600_000) {
  if (syncInterval) clearInterval(syncInterval);
  console.log(`Metrics sync scheduled every ${intervalMs / 60000} minutes`);
  syncInterval = setInterval(() => syncFromGoogleAds(), intervalMs);
  // Sync inicial después de 10 segundos
  setTimeout(() => syncFromGoogleAds(), 10_000);
}

function stopPeriodicSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

module.exports = {
  syncFromGoogleAds, getSummaries, getDailyMetrics, getGlobalMetrics,
  startPeriodicSync, stopPeriodicSync, updateSummaries, generateAlerts,
};
