import { Router } from 'express';

export const pointRoutes: Router = Router();

// GET /api/points?matchId=xxx
pointRoutes.get('/', async (req, res) => {
  const { matchId } = req.query;
  if (!matchId) {
    res.status(400).json({ error: 'matchId query param required' });
    return;
  }
  res.json({ points: [] }); // TODO: fetch from Firestore
});

// GET /api/points/:id
pointRoutes.get('/:id', async (req, res) => {
  res.json({ id: req.params.id }); // TODO: fetch from Firestore
});
