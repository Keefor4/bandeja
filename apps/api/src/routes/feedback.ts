import { Router } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../firebase.js';

export const feedbackRoutes = Router();

const DEFAULT_WEIGHTS = {
  sceneChange:    0.20,
  motionAnalysis: 0.25,
  audioAnalysis:  0.35,
  visionAnalysis: 0.20,
};

const MIN_REVIEWS_FOR_RECALIBRATION = 25;

// GET /api/feedback/weights — current weights + stats
feedbackRoutes.get('/weights', async (_req, res) => {
  try {
    const snap = await db.collection('settings').doc('detectionWeights').get();
    if (!snap.exists) {
      res.json({ weights: DEFAULT_WEIGHTS, isDefault: true, reviewCount: 0 });
      return;
    }
    res.json({ weights: snap.data()?.weights ?? DEFAULT_WEIGHTS, isDefault: false, ...snap.data() });
  } catch {
    res.status(500).json({ error: 'Failed to fetch weights' });
  }
});

// GET /api/feedback/stats — accuracy metrics for the dashboard
feedbackRoutes.get('/stats', async (_req, res) => {
  try {
    const snap = await db.collection('feedback').orderBy('timestamp', 'asc').get();
    const entries = snap.docs.map(d => d.data());

    const total = entries.length;
    const approved  = entries.filter(e => e.action === 'approved' || e.action === 'corrected').length;
    const rejected  = entries.filter(e => e.action === 'rejected').length;
    const corrected = entries.filter(e => e.action === 'corrected').length;

    // Per-signal accuracy: for approved points, which signals were high (≥0.6)?
    // For rejected points, which signals were high but shouldn't have been?
    const signalStats: Record<string, { truePositive: number; falsePositive: number; total: number }> = {
      sceneChange:    { truePositive: 0, falsePositive: 0, total: 0 },
      motionAnalysis: { truePositive: 0, falsePositive: 0, total: 0 },
      audioAnalysis:  { truePositive: 0, falsePositive: 0, total: 0 },
      visionAnalysis: { truePositive: 0, falsePositive: 0, total: 0 },
    };

    for (const entry of entries) {
      const signals = entry.originalSignals ?? {};
      const wasGood = entry.action === 'approved' || entry.action === 'corrected';
      for (const [signal, stat] of Object.entries(signalStats)) {
        const val = signals[signal];
        if (val === undefined) continue;
        stat.total++;
        if (val >= 0.5) {
          wasGood ? stat.truePositive++ : stat.falsePositive++;
        }
      }
    }

    const signalAccuracy = Object.fromEntries(
      Object.entries(signalStats).map(([key, s]) => [
        key,
        s.total > 0
          ? Math.round(((s.truePositive) / (s.truePositive + s.falsePositive || 1)) * 100)
          : null,
      ])
    );

    // Weekly approval rate over time
    const weeklyMap: Record<string, { approved: number; total: number }> = {};
    for (const entry of entries) {
      const ts = entry.timestamp?.toDate?.() ?? new Date();
      const week = getWeekKey(ts);
      if (!weeklyMap[week]) weeklyMap[week] = { approved: 0, total: 0 };
      weeklyMap[week].total++;
      if (entry.action === 'approved' || entry.action === 'corrected') weeklyMap[week].approved++;
    }
    const weeklyTrend = Object.entries(weeklyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, { approved, total }]) => ({
        week,
        approvalRate: Math.round((approved / total) * 100),
        total,
      }));

    // Avg boundary correction delta (for corrected entries)
    const corrections = entries.filter(e => e.action === 'corrected' && e.correctedStartTime !== undefined);
    const avgStartDelta = corrections.length > 0
      ? corrections.reduce((sum, e) => sum + Math.abs(e.correctedStartTime - e.originalStartTime), 0) / corrections.length
      : 0;
    const avgEndDelta = corrections.length > 0
      ? corrections.reduce((sum, e) => sum + Math.abs(e.correctedEndTime - e.originalEndTime), 0) / corrections.length
      : 0;

    res.json({
      summary: { total, approved, rejected, corrected, approvalRate: total > 0 ? Math.round((approved / total) * 100) : 0 },
      signalAccuracy,
      weeklyTrend,
      corrections: { count: corrections.length, avgStartDelta: +avgStartDelta.toFixed(1), avgEndDelta: +avgEndDelta.toFixed(1) },
      readyToRecalibrate: total >= MIN_REVIEWS_FOR_RECALIBRATION,
      minReviews: MIN_REVIEWS_FOR_RECALIBRATION,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to compute stats' });
  }
});

