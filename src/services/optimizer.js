const supabase = require('../db/supabase');
const knowledge = require('./knowledge');
const googleAds = require('./google-ads');

async function evaluateRules(userId) {
  let rulesQuery = supabase
    .from('adpilot_rules')
    .select('*')
    .eq('enabled', true);
  if (userId) rulesQuery = rulesQuery.eq('user_id', userId);
  const { data: rules } = await rulesQuery;

  let summariesQuery = supabase
    .from('adpilot_campaign_summary')
    .select('*');
  if (userId) summariesQuery = summariesQuery.eq('user_id', userId);
  const { data: summaries } = await summariesQuery;

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
          user_id: userId,
        };

        const since = new Date(); since.setHours(since.getHours() - 24);
        let existsQuery = supabase
          .from('adpilot_optimization_logs')
          .select('id')
          .eq('rule_id', rule.id)
          .eq('campaign_id', summary.campaign_id)
          .gte('created_at', since.toISOString())
          .limit(1);
        if (userId) existsQuery = existsQuery.eq('user_id', userId);
        const { data: existing } = await existsQuery;

        if (!existing?.length) {
          const { data } = await supabase
            .from('adpilot_optimization_logs')
            .insert(rec)
            .select('*')
            .single();
          triggered.push(data);

          if (rule.auto_execute) {
            await executeOptimization(data.id, userId);
          }
        }
      }
    }

    if (triggered.length > 0) {
      await supabase.from('adpilot_rules')
        .update({ last_triggered_at: new Date().toISOString() })
        .eq('id', rule.id);
    }
  }

  return triggered;
}

function evaluateCondition(condition, summary) {
  const metric = condition.metric;
  const operator = condition.operator;
  const threshold = condition.value;
  const scope = condition.scope || 'campaign';

  if (scope === 'campaign' && summary.campaign_status !== 'ENABLED') return false;

  const value = Number(summary[metric]);
  if (isNaN(value)) return false;

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

async function executeOptimization(logId, userId = null) {
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
    const { customer, customerId } = await googleAds.listCampaigns(userId)
      .then(() => require('./google-ads')) // just to validate connection
      .catch(() => { throw new Error('Google Ads not configured'); });

    // Get actual client for mutations
    const llm = require('./llm');
    const settings = await llm.getSettings(userId);
    const { GoogleAdsApi } = require('google-ads-api');

    const clientId = settings.gads_client_id || require('../config').googleAds.clientId;
    const clientSecret = settings.gads_client_secret || require('../config').googleAds.clientSecret;
    const devToken = settings.gads_dev_token || require('../config').googleAds.developerToken;
    const refreshToken = settings.gads_refresh_token || require('../config').googleAds.refreshToken;
    const custId = settings.gads_customer_id || require('../config').googleAds.customerId;
    const loginCustId = settings.gads_login_customer_id || require('../config').googleAds.loginCustomerId;

    if (!clientId || !devToken) throw new Error('Google Ads not configured');

    const gadsClient = new GoogleAdsApi({
      client_id: clientId,
      client_secret: clientSecret,
      developer_token: devToken,
    });
    const cust = gadsClient.Customer({
      customer_id: custId,
      login_customer_id: loginCustId,
      refresh_token: refreshToken,
    });

    switch (action.type) {
      case 'pause_campaign':
        await cust.campaigns.update([{
          resource_name: `customers/${custId}/campaigns/${log.campaign_id}`,
          status: 'PAUSED',
        }]);
        break;

      case 'enable_campaign':
        await cust.campaigns.update([{
          resource_name: `customers/${custId}/campaigns/${log.campaign_id}`,
          status: 'ENABLED',
        }]);
        break;

      case 'adjust_budget':
        if (action.params?.new_budget_micros) {
          const campaigns = await cust.query(`
            SELECT campaign.campaign_budget
            FROM campaign WHERE campaign.id = ${log.campaign_id}
          `);
          if (campaigns[0]) {
            await cust.campaignBudgets.update([{
              resource_name: campaigns[0].campaign.campaign_budget,
              amount_micros: action.params.new_budget_micros,
            }]);
          }
        }
        break;

      case 'pause_keyword':
        if (action.params?.keyword_id && action.params?.ad_group_id) {
          await cust.adGroupCriteria.update([{
            resource_name: `customers/${custId}/adGroupCriteria/${action.params.ad_group_id}~${action.params.keyword_id}`,
            status: 'PAUSED',
          }]);
        } else {
          throw new Error('pause_keyword requires keyword_id and ad_group_id in action params');
        }
        break;

      case 'enable_keyword':
        if (action.params?.keyword_id && action.params?.ad_group_id) {
          await cust.adGroupCriteria.update([{
            resource_name: `customers/${custId}/adGroupCriteria/${action.params.ad_group_id}~${action.params.keyword_id}`,
            status: 'ENABLED',
          }]);
        } else {
          throw new Error('enable_keyword requires keyword_id and ad_group_id in action params');
        }
        break;

      case 'alert':
        break;

      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }

    await supabase.from('adpilot_optimization_logs')
      .update({ status: 'executed' })
      .eq('id', logId);

    await knowledge.add({
      category: 'optimization',
      title: `Optimización ejecutada: ${action.type} en "${log.campaign_name}"`,
      content: log.recommendation,
      metadata: { log_id: logId, campaign_id: log.campaign_id },
      userId,
    }).catch(() => {});

    return { success: true };
  } catch (e) {
    await supabase.from('adpilot_optimization_logs')
      .update({ status: 'failed', payload: { ...log.payload, error: e.message } })
      .eq('id', logId);
    return { success: false, error: e.message };
  }
}

