const { GoogleAdsApi } = require('google-ads-api');
const config = require('../config');
const supabase = require('../db/supabase');
const { decryptIfSensitive } = require('./settings-crypto');

// Cache per-user: Map<userId, { customer, customerId, cacheTime }>
const clientCache = new Map();
const CACHE_TTL = 300_000; // 5 min

/**
 * Obtiene credenciales de Google Ads para un usuario específico
 */
async function getGadsCreds(userId = null) {
  const cacheKey = userId || '__global__';
  const cached = clientCache.get(cacheKey);
  if (cached && Date.now() - cached.cacheTime < CACHE_TTL) {
    return { customer: cached.customer, customerId: cached.customerId };
  }

  let creds = { ...config.googleAds };

  // Intentar leer settings de la DB
  try {
    // Global settings first
    const { data: globalRows } = await supabase
      .from('adpilot_settings')
      .select('key, value')
      .is('user_id', null);
    const db = {};
    for (const row of globalRows || []) db[row.key] = decryptIfSensitive(row.key, row.value);

    // Per-user settings override
    if (userId) {
      const { data: userRows } = await supabase
        .from('adpilot_settings')
        .select('key, value')
        .eq('user_id', userId);
      for (const row of userRows || []) db[row.key] = decryptIfSensitive(row.key, row.value);
    }

    if (db.gads_client_id) creds.clientId = db.gads_client_id;
    if (db.gads_client_secret) creds.clientSecret = db.gads_client_secret;
    if (db.gads_dev_token) creds.developerToken = db.gads_dev_token;
    if (db.gads_refresh_token) creds.refreshToken = db.gads_refresh_token;
    if (db.gads_customer_id) creds.customerId = db.gads_customer_id;
    if (db.gads_login_customer_id) creds.loginCustomerId = db.gads_login_customer_id;
  } catch (e) {
    // Fallback a .env silenciosamente
  }

  if (!creds.clientId || !creds.developerToken || !creds.refreshToken) {
    throw new Error('Google Ads credentials not configured');
  }

  const client = new GoogleAdsApi({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    developer_token: creds.developerToken,
  });
  const customer = client.Customer({
    customer_id: creds.customerId,
    login_customer_id: creds.loginCustomerId,
    refresh_token: creds.refreshToken,
  });

  clientCache.set(cacheKey, { customer, customerId: creds.customerId, cacheTime: Date.now() });
  return { customer, customerId: creds.customerId };
}

async function getClient(userId = null) {
  const { customer } = await getGadsCreds(userId);
  return customer;
}

function invalidateClient(userId = null) {
  if (userId) {
    clientCache.delete(userId);
  } else {
    clientCache.clear();
  }
}

async function listCampaigns(userId = null) {
  const cust = await getClient(userId);
  const campaigns = await cust.query(`
    SELECT campaign.id, campaign.name, campaign.status,
           campaign_budget.amount_micros
    FROM campaign
    WHERE campaign.status != 'REMOVED'
    ORDER BY campaign.id DESC
    LIMIT 20
  `);
  return campaigns.map(c => ({
    id: c.campaign.id,
    name: c.campaign.name,
    status: c.campaign.status,
    budget_micros: c.campaign_budget?.amount_micros,
  }));
}

async function createCampaignFromDraft(draft, userId = null) {
  const cust = await getClient(userId);
  const results = { campaignId: null, adGroupIds: [], errors: [] };

  try {
    // 1. Crear campaign budget
    const budgetResult = await cust.campaignBudgets.create([{
      name: `${draft.campaign.name} Budget - ${Date.now()}`,
      amount_micros: draft.campaign.budget_micros,
      delivery_method: 'STANDARD',
    }]);
    const budgetResourceName = budgetResult.results[0].resource_name;

    // 2. Crear campaign
    const campaignData = {
      name: draft.campaign.name,
      campaign_budget: budgetResourceName,
      advertising_channel_type: draft.campaign.type,
      status: 'PAUSED',
    };

    if (draft.campaign.bidding_strategy === 'TARGET_CPA') {
      campaignData.target_cpa = { target_cpa_micros: draft.campaign.bidding_value_micros };
    } else if (draft.campaign.bidding_strategy === 'MAXIMIZE_CONVERSIONS') {
      campaignData.maximize_conversions = {};
    } else if (draft.campaign.bidding_strategy === 'MAXIMIZE_CLICKS') {
      campaignData.maximize_clicks = {};
    } else if (draft.campaign.bidding_strategy === 'TARGET_ROAS') {
      campaignData.target_roas = { target_roas: draft.campaign.bidding_value_micros / 1000000 };
    }

    if (draft.campaign.networks) {
      campaignData.network_settings = {
        target_google_search: draft.campaign.networks.search ?? true,
        target_content_network: draft.campaign.networks.display ?? false,
        target_search_network: draft.campaign.networks.partners ?? false,
      };
    }

    if (draft.campaign.start_date) {
      campaignData.start_date = draft.campaign.start_date.replace(/-/g, '');
    }

    const campaignResult = await cust.campaigns.create([campaignData]);
    const campaignResourceName = campaignResult.results[0].resource_name;
    results.campaignId = campaignResourceName.split('/').pop();

    // 3. Geo targeting
    if (draft.campaign.geo_targets?.length) {
      const geoTargets = draft.campaign.geo_targets.map(geo => ({
        campaign: campaignResourceName,
        geo_target_constant: `geoTargetConstants/${getGeoId(geo)}`,
      }));
      await cust.campaignCriteria.create(geoTargets);
    }

    // 4. Language targeting
    if (draft.campaign.languages?.length) {
      const langTargets = draft.campaign.languages.map(lang => ({
        campaign: campaignResourceName,
        language: `languageConstants/${getLangId(lang)}`,
      }));
      await cust.campaignCriteria.create(langTargets);
    }

    // 5. Ad groups + keywords + ads
    for (const ag of draft.ad_groups || []) {
      try {
        const agResult = await cust.adGroups.create([{
          name: ag.name,
          campaign: campaignResourceName,
          status: 'ENABLED',
          type: 'SEARCH_STANDARD',
        }]);
        const agResourceName = agResult.results[0].resource_name;
        results.adGroupIds.push(agResourceName.split('/').pop());

        if (ag.keywords?.length) {
          const keywords = ag.keywords.map(kw => ({
            ad_group: agResourceName,
            keyword: { text: kw.text, match_type: kw.match_type },
            status: 'ENABLED',
          }));
          await cust.adGroupCriteria.create(keywords);
        }

        if (ag.negative_keywords?.length) {
          const negKws = ag.negative_keywords.map(text => ({
            ad_group: agResourceName,
            keyword: { text, match_type: 'BROAD' },
            negative: true,
            status: 'ENABLED',
          }));
          await cust.adGroupCriteria.create(negKws);
        }

        for (const ad of ag.ads || []) {
          if (ad.type === 'RESPONSIVE_SEARCH_AD') {
            await cust.adGroupAds.create([{
              ad_group: agResourceName,
              ad: {
                responsive_search_ad: {
                  headlines: ad.headlines.map((h) => ({ text: h })),
                  descriptions: ad.descriptions.map(d => ({ text: d })),
                  path1: ad.path1 || '',
                  path2: ad.path2 || '',
                },
                final_urls: [ad.final_url],
              },
              status: 'ENABLED',
            }]);
          }
        }
      } catch (err) {
        results.errors.push({ adGroup: ag.name, error: err.message });
      }
    }
  } catch (err) {
    results.errors.push({ campaign: true, error: err.message });
  }

  return results;
}

