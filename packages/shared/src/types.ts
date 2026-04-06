import type { Timestamp } from 'firebase/firestore';

// ─── Match ───────────────────────────────────────────────────────────────────

export type MatchStatus =
  | 'uploaded'
  | 'processing'
  | 'detected'
  | 'reviewing'
  | 'approved'
  | 'rendering'
  | 'complete';

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
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ─── DetectedPoint ───────────────────────────────────────────────────────────

export type PointStatus = 'pending' | 'approved' | 'rejected' | 'corrected';

export interface DetectionSignals {
  sceneChange: number;
  motionAnalysis: number;
  audioAnalysis?: number;
  visionAnalysis?: number;
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
  correctedStartTime?: number;
  correctedEndTime?: number;
  reviewedBy?: string;
  reviewedAt?: Timestamp;
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
  videoMetadata: {
    resolution: string;
    fps: number;
    cameraType: string;
    lightingCondition?: string;
  };
  timestamp: Timestamp;
}

// ─── Box Score ───────────────────────────────────────────────────────────────

export type HowWon =
  | 'winner'
  | 'unforced_error'
  | 'forced_error'
  | 'ace'
  | 'double_fault'
  | 'let';

export type FinishingShot =
  | 'bandeja'
  | 'vibora'
  | 'smash'
  | 'volley'
  | 'lob'
  | 'chiquita'
  | 'drive'
  | 'serve'
  | 'other';

export interface PointStats {
  pointId: string;
  matchId: string;
  setNumber: number;
  gameScore: string;
  setScore: string;
  matchScore: string;
  winner: 'team1' | 'team2';
  howWon: HowWon;
  finishingShot?: FinishingShot;
  server: string;
  serveSpeed?: number;
  firstServeIn: boolean;
  rallyLength: number;
  keyPlayer?: string;
}

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
  firstServePointsWon: number;
  secondServePointsWon: number;
  breakPointsConverted: string;
  avgRallyLength: number;
  bandejaWinners: number;
  viboraWinners: number;
  smashWinners: number;
  netApproaches: number;
  lobsPlayed: number;
}

export interface BoxScore {
  matchId: string;
  teams: {
    team1: { player1: string; player2: string };
    team2: { player1: string; player2: string };
  };
  finalScore: string;
  sets: SetScore[];
  stats: {
    team1: TeamStats;
    team2: TeamStats;
  };
}

// ─── Users ───────────────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'reviewer' | 'viewer';

export interface BandejaUser {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  createdAt: Timestamp;
  stats?: {
    pointsReviewed: number;
    approvalRate: number;
    avgTimePerReview: number;
  };
}
