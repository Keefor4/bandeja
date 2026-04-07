import path from 'node:path';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../firebase.js';
import type { DetectedPoint } from '@bandeja/shared';

export const renderRoutes: Router = Router();

const STORAGE_PATH = process.env.BANDEJA_STORAGE_PATH ?? 'C:/Users/Tomer/Desktop/Bandeja video';
const API_BASE = process.env.API_BASE_URL ?? 'http://localhost:4000';

/** Extract a short clip from a video using FFmpeg (fast input-seek, stream copy). */
function extractClip(videoPath: string, startTime: number, duration: number, outPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-ss', String(startTime),
      '-i', videoPath,
      '-t', String(duration),
      '-c', 'copy',
      '-avoid_negative_ts', 'make_zero',
      outPath,
    ];
    const proc = spawn('ffmpeg', args, { stdio: 'pipe' });
    proc.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)));
    proc.on('error', reject);
  });
}

// Cache the webpack bundle URL so we only bundle once per API process
let bundleCache: string | null = null;

async function getBundle(): Promise<string> {
  if (bundleCache) return bundleCache;
  const { bundle } = await import('@remotion/bundler');
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const entryPoint = path.resolve(__dirname, '../../../../packages/remotion/src/Root.tsx');
  console.log('[Render] Bundling Remotion at', entryPoint);
  bundleCache = await bundle({ entryPoint });
  console.log('[Render] Bundle ready');
  return bundleCache;
}