async function llmAnalysis(campaignId, userId = null) {
  let summaryQuery = supabase
    .from('adpilot_campaign_summary')
    .select('*')
    .eq('campaign_id', campaignId);
  if (userId) summaryQuery = summaryQuery.eq('user_id', userId);
  const { data: summary } = await summaryQuery.single();

  if (!summary) throw new Error('Campaign summary not found');

  let dailyQuery = supabase
    .from('adpilot_metrics')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('date', { ascending: false })
    .limit(14);
  if (userId) dailyQuery = dailyQuery.eq('user_id', userId);
  const { data: daily } = await dailyQuery;

  let ragContext = [];
  try {
    ragContext = await knowledge.search(
      `optimización ${summary.campaign_name} CPA CTR ROAS`,
      { count: 3, userId }
    );
  } catch (e) {}

  return buildAnalysisPrompt(summary, daily || [], ragContext);
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

async function getPendingRecommendations(userId = null) {
  let query = supabase
    .from('adpilot_optimization_logs')
    .select('*')
    .in('status', ['pending', 'pending_execution'])
    .order('created_at', { ascending: false });
  if (userId) query = query.eq('user_id', userId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function resolveRecommendation(logId, approved, userId = null) {
  if (approved) {
    return executeOptimization(logId, userId);
  }
  await supabase.from('adpilot_optimization_logs')
    .update({ status: 'rejected' })
    .eq('id', logId);
  return { success: true };
}

async function listRules(userId = null) {
  let query = supabase.from('adpilot_rules').select('*').order('created_at');
  if (userId) query = query.eq('user_id', userId);
  const { data } = await query;
  return data || [];
}

async function createRule(rule, userId = null) {
  const record = { ...rule };
  if (userId) record.user_id = userId;
  const { data, error } = await supabase.from('adpilot_rules').insert(record).select('*').single();
  if (error) throw error;
  return data;
}

async function updateRule(id, updates, userId = null) {
  let query = supabase.from('adpilot_rules').update(updates).eq('id', id);
  if (userId) query = query.eq('user_id', userId);
  const { error } = await query;
  if (error) throw error;
}

async function deleteRule(id, userId = null) {
  let query = supabase.from('adpilot_rules').delete().eq('id', id);
  if (userId) query = query.eq('user_id', userId);
  const { error } = await query;
  if (error) throw error;
}

module.exports = {
  evaluateRules, executeOptimization, llmAnalysis,
  getPendingRecommendations, resolveRecommendation,
  listRules, createRule, updateRule, deleteRule,
};
