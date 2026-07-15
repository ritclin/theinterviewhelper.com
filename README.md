<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# The Interview Helper

Real-time interview assistance platform with a React web dashboard, Socket.io relay server, Gemini AI analysis, and optional Stripe subscriptions.

## Prerequisites

- Node.js 20+ (22 recommended)
- A [Gemini API key](https://aistudio.google.com/apikey) for live AI responses

## Run locally

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy environment variables and add your API key:

   ```bash
   cp .env.example .env
   ```

   Set `GEMINI_API_KEY` in `.env`.

3. Start the development server:

   ```bash
   npm run dev
   ```

4. Open http://localhost:3000

Without `GEMINI_API_KEY`, the server runs in simulation mode with canned AI responses.

## Production build

```bash
npm run build
NODE_ENV=production npm run start
```

## Deploy with Docker

```bash
docker build -t the-interview-helper .
docker run --rm -p 3000:3000 \
  -e NODE_ENV=production \
  -e GEMINI_API_KEY=your_key_here \
  -e APP_URL=http://localhost:3000 \
  the-interview-helper
```

Cloud platforms (Cloud Run, Railway, Render, Fly.io) can use the included `Dockerfile`. Set `PORT` from the platform; the server reads `process.env.PORT`.

## Required environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `GEMINI_API_KEY` | Recommended | Enables live Gemini AI analysis |
| `NODE_ENV` | Yes (deploy) | Must be `production` when deployed |
| `PORT` | Auto on most hosts | HTTP port (defaults to 3000) |
| `APP_URL` | Recommended | Public URL for client configuration |

## Optional environment variables

| Variable | Purpose |
|----------|---------|
| `STRIPE_SECRET_KEY` | Real Stripe checkout |
| `STRIPE_WEBHOOK_SECRET` | Verified Stripe webhooks |

## Companion clients

### 1. Subscribe (required — €20/month)

Open **`/subscribe`** on your deployed site (e.g. `https://theinterviewhelpercom-production.up.railway.app/subscribe`), pay with Stripe, and use the **same email** everywhere.

Pairing and AI answers are **blocked server-side** until subscription is active.

### 2. Android app (host + personalized AI)

The Android app is the **session host**: it creates the room, stores your profile (position, job description, CV), and displays AI answers.

**Option A — Expo Go (quick test)**

```bash
cd mobile-client && npm install && npx expo start
```

Scan the QR code with Expo Go on Android.

**Option B — Standalone APK (recommended for interviews)**

```bash
cd mobile-client
npm install -g eas-cli
eas login
eas build -p android --profile preview
```

Install the downloaded APK on your phone.

**In the app:**

1. Enter your **billing email** → Check subscription
2. Fill in **position, job description, CV** (paste or upload `.txt`)
3. Tap **Start pairing session** → note the **6-digit room code**
4. Open the **Live answers** tab during the interview

### 3. Windows stealth capture (.exe)

Captures **full-screen** interview questions and sends them to your Android app. Runs hidden in the system tray.

**Build on Windows (once):**

```powershell
cd windows-client
powershell -ExecutionPolicy Bypass -File build.ps1
```

**Silent install + auto-start on login:**

```powershell
powershell -ExecutionPolicy Bypass -File install.ps1 -RoomCode 123456
```

Replace `123456` with the code shown in the Android app.

**Manual run:**

```powershell
dist\InterviewHelperCapture.exe --room 123456 --stealth
```

**Hotkey:** `Ctrl+Shift+Space` — captures the screen and sends it to your phone. If auto-analyze is enabled on Android, AI answers start immediately.

### End-to-end flow

```
Subscribe (/subscribe) → Android: profile + start session → Windows: install with room code
→ Ctrl+Shift+Space during interview → screenshot on phone → personalized AI answer
```

## Health check

`GET /api/health` returns server status and whether Gemini is configured.

## Security (production checklist)

Set these before going live:

| Variable | Purpose |
|----------|---------|
| `NODE_ENV=production` | Enables production hardening |
| `APP_URL` | Restricts Socket.io CORS to your domain |
| `ADMIN_API_KEY` | Protects session/room admin APIs (`X-Admin-Key` header) |
| `STRIPE_WEBHOOK_SECRET` | Required for verified Stripe webhooks |
| `GEMINI_API_KEY` | Keep server-side only; never expose in frontend |

Built-in protections: Helmet security headers, API rate limiting, cryptographically secure room codes, join brute-force limits, AI rate limits, payload size caps, open-redirect prevention on Stripe URLs, and disabled webhook simulation in production.

## Future-proofing roadmap

| Phase | Improvement |
|-------|---------------|
| Now | Single-instance in-memory state (fine for MVP) |
| Next | Redis for rooms + rate limits (multi-instance) |
| Next | PostgreSQL for sessions/subscriptions persistence |
| Next | User authentication (OAuth/JWT) replacing email-only subscription lookup |
| Next | End-to-end room encryption for screenshot streams |
