import type { HighlightReelProps, PlayerHighlightProps, PointData } from './types';

export const INTRO_S  = 4;
export const OUTRO_S  = 6;
export const SET_BREAK_S = 3;
export const FADE_FRAMES = 12; // 0.4s at 30fps

export function calculateHighlightFrames(props: HighlightReelProps, fps: number): number {
  let total = (INTRO_S + OUTRO_S) * fps;
  let prevSet = -1;
  for (const p of props.points) {
    if (prevSet !== -1 && p.setNumber !== undefined && p.setNumber !== prevSet) {
      total += SET_BREAK_S * fps;
    }
    total += Math.round((p.endTime - p.startTime) * fps);
    prevSet = p.setNumber ?? prevSet;
  }
  return Math.max(total, fps * 3);
}

export function calculatePlayerHighlightFrames(props: PlayerHighlightProps, fps: number): number {
  const MAX_S = 30;
  const INTRO = 3;
  let clipS = 0;
  for (const p of props.points) {
    const dur = p.endTime - p.startTime;
    if (clipS + dur > MAX_S - INTRO) {
      clipS += MAX_S - INTRO - clipS;
      break;
    }
    clipS += dur;
  }
  return Math.round((INTRO + clipS) * fps);
}

export interface Segment {
  from: number;
  duration: number;
  type: 'intro' | 'outro' | 'setbreak' | 'point';
  data?: PointData | { setScore: string; setNumber: number; teams: HighlightReelProps['teams'] };
}

export function buildSegments(points: PointData[], fps: number): Segment[] {
  const segments: Segment[] = [];
  let offset = 0;

  const introDur = INTRO_S * fps;
  segments.push({ from: 0, duration: introDur, type: 'intro' });
  offset = introDur;

  let prevSet = -1;
  let prevSetScore = '';

  for (const point of points) {
    if (prevSet !== -1 && point.setNumber !== undefined && point.setNumber !== prevSet) {
      const sbDur = SET_BREAK_S * fps;
      segments.push({
        from: offset, duration: sbDur, type: 'setbreak',
        data: { setScore: prevSetScore, setNumber: prevSet, teams: null },
      });
      offset += sbDur;
    }
    const dur = Math.round((point.endTime - point.startTime) * fps);
    segments.push({ from: offset, duration: dur, type: 'point', data: point });
    offset += dur;
    prevSet = point.setNumber ?? prevSet;
    prevSetScore = point.setScore ?? prevSetScore;
  }

  segments.push({ from: offset, duration: OUTRO_S * fps, type: 'outro' });
  return segments;
}
