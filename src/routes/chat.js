const { Router } = require('express');
const conversation = require('../services/conversation');
const campaignBuilder = require('../services/campaign-builder');
const googleAds = require('../services/google-ads');

const router = Router();

// Crear nueva conversación
router.post('/conversations', async (req, res) => {
  try {
    const conv = await conversation.create();
    res.json(conv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Listar conversaciones
router.get('/conversations', async (req, res) => {
  try {
    const list = await conversation.list();
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Obtener conversación
router.get('/conversations/:id', async (req, res) => {
  try {
    const conv = await conversation.get(req.params.id);
    if (!conv) return res.status(404).json({ error: 'Not found' });
    res.json(conv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Enviar mensaje
router.post('/conversations/:id/messages', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'Message required' });

    const result = await conversation.processMessage(req.params.id, message.trim());
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Ejecutar campaña (después de confirmación)
router.post('/conversations/:id/execute', async (req, res) => {
  try {
    const result = await campaignBuilder.execute(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Test: listar campañas de Google Ads
router.get('/google-ads/campaigns', async (req, res) => {
  try {
    const campaigns = await googleAds.listCampaigns();
    res.json(campaigns);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
