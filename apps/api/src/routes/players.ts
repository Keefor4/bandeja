import path from 'node:path';
import { Router } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../firebase.js';
import { getStorage } from '../storage/index.js';

export const playerRoutes: Router = Router();

// GET /api/players/frames/:matchId
// Calls the processor to extract 4 player frames from the first ~30s of the video
playerRoutes.get('/frames/:matchId', async (req, res) => {
  try {
    const matchSnap = await db.collection('matches').doc(req.params.matchId).get();
    if (!matchSnap.exists) { res.status(404).json({ error: 'Match not found' }); return; }

    const match = matchSnap.data()!;
    const storage = getStorage();
    const videoPath = storage.getLocalPath(match.videoPath);

    const processorUrl = process.env.PROCESSOR_URL ?? 'http://localhost:8000';
    const response = await fetch(`${processorUrl}/extract-players`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ video_path: videoPath }),
    });

    if (!response.ok) {
      res.status(500).json({ error: 'Processor failed to extract frames' });
      return;
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to extract player frames' });
  }
});

// POST /api/players/:matchId
// Save player names for a match
playerRoutes.post('/:matchId', async (req, res) => {
  const { team1, team2 } = req.body;
  if (!team1?.player1 || !team1?.player2 || !team2?.player1 || !team2?.player2) {
    res.status(400).json({ error: 'All 4 player names required' });
    return;
  }
  try {
    await db.collection('matches').doc(req.params.matchId).update({
      players: {
        team1: { player1: team1.player1.trim(), player2: team1.player2.trim() },
        team2: { player1: team2.player1.trim(), player2: team2.player2.trim() },
        identifiedAt: FieldValue.serverTimestamp(),
      },
      updatedAt: FieldValue.serverTimestamp(),
    });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to save players' });
  }
});
