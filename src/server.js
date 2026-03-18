const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const chatRoutes = require('./routes/chat');
const adminRoutes = require('./routes/admin');

const app = express();

app.use(cors());
app.use(express.json());

// Auth middleware — todas las rutas API requieren token
app.use('/api', (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!config.adminToken || token === config.adminToken) {
    return next();
  }
  res.status(401).json({ error: 'Unauthorized' });
});

// API routes
app.use('/api', chatRoutes);
app.use('/api/admin', adminRoutes);

// Static frontend
app.use(express.static(path.join(__dirname, '..', 'public')));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(config.port, () => {
  console.log(`AdPilot running on port ${config.port}`);
});
