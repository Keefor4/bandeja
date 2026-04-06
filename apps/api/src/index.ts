import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { matchRoutes } from './routes/matches.js';
import { pointRoutes } from './routes/points.js';
import { reviewRoutes } from './routes/reviews.js';
import { feedbackRoutes } from './routes/feedback.js';

const app = express();
const PORT = process.env.PORT ?? 4000;
const STORAGE_PATH = process.env.BANDEJA_STORAGE_PATH ?? 'C:/Users/Tomer/Desktop/Bandeja video';

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use('/storage', express.static(STORAGE_PATH));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'bandeja-api' });
});

app.use('/api/matches', matchRoutes);
app.use('/api/points', pointRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/feedback', feedbackRoutes);

app.listen(PORT, () => {
  console.log(`Bandeja API running on http://localhost:${PORT}`);
  console.log(`Serving videos from: ${STORAGE_PATH}`);
});
