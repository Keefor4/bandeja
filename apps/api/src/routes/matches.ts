import { Router } from 'express';
import multer from 'multer';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../firebase.js';
import { getStorage } from '../storage/index.js';

export const matchRoutes = Router();

// Use disk storage for large video files (up to 2hrs/720p ~4GB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 * 1024 }, // 4GB
});

// GET /api/matches
matchRoutes.get('/', async (_req, res) => {
  try {
    const snapshot = await db.collection('matches').orderBy('createdAt', 'desc').get();
    const matches = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    res.json({ matches });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch matches' });
  }
});

// GET /api/matches/:id
matchRoutes.get('/:id', async (req, res) => {
  try {
    const doc = await db.collection('matches').doc(req.params.id).get();
    if (!doc.exists) {
      res.status(404).json({ error: 'Match not found' });
      return;
    }
    res.json({ id: doc.id, ...doc.data() });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch match' });
  }
});

// POST /api/matches/upload
matchRoutes.post('/upload', upload.single('video'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No video file provided' });
    return;
  }

  const { title } = req.body;
  if (!title) {
    res.status(400).json({ error: 'title is required' });
    return;
  }

  try {
    const storage = getStorage();
    const filename = `matches/${Date.now()}-${req.file.originalname.replace(/\s+/g, '_')}`;
    const videoPath = await storage.upload(filename, req.file.buffer, req.file.mimetype);

    const matchRef = db.collection('matches').doc();
    const now = FieldValue.serverTimestamp();
    await matchRef.set({
      title,
      uploadedBy: req.body.userId ?? 'anonymous',
      uploadedAt: now,
      videoPath,
      duration: 0,
      status: 'uploaded',
      processingProgress: 0,
      metadata: {
        resolution: '720p',
        fps: 0,
        codec: '',
      },
      pointsDetected: 0,
      pointsApproved: 0,
      createdAt: now,
      updatedAt: now,
    });

    // Trigger processor asynchronously — don't await
    const processorUrl = process.env.PROCESSOR_URL ?? 'http://localhost:8000';
    fetch(`${processorUrl}/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        match_id: matchRef.id,
        video_path: storage.getLocalPath(videoPath),
        confidence_threshold: 0.7,
      }),
    }).catch((err) => {
      console.error(`Failed to trigger processor for match ${matchRef.id}:`, err);
    });

    await matchRef.update({ status: 'processing', updatedAt: FieldValue.serverTimestamp() });

    res.json({ success: true, matchId: matchRef.id, videoPath });
  } catch (err) {
    console.error('Upload failed:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});
