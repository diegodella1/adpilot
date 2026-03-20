const { Router } = require('express');
const googleAds = require('../services/google-ads');
const campaignManager = require('../services/campaign-manager');
const { errorResponse } = require('../services/errors');

const router = Router();

// --- Location search ---

router.get('/locations/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q?.trim()) return res.status(400).json({ error: 'Query parameter "q" required' });
    const results = await googleAds.searchLocations(q.trim(), req.user.id);
    res.json(results);
  } catch (err) {
    errorResponse(res, err);
  }
});

// --- Campaign list & details ---

router.get('/campaigns', async (req, res) => {
  try {
    const campaigns = await googleAds.listCampaigns(req.user.id);
    res.json(campaigns);
  } catch (err) {
    errorResponse(res, err);
  }
});

router.get('/campaigns/:id', async (req, res) => {
  try {
    const details = await googleAds.getCampaignDetails(req.params.id, req.user.id);
    res.json(details);
  } catch (err) {
    errorResponse(res, err);
  }
});

// --- Geo targets ---

router.put('/campaigns/:id/geo-targets', async (req, res) => {
  try {
    const { targets } = req.body;
    if (!Array.isArray(targets)) return res.status(400).json({ error: 'targets array required' });
    await campaignManager.updateGeoTargets(req.params.id, targets, req.user.id);
    res.json({ success: true });
  } catch (err) {
    errorResponse(res, err);
  }
});

// --- Budget ---

router.put('/campaigns/:id/budget', async (req, res) => {
  try {
    const { budget_micros } = req.body;
    if (!budget_micros || budget_micros <= 0) return res.status(400).json({ error: 'Valid budget_micros required' });
    await campaignManager.updateBudget(req.params.id, budget_micros, req.user.id);
    res.json({ success: true });
  } catch (err) {
    errorResponse(res, err);
  }
});

// --- Bidding ---

router.put('/campaigns/:id/bidding', async (req, res) => {
  try {
    const { strategy, value_micros } = req.body;
    if (!strategy) return res.status(400).json({ error: 'strategy required' });
    await campaignManager.updateBidding(req.params.id, strategy, value_micros, req.user.id);
    res.json({ success: true });
  } catch (err) {
    errorResponse(res, err);
  }
});

// --- Campaign status ---

router.put('/campaigns/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['ENABLED', 'PAUSED'].includes(status)) {
      return res.status(400).json({ error: 'status must be ENABLED or PAUSED' });
    }
    await campaignManager.updateStatus(req.params.id, status, req.user.id);
    res.json({ success: true });
  } catch (err) {
    errorResponse(res, err);
  }
});

// --- Ad groups ---

router.get('/campaigns/:id/ad-groups', async (req, res) => {
  try {
    const adGroups = await googleAds.listAdGroups(req.params.id, req.user.id);
    res.json(adGroups);
  } catch (err) {
    errorResponse(res, err);
  }
});

router.put('/campaigns/:id/ad-groups/:agId/status', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['ENABLED', 'PAUSED'].includes(status)) {
      return res.status(400).json({ error: 'status must be ENABLED or PAUSED' });
    }
    await campaignManager.updateAdGroupStatus(req.params.id, req.params.agId, status, req.user.id);
    res.json({ success: true });
  } catch (err) {
    errorResponse(res, err);
  }
});

// --- Keywords ---

router.get('/campaigns/:id/ad-groups/:agId/keywords', async (req, res) => {
  try {
    const keywords = await googleAds.listKeywords(req.params.agId, req.user.id);
    res.json(keywords);
  } catch (err) {
    errorResponse(res, err);
  }
});

router.post('/campaigns/:id/ad-groups/:agId/keywords', async (req, res) => {
  try {
    const { keywords } = req.body;
    if (!Array.isArray(keywords) || !keywords.length) {
      return res.status(400).json({ error: 'keywords array required' });
    }
    await campaignManager.addKeywords(req.params.agId, keywords, req.user.id);
    res.json({ success: true });
  } catch (err) {
    errorResponse(res, err);
  }
});

router.delete('/campaigns/:id/ad-groups/:agId/keywords/:kwId', async (req, res) => {
  try {
    const { customer, customerId } = await googleAds.getGadsCreds(req.user.id);
    const resourceName = `customers/${customerId}/adGroupCriteria/${req.params.agId}~${req.params.kwId}`;
    await campaignManager.removeKeywords(req.params.agId, [resourceName], req.user.id);
    res.json({ success: true });
  } catch (err) {
    errorResponse(res, err);
  }
});

// --- Negative keywords ---

router.post('/campaigns/:id/ad-groups/:agId/negative-keywords', async (req, res) => {
  try {
    const { keywords } = req.body;
    if (!Array.isArray(keywords) || !keywords.length) {
      return res.status(400).json({ error: 'keywords array required' });
    }
    await campaignManager.addNegativeKeywords('ad_group', req.params.agId, keywords, req.user.id);
    res.json({ success: true });
  } catch (err) {
    errorResponse(res, err);
  }
});

// --- Ads ---

router.get('/campaigns/:id/ad-groups/:agId/ads', async (req, res) => {
  try {
    const ads = await googleAds.listAds(req.params.agId, req.user.id);
    res.json(ads);
  } catch (err) {
    errorResponse(res, err);
  }
});