// POST /api/feedback/recalibrate — compute and save new weights from feedback data
feedbackRoutes.post('/recalibrate', async (_req, res) => {
  try {
    const snap = await db.collection('feedback').get();
    const entries = snap.docs.map(d => d.data());

    if (entries.length < MIN_REVIEWS_FOR_RECALIBRATION) {
      res.status(400).json({
        error: `Need at least ${MIN_REVIEWS_FOR_RECALIBRATION} reviews to recalibrate. Currently: ${entries.length}`,
      });
      return;
    }

    // For each signal: compute correlation with correct outcome
    // Weight = how often high signal → correct detection (approved/corrected)
    const signals = ['sceneChange', 'motionAnalysis', 'audioAnalysis', 'visionAnalysis'] as const;
    const rawScores: Record<string, number> = {};

    for (const signal of signals) {
      const relevant = entries.filter(e => e.originalSignals?.[signal] !== undefined);
      if (relevant.length === 0) { rawScores[signal] = 1; continue; }

      // Score = mean(signal_value * outcome) — high signal + good outcome = good weight
      const score = relevant.reduce((sum, e) => {
        const val = e.originalSignals[signal] as number;
        const outcome = (e.action === 'approved' || e.action === 'corrected') ? 1 : 0;
        // Penalize false positives (high signal but rejected)
        const contribution = outcome === 1 ? val : (1 - val);
        return sum + contribution;
      }, 0) / relevant.length;

      rawScores[signal] = Math.max(0.05, score); // floor at 5% so no signal is completely ignored
    }

    // Normalize so weights sum to 1
    const total = Object.values(rawScores).reduce((a, b) => a + b, 0);
    const weights = Object.fromEntries(
      Object.entries(rawScores).map(([k, v]) => [k, +((v / total).toFixed(4))])
    );

    await db.collection('settings').doc('detectionWeights').set({
      weights,
      previousWeights: (await db.collection('settings').doc('detectionWeights').get()).data()?.weights ?? DEFAULT_WEIGHTS,
      lastRecalibratedAt: FieldValue.serverTimestamp(),
      reviewCount: entries.length,
      isDefault: false,
    });

    res.json({ success: true, weights, reviewCount: entries.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Recalibration failed' });
  }
});

// POST /api/feedback/weights/override — manually set weights
feedbackRoutes.post('/weights/override', async (req, res) => {
  try {
    const { weights } = req.body;
    if (!weights || typeof weights !== 'object') {
      res.status(400).json({ error: 'weights object required' });
      return;
    }

    // Validate and normalize
    const keys = ['sceneChange', 'motionAnalysis', 'audioAnalysis', 'visionAnalysis'];
    for (const k of keys) {
      if (typeof weights[k] !== 'number' || weights[k] < 0 || weights[k] > 1) {
        res.status(400).json({ error: `Invalid weight for ${k}` });
        return;
      }
    }
    const sum = keys.reduce((a, k) => a + weights[k], 0);
    const normalized = Object.fromEntries(keys.map(k => [k, +((weights[k] / sum).toFixed(4))]));

    await db.collection('settings').doc('detectionWeights').set({
      weights: normalized,
      isManualOverride: true,
      overriddenAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    res.json({ success: true, weights: normalized });
  } catch {
    res.status(500).json({ error: 'Failed to save weights' });
  }
});

function getWeekKey(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay()); // start of week
  return d.toISOString().slice(0, 10);
}
