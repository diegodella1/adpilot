const supabase = require('../db/supabase');
const googleAds = require('./google-ads');

// --- Logging helper ---

async function logAction(action, campaignId, payload, userId) {
  await supabase.from('adpilot_campaign_logs').insert({
    action,
    status: 'success',
    payload: { campaign_id: campaignId, ...payload },
    user_id: userId,
  }).catch(e => console.warn('Campaign log failed:', e.message));
}

// --- Phase 1: Geo, Budget, Bidding, Status, Keywords ---

async function updateGeoTargets(campaignId, targets, userId) {
  // targets: mixed array of country codes ("US") and location IDs (1023191)
  const locationIds = targets.map(t => googleAds.getGeoId(t));
  await googleAds.updateCampaignGeoTargets(campaignId, locationIds, userId);
  await logAction('update_geo_targets', campaignId, { targets, locationIds }, userId);
}

async function updateBudget(campaignId, budgetMicros, userId) {
  const details = await googleAds.getCampaignDetails(campaignId, userId);
  if (!details.budget_resource_name) throw new Error('Campaign budget not found');
  await googleAds.updateCampaignBudget(campaignId, details.budget_resource_name, budgetMicros, userId);
  await logAction('update_budget', campaignId, { budgetMicros }, userId);
}

async function updateBidding(campaignId, strategy, valueMicros, userId) {
  await googleAds.updateCampaignBidding(campaignId, strategy, valueMicros, userId);
  await logAction('update_bidding', campaignId, { strategy, valueMicros }, userId);
}

async function updateStatus(campaignId, status, userId) {
  await googleAds.updateCampaignStatus(campaignId, status, userId);
  await logAction('update_campaign_status', campaignId, { status }, userId);
}

async function updateAdGroupStatus(campaignId, adGroupId, status, userId) {
  await googleAds.updateAdGroupStatus(adGroupId, status, userId);
  await logAction('update_ad_group_status', campaignId, { adGroupId, status }, userId);
}

async function updateAdStatus(campaignId, adGroupAdResourceName, status, userId) {
  await googleAds.updateAdStatus(adGroupAdResourceName, status, userId);
  await logAction('update_ad_status', campaignId, { adGroupAdResourceName, status }, userId);
}

async function addKeywords(adGroupId, keywords, userId) {
  await googleAds.addKeywordsToAdGroup(adGroupId, keywords, userId);
  await logAction('add_keywords', null, { adGroupId, keywords }, userId);
}

async function removeKeywords(adGroupId, criterionResourceNames, userId) {
  await googleAds.removeKeywords(criterionResourceNames, userId);
  await logAction('remove_keywords', null, { adGroupId, criterionResourceNames }, userId);
}

async function addNegativeKeywords(scope, id, keywords, userId) {
  const kwData = keywords.map(text => ({
    text,
    match_type: 'BROAD',
    negative: true,
  }));

  if (scope === 'ad_group') {
    await googleAds.addKeywordsToAdGroup(id, kwData, userId);
  } else if (scope === 'campaign') {
    // Campaign-level negative keywords use campaignCriteria
    const { customer, customerId } = await googleAds.getGadsCreds(userId);
    const campaignResource = `customers/${customerId}/campaigns/${id}`;
    const negKws = keywords.map(text => ({
      campaign: campaignResource,
      keyword: { text, match_type: 'BROAD' },
      negative: true,
    }));
    await customer.campaignCriteria.create(negKws);
  } else {
    throw new Error(`Invalid scope: ${scope}. Use "campaign" or "ad_group"`);
  }

  await logAction('add_negative_keywords', scope === 'campaign' ? id : null, { scope, id, keywords }, userId);
}

// --- Phase 2: UTM Tracking ---

