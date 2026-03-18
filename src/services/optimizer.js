const supabase = require('../db/supabase');
const config = require('../config');
const knowledge = require('./knowledge');

/**
 * Evalúa todas las reglas activas contra los summaries actuales
 */
async function evaluateRules() {
  const { data: rules } = await supabase
    .from('adpilot_rules')
    .select('*')
    .eq('enabled', true);

  const { data: summaries } = await supabase
    .from('adpilot_campaign_summary')
    .select('*');

  if (!rules?.length || !summaries?.length) return [];

  const triggered = [];

  for (const rule of rules) {
    const { condition, action } = rule;

    for (const summary of summaries) {
      if (evaluateCondition(condition, summary)) {
        const rec = {
          rule_id: rule.id,
          campaign_id: summary.campaign_id,
          campaign_name: summary.campaign_name,
          action: action.type,
          status: rule.auto_execute ? 'pending_execution' : 'pending',
          recommendation: formatRecommendation(rule, summary),
          payload: { rule, action, summary_snapshot: summarize(summary) },
        };

        // Evitar duplicados recientes (misma regla + campaña en últimas 24h)
        const since = new Date(); since.setHours(since.getHours() - 24);
        const { data: existing } = await supabase
          .from('adpilot_optimization_logs')
          .select('id')
          .eq('rule_id', rule.id)
          .eq('campaign_id', summary.campaign_id)
          .gte('created_at', since.toISOString())
          .limit(1);

        if (!existing?.length) {
          const { data } = await supabase
            .from('adpilot_optimization_logs')
            .insert(rec)
            .select('*')
            .single();
          triggered.push(data);

          // Auto-execute si está habilitado
          if (rule.auto_execute) {
            await executeOptimization(data.id);
          }
        }
      }
    }

    // Actualizar last_triggered
    if (triggered.length > 0) {
      await supabase.from('adpilot_rules')
        .update({ last_triggered_at: new Date().toISOString() })
        .eq('id', rule.id);
    }
  }

  return triggered;
}

/**
 * Evalúa una condición contra un summary de campaña
 */
function evaluateCondition(condition, summary) {
  const metric = condition.metric; // e.g. 'cpa_7d_micros', 'ctr_7d', 'roas_7d'
  const operator = condition.operator; // '>', '<', '>=', '<=', '=='
  const threshold = condition.value;
  const scope = condition.scope || 'campaign';

  // Solo evaluar campañas activas por default
  if (scope === 'campaign' && summary.campaign_status !== 'ENABLED') return false;

  const value = Number(summary[metric]);
  if (isNaN(value)) return false;

  // Para métricas en micros, el threshold viene en la unidad humana
  const isMicros = metric.includes('micros');
  const compareValue = isMicros ? value / 1_000_000 : value;

  switch (operator) {
    case '>': return compareValue > threshold;
    case '<': return compareValue < threshold;
    case '>=': return compareValue >= threshold;
    case '<=': return compareValue <= threshold;
    case '==': return compareValue === threshold;
    default: return false;
  }
}

/**
 * Genera un texto de recomendación legible
 */
function formatRecommendation(rule, summary) {
  const micro = (v) => `$${(v / 1_000_000).toFixed(2)}`;
  const s = summary;
  return `${rule.name}: Campaña "${s.campaign_name}" — ` +
    `Spend 7d: ${micro(s.spend_7d_micros)}, CPA 7d: ${micro(s.cpa_7d_micros)}, ` +
    `CTR 7d: ${(s.ctr_7d * 100).toFixed(2)}%, Conversiones 7d: ${s.conversions_7d}. ` +
    `Acción sugerida: ${rule.action.type}`;
}

function summarize(s) {
  return {
    spend_7d: s.spend_7d_micros / 1_000_000,
    cpa_7d: s.cpa_7d_micros / 1_000_000,
    ctr_7d: s.ctr_7d,
    conversions_7d: s.conversions_7d,
    roas_7d: s.roas_7d,
  };
}

/**
 * Ejecuta una optimización aprobada via Google Ads API
 */
