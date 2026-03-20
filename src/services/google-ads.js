const { GoogleAdsApi } = require('google-ads-api');
const config = require('../config');
const supabase = require('../db/supabase');
const { decryptIfSensitive } = require('./settings-crypto');
const { withRetry } = require('../utils/retry');

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
    const budgetResult = await withRetry(() => cust.campaignBudgets.create([{
      name: `${draft.campaign.name} Budget - ${Date.now()}`,
      amount_micros: draft.campaign.budget_micros,
      delivery_method: 'STANDARD',
    }]), { maxRetries: 2, baseDelay: 2000 });
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

    const campaignResult = await withRetry(() => cust.campaigns.create([campaignData]), { maxRetries: 2, baseDelay: 2000 });
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

// Geo ID lookup — acepta country code string O location ID numérico (passthrough)
function getGeoId(code) {
  if (typeof code === 'number') return code;
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
  const id = map[String(code).toUpperCase()];
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

// --- Campaign details & mutation functions ---

async function getCampaignDetails(campaignId, userId = null) {
  const { customer, customerId } = await getGadsCreds(userId);
  const rows = await customer.query(`
    SELECT campaign.id, campaign.name, campaign.status,
           campaign.bidding_strategy_type,
           campaign.target_cpa.target_cpa_micros,
           campaign.maximize_conversions.target_cpa_micros,
           campaign.target_roas.target_roas,
           campaign_budget.amount_micros,
           campaign_budget.resource_name
    FROM campaign
    WHERE campaign.id = ${campaignId}
  `);
  if (!rows.length) throw new Error(`Campaign ${campaignId} not found`);
  const c = rows[0];

  // Fetch geo criteria
  const geoCriteria = await customer.query(`
    SELECT campaign_criterion.criterion_id,
           campaign_criterion.resource_name,
           campaign_criterion.geo_target_constant
    FROM campaign_criterion
    WHERE campaign_criterion.campaign = 'customers/${customerId}/campaigns/${campaignId}'
      AND campaign_criterion.type = 'LOCATION'
  `);

  return {
    id: c.campaign.id,
    name: c.campaign.name,
    status: c.campaign.status,
    bidding_strategy_type: c.campaign.bidding_strategy_type,
    target_cpa_micros: c.campaign.target_cpa?.target_cpa_micros || null,
    target_roas: c.campaign.target_roas?.target_roas || null,
    budget_micros: c.campaign_budget?.amount_micros,
    budget_resource_name: c.campaign_budget?.resource_name,
    geo_targets: geoCriteria.map(g => ({
      criterion_id: g.campaign_criterion.criterion_id,
      resource_name: g.campaign_criterion.resource_name,
      geo_target_constant: g.campaign_criterion.geo_target_constant,
    })),
  };
}

async function searchLocations(query, userId = null) {
  const cust = await getClient(userId);
  const results = await cust.geoTargetConstants.suggest({
    locale: 'en',
    country_code: '',
    location_names: { names: [query] },
  });
  return (results.geo_target_constant_suggestions || []).map(s => ({
    id: Number(s.geo_target_constant.resource_name.split('/').pop()),
    name: s.geo_target_constant.name,
    canonical_name: s.geo_target_constant.canonical_name,
    target_type: s.geo_target_constant.target_type,
  }));
}

async function updateCampaignGeoTargets(campaignId, locationIds, userId = null) {
  const { customer, customerId } = await getGadsCreds(userId);
  const campaignResource = `customers/${customerId}/campaigns/${campaignId}`;

  // Remove existing geo criteria
  const existing = await customer.query(`
    SELECT campaign_criterion.resource_name
    FROM campaign_criterion
    WHERE campaign_criterion.campaign = '${campaignResource}'
      AND campaign_criterion.type = 'LOCATION'
  `);
  if (existing.length) {
    await customer.campaignCriteria.remove(
      existing.map(e => e.campaign_criterion.resource_name)
    );
  }

  // Create new geo criteria
  if (locationIds.length) {
    const geoTargets = locationIds.map(id => ({
      campaign: campaignResource,
      geo_target_constant: `geoTargetConstants/${id}`,
    }));
    await customer.campaignCriteria.create(geoTargets);
  }
}

async function updateCampaignBudget(campaignId, budgetResourceName, newBudgetMicros, userId = null) {
  const cust = await getClient(userId);
  await cust.campaignBudgets.update([{
    resource_name: budgetResourceName,
    amount_micros: newBudgetMicros,
  }]);
}

async function updateCampaignBidding(campaignId, strategy, valueMicros, userId = null) {
  const { customer, customerId } = await getGadsCreds(userId);
  const update = {
    resource_name: `customers/${customerId}/campaigns/${campaignId}`,
  };

  // Clear existing strategy fields by setting the new one
  switch (strategy) {
    case 'TARGET_CPA':
      update.target_cpa = { target_cpa_micros: valueMicros };
      break;
    case 'MAXIMIZE_CONVERSIONS':
      update.maximize_conversions = {};
      break;
    case 'MAXIMIZE_CLICKS':
      update.maximize_clicks = {};
      break;
    case 'TARGET_ROAS':
      update.target_roas = { target_roas: valueMicros / 1_000_000 };
      break;
    default:
      throw new Error(`Unsupported bidding strategy: ${strategy}`);
  }

  await customer.campaigns.update([update]);
}

async function updateCampaignStatus(campaignId, status, userId = null) {
  const { customer, customerId } = await getGadsCreds(userId);
  await customer.campaigns.update([{
    resource_name: `customers/${customerId}/campaigns/${campaignId}`,
    status,
  }]);
}

async function updateAdGroupStatus(adGroupId, status, userId = null) {
  const { customer, customerId } = await getGadsCreds(userId);
  await customer.adGroups.update([{
    resource_name: `customers/${customerId}/adGroups/${adGroupId}`,
    status,
  }]);
}

async function updateAdStatus(adGroupAdResourceName, status, userId = null) {
  const cust = await getClient(userId);
  await cust.adGroupAds.update([{
    resource_name: adGroupAdResourceName,
    status,
  }]);
}

async function listAdGroups(campaignId, userId = null) {
  const { customer, customerId } = await getGadsCreds(userId);
  const rows = await customer.query(`
    SELECT ad_group.id, ad_group.name, ad_group.status, ad_group.type
    FROM ad_group
    WHERE ad_group.campaign = 'customers/${customerId}/campaigns/${campaignId}'
      AND ad_group.status != 'REMOVED'
  `);
  return rows.map(r => ({
    id: r.ad_group.id,
    name: r.ad_group.name,
    status: r.ad_group.status,
    type: r.ad_group.type,
  }));
}

async function listKeywords(adGroupId, userId = null) {
  const { customer, customerId } = await getGadsCreds(userId);
  const rows = await customer.query(`
    SELECT ad_group_criterion.criterion_id,
           ad_group_criterion.resource_name,
           ad_group_criterion.keyword.text,
           ad_group_criterion.keyword.match_type,
           ad_group_criterion.status,
           ad_group_criterion.negative
    FROM ad_group_criterion
    WHERE ad_group_criterion.ad_group = 'customers/${customerId}/adGroups/${adGroupId}'
      AND ad_group_criterion.type = 'KEYWORD'
      AND ad_group_criterion.status != 'REMOVED'
  `);
  return rows.map(r => ({
    criterion_id: r.ad_group_criterion.criterion_id,
    resource_name: r.ad_group_criterion.resource_name,
    text: r.ad_group_criterion.keyword?.text,
    match_type: r.ad_group_criterion.keyword?.match_type,
    status: r.ad_group_criterion.status,
    negative: r.ad_group_criterion.negative || false,
  }));
}

async function listAds(adGroupId, userId = null) {
  const { customer, customerId } = await getGadsCreds(userId);
  const rows = await customer.query(`
    SELECT ad_group_ad.resource_name,
           ad_group_ad.status,
           ad_group_ad.ad.id,
           ad_group_ad.ad.type,
           ad_group_ad.ad.responsive_search_ad.headlines,
           ad_group_ad.ad.responsive_search_ad.descriptions,
           ad_group_ad.ad.final_urls
    FROM ad_group_ad
    WHERE ad_group_ad.ad_group = 'customers/${customerId}/adGroups/${adGroupId}'
      AND ad_group_ad.status != 'REMOVED'
  `);
  return rows.map(r => ({
    resource_name: r.ad_group_ad.resource_name,
    status: r.ad_group_ad.status,
    ad_id: r.ad_group_ad.ad?.id,
    type: r.ad_group_ad.ad?.type,
    headlines: r.ad_group_ad.ad?.responsive_search_ad?.headlines?.map(h => h.text) || [],
    descriptions: r.ad_group_ad.ad?.responsive_search_ad?.descriptions?.map(d => d.text) || [],
    final_urls: r.ad_group_ad.ad?.final_urls || [],
  }));
}

async function addKeywordsToAdGroup(adGroupId, keywords, userId = null) {
  const { customer, customerId } = await getGadsCreds(userId);
  const adGroupResource = `customers/${customerId}/adGroups/${adGroupId}`;
  const kwData = keywords.map(kw => ({
    ad_group: adGroupResource,
    keyword: { text: kw.text, match_type: kw.match_type || 'BROAD' },
    negative: kw.negative || false,
    status: 'ENABLED',
  }));
  await customer.adGroupCriteria.create(kwData);
}

async function removeKeywords(criterionResourceNames, userId = null) {
  const cust = await getClient(userId);
  await cust.adGroupCriteria.remove(criterionResourceNames);
}

// --- Audience functions ---

async function searchAudienceSegments(query, userId = null) {
  const cust = await getClient(userId);
  const rows = await cust.query(`
    SELECT user_interest.user_interest_id,
           user_interest.name,
           user_interest.taxonomy_type
    FROM user_interest
    WHERE user_interest.name LIKE '%${query.replace(/'/g, "''")}%'
    LIMIT 50
  `);
  return rows.map(r => ({
    id: r.user_interest.user_interest_id,
    name: r.user_interest.name,
    taxonomy_type: r.user_interest.taxonomy_type,
  }));
}

async function addCampaignAudience(campaignId, { type, resourceName, bidModifier }, userId = null) {
  const { customer, customerId } = await getGadsCreds(userId);
  const criterion = {
    campaign: `customers/${customerId}/campaigns/${campaignId}`,
    user_interest: { user_interest_category: resourceName },
    bid_modifier: bidModifier || 1.0,
  };
  await customer.campaignCriteria.create([criterion]);
}

async function removeCampaignAudience(campaignId, criterionResourceName, userId = null) {
  const cust = await getClient(userId);
  await cust.campaignCriteria.remove([criterionResourceName]);
}

async function listCampaignAudiences(campaignId, userId = null) {
  const { customer, customerId } = await getGadsCreds(userId);
  const rows = await customer.query(`
    SELECT campaign_criterion.criterion_id,
           campaign_criterion.resource_name,
           campaign_criterion.bid_modifier,
           campaign_criterion.user_interest.user_interest_category
    FROM campaign_criterion
    WHERE campaign_criterion.campaign = 'customers/${customerId}/campaigns/${campaignId}'
      AND campaign_criterion.type = 'USER_INTEREST'
  `);
  return rows.map(r => ({
    criterion_id: r.campaign_criterion.criterion_id,
    resource_name: r.campaign_criterion.resource_name,
    bid_modifier: r.campaign_criterion.bid_modifier,
    user_interest: r.campaign_criterion.user_interest?.user_interest_category,
  }));
}

async function updateAudienceBidModifier(criterionResourceName, bidModifier, userId = null) {
  const cust = await getClient(userId);
  await cust.campaignCriteria.update([{
    resource_name: criterionResourceName,
    bid_modifier: bidModifier,
  }]);
}

async function createCustomAudience(name, urls, userId = null) {
  const cust = await getClient(userId);
  const result = await cust.customAudiences.create([{
    name,
    type: 'AUTO',
    members: urls.map(url => ({ member_type: 'URL', value: url })),
  }]);
  return result.results[0].resource_name;
}

// --- Device bid adjustments ---

// Fixed device criterion IDs in Google Ads
const DEVICE_CRITERIA = { desktop: 30000, mobile: 30001, tablet: 30002 };

async function setDeviceBidAdjustments(campaignId, adjustments, userId = null) {
  const { customer, customerId } = await getGadsCreds(userId);
  const campaignResource = `customers/${customerId}/campaigns/${campaignId}`;
  const operations = [];

  for (const [device, modifier] of Object.entries(adjustments)) {
    const criterionId = DEVICE_CRITERIA[device];
    if (!criterionId) continue;
    operations.push({
      resource_name: `${campaignResource}/campaignCriteria/${criterionId}`,
      device: { type: device.toUpperCase() },
      bid_modifier: modifier,
    });
  }

  if (operations.length) {
    await customer.campaignCriteria.update(operations);
  }
}

async function getDeviceBidAdjustments(campaignId, userId = null) {
  const { customer, customerId } = await getGadsCreds(userId);
  const rows = await customer.query(`
    SELECT campaign_criterion.criterion_id,
           campaign_criterion.device.type,
           campaign_criterion.bid_modifier
    FROM campaign_criterion
    WHERE campaign_criterion.campaign = 'customers/${customerId}/campaigns/${campaignId}'
      AND campaign_criterion.type = 'DEVICE'
  `);
  const result = {};
  for (const r of rows) {
    const type = (r.campaign_criterion.device?.type || '').toLowerCase();
    if (type) result[type] = r.campaign_criterion.bid_modifier;
  }
  return result;
}

// --- Remarketing lists ---

async function listRemarketingLists(userId = null) {
  const cust = await getClient(userId);
  const rows = await cust.query(`
    SELECT user_list.id, user_list.name, user_list.type,
           user_list.size_for_search, user_list.membership_status
    FROM user_list
    WHERE user_list.membership_status = 'OPEN'
  `);
  return rows.map(r => ({
    id: r.user_list.id,
    name: r.user_list.name,
    type: r.user_list.type,
    size_for_search: r.user_list.size_for_search,
  }));
}

async function addRemarketingList(campaignId, userListId, bidModifier, userId = null) {
  const { customer, customerId } = await getGadsCreds(userId);
  await customer.campaignCriteria.create([{
    campaign: `customers/${customerId}/campaigns/${campaignId}`,
    user_list: { user_list: `customers/${customerId}/userLists/${userListId}` },
    bid_modifier: bidModifier || 1.0,
  }]);
}

async function removeRemarketingList(campaignId, criterionResourceName, userId = null) {
  const cust = await getClient(userId);
  await cust.campaignCriteria.remove([criterionResourceName]);
}

// --- Ad creation (for UTM updates — RSA ads are immutable) ---

async function createAdInAdGroup(adGroupResourceName, ad, userId = null) {
  const cust = await getClient(userId);
  await cust.adGroupAds.create([{
    ad_group: adGroupResourceName,
    ad: {
      responsive_search_ad: {
        headlines: ad.headlines.map(h => ({ text: h })),
        descriptions: ad.descriptions.map(d => ({ text: d })),
        path1: ad.path1 || '',
        path2: ad.path2 || '',
      },
      final_urls: [ad.final_url],
    },
    status: 'ENABLED',
  }]);
}

module.exports = {
  getClient, getGadsCreds, getGeoId, getLangId, invalidateClient,
  listCampaigns, createCampaignFromDraft, removeCampaign, keywordIdeas,
  // Phase 1: Campaign management
  getCampaignDetails, searchLocations,
  updateCampaignGeoTargets, updateCampaignBudget, updateCampaignBidding,
  updateCampaignStatus, updateAdGroupStatus, updateAdStatus,
  listAdGroups, listKeywords, listAds,
  addKeywordsToAdGroup, removeKeywords,
  // Phase 3: Audiences
  searchAudienceSegments, addCampaignAudience, removeCampaignAudience,
  listCampaignAudiences, updateAudienceBidModifier, createCustomAudience,
  // Phase 4: Device bids
  setDeviceBidAdjustments, getDeviceBidAdjustments,
  // Phase 5: Remarketing
  listRemarketingLists, addRemarketingList, removeRemarketingList,
  // Ad creation (for UTM)
  createAdInAdGroup,
};
