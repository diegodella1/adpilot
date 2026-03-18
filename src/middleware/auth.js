const auth = require('../services/auth');

/**
 * JWT auth middleware — extrae token de Authorization header, verifica, busca user
 */
async function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token required' });
  }

  const token = header.slice(7);
  try {
    const payload = auth.verifyToken(token);
    const user = await auth.getUserById(payload.id);
    if (!user) return res.status(401).json({ error: 'User not found' });
    if (!user.enabled) return res.status(403).json({ error: 'Account disabled' });
    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

/**
 * Admin-only guard — must be used after authMiddleware
 */
function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

module.exports = { authMiddleware, adminOnly };
