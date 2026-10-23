const express = require('express');
const { rateLimit } = require('express-rate-limit');
const service = require('../services/aiStudio');

function createRouter(options = {}) {
  const router = express.Router();
  const ai = options.service || service;
  const authenticate = options.authenticate || require('../middleware/auth').verifyToken;
  router.use(authenticate);
  router.use(rateLimit({ windowMs: 60000, limit: options.limit || 12, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Please wait a minute before another AI Studio request.', code: 'RATE_LIMITED' } }));
  router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  const handler = fn => async (req, res) => {
    try { res.json(await fn(req)); }
    catch (error) {
      // Never log upstream payloads, prompts, uploaded images or credentials.
      res.status(error.status || 500).json({ error: error.status ? error.message : 'AI Studio could not load this information. Please retry.', code: error.status ? error.code || 'VALIDATION_ERROR' : 'AI_STUDIO_ERROR' });
    }
  };
  router.get('/status', handler(() => ai.configuration()));
  router.post('/listing-draft', handler(req => ai.listingDraft(req.body)));
  router.post('/guide', handler(req => ai.guide(req.body)));
  router.post('/host-insights', handler(req => ai.hostInsights(req.user.id, req.body)));
  return router;
}

module.exports = createRouter();
module.exports.createRouter = createRouter;
