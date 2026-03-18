const express = require('express');
const crypto = require('crypto');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const chatRoutes = require('./routes/chat');
const adminRoutes = require('./routes/admin');
const knowledgeRoutes = require('./routes/knowledge');
const dashboardRoutes = require('./routes/dashboard');
const optimizerRoutes = require('./routes/optimizer');
const analysisChatRoutes = require('./routes/analysis-chat');
const metrics = require('./services/metrics');

const app = express();

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// CORS restringido
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
app.use(cors({
  origin: allowedOrigins.length > 0
    ? allowedOrigins
    : (origin, cb) => cb(null, true), // dev: allow all if not configured
}));

app.use(express.json({ limit: '1mb' }));

// Rate limiting global
const globalLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests' },
});
app.use('/api', globalLimiter);

// Rate limiting estricto para endpoints LLM (cuestan plata)
const llmLimiter = rateLimit({
  windowMs: 60_000,
  max: 15,
  message: { error: 'Too many LLM requests. Wait a moment.' },
});

// Auth middleware — timing-safe comparison
app.use('/api', (req, res, next) => {
  if (!config.adminToken) return next(); // dev mode sin token
  const token = req.headers.authorization?.replace('Bearer ', '') || '';
  const expected = config.adminToken;
  if (token.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))) {
    return next();
  }
  res.status(401).json({ error: 'Unauthorized' });
});

// Health check (no auth)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// API routes
app.use('/api', chatRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/knowledge', knowledgeRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/optimizer', optimizerRoutes);
app.use('/api/analysis', analysisChatRoutes);

// Aplicar rate limit LLM a endpoints que llaman al modelo
app.use('/api/conversations/:id/messages', llmLimiter);
app.use('/api/analysis/chat', llmLimiter);

// Static frontend
app.use(express.static(path.join(__dirname, '..', 'public')));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Error handler global — no leakear internals
app.use((err, req, res, _next) => {
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.path}:`, err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// Graceful shutdown
let server;
function shutdown(signal) {
  console.log(`${signal} received, shutting down gracefully...`);
  metrics.stopPeriodicSync();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
  // Force exit after 10s
  setTimeout(() => process.exit(1), 10_000);
}

// Unhandled errors
process.on('unhandledRejection', (err) => {
  console.error(`[${new Date().toISOString()}] Unhandled rejection:`, err);
});
process.on('uncaughtException', (err) => {
  console.error(`[${new Date().toISOString()}] Uncaught exception:`, err);
  shutdown('uncaughtException');
});

server = app.listen(config.port, () => {
  console.log(`AdPilot running on port ${config.port}`);
  metrics.startPeriodicSync(3600_000);
});

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
