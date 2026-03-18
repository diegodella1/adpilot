const { Router } = require('express');
const { keywordIdeas } = require('../services/google-ads');
const { errorResponse } = require('../services/errors');

const router = Router();

router.post('/ideas', async (req, res) => {
  try {
    const { keywords, url, geo, language } = req.body;
    if ((!keywords || !keywords.length) && !url) {
      return res.status(400).json({ error: 'Se requiere al menos keywords o url' });
    }
    const ideas = await keywordIdeas({ keywords, url, geo, language }, req.user.id);
    res.json(ideas);
  } catch (err) {
    errorResponse(res, err);
  }
});

module.exports = router;