router.put('/campaigns/:id/ad-groups/:agId/ads/:adId/status', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['ENABLED', 'PAUSED'].includes(status)) {
      return res.status(400).json({ error: 'status must be ENABLED or PAUSED' });
    }
    const { customerId } = await googleAds.getGadsCreds(req.user.id);
    const resourceName = `customers/${customerId}/adGroupAds/${req.params.agId}~${req.params.adId}`;
    await campaignManager.updateAdStatus(req.params.id, resourceName, status, req.user.id);
    res.json({ success: true });
  } catch (err) {
    errorResponse(res, err);
  }
});

// --- UTM (Phase 2) ---

router.put('/campaigns/:id/utm', async (req, res) => {
  try {
    const { utm_params } = req.body;
    if (!utm_params) return res.status(400).json({ error: 'utm_params object required' });
    const result = await campaignManager.applyUtmToCampaign(req.params.id, utm_params, req.user.id);
    res.json(result);
  } catch (err) {
    errorResponse(res, err);
  }
});

// --- Audiences (Phase 3) ---

router.get('/audiences/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q?.trim()) return res.status(400).json({ error: 'Query parameter "q" required' });
    const results = await googleAds.searchAudienceSegments(q.trim(), req.user.id);
    res.json(results);
  } catch (err) {
    errorResponse(res, err);
  }
});

router.get('/campaigns/:id/audiences', async (req, res) => {
  try {
    const audiences = await googleAds.listCampaignAudiences(req.params.id, req.user.id);
    res.json(audiences);
  } catch (err) {
    errorResponse(res, err);
  }
});

router.post('/campaigns/:id/audiences', async (req, res) => {
  try {
    const { segments } = req.body;
    if (!Array.isArray(segments) || !segments.length) {
      return res.status(400).json({ error: 'segments array required' });
    }
    await campaignManager.addAudienceSegments(req.params.id, segments, req.user.id);
    res.json({ success: true });
  } catch (err) {
    errorResponse(res, err);
  }
});

router.delete('/campaigns/:id/audiences/:criterionId', async (req, res) => {
  try {
    const { customerId } = await googleAds.getGadsCreds(req.user.id);
    const resourceName = `customers/${customerId}/campaignCriteria/${req.params.id}~${req.params.criterionId}`;
    await campaignManager.removeAudienceSegments(req.params.id, [resourceName], req.user.id);
    res.json({ success: true });
  } catch (err) {
    errorResponse(res, err);
  }
});

router.put('/campaigns/:id/audiences/:criterionId/bid', async (req, res) => {
  try {
    const { bid_modifier } = req.body;
    if (typeof bid_modifier !== 'number') {
      return res.status(400).json({ error: 'bid_modifier number required' });
    }
    const { customerId } = await googleAds.getGadsCreds(req.user.id);
    const resourceName = `customers/${customerId}/campaignCriteria/${req.params.id}~${req.params.criterionId}`;
    await campaignManager.updateAudienceBids(req.params.id, [{ criterionResourceName: resourceName, bidModifier: bid_modifier }], req.user.id);
    res.json({ success: true });
  } catch (err) {
    errorResponse(res, err);
  }
});

// --- Devices (Phase 4) ---

router.get('/campaigns/:id/devices', async (req, res) => {
  try {
    const devices = await googleAds.getDeviceBidAdjustments(req.params.id, req.user.id);
    res.json(devices);
  } catch (err) {
    errorResponse(res, err);
  }
});

router.put('/campaigns/:id/devices', async (req, res) => {
  try {
    const { adjustments } = req.body;
    if (!adjustments || typeof adjustments !== 'object') {
      return res.status(400).json({ error: 'adjustments object required (e.g. { desktop: 1.0, mobile: 0.8 })' });
    }
    await campaignManager.updateDeviceBids(req.params.id, adjustments, req.user.id);
    res.json({ success: true });
  } catch (err) {
    errorResponse(res, err);
  }
});

// --- Remarketing (Phase 5) ---

router.get('/remarketing-lists', async (req, res) => {
  try {
    const lists = await googleAds.listRemarketingLists(req.user.id);
    res.json(lists);
  } catch (err) {
    errorResponse(res, err);
  }
});

router.post('/campaigns/:id/remarketing', async (req, res) => {
  try {
    const { user_list_id, bid_modifier } = req.body;
    if (!user_list_id) return res.status(400).json({ error: 'user_list_id required' });
    await googleAds.addRemarketingList(req.params.id, user_list_id, bid_modifier, req.user.id);
    res.json({ success: true });
  } catch (err) {
    errorResponse(res, err);
  }
});

router.delete('/campaigns/:id/remarketing/:criterionId', async (req, res) => {
  try {
    const { customerId } = await googleAds.getGadsCreds(req.user.id);
    const resourceName = `customers/${customerId}/campaignCriteria/${req.params.id}~${req.params.criterionId}`;
    await googleAds.removeRemarketingList(req.params.id, resourceName, req.user.id);
    res.json({ success: true });
  } catch (err) {
    errorResponse(res, err);
  }
});

module.exports = router;
