import type { Timestamp } from 'firebase/firestore';

// ─── Match ───────────────────────────────────────────────────────────────────

export type MatchStatus =
  | 'uploaded'
  | 'processing'
  | 'detected'
  | 'reviewing'
  | 'approved'
  | 'rendering'
  | 'complete'
  | 'error';

export interface Match {
  id: string;
  title: string;
  uploadedBy: string;
  uploadedAt: Timestamp;
  videoPath: string;
  duration: number;
  status: MatchStatus;
  processingProgress: number;
  metadata: {
    resolution: string;
    fps: number;
    codec: string;
    cameraType?: 'overhead' | 'side' | 'mixed';
  };
  pointsDetected: number;
  pointsApproved: number;
  players?: MatchPlayers;
  renderPath?: string;
  renderProgress?: number;
  renderError?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface MatchPlayers {
  team1: { player1: string; player2: string };
  team2: { player1: string; player2: string };
  identifiedAt?: Timestamp;
}

// ─── DetectedPoint ───────────────────────────────────────────────────────────

export type PointStatus = 'pending' | 'approved' | 'rejected' | 'corrected';

export interface DetectionSignals {
  sceneChange: number;
  motionAnalysis: number;
  audioAnalysis?: number;
  visionAnalysis?: number;
}

export interface WinnerDetection {
  winner: 'team1' | 'team2' | null;
  confidence: number;
  reason: string;
  needsReview: boolean;
}

export interface DetectedPoint {
  id: string;
  matchId: string;
  pointNumber: number;
  startTime: number;
  endTime: number;
  duration: number;
  confidence: number;
  detectionSignals: DetectionSignals;
  status: PointStatus;
  winnerDetection?: WinnerDetection;
  correctedStartTime?: number;
  correctedEndTime?: number;
  reviewedBy?: string;
  reviewedAt?: Timestamp;
}

// ─── Shot types ──────────────────────────────────────────────────────────────

export type ShotHand = 'forehand' | 'backhand';

export type ShotType =
  | 'bandeja'
  | 'vibora'
  | 'smash'
  | 'drive'
  | 'serve'
  | 'volley_forehand'
  | 'volley_backhand'
  | 'lob_forehand'
  | 'lob_backhand'
  | 'chiquita_forehand'
  | 'chiquita_backhand'
  | 'groundstroke_forehand'
  | 'groundstroke_backhand'
  | 'other';

export const SHOT_LABELS: Record<ShotType, string> = {
  bandeja:               'Bandeja',
  vibora:                'Víbora',
  smash:                 'Smash',
  drive:                 'Drive',
  serve:                 'Serve',
  volley_forehand:       'Volley FH',
  volley_backhand:       'Volley BH',
  lob_forehand:          'Lob FH',
  lob_backhand:          'Lob BH',
  chiquita_forehand:     'Chiquita FH',
  chiquita_backhand:     'Chiquita BH',
  groundstroke_forehand: 'Groundstroke FH',
  groundstroke_backhand: 'Groundstroke BH',
  other:                 'Other',
};

// Grouped for UI rendering
export const SHOT_GROUPS: { label: string; shots: ShotType[] }[] = [
  { label: 'Power',    shots: ['smash', 'bandeja', 'vibora'] },
  { label: 'Serve',    shots: ['serve'] },
  { label: 'Volley',   shots: ['volley_forehand', 'volley_backhand'] },
  { label: 'Ground',   shots: ['groundstroke_forehand', 'groundstroke_backhand', 'drive'] },
  { label: 'Lob',      shots: ['lob_forehand', 'lob_backhand'] },
  { label: 'Chiquita', shots: ['chiquita_forehand', 'chiquita_backhand'] },
  { label: 'Other',    shots: ['other'] },
];

export type HowWon =
  | 'winner'
  | 'unforced_error'
  | 'forced_error'
  | 'ace'
  | 'double_fault'
  | 'let';

export const HOW_WON_LABELS: Record<HowWon, string> = {
  winner:        'Winner',
  unforced_error:'Unforced Error',
  forced_error:  'Forced Error',
  ace:           'Ace',
  double_fault:  'Double Fault',
  let:           'Let',
};

// ─── Point Stats ─────────────────────────────────────────────────────────────

export interface PointStats {
  pointId: string;
  matchId: string;
  setNumber: number;
  gameScore: string;
  setScore: string;
  matchScore: string;
  winner: 'team1' | 'team2';
  winnerSource: 'ai' | 'manual';
  howWon: HowWon;
  finishingShot?: ShotType;
  server?: string;
  firstServeIn: boolean;
  rallyLength: number;
  keyPlayer?: string;
  taggedBy: string;
  taggedAt: Timestamp;
}

// ─── Box Score ───────────────────────────────────────────────────────────────

export interface SetScore {
  setNumber: number;
  team1Games: number;
  team2Games: number;
}

export interface TeamStats {
  pointsWon: number;
  winners: number;
  unforcedErrors: number;
  forcedErrors: number;
  aces: number;
  doubleFaults: number;
  firstServePercentage: number;
  avgRallyLength: number;
  bandejaWinners: number;
  viboraWinners: number;
  smashWinners: number;
  volleyWinners: number;
  lobWinners: number;
  groundstrokeWinners: number;
}

export interface BoxScore {
  matchId: string;
  teams: {
    team1: { player1: string; player2: string };
    team2: { player1: string; player2: string };
  };
  finalScore: string;
  sets: SetScore[];
  stats: { team1: TeamStats; team2: TeamStats };
  updatedAt: Timestamp;
}

// ─── Feedback ────────────────────────────────────────────────────────────────

export type FeedbackAction = 'approved' | 'rejected' | 'corrected';

export interface FeedbackEntry {
  id: string;
  matchId: string;
  pointId: string;
  action: FeedbackAction;
  reviewerId: string;
  originalStartTime: number;
  originalEndTime: number;
  originalConfidence: number;
  originalSignals: DetectionSignals;
  correctedStartTime?: number;
  correctedEndTime?: number;
  videoMetadata: { resolution: string; fps: number; cameraType: string; lightingCondition?: string };
  timestamp: Timestamp;
}

// ─── Users ───────────────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'reviewer' | 'viewer';

export interface BandejaUser {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  createdAt: Timestamp;
  stats?: { pointsReviewed: number; approvalRate: number; avgTimePerReview: number };
}
