const { Router } = require('express');
const supabase = require('../db/supabase');
const { invalidateCache } = require('../services/llm');
const { invalidateClient } = require('../services/google-ads');
const { errorResponse } = require('../services/errors');

const router = Router();

// Obtener settings
router.get('/settings', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('adpilot_settings')
      .select('key, value')
      .order('key');
    if (error) throw error;
    // Convertir a objeto, ocultar API keys parcialmente
    const settings = {};
    for (const row of data || []) {
      settings[row.key] = row.value;
    }
    res.json(settings);
  } catch (err) {
    errorResponse(res, err);
  }
});

// Actualizar settings (batch)
router.put('/settings', async (req, res) => {
  try {
    const updates = req.body; // { key: value, ... }
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ error: 'Body must be an object of key:value pairs' });
    }

    for (const [key, value] of Object.entries(updates)) {
      await supabase
        .from('adpilot_settings')
        .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    }

    invalidateCache();
    invalidateClient();
    res.json({ ok: true });
  } catch (err) {
    errorResponse(res, err);
  }
});

// Obtener logs de campañas
router.get('/logs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '50', 10);
    const { data, error } = await supabase
      .from('adpilot_campaign_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    res.json(data);
  } catch (err) {
    errorResponse(res, err);
  }
});

module.exports = router;
