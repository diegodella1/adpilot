const { Router } = require('express');
const supabase = require('../db/supabase');
const { invalidateCache } = require('../services/llm');
const { invalidateClient } = require('../services/google-ads');
const { errorResponse } = require('../services/errors');
const { encryptIfSensitive, decryptIfSensitive } = require('../services/settings-crypto');
const { adminOnly } = require('../middleware/auth');
const auth = require('../services/auth');

const router = Router();

// ===================== PER-USER SETTINGS =====================

// Obtener settings del usuario (per-user merged with global)
router.get('/settings', async (req, res) => {
  try {
    // Global settings
    const { data: globalRows } = await supabase
      .from('adpilot_settings')
      .select('key, value')
      .is('user_id', null)
      .order('key');

    const settings = {};
    for (const row of globalRows || []) {
      settings[row.key] = decryptIfSensitive(row.key, row.value);
    }

    // Per-user settings (override)
    const { data: userRows } = await supabase
      .from('adpilot_settings')
      .select('key, value')
      .eq('user_id', req.user.id)
      .order('key');

    for (const row of userRows || []) {
      settings[row.key] = decryptIfSensitive(row.key, row.value);
    }

    res.json(settings);
  } catch (err) {
    errorResponse(res, err);
  }
});

// Actualizar settings per-user (Google Ads creds + business_context)
router.put('/settings', async (req, res) => {
  try {
    const updates = req.body;
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ error: 'Body must be an object of key:value pairs' });
    }

    // Per-user settings keys
    const perUserKeys = [
      'gads_client_id', 'gads_client_secret', 'gads_dev_token',
      'gads_refresh_token', 'gads_customer_id', 'gads_login_customer_id',
      'business_context',
    ];

    for (const [key, value] of Object.entries(updates)) {
      const encrypted = encryptIfSensitive(key, value);
      const isPerUser = perUserKeys.includes(key);

      if (isPerUser) {
        // Upsert per-user setting
        const { data: existing } = await supabase
          .from('adpilot_settings')
          .select('key')
          .eq('key', key)
          .eq('user_id', req.user.id)
          .limit(1);

        if (existing?.length) {
          await supabase
            .from('adpilot_settings')
            .update({ value: encrypted, updated_at: new Date().toISOString() })
            .eq('key', key)
            .eq('user_id', req.user.id);
        } else {
          await supabase
            .from('adpilot_settings')
            .insert({ key, value: encrypted, user_id: req.user.id, updated_at: new Date().toISOString() });
        }
      } else if (req.user.role === 'admin') {
        // Global settings — only admin can change
        const { data: existing } = await supabase
          .from('adpilot_settings')
          .select('key')
          .eq('key', key)
          .is('user_id', null)
          .limit(1);

        if (existing?.length) {
          await supabase
            .from('adpilot_settings')
            .update({ value: encrypted, updated_at: new Date().toISOString() })
            .eq('key', key)
            .is('user_id', null);
        } else {
          await supabase
            .from('adpilot_settings')
            .insert({ key, value: encrypted, user_id: null, updated_at: new Date().toISOString() });
        }
      }
    }

    invalidateCache();
    invalidateClient(req.user.id);
    res.json({ ok: true });
  } catch (err) {
    errorResponse(res, err);
  }
});

// ===================== GLOBAL SETTINGS (admin only) =====================

router.get('/settings/global', adminOnly, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('adpilot_settings')
      .select('key, value')
      .is('user_id', null)
      .order('key');
    if (error) throw error;
    const settings = {};
    for (const row of data || []) {
      settings[row.key] = decryptIfSensitive(row.key, row.value);
    }
    res.json(settings);
  } catch (err) {
    errorResponse(res, err);
  }
});

router.put('/settings/global', adminOnly, async (req, res) => {
  try {
    const updates = req.body;
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ error: 'Body must be an object of key:value pairs' });
    }

    for (const [key, value] of Object.entries(updates)) {
      const encrypted = encryptIfSensitive(key, value);
      const { data: existing } = await supabase
        .from('adpilot_settings')
        .select('key')
        .eq('key', key)
        .is('user_id', null)
        .limit(1);

      if (existing?.length) {
        await supabase
          .from('adpilot_settings')
          .update({ value: encrypted, updated_at: new Date().toISOString() })
          .eq('key', key)
          .is('user_id', null);
      } else {
        await supabase
          .from('adpilot_settings')
          .insert({ key, value: encrypted, user_id: null, updated_at: new Date().toISOString() });
      }
    }

    invalidateCache();
    invalidateClient();
    res.json({ ok: true });
  } catch (err) {
    errorResponse(res, err);
  }
});

// ===================== LOGS =====================

router.get('/logs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '50', 10);
    let query = supabase
      .from('adpilot_campaign_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    // Admin sees all, users see own
    if (req.user.role !== 'admin') {
      query = query.eq('user_id', req.user.id);
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    errorResponse(res, err);
  }
});

// ===================== USER MANAGEMENT (admin only) =====================

router.get('/users', adminOnly, async (req, res) => {
  try {
    const users = await auth.listUsers();

    // Attach current month LLM usage for each user
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { data: usageData } = await supabase
      .from('adpilot_llm_usage')
      .select('user_id, estimated_cost_usd')
      .gte('created_at', startOfMonth.toISOString());

    const usageByUser = {};
    for (const row of usageData || []) {
      usageByUser[row.user_id] = (usageByUser[row.user_id] || 0) + Number(row.estimated_cost_usd);
    }

    const result = users.map(u => ({
      ...u,
      llm_usage_this_month_usd: (usageByUser[u.id] || 0).toFixed(4),
    }));

    res.json(result);
  } catch (err) {
    errorResponse(res, err);
  }
});

router.post('/users', adminOnly, async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const user = await auth.createUser({ email, password, name, role: 'user' });
    res.json(user);
  } catch (err) {
    errorResponse(res, err);
  }
});

router.put('/users/:id', adminOnly, async (req, res) => {
  try {
    await auth.updateUser(req.params.id, req.body);
    res.json({ ok: true });
  } catch (err) {
    errorResponse(res, err);
  }
});

// ===================== LLM USAGE (admin only) =====================

router.get('/usage', adminOnly, async (req, res) => {
  try {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('adpilot_llm_usage')
      .select('user_id, model, prompt_tokens, completion_tokens, total_tokens, estimated_cost_usd, endpoint, created_at')
      .gte('created_at', startOfMonth.toISOString())
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) throw error;
    res.json(data);
  } catch (err) {
    errorResponse(res, err);
  }
});

module.exports = router;
