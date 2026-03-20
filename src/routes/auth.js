const { Router } = require('express');
const auth = require('../services/auth');
const { authMiddleware } = require('../middleware/auth');
const { errorResponse } = require('../services/errors');

const router = Router();

// Login — público
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const user = await auth.getUserByEmail(email);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    if (!user.enabled) return res.status(403).json({ error: 'Account disabled' });

    const valid = await auth.verifyPassword(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = auth.generateToken(user);
    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  } catch (err) {
    errorResponse(res, err);
  }
});

// Bootstrap — crea primer admin si no hay usuarios
router.post('/setup', async (req, res) => {
  try {
    const exists = await auth.hasAnyUser();
    if (exists) return res.status(400).json({ error: 'Setup already completed' });

    const { email, password, name } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const user = await auth.createUser({ email, password, name, role: 'admin' });
    const token = auth.generateToken(user);
    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  } catch (err) {
    errorResponse(res, err);
  }
});

// Lead capture — público (landing page free trial)
router.post('/lead', async (req, res) => {
  try {
    const { name, email, use_case, role } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const supabase = require('../db/supabase');
    await supabase.from('adpilot_leads').upsert({
      email: email.toLowerCase().trim(),
      name: name?.trim() || null,
      use_case: use_case?.trim() || null,
      role: role?.trim() || null,
    }, { onConflict: 'email' });

    res.json({ ok: true });
  } catch (err) {
    // Don't leak errors on public endpoint
    console.error('Lead capture error:', err.message);
    res.json({ ok: true }); // Always return success to user
  }
});

// Me — retorna user autenticado
router.get('/me', authMiddleware, async (req, res) => {
  res.json({ user: req.user });
});

// Change password
router.post('/change-password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Verify current password
    const user = await auth.getUserByEmail(req.user.email);
    const valid = await auth.verifyPassword(currentPassword, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Current password is wrong' });

    await auth.changePassword(req.user.id, newPassword);
    res.json({ ok: true });
  } catch (err) {
    errorResponse(res, err);
  }
});

module.exports = router;
