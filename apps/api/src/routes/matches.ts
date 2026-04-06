import { Router } from 'express';
import multer from 'multer';
import { getStorage } from '../storage/index.js';

export const matchRoutes = Router();
const upload = multer({ storage: multer.memoryStorage() });

// GET /api/matches
matchRoutes.get('/', async (_req, res) => {
  res.json({ matches: [] }); // TODO: fetch from Firestore
});

// GET /api/matches/:id
matchRoutes.get('/:id', async (req, res) => {
  res.json({ id: req.params.id }); // TODO: fetch from Firestore
});

// POST /api/matches/upload
matchRoutes.post('/upload', upload.single('video'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No video file provided' });
    return;
  }

  const storage = getStorage();
  const filename = `${Date.now()}-${req.file.originalname}`;
  const videoPath = await storage.upload(filename, req.file.buffer, req.file.mimetype);

  // TODO: create Firestore match document and trigger processor
  res.json({ success: true, videoPath });
});