function buildUtmUrl(baseUrl, params) {
  const url = new URL(baseUrl);
  if (params.source) url.searchParams.set('utm_source', params.source);
  if (params.medium) url.searchParams.set('utm_medium', params.medium);
  if (params.campaign) url.searchParams.set('utm_campaign', params.campaign);
  if (params.content) url.searchParams.set('utm_content', params.content);
  if (params.term) url.searchParams.set('utm_term', params.term);
  return url.toString();
}

async function applyUtmToCampaign(campaignId, utmParams, userId) {
  const adGroups = await googleAds.listAdGroups(campaignId, userId);
  const { customerId } = await googleAds.getGadsCreds(userId);
  let updatedCount = 0;

  for (const ag of adGroups) {
    const ads = await googleAds.listAds(ag.id, userId);
    const adGroupResource = `customers/${customerId}/adGroups/${ag.id}`;

    for (const ad of ads) {
      if (ad.status === 'REMOVED') continue;
      const originalUrl = ad.final_urls?.[0];
      if (!originalUrl) continue;

      const newUrl = buildUtmUrl(originalUrl.split('?')[0], utmParams);
      if (originalUrl === newUrl) continue;

      // RSA ads are immutable — create new ad with updated URL, pause old one
      await googleAds.updateAdStatus(ad.resource_name, 'PAUSED', userId);
      await googleAds.createAdInAdGroup(adGroupResource, {
        headlines: ad.headlines,
        descriptions: ad.descriptions,
        final_url: newUrl,
        path1: '',
        path2: '',
      }, userId);
      updatedCount++;
    }
  }

  await logAction('apply_utm', campaignId, { utmParams, updatedCount }, userId);
  return { updatedCount };
}

// --- Phase 3: Audience Segments ---

async function addAudienceSegments(campaignId, segments, userId) {
  for (const seg of segments) {
    if (seg.type === 'CUSTOM_INTENT' && seg.urls?.length) {
      const resourceName = await googleAds.createCustomAudience(seg.name, seg.urls, userId);
      await googleAds.addCampaignAudience(campaignId, {
        type: seg.type,
        resourceName,
        bidModifier: seg.bid_modifier || 1.0,
      }, userId);
    } else {
      // For IN_MARKET and AFFINITY, search for the segment first
      const results = await googleAds.searchAudienceSegments(seg.name, userId);
      if (results.length) {
        const { customer, customerId } = await googleAds.getGadsCreds(userId);
        await googleAds.addCampaignAudience(campaignId, {
          type: seg.type,
          resourceName: `customers/${customerId}/userInterests/${results[0].id}`,
          bidModifier: seg.bid_modifier || 1.0,
        }, userId);
      }
    }
  }
  await logAction('add_audiences', campaignId, { segments }, userId);
}

async function removeAudienceSegments(campaignId, criterionResourceNames, userId) {
  for (const rn of criterionResourceNames) {
    await googleAds.removeCampaignAudience(campaignId, rn, userId);
  }
  await logAction('remove_audiences', campaignId, { criterionResourceNames }, userId);
}

async function updateAudienceBids(campaignId, adjustments, userId) {
  // adjustments: [{criterionResourceName, bidModifier}]
  for (const adj of adjustments) {
    await googleAds.updateAudienceBidModifier(adj.criterionResourceName, adj.bidModifier, userId);
  }
  await logAction('update_audience_bids', campaignId, { adjustments }, userId);
}

// --- Phase 4: Device Bid Adjustments ---

async function updateDeviceBids(campaignId, adjustments, userId) {
  await googleAds.setDeviceBidAdjustments(campaignId, adjustments, userId);
  await logAction('update_device_bids', campaignId, { adjustments }, userId);
}

module.exports = {
  // Phase 1
  updateGeoTargets, updateBudget, updateBidding, updateStatus,
  updateAdGroupStatus, updateAdStatus,
  addKeywords, removeKeywords, addNegativeKeywords,
  // Phase 2
  buildUtmUrl, applyUtmToCampaign,
  // Phase 3
  addAudienceSegments, removeAudienceSegments, updateAudienceBids,
  // Phase 4
  updateDeviceBids,
};
