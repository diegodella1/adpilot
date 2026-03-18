const { Router } = require('express');
const optimizer = require('../services/optimizer');
const { errorResponse } = require('../services/errors');

const router = Router();

// --- Reglas ---

router.get('/rules', async (req, res) => {
  try {
    res.json(await optimizer.listRules(req.user.id));
  } catch (err) { errorResponse(res, err); }
});

router.post('/rules', async (req, res) => {
  try {
    const { name, description, condition, action, auto_execute } = req.body;
    if (!name || !condition || !action) {
      return res.status(400).json({ error: 'name, condition, and action required' });
    }
    const rule = await optimizer.createRule({
      name, description, condition, action,
      auto_execute: auto_execute || false,
    }, req.user.id);
    res.json(rule);
  } catch (err) { errorResponse(res, err); }
});

router.put('/rules/:id', async (req, res) => {
  try {
    await optimizer.updateRule(req.params.id, req.body, req.user.id);
    res.json({ ok: true });
  } catch (err) { errorResponse(res, err); }
});

router.delete('/rules/:id', async (req, res) => {
  try {
    await optimizer.deleteRule(req.params.id, req.user.id);
    res.json({ ok: true });
  } catch (err) { errorResponse(res, err); }
});

// --- Evaluación y recomendaciones ---

router.post('/evaluate', async (req, res) => {
  try {
    const triggered = await optimizer.evaluateRules(req.user.id);
    res.json({ triggered: triggered.length, results: triggered });
  } catch (err) { errorResponse(res, err); }
});

router.get('/recommendations', async (req, res) => {
  try {
    res.json(await optimizer.getPendingRecommendations(req.user.id));
  } catch (err) { errorResponse(res, err); }
});

router.post('/recommendations/:id/resolve', async (req, res) => {
  try {
    const { approved } = req.body;
    const result = await optimizer.resolveRecommendation(req.params.id, approved, req.user.id);
    res.json(result);
  } catch (err) { errorResponse(res, err); }
});

router.get('/analysis/:campaignId', async (req, res) => {
  try {
    const prompt = await optimizer.llmAnalysis(req.params.campaignId, req.user.id);
    res.json(prompt);
  } catch (err) { errorResponse(res, err); }
});

module.exports = router;
