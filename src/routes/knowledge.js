const { Router } = require('express');
const knowledge = require('../services/knowledge');
const { errorResponse } = require('../services/errors');

const router = Router();

// Buscar conocimiento relevante
router.get('/search', async (req, res) => {
  try {
    const { q, category, count } = req.query;
    if (!q) return res.status(400).json({ error: 'Query parameter "q" required' });
    const results = await knowledge.search(q, {
      count: parseInt(count || '5', 10),
      category: category || null,
    });
    res.json(results);
  } catch (err) {
    errorResponse(res, err);
  }
});

// Listar conocimiento
router.get('/', async (req, res) => {
  try {
    const { category, limit } = req.query;
    const results = await knowledge.list({
      category: category || null,
      limit: parseInt(limit || '50', 10),
    });
    res.json(results);
  } catch (err) {
    errorResponse(res, err);
  }
});

// Agregar conocimiento manualmente
router.post('/', async (req, res) => {
  try {
    const { category, title, content, metadata } = req.body;
    if (!category || !title || !content) {
      return res.status(400).json({ error: 'category, title, and content required' });
    }
    const result = await knowledge.add({ category, title, content, metadata });
    res.json(result);
  } catch (err) {
    errorResponse(res, err);
  }
});

// Eliminar conocimiento
router.delete('/:id', async (req, res) => {
  try {
    await knowledge.remove(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    errorResponse(res, err);
  }
});

module.exports = router;
