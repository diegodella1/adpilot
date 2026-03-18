const { GoogleAdsApi } = require('google-ads-api');
const config = require('../config');

let client = null;
let customer = null;

function getClient() {
  if (!client) {
    client = new GoogleAdsApi({
      client_id: config.googleAds.clientId,
      client_secret: config.googleAds.clientSecret,
      developer_token: config.googleAds.developerToken,
    });
    customer = client.Customer({
      customer_id: config.googleAds.customerId,
      login_customer_id: config.googleAds.loginCustomerId,
      refresh_token: config.googleAds.refreshToken,
    });
  }
  return customer;
}

/**
 * Test de conexión: lista campañas existentes
 */
async function listCampaigns() {
  const cust = getClient();
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

/**
 * Crea una campaña completa a partir del draft JSON del LLM
 */
async function createCampaignFromDraft(draft) {
  const cust = getClient();
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
      status: 'PAUSED', // siempre crear pausada para revisión
    };

    // Bidding strategy
    if (draft.campaign.bidding_strategy === 'TARGET_CPA') {
      campaignData.target_cpa = { target_cpa_micros: draft.campaign.bidding_value_micros };
    } else if (draft.campaign.bidding_strategy === 'MAXIMIZE_CONVERSIONS') {
      campaignData.maximize_conversions = {};
    } else if (draft.campaign.bidding_strategy === 'MAXIMIZE_CLICKS') {
      campaignData.maximize_clicks = {};
    } else if (draft.campaign.bidding_strategy === 'TARGET_ROAS') {
      campaignData.target_roas = { target_roas: draft.campaign.bidding_value_micros / 1000000 };
    }

    // Network settings (Search)
    if (draft.campaign.networks) {
      campaignData.network_settings = {
        target_google_search: draft.campaign.networks.search ?? true,
        target_content_network: draft.campaign.networks.display ?? false,
        target_search_network: draft.campaign.networks.partners ?? false,
      };
    }

    // Start date
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

        // Keywords
        if (ag.keywords?.length) {
          const keywords = ag.keywords.map(kw => ({
            ad_group: agResourceName,
            keyword: { text: kw.text, match_type: kw.match_type },
            status: 'ENABLED',
          }));
          await cust.adGroupCriteria.create(keywords);
        }

        // Negative keywords
        if (ag.negative_keywords?.length) {
          const negKws = ag.negative_keywords.map(text => ({
            ad_group: agResourceName,
            keyword: { text, match_type: 'BROAD' },
            negative: true,
            status: 'ENABLED',
          }));
          await cust.adGroupCriteria.create(negKws);
        }

        // Responsive Search Ads
        for (const ad of ag.ads || []) {
          if (ad.type === 'RESPONSIVE_SEARCH_AD') {
            await cust.adGroupAds.create([{
              ad_group: agResourceName,
              ad: {
                responsive_search_ad: {
                  headlines: ad.headlines.map((h, i) => ({
                    text: h,
                    pinned_field: i < 3 ? undefined : undefined, // no pinning by default
                  })),
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

// Geo ID lookup (principales)
function getGeoId(code) {
  const map = {
    AR: 2032, US: 2840, BR: 2076, MX: 2484, ES: 2724,
    CL: 2152, CO: 2170, PE: 2604, UY: 2858, GB: 2826,
  };
  return map[code.toUpperCase()] || 2032;
}

// Language ID lookup
function getLangId(code) {
  const map = {
    es: 1003, en: 1000, pt: 1014, fr: 1002, de: 1001, it: 1004,
  };
  return map[code.toLowerCase()] || 1003;
}

module.exports = { listCampaigns, createCampaignFromDraft };
