const { Router } = require('express');
const conversation = require('../services/conversation');
const campaignBuilder = require('../services/campaign-builder');
const googleAds = require('../services/google-ads');
const { errorResponse } = require('../services/errors');

const router = Router();

router.post('/conversations', async (req, res) => {
  try {
    const conv = await conversation.create(req.user.id);
    res.json(conv);
  } catch (err) { errorResponse(res, err); }
});

router.get('/conversations', async (req, res) => {
  try {
    const list = await conversation.list(req.user.id);
    res.json(list);
  } catch (err) { errorResponse(res, err); }
});

router.get('/conversations/:id', async (req, res) => {
  try {
    const conv = await conversation.get(req.params.id, req.user.id);
    if (!conv) return res.status(404).json({ error: 'Not found' });
    res.json(conv);
  } catch (err) { errorResponse(res, err); }
});

router.delete('/conversations/:id', async (req, res) => {
  try {
    await conversation.remove(req.params.id, req.user.id);
    res.json({ success: true });
  } catch (err) { errorResponse(res, err); }
});

router.post('/conversations/:id/messages', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'Message required' });
    const result = await conversation.processMessage(req.params.id, message.trim(), req.user.id);
    res.json(result);
  } catch (err) { errorResponse(res, err); }
});

router.post('/conversations/:id/execute', async (req, res) => {
  try {
    const result = await campaignBuilder.execute(req.params.id, req.user.id);
    res.json(result);
  } catch (err) { errorResponse(res, err); }
});

router.get('/google-ads/campaigns', async (req, res) => {
  try {
    const campaigns = await googleAds.listCampaigns(req.user.id);
    res.json(campaigns);
  } catch (err) { errorResponse(res, err); }
});

module.exports = router;
