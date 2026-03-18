const { Router } = require('express');
const metrics = require('../services/metrics');
const { errorResponse } = require('../services/errors');

const router = Router();

// Resúmenes de campañas (tabla principal del dashboard)
router.get('/summaries', async (req, res) => {
  try {
    const data = await metrics.getSummaries();
    res.json(data);
  } catch (err) {
    errorResponse(res, err);
  }
});

// Métricas diarias de una campaña (para gráficos)
router.get('/campaigns/:id/metrics', async (req, res) => {
  try {
    const days = parseInt(req.query.days || '30', 10);
    const data = await metrics.getDailyMetrics(req.params.id, days);
    res.json(data);
  } catch (err) {
    errorResponse(res, err);
  }
});

// Métricas globales (todas las campañas agregadas)
router.get('/global', async (req, res) => {
  try {
    const days = parseInt(req.query.days || '30', 10);
    const data = await metrics.getGlobalMetrics(days);
    res.json(data);
  } catch (err) {
    errorResponse(res, err);
  }
});

// Forzar sync manual
router.post('/sync', async (req, res) => {
  try {
    const result = await metrics.syncFromGoogleAds();
    res.json(result);
  } catch (err) {
    errorResponse(res, err);
  }
});

module.exports = router;
