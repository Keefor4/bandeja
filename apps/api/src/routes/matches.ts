import path from 'node:path';
import fs from 'node:fs';
import { Router } from 'express';
import multer from 'multer';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../firebase.js';
import { getStorage } from '../storage/index.js';

export const matchRoutes = Router();

// Write directly to storage path so we never load the whole file into RAM
const storagePath = process.env.BANDEJA_STORAGE_PATH ?? 'C:/Users/Tomer/Desktop/Bandeja video';
const uploadDir = path.join(storagePath, 'matches');
fs.mkdirSync(uploadDir, { recursive: true });

const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`),
});

const upload = multer({
  storage: diskStorage,
  limits: { fileSize: 8 * 1024 * 1024 * 1024 }, // 8 GB
  fileFilter: (_req, file, cb) => {
    const allowed = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska'];
    cb(null, allowed.includes(file.mimetype) || file.originalname.match(/\.(mp4|mov|avi|mkv)$/i) !== null);
  },
});

// GET /api/matches
matchRoutes.get('/', async (_req, res) => {
  try {
    const snapshot = await db.collection('matches').orderBy('createdAt', 'desc').get();
    const matches = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    res.json({ matches });
  } catch {
    res.status(500).json({ error: 'Failed to fetch matches' });
  }
});

// GET /api/matches/:id
matchRoutes.get('/:id', async (req, res) => {
  try {
    const snap = await db.collection('matches').doc(req.params.id).get();
    if (!snap.exists) { res.status(404).json({ error: 'Match not found' }); return; }
    res.json({ id: snap.id, ...snap.data() });
  } catch {
    res.status(500).json({ error: 'Failed to fetch match' });
  }
});

// POST /api/matches/upload  (multipart/form-data: video + title + userId)
matchRoutes.post('/upload', upload.single('video'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No video file provided' });
    return;
  }
  const { title, userId } = req.body;
  if (!title?.trim()) {
    fs.unlinkSync(req.file.path); // clean up
    res.status(400).json({ error: 'title is required' });
    return;
  }

  try {
    // File is already on disk — just record the relative path
    const videoPath = `matches/${req.file.filename}`;
    const storage = getStorage();
    const localPath = storage.getLocalPath(videoPath);

    const matchRef = db.collection('matches').doc();
    const now = FieldValue.serverTimestamp();
    await matchRef.set({
      title: title.trim(),
      uploadedBy: userId ?? 'anonymous',
      uploadedAt: now,
      videoPath,
      duration: 0,
      status: 'processing',
      processingProgress: 0,
      metadata: { resolution: '720p', fps: 0, codec: '' },
      pointsDetected: 0,
      pointsApproved: 0,
      createdAt: now,
      updatedAt: now,
    });

    // Load learned weights (fall back to defaults if not calibrated yet)
    const weightSnap = await db.collection('settings').doc('detectionWeights').get();
    const weights = weightSnap.exists
      ? weightSnap.data()?.weights
      : { sceneChange: 0.20, motionAnalysis: 0.25, audioAnalysis: 0.35, visionAnalysis: 0.20 };

    // Trigger processor — fire and forget
    const processorUrl = process.env.PROCESSOR_URL ?? 'http://localhost:8000';
    fetch(`${processorUrl}/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        match_id: matchRef.id,
        video_path: localPath,
        confidence_threshold: 0.7,
        signal_weights: weights,
      }),
    }).catch((err) => console.error(`Processor trigger failed for ${matchRef.id}:`, err));

    res.json({ success: true, matchId: matchRef.id, videoPath });
  } catch (err) {
    console.error('Upload failed:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});
