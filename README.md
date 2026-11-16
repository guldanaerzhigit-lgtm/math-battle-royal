# Math Battle Royale

React + Vite 2.5D mathematics battle prototype for grades 5–6. Supports solo/team modes, room codes, up to 30 participants, anonymous Firebase authentication, Firestore room snapshots, lives, scoring and leaderboard.

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

## Important MVP note
Current Firestore rules and client-side scoring are prototype-only. Do not use for a public competitive tournament until room membership, answer validation, round deadlines, eliminations and score updates are moved to trusted Cloud Functions or Cloudflare Workers/Durable Objects.