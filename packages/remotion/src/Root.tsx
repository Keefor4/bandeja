import { Composition } from 'remotion';
import { HighlightReel } from './compositions/HighlightReel';
import { PlayerHighlight } from './compositions/PlayerHighlight';
import { calculateHighlightFrames, calculatePlayerHighlightFrames } from './utils';
import type { HighlightReelProps, PlayerHighlightProps } from './types';

const defaultHighlightProps: HighlightReelProps = {
  matchTitle: 'Match Preview',
  matchDate: 'January 1, 2025',
  teams: {
    team1: { player1: 'Player A', player2: 'Player B' },
    team2: { player1: 'Player C', player2: 'Player D' },
  },
  points: [],
  includeMusic: false,
};

const defaultPlayerProps: PlayerHighlightProps = {
  playerName: 'Player',
  matchTitle: 'Match',
  matchDate: 'January 1, 2025',
  teams: null,
  points: [],
  includeMusic: false,
};

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="HighlightReel"
      component={HighlightReel}
      fps={30}
      width={1920}
      height={1080}
      durationInFrames={300}
      defaultProps={defaultHighlightProps}
      calculateMetadata={({ props }) => ({
        durationInFrames: calculateHighlightFrames(props as HighlightReelProps, 30),
      })}
    />
    <Composition
      id="PlayerHighlight"
      component={PlayerHighlight}
      fps={30}
      width={1080}
      height={1920}
      durationInFrames={900}
      defaultProps={defaultPlayerProps}
      calculateMetadata={({ props }) => ({
        durationInFrames: calculatePlayerHighlightFrames(props as PlayerHighlightProps, 30),
      })}
    />
  </>
);
