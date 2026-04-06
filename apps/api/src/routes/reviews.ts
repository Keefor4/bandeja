import { Router } from 'express';

export const reviewRoutes: Router = Router();

// POST /api/reviews — submit a review decision
reviewRoutes.post('/', async (req, res) => {
  const { pointId, action, correctedStartTime, correctedEndTime } = req.body;

  if (!pointId || !action) {
    res.status(400).json({ error: 'pointId and action are required' });
    return;
  }

  if (!['approved', 'rejected', 'corrected'].includes(action)) {
    res.status(400).json({ error: 'action must be approved, rejected, or corrected' });
    return;
  }

  // TODO: update Firestore, store feedback entry
  res.json({ success: true, pointId, action });
});
