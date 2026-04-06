# Bandeja - Padel Match Highlight Creator

## Claude Code Project Prompt

You are building **Bandeja**, an AI-powered padel match highlight creator. This is a full-stack application that watches raw padel match footage, detects individual points, cuts out dead time, and produces highlight reels. It includes an admin review console where humans teach the AI to improve its cuts over time. The end goal is fully automated highlights with box scores.

**Before starting any phase, ask the user clarifying questions about anything ambiguous. Do not assume. Confirm your understanding before writing code.**

---

## Architecture Overview

### Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite + TypeScript |
| Video Composition | Remotion (React-based video rendering) |
| Backend API | Node.js + Express + TypeScript |
| Video Processing | Python (FastAPI) with FFmpeg + OpenCV |
| AI Detection | OpenCV heuristics + Claude Vision API (claude-sonnet-4) |
| Database / Auth | Google Firebase (Firestore + Firebase Auth) |
| Storage | Local filesystem initially, abstracted to support remote storage server later |
| Version Control | GitHub (all code, CI/CD ready) |

### System Diagram

```
[Raw Video Upload]
        |
        v
[Python Video Processor] -- FFmpeg extracts frames
        |                 -- OpenCV detects motion/court/serve patterns
        |                 -- Claude Vision analyzes ambiguous segments
        v
[Point Detection Engine] -- Outputs timestamped point boundaries
        |                   (start_time, end_time, confidence_score)
        v
[Node.js API] -- Stores cuts in Firestore
     |        -- Serves admin console data
     |        -- Manages review queue
     v
[Admin Review Console (React)] -- Reviewers approve/reject cuts
     |                          -- Bad cuts get 2min before/after context
     |                          -- Corrections feed back to AI
     v
[Feedback Loop] -- Corrections stored as training data in Firestore
     |          -- Detection model parameters update based on feedback
     v
[Remotion Composer] -- Assembles approved points into highlight reel
     |              -- Overlays box score, point markers, transitions
     v
[Final Highlight Video]
```

---

## Phase 1: Project Setup & Infrastructure

### Tasks
1. Initialize a monorepo structure on GitHub:
   ```
   bandeja/
   ├── apps/
   │   ├── web/              # React + Vite frontend
   │   ├── api/              # Node.js Express API
   │   └── processor/        # Python FastAPI video processor
   ├── packages/
   │   ├── shared/           # Shared TypeScript types
   │   └── remotion/         # Remotion video compositions
   ├── firebase/             # Firebase config, rules, indexes
   ├── .github/
   │   └── workflows/        # CI/CD pipelines
   ├── docker-compose.yml
   ├── package.json          # Workspace root
   └── README.md
   ```

2. Set up Firebase project:
   - Firebase Auth with email/password + Google sign-in
   - Firestore database with collections: `matches`, `points`, `reviews`, `feedback`, `users`, `settings`
   - Firebase Security Rules (role-based: admin, reviewer, viewer)
   - Firebase emulator suite for local development

3. Set up storage abstraction layer:
   - Interface: `StorageProvider` with methods: `upload`, `download`, `getUrl`, `delete`, `list`
   - Default implementation: `LocalStorageProvider` reading/writing from a configurable local directory
   - Placeholder: `RemoteStorageProvider` (to be implemented later for NAS/S3/GCS)
   - The local path should be configurable via environment variable `BANDEJA_STORAGE_PATH`

4. Docker Compose for local development:
   - Web frontend container
   - API container
   - Python processor container with FFmpeg + OpenCV pre-installed
   - Firebase emulator container

**ASK THE USER:**
- What GitHub organization or account should the repo live under?
- Do you want a specific Firebase project name, or should I generate one?
- Do you have a preferred local storage path for match videos?
- Do you want Docker from day one, or start without it and add later?

---

## Phase 2: Video Ingestion & Processing Pipeline

### Video Ingestion
1. Upload endpoint accepts video files (MP4, MOV, AVI)
2. On upload, create a `match` document in Firestore:
   ```typescript
   interface Match {
     id: string;
     title: string;
     uploadedBy: string;
     uploadedAt: Timestamp;
     videoPath: string;           // Path in storage
     duration: number;            // Total duration in seconds
     status: 'uploaded' | 'processing' | 'detected' | 'reviewing' | 'approved' | 'rendering' | 'complete';
     processingProgress: number;  // 0-100
     metadata: {
       resolution: string;
       fps: number;
       codec: string;
       cameraType?: string;       // overhead, side, mixed
     };
     pointsDetected: number;
     pointsApproved: number;
     createdAt: Timestamp;
     updatedAt: Timestamp;
   }
   ```

