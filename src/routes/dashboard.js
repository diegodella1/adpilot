const { Router } = require('express');
const metrics = require('../services/metrics');
const { errorResponse } = require('../services/errors');

const router = Router();

router.get('/summaries', async (req, res) => {
  try {
    const data = await metrics.getSummaries(req.user.id);
    res.json(data);
  } catch (err) {
    errorResponse(res, err);
  }
});

router.get('/campaigns/:id/metrics', async (req, res) => {
  try {
    const days = parseInt(req.query.days || '30', 10);
    const data = await metrics.getDailyMetrics(req.params.id, days, req.user.id);
    res.json(data);
  } catch (err) {
    errorResponse(res, err);
  }
});

router.get('/global', async (req, res) => {
  try {
    const days = parseInt(req.query.days || '30', 10);
    const data = await metrics.getGlobalMetrics(days, req.user.id);
    res.json(data);
  } catch (err) {
    errorResponse(res, err);
  }
});

router.post('/sync', async (req, res) => {
  try {
    const result = await metrics.syncFromGoogleAds(req.user.id);
    res.json(result);
  } catch (err) {
    errorResponse(res, err);
  }
});

module.exports = router;
