import { Router } from 'express';
import { requireAuth } from '../middleware.js';

export const listingsRouter = Router();

/** User listing boards retired — admin OTC only. */
listingsRouter.use(requireAuth, (_req, res) => {
  res.status(410).json({
    error: 'Listings API retired. Use /api/orders/buy, /api/orders/sell, and /api/trades.',
  });
});