async function removeCampaign(campaignId, userId = null) {
  const { customer, customerId } = await getGadsCreds(userId);
  await customer.campaigns.update([{
    resource_name: `customers/${customerId}/campaigns/${campaignId}`,
    status: 'REMOVED',
  }]);
}

// Geo ID lookup
function getGeoId(code) {
  const map = {
    AR: 2032, US: 2840, BR: 2076, MX: 2484, ES: 2724,
    CL: 2152, CO: 2170, PE: 2604, UY: 2858, GB: 2826,
    CA: 2124, DE: 2276, FR: 2250, IT: 2380, AU: 2036,
    NZ: 2554, JP: 2392, IN: 2356, ZA: 2710, PY: 2600,
    BO: 2068, EC: 2218, VE: 2862, CR: 2188, PA: 2591,
    GT: 2320, DO: 2214, HN: 2340, SV: 2222, NI: 2558,
    CU: 2192, PR: 2630, PT: 2620, IE: 2372, NL: 2528,
    BE: 2056, CH: 2756, AT: 2040, SE: 2752, NO: 2578,
    DK: 2208, FI: 2246, PL: 2616, CZ: 2203, RO: 2642,
    HU: 2348, GR: 2300, TR: 2792, IL: 2376, AE: 2784,
    SA: 2682, EG: 2818, KR: 2410, TW: 2158, SG: 2702,
    MY: 2458, TH: 2764, PH: 2608, ID: 2360, VN: 2704,
    CN: 2156, RU: 2643, UA: 2804, KE: 2404, NG: 2566,
  };
  const id = map[code.toUpperCase()];
  if (!id) throw new Error(`Geo code "${code}" not supported`);
  return id;
}

function getLangId(code) {
  const map = {
    es: 1003, en: 1000, pt: 1014, fr: 1002, de: 1001, it: 1004,
    ja: 1005, ko: 1012, zh: 1017, nl: 1010, ru: 1031, ar: 1019,
    hi: 1023, pl: 1030, tr: 1037, sv: 1015, da: 1009, no: 1013,
    fi: 1011, cs: 1021, hu: 1024, ro: 1032, el: 1022, he: 1027,
    th: 1044, vi: 1040, id: 1025, ms: 1102, tl: 1042,
  };
  const id = map[code.toLowerCase()];
  if (!id) throw new Error(`Language code "${code}" not supported`);
  return id;
}

async function keywordIdeas({ keywords = [], url = null, geo = 'AR', language = 'es' }, userId = null) {
  if (!keywords.length && !url) {
    throw new Error('Se requiere al menos keywords o url');
  }

  const { customer, customerId } = await getGadsCreds(userId);

  const request = {
    customer_id: customerId,
    language: `languageConstants/${getLangId(language)}`,
    geo_target_constants: [`geoTargetConstants/${getGeoId(geo)}`],
    keyword_plan_network: 'GOOGLE_SEARCH',
  };
  if (keywords.length) request.keyword_seed = { keywords };
  if (url) request.url_seed = { url };

  const response = await customer.keywordPlanIdeas.generateKeywordIdeas(request);

  return (response || []).map(r => ({
    keyword: r.text,
    avg_monthly_searches: Number(r.keyword_idea_metrics?.avg_monthly_searches) || 0,
    competition: r.keyword_idea_metrics?.competition || 'UNSPECIFIED',
    competition_index: Number(r.keyword_idea_metrics?.competition_index) || 0,
    low_cpc_micros: Number(r.keyword_idea_metrics?.low_top_of_page_bid_micros) || 0,
    high_cpc_micros: Number(r.keyword_idea_metrics?.high_top_of_page_bid_micros) || 0,
  }));
}

module.exports = { listCampaigns, createCampaignFromDraft, removeCampaign, invalidateClient, keywordIdeas };
