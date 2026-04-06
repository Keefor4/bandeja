import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { matchRoutes } from './routes/matches.js';
import { pointRoutes } from './routes/points.js';
import { reviewRoutes } from './routes/reviews.js';

const app = express();
const PORT = process.env.PORT ?? 4000;

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'bandeja-api' });
});

app.use('/api/matches', matchRoutes);
app.use('/api/points', pointRoutes);
app.use('/api/reviews', reviewRoutes);

app.listen(PORT, () => {
  console.log(`Bandeja API running on http://localhost:${PORT}`);
});
