const { Router } = require('express');
const optimizer = require('../services/optimizer');

const router = Router();

// --- Reglas ---

router.get('/rules', async (req, res) => {
  try {
    res.json(await optimizer.listRules());
  } catch (err) { res.status(500).json({ error: err.message }); }
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
    });
    res.json(rule);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/rules/:id', async (req, res) => {
  try {
    await optimizer.updateRule(req.params.id, req.body);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/rules/:id', async (req, res) => {
  try {
    await optimizer.deleteRule(req.params.id);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Evaluación y recomendaciones ---

// Evaluar reglas ahora
router.post('/evaluate', async (req, res) => {
  try {
    const triggered = await optimizer.evaluateRules();
    res.json({ triggered: triggered.length, results: triggered });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Listar recomendaciones pendientes
router.get('/recommendations', async (req, res) => {
  try {
    res.json(await optimizer.getPendingRecommendations());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Aprobar/rechazar recomendación
router.post('/recommendations/:id/resolve', async (req, res) => {
  try {
    const { approved } = req.body;
    const result = await optimizer.resolveRecommendation(req.params.id, approved);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Análisis LLM de una campaña
router.get('/analysis/:campaignId', async (req, res) => {
  try {
    const prompt = await optimizer.llmAnalysis(req.params.campaignId);
    res.json(prompt);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