// POST /api/render/:matchId
// Body: { quickHighlight?: number, includeMusic?: boolean, playerHighlight?: string }
renderRoutes.post('/:matchId', async (req, res) => {
  const { matchId } = req.params;
  const options = req.body as {
    quickHighlight?: number;
    includeMusic?: boolean;
    playerHighlight?: string;
  };

  try {
    const matchSnap = await db.collection('matches').doc(matchId).get();
    if (!matchSnap.exists) { res.status(404).json({ error: 'Match not found' }); return; }

    await db.collection('matches').doc(matchId).update({
      status: 'rendering',
      renderProgress: 0,
      updatedAt: FieldValue.serverTimestamp(),
    });

    res.json({ status: 'queued' });

    runRender(matchId, matchSnap.data()!, options).catch(err => {
      console.error('[Render] Failed:', err);
      db.collection('matches').doc(matchId).update({
        status: 'error',
        renderError: String(err),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to start render' });
  }
});

// GET /api/render/:matchId/status
renderRoutes.get('/:matchId/status', async (req, res) => {
  try {
    const snap = await db.collection('matches').doc(req.params.matchId).get();
    if (!snap.exists) { res.status(404).json({ error: 'Not found' }); return; }
    const { status, renderProgress, renderPath, renderError } = snap.data()!;
    res.json({ status, renderProgress, renderPath, renderError });
  } catch {
    res.status(500).json({ error: 'Failed to get status' });
  }
});

async function runRender(
  matchId: string,
  match: FirebaseFirestore.DocumentData,
  options: { quickHighlight?: number; includeMusic?: boolean; playerHighlight?: string },
) {
  const { renderMedia, selectComposition } = await import('@remotion/renderer');
  const matchRef = db.collection('matches').doc(matchId);

  // Fetch approved points ordered by pointNumber
  const pointsSnap = await db.collection('points')
    .where('matchId', '==', matchId)
    .where('status', 'in', ['approved', 'corrected'])
    .orderBy('pointNumber', 'asc')
    .get();

  let points = pointsSnap.docs.map(d => ({ ...(d.data() as DetectedPoint), id: d.id }));

  // Fetch pointStats
  const statsSnap = await db.collection('pointStats').where('matchId', '==', matchId).get();
  const statsMap: Record<string, FirebaseFirestore.DocumentData> = {};
  statsSnap.docs.forEach(d => { statsMap[d.id] = d.data(); });

  // Filter for player highlight (winner on their side)
  if (options.playerHighlight) {
    const pn = options.playerHighlight;
    const t1Players = [match.players?.team1?.player1, match.players?.team1?.player2];
    const t2Players = [match.players?.team2?.player1, match.players?.team2?.player2];
    points = points.filter(p => {
      const s = statsMap[p.id];
      if (!s) return false;
      const winnerTeam = s.winner as string | undefined;
      if (!winnerTeam) return false;
      return winnerTeam === 'team1' ? t1Players.includes(pn) : t2Players.includes(pn);
    });
  }

  // Quick highlight: top N by rally length, restored to chronological order
  if (options.quickHighlight && options.quickHighlight > 0) {
    points = [...points]
      .sort((a, b) => (statsMap[b.id]?.rallyLength ?? 0) - (statsMap[a.id]?.rallyLength ?? 0))
      .slice(0, options.quickHighlight)
      .sort((a, b) => a.pointNumber - b.pointNumber);
  }

  const uploadedAt = match.uploadedAt?.toDate?.() ?? new Date();
  const matchDate = uploadedAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // Pre-extract each point as a short clip — avoids deep seeking in a large file
  const clipsDir = path.join(STORAGE_PATH, 'renders', 'clips', matchId);
  await fs.mkdir(clipsDir, { recursive: true });
  const sourceVideoPath = path.join(STORAGE_PATH, match.videoPath);

  console.log(`[Render] Extracting ${points.length} clips from source video…`);
  const pointData = await Promise.all(points.map(async (p, i) => {
    const s = statsMap[p.id];
    const startTime = p.correctedStartTime ?? p.startTime;
    const endTime   = p.correctedEndTime ?? p.endTime;
    const duration  = endTime - startTime;
    const clipFile  = path.join(clipsDir, `clip_${i}.mp4`);
    await extractClip(sourceVideoPath, startTime, duration, clipFile);
    return {
      id: p.id,
      // Each clip starts at 0:00 — no deep seeking needed
      videoSrc: `http://localhost:4000/storage/renders/clips/${matchId}/clip_${i}.mp4`,
      startTime: 0,
      endTime: duration,
      pointNumber: p.pointNumber,
      totalPoints: points.length,
      winner: s?.winner ?? null,
      gameScore: s?.gameScore ?? '',
      setScore: s?.setScore ?? '',
      matchScore: s?.matchScore ?? '',
      setNumber: s?.setNumber ?? 1,
      howWon: s?.howWon ?? '',
      shotType: s?.finishingShot ?? '',
    };
  }));
  console.log(`[Render] All clips extracted`);

  const isPlayerReel = Boolean(options.playerHighlight);
  const compositionId = isPlayerReel ? 'PlayerHighlight' : 'HighlightReel';

  const inputProps = isPlayerReel
    ? {
        playerName: options.playerHighlight!,
        matchTitle: match.title,
        matchDate,
        teams: match.players ?? null,
        points: pointData,
        includeMusic: options.includeMusic ?? false,
      }
    : {
        matchTitle: match.title,
        matchDate,
        teams: match.players ?? null,
        points: pointData,
        includeMusic: options.includeMusic ?? false,
      };

  const serveUrl = await getBundle();

  // Use software rendering (swangle) — required for headless Docker environments
  const chromiumOptions = { gl: 'swangle' as const };

  const composition = await selectComposition({
    serveUrl,
    id: compositionId,
    inputProps,
    chromiumOptions,
  });

  const outputDir = path.join(STORAGE_PATH, 'renders');
  await fs.mkdir(outputDir, { recursive: true });

  const safeName = options.playerHighlight?.replace(/\s+/g, '_') ?? 'highlight';
  const fileName = isPlayerReel ? `${matchId}-${safeName}.mp4` : `${matchId}.mp4`;
  const outputLocation = path.join(outputDir, fileName);

  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    outputLocation,
    inputProps,
    chromiumOptions,
    timeoutInMilliseconds: 120000,
    onProgress: async ({ progress }) => {
      await matchRef.update({
        renderProgress: Math.round(progress * 100),
        updatedAt: FieldValue.serverTimestamp(),
      });
    },
  });

  const renderPath = `renders/${fileName}`;
  await matchRef.update({
    status: 'complete',
    renderPath,
    renderProgress: 100,
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Clean up temp clips
  await fs.rm(clipsDir, { recursive: true, force: true }).catch(() => {});

  console.log(`[Render] ${matchId} → ${outputLocation}`);
}
