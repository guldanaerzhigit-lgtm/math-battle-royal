# Math Battle Royale

A React + Vite 2.5D mathematics battle game for grades 5–6.

## Arena features
- Multiplayer rooms with a 5-character join code; up to 30 participants.
- SOLO and TEAM room modes.
- 2.5D floating island arena with animated player avatars.
- Each player moves their own character with **WASD**, **arrow keys**, or the on-screen directional pad.
- Live character positions, health hearts, player names and team colors are synchronized through Firestore.
- Three lives, answer scoring, leaderboard and elimination state.
- At the end of a round, the host resolves unanswered players; players who lose all lives are eliminated.
- When one player remains, the arena declares the champion and shows a winner screen.
- Local demo mode includes sample opponents so the arena can be tested without Firebase.

## Local setup
1. Install Node.js 20+.
2. Run `npm install`.
3. Copy `.env.example` to `.env` and add Firebase Web App settings.
4. Enable **Authentication → Anonymous** and create **Cloud Firestore** in Firebase.
5. Publish `firestore.rules` in Firestore Rules.
6. Run `npm run dev`.

Without Firebase config the demo mode runs locally. Online rooms require Firebase.

## Cloudflare Pages
Connect this GitHub repository to Cloudflare Pages. Framework: Vite. Build command: `npm run build`. Output directory: `dist`. Add each `VITE_FIREBASE_*` variable in Pages → Settings → Environment variables, then redeploy. Add the Pages domain to Firebase Authentication → Authorized domains.

## Important MVP / production note
This is an interactive MVP. Firestore room documents currently contain client-updated player positions and game state. The current rules are permissive for prototyping and are **not safe for a public competitive tournament**. Before public release, move room membership, authoritative round deadlines, answer validation, elimination and score updates into trusted Cloud Functions or Cloudflare Workers/Durable Objects. Add rate limits and strict per-player authorization. The client-side countdown is a display; the host currently triggers round resolution.