3. Trigger the Python processor via a job queue (use Firebase Cloud Functions or a simple Redis/BullMQ queue)

### Point Detection Engine (Python)

The detection pipeline runs in stages. Each stage adds confidence signals. The system should be modular so new detection strategies can be added over time.

#### Stage 1: Scene Change Detection
- Use FFmpeg scene detection filter or OpenCV frame differencing
- Detect major transitions: serve setups, ball-out-of-play pauses, celebrations
- Output candidate segments with timestamps

#### Stage 2: Motion Analysis
- Analyze optical flow to distinguish active rallies from dead time
- High motion in the court area = point being played
- Low/scattered motion = dead time (retrieving balls, walking, adjusting)
- Track motion intensity over time to find point boundaries

#### Stage 3: Audio Analysis (if audio track exists)
- Detect sharp ball-hit sounds (paddle contact)
- Detect crowd/player reactions (point end signals)
- Silence or ambient chatter = dead time

#### Stage 4: Claude Vision Analysis (for ambiguous segments)
- For segments where OpenCV confidence is below threshold (configurable, default 0.7):
  - Sample 3-5 frames from the segment
  - Send to Claude Vision API with a prompt asking:
    - "Is a padel point actively being played in these frames?"
    - "Are players in serve position, rally position, or idle?"
    - "Is the ball visible and in play?"
  - Use Claude's response to confirm or reject the boundary

#### Output Format
```typescript
interface DetectedPoint {
  id: string;
  matchId: string;
  pointNumber: number;
  startTime: number;          // seconds from video start
  endTime: number;            // seconds from video start
  duration: number;           // endTime - startTime
  confidence: number;         // 0-1 aggregate confidence
  detectionSignals: {
    sceneChange: number;      // 0-1
    motionAnalysis: number;   // 0-1
    audioAnalysis?: number;   // 0-1
    visionAnalysis?: number;  // 0-1
  };
  status: 'pending' | 'approved' | 'rejected' | 'corrected';
  correctedStartTime?: number;
  correctedEndTime?: number;
  reviewedBy?: string;
  reviewedAt?: Timestamp;
}
```

**ASK THE USER:**
- What's the typical length of a full match video? (This affects processing strategy)
- What resolution are the videos usually? (720p, 1080p, 4K?)
- Do the videos have audio, and is the audio useful (clear ball sounds) or noisy?
- Should processing happen synchronously (wait for result) or as a background job?
- What confidence threshold should trigger Claude Vision review? (default: 0.7)

---

## Phase 3: Admin Review Console

### Dashboard View
- List of all uploaded matches with status indicators
- Filters: by status, date, uploader
- Progress bars showing detection and review completion
- Quick stats: total matches, points detected, points reviewed, approval rate

### Match Review View
- Video player showing the full match
- Timeline visualization below the player:
  - Green segments = detected points
  - Red segments = dead time (cut)
  - Yellow segments = low confidence (needs review)
  - Blue segments = already reviewed/approved
- Click any segment to jump to it
- Bulk approve high-confidence points (above configurable threshold)

### Point Review View (the core review workflow)
This is the most important screen. For each detected point:

1. **Show the clip**: Play the detected point from `startTime` to `endTime`
2. **Decision buttons**:
   - **Approve** - This cut is correct
   - **Reject** - This is not a real point (false positive)
   - **Adjust** - The boundaries need correction
3. **On "Adjust"**:
   - Expand the view to show 2 minutes before and 2 minutes after the detected boundaries
   - Show the expanded video with the original cut highlighted
   - User drags start/end markers to set correct boundaries
   - User saves the corrected cut
4. **Keyboard shortcuts** for fast reviewing:
   - `A` = Approve
   - `R` = Reject
   - `E` = Adjust (Edit)
   - `Space` = Play/Pause
   - `Left/Right` = Seek 1 second
   - `Shift+Left/Right` = Seek 5 seconds
   - `Enter` = Save adjustment and move to next

### Review Queue
- Points ordered by confidence (lowest first, so humans review the hardest ones)
- Show which reviewer is currently reviewing which match (avoid conflicts)
- Lock mechanism: when a reviewer opens a point, it's locked for 5 minutes
- Show review progress per reviewer

### User Management
- Roles: `admin` (full access + settings), `reviewer` (review only), `viewer` (read only)
- Admin can invite reviewers via email
- Track reviewer stats: points reviewed, approval rate, avg time per review

**ASK THE USER:**
- Should multiple reviewers be able to review the same point (consensus mode), or is one review enough?
- Do you want reviewer disagreement resolution (e.g., if 2 out of 3 reviewers disagree)?
- Should there be a "skip" option for reviewers who are unsure?
- What's the ideal keyboard shortcut layout? (The above is a suggestion)
- Do you want real-time collaboration (see other reviewers' cursors/progress)?

---

## Phase 4: AI Feedback Loop & Learning

### How Bandeja Learns

The feedback loop is the heart of the system. Every human correction teaches Bandeja to make better cuts.

#### Feedback Storage
```typescript
interface FeedbackEntry {
  id: string;
  matchId: string;
  pointId: string;
  action: 'approved' | 'rejected' | 'corrected';
  reviewerId: string;
  
  // Original detection
  originalStartTime: number;
  originalEndTime: number;
  originalConfidence: number;
  originalSignals: DetectionSignals;
  
  // Correction (if action = 'corrected')
  correctedStartTime?: number;
  correctedEndTime?: number;
  
  // Context for learning
  videoMetadata: {
    resolution: string;
    fps: number;
    cameraType: string;
    lightingCondition?: string;
  };
  
  timestamp: Timestamp;
}
```

#### Learning Mechanism (Evolving Over Time)

**V1 - Threshold Tuning (Start here)**:
- Aggregate feedback to adjust confidence thresholds per signal type
- If scene change detection is consistently wrong but motion analysis is right, weight motion higher
- Store optimal weights per camera type / video quality
- Simple weighted scoring: `finalConfidence = w1*scene + w2*motion + w3*audio + w4*vision`

**V2 - Pattern Library**:
- Store "golden examples" of correct point boundaries
- When analyzing new videos, compare frame signatures against the library
- Use cosine similarity on frame embeddings (extract via a lightweight model or Claude Vision)
- Build a library of "this is what a point start looks like" and "this is what dead time looks like"

**V3 - Fine-tuned Detection (Future)**:
- Export feedback data as training labels
- Train a lightweight classifier (e.g., using TensorFlow.js or PyTorch) on the labeled segments
- The model takes a short video segment and outputs: point/not-point with confidence
- Continue using Claude Vision as a fallback for low-confidence segments

#### Feedback Dashboard (Admin Only)
- Charts showing detection accuracy over time
- Confusion matrix: true positives, false positives, false negatives
- Per-signal accuracy breakdown
- Comparison: which camera types are hardest to analyze?
- Button to trigger weight recalculation based on latest feedback

**ASK THE USER:**
- How many matches do you expect to process before the AI should be "good enough" for minimal corrections?
- Do you want to start with V1 only, or build V1+V2 from the start?
- Should there be a way to manually set detection weights, or always auto-calculate from feedback?
- Do you want A/B testing capability (run two detection strategies and compare)?

---

## Phase 5: Box Score Generation

### Point-Level Tracking
For each approved point, the system should track (initially via human input in the review console, later via AI):

```typescript
interface PointStats {
  pointId: string;
  matchId: string;
  
  // Score state
  setNumber: number;
  gameScore: string;         // e.g., "40-30"
  setScore: string;          // e.g., "4-3"
  matchScore: string;        // e.g., "1-0"
  
  // Point outcome
  winner: 'team1' | 'team2';
  howWon: 'winner' | 'unforced_error' | 'forced_error' | 'ace' | 'double_fault' | 'let';
  
  // Shot that ended the point
  finishingShot?: 'bandeja' | 'vibora' | 'smash' | 'volley' | 'lob' | 'chiquita' | 'drive' | 'serve' | 'other';
  
  // Serve info
  server: string;            // Player name or position
  serveSpeed?: number;
  firstServeIn: boolean;
  
  // Rally info
  rallyLength: number;       // Number of shots
  
  // Player who hit the winning/error shot
  keyPlayer?: string;
}
```

### Match-Level Box Score
```typescript
interface BoxScore {
  matchId: string;
  teams: {
    team1: { player1: string; player2: string };
    team2: { player1: string; player2: string };
  };
  
  finalScore: string;        // e.g., "6-4, 3-6, 6-2"
  sets: SetScore[];
  
  stats: {
    [teamId: string]: {
      pointsWon: number;
      winners: number;
      unforcedErrors: number;
      forcedErrors: number;
      aces: number;
      doubleFaults: number;
      firstServePercentage: number;
      firstServePointsWon: number;
      secondServePointsWon: number;
      breakPointsConverted: string;  // "3/5"
      avgRallyLength: number;
      
      // Padel-specific
      bandejaWinners: number;
      viboraWinners: number;
      smashWinners: number;
      netApproaches: number;
      lobsPlayed: number;
    };
  };
}
```

### Box Score UI
- During review, allow the reviewer to tag each point with stats
- Quick-tag buttons for common outcomes (winner, error, ace)
- Running score tracker that auto-increments based on point outcomes
- Post-match summary screen with full box score
- Box score overlay in the final highlight video (via Remotion)

**ASK THE USER:**
- Should box score tagging happen during the initial point review, or as a separate pass?
- Do you want player names entered per match, or maintained in a player database?
- What box score format should the highlight video overlay use? (Corner scorebug? Full-screen between sets? Both?)
- Are there specific stats that are most important for padel that I might be missing?

---

## Phase 6: Highlight Video Composition (Remotion)

### Remotion Compositions

1. **HighlightReel**: The main output
   - Intro card with match title, date, teams
   - Each approved point plays in sequence
   - Transition effects between points (quick fade or cut)
   - Score bug overlay showing current score
   - Point counter ("Point 14 of 47")
   - Set break cards showing set scores
   - Outro card with final box score summary

2. **BoxScoreCard**: Full-screen stats display
   - Shown between sets or at the end
   - Animated stat bars
   - Key stats highlighted

3. **ScoreBug**: Persistent overlay
   - Shows team names, current score
   - Updates per point
   - Configurable position (top-left, top-right, bottom)

### Rendering Pipeline
1. User clicks "Generate Highlight" on an approved match
2. System compiles the point list with stats
3. Remotion renders the composition server-side
4. Output video saved to storage
5. Download link provided to user

### Customization Options
- Include/exclude specific points
- Choose transition style
- Toggle box score overlay
- Set output resolution (720p, 1080p)
- Add custom intro/outro images or text

**ASK THE USER:**
- What visual style do you want for the highlight? (Clean/minimal, sports broadcast, social media friendly?)
- Should highlights be exportable in different aspect ratios (16:9 for YouTube, 9:16 for Instagram/TikTok)?
- Do you want background music support?
- Should there be a "quick highlight" option that only includes the best N points (by rally length or shot type)?

---

## Phase 7: GitHub Integration & DevOps

### Repository Setup
- Branch protection on `main`
- Required PR reviews
- GitHub Actions workflows:
  - Lint + type check on PR
  - Run tests on PR
  - Build and deploy on merge to `main`
- Issue templates for bug reports and feature requests
- Project board for tracking work

### Environment Management
- `.env.example` with all required variables
- Firebase config for dev/staging/prod
- Secrets management via GitHub Secrets

**ASK THE USER:**
- Do you want automatic deployment (e.g., to Firebase Hosting / Vercel / a VPS)?
- Do you have a preferred CI/CD setup, or should I design one?
- Should the Python processor be deployable independently (as a microservice)?

---

## Non-Functional Requirements

1. **All tools must be free**: No paid APIs except Claude (which you already have). Use open-source alternatives wherever possible.
2. **Storage abstraction**: Must work with local filesystem now but be swappable to any storage backend later.
3. **Scalability**: The admin console must handle 10+ concurrent reviewers without conflicts.
4. **Video processing**: Must handle videos up to 2 hours long without crashing. Use streaming/chunked processing.
5. **Real-time updates**: Admin console should show live processing progress (use Firestore real-time listeners or WebSockets).
6. **Mobile-friendly**: The review console should be usable on tablets (reviewers might use iPads courtside).

---

## Implementation Order

Build in this order, confirming each phase works before moving to the next:

1. **Phase 1**: Project setup, Firebase, storage abstraction, GitHub repo
2. **Phase 2**: Video upload + basic point detection (scene change + motion only)
3. **Phase 3**: Admin console with review workflow (the core UX loop)
4. **Phase 4**: Claude Vision integration for ambiguous segments + feedback loop V1
5. **Phase 5**: Box score tagging in the review console
6. **Phase 6**: Remotion highlight composition with box score overlay
7. **Phase 7**: Polish, CI/CD, deployment

At each phase, demo the working feature to the user and ask for feedback before proceeding.

---

## Critical Reminders

- **Ask questions before coding.** If anything is unclear, stop and ask.
- **Use free tools only.** Firebase free tier, FFmpeg (free), OpenCV (free), Remotion (free for self-hosted), Claude API (user's existing key).
- **GitHub first.** Initialize the repo immediately. Commit after every working feature.
- **Storage is abstract.** Never hardcode file paths. Always go through the StorageProvider interface.
- **Feedback is sacred.** Every human correction must be stored and used to improve detection. Never discard feedback data.
- **The admin console is the product.** The video processing is important, but the review UX is what makes Bandeja useful. Make it fast, intuitive, and keyboard-driven.