async function executeOptimization(logId) {
  const { data: log } = await supabase
    .from('adpilot_optimization_logs')
    .select('*')
    .eq('id', logId)
    .single();

  if (!log) throw new Error('Optimization log not found');
  if (log.status !== 'pending' && log.status !== 'pending_execution') {
    throw new Error(`Cannot execute optimization in status "${log.status}"`);
  }

  const action = log.payload?.action;
  if (!action) throw new Error('No action in payload');

  try {
    const gads = config.googleAds;
    if (!gads.clientId || !gads.developerToken) {
      throw new Error('Google Ads not configured');
    }

    const { GoogleAdsApi } = require('google-ads-api');
    const client = new GoogleAdsApi({
      client_id: gads.clientId,
      client_secret: gads.clientSecret,
      developer_token: gads.developerToken,
    });
    const customer = client.Customer({
      customer_id: gads.customerId,
      login_customer_id: gads.loginCustomerId,
      refresh_token: gads.refreshToken,
    });

    switch (action.type) {
      case 'pause_campaign':
        await customer.campaigns.update([{
          resource_name: `customers/${gads.customerId}/campaigns/${log.campaign_id}`,
          status: 'PAUSED',
        }]);
        break;

      case 'enable_campaign':
        await customer.campaigns.update([{
          resource_name: `customers/${gads.customerId}/campaigns/${log.campaign_id}`,
          status: 'ENABLED',
        }]);
        break;

      case 'adjust_budget':
        if (action.params?.new_budget_micros) {
          // Buscar budget resource name
          const campaigns = await customer.query(`
            SELECT campaign.campaign_budget
            FROM campaign WHERE campaign.id = ${log.campaign_id}
          `);
          if (campaigns[0]) {
            await customer.campaignBudgets.update([{
              resource_name: campaigns[0].campaign.campaign_budget,
              amount_micros: action.params.new_budget_micros,
            }]);
          }
        }
        break;

      case 'alert':
        // Solo notificación, no ejecuta nada en Google Ads
        break;

      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }

    await supabase.from('adpilot_optimization_logs')
      .update({ status: 'executed' })
      .eq('id', logId);

    // Guardar en knowledge como aprendizaje
    await knowledge.add({
      category: 'optimization',
      title: `Optimización ejecutada: ${action.type} en "${log.campaign_name}"`,
      content: log.recommendation,
      metadata: { log_id: logId, campaign_id: log.campaign_id },
    }).catch(() => {});

    return { success: true };
  } catch (e) {
    await supabase.from('adpilot_optimization_logs')
      .update({ status: 'failed', payload: { ...log.payload, error: e.message } })
      .eq('id', logId);
    return { success: false, error: e.message };
  }
}

/**
 * Pide al LLM que analice las métricas y genere recomendaciones
 */
async function llmAnalysis(campaignId) {
  const { data: summary } = await supabase
    .from('adpilot_campaign_summary')
    .select('*')
    .eq('campaign_id', campaignId)
    .single();

  if (!summary) throw new Error('Campaign summary not found');

  const { data: daily } = await supabase
    .from('adpilot_metrics')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('date', { ascending: false })
    .limit(14);

  // Buscar conocimiento relevante
  let ragContext = [];
  try {
    ragContext = await knowledge.search(
      `optimización ${summary.campaign_name} CPA CTR ROAS`,
      { count: 3 }
    );
  } catch (e) {}

  const prompt = buildAnalysisPrompt(summary, daily || [], ragContext);
  return prompt;
}

function buildAnalysisPrompt(summary, daily, ragContext) {
  const micro = (v) => (v / 1_000_000).toFixed(2);
  let ctx = ragContext.map(k => `- ${k.title}: ${k.content}`).join('\n');

  return {
    summary: {
      campaign: summary.campaign_name,
      status: summary.campaign_status,
      spend_7d: `$${micro(summary.spend_7d_micros)}`,
      cpa_7d: `$${micro(summary.cpa_7d_micros)}`,
      ctr_7d: `${(summary.ctr_7d * 100).toFixed(2)}%`,
      conversions_7d: summary.conversions_7d,
      roas_7d: summary.roas_7d?.toFixed(2),
      spend_30d: `$${micro(summary.spend_30d_micros)}`,
      cpa_30d: `$${micro(summary.cpa_30d_micros)}`,
      ctr_30d: `${(summary.ctr_30d * 100).toFixed(2)}%`,
      conversions_30d: summary.conversions_30d,
      roas_30d: summary.roas_30d?.toFixed(2),
    },
    daily: daily.map(d => ({
      date: d.date,
      spend: `$${micro(d.cost_micros)}`,
      clicks: d.clicks,
      conversions: d.conversions,
      cpa: `$${micro(d.cpa_micros)}`,
    })),
    alerts: summary.alerts || [],
    context: ctx || 'Sin contexto previo',
  };
}

/**
 * Lista recomendaciones pendientes
 */
async function getPendingRecommendations() {
  const { data, error } = await supabase
    .from('adpilot_optimization_logs')
    .select('*')
    .in('status', ['pending', 'pending_execution'])
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

/**
 * Aprueba o rechaza una recomendación
 */
async function resolveRecommendation(logId, approved) {
  if (approved) {
    return executeOptimization(logId);
  }
  await supabase.from('adpilot_optimization_logs')
    .update({ status: 'rejected' })
    .eq('id', logId);
  return { success: true };
}

// CRUD de reglas
async function listRules() {
  const { data } = await supabase.from('adpilot_rules').select('*').order('created_at');
  return data || [];
}

async function createRule(rule) {
  const { data, error } = await supabase.from('adpilot_rules').insert(rule).select('*').single();
  if (error) throw error;
  return data;
}

async function updateRule(id, updates) {
  const { error } = await supabase.from('adpilot_rules').update(updates).eq('id', id);
  if (error) throw error;
}

async function deleteRule(id) {
  const { error } = await supabase.from('adpilot_rules').delete().eq('id', id);
  if (error) throw error;
}

module.exports = {
  evaluateRules, executeOptimization, llmAnalysis,
  getPendingRecommendations, resolveRecommendation,
  listRules, createRule, updateRule, deleteRule,
};
