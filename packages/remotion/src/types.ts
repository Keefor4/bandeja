export interface TeamNames {
  team1: { player1: string; player2: string };
  team2: { player1: string; player2: string };
}

export interface PointData {
  id: string;
  videoSrc: string;
  startTime: number;
  endTime: number;
  pointNumber: number;
  totalPoints: number;
  winner?: 'team1' | 'team2' | null;
  gameScore?: string;
  setScore?: string;
  matchScore?: string;
  setNumber?: number;
  howWon?: string;
  shotType?: string;
}

export interface HighlightReelProps {
  matchTitle: string;
  matchDate: string;
  teams: TeamNames | null;
  points: PointData[];
  includeMusic: boolean;
  musicSrc?: string;
}

export interface PlayerHighlightProps {
  playerName: string;
  matchTitle: string;
  matchDate: string;
  teams: TeamNames | null;
  points: PointData[];
  includeMusic: boolean;
  musicSrc?: string;
}
