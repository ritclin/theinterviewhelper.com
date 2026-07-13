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

After deploying the relay server, point clients at your public URL instead of `localhost`:

- **Web dashboard**: uses the same origin automatically
- **Windows client**: `python client.py --server https://your-app.example.com`
- **Mobile client (Expo)**: set the server URL in the app UI

## Health check

`GET /api/health` returns server status and whether Gemini is configured.
