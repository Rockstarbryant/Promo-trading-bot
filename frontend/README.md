# Binance Promo Trader — Frontend

Next.js 15 + TypeScript + Tailwind dashboard for the Binance Promo Trader
backend. Dark, dense, trading-terminal styling — this is an instrument
panel, not a marketing site.

## Architecture notes

- **Auth tokens never reach the browser.** Login/register go through
  `app/api/auth/*` Route Handlers, which call the backend and store the
  resulting JWT in an `httpOnly` cookie. Every other backend call goes
  through the catch-all proxy at `app/api/proxy/[...path]/route.ts`, which
  attaches the token server-side. Client components only ever call
  `/api/proxy/*` or `/api/auth/*` — see `lib/api-client.ts`.
- Server Components that need data at request time use
  `lib/server-api.ts`, which calls the backend directly (no self-hop
  through the proxy).
- Fonts (Space Grotesk, IBM Plex Mono) are self-hosted via `@fontsource`
  packages rather than `next/font/google`, so the production build doesn't
  depend on reaching Google's font CDN at build time.

## Quick start (local, without Docker)

```bash
cd frontend
npm install
cp .env.example .env
# Set BACKEND_API_BASE_URL to wherever the backend is running,
# e.g. http://localhost:8000

npm run dev
```

Open http://localhost:3000 — you'll be redirected to `/login`. Register a
user, then walk through: connect a Binance account → create a promotion →
activate it → create a strategy configuration → create a bot (start in
PAPER mode) → start the bot → watch orders and analytics update.

## Quick start (Docker)

From the repository root:

```bash
docker compose up --build
```

## Scripts

```bash
npm run dev      # local development server
npm run build    # production build (also type-checks + lints)
npm run start    # run the production build
npm run lint     # ESLint only
npm run test     # Vitest (jsdom + Testing Library)
```

## Tests

33 tests across 7 files, covering: dashboard/formatting calculations,
status-badge tone mapping, the promotion creation form (including API
error handling), strategy-configuration dynamic parameter fields, the bot
detail page's PAPER/LIVE banner and lifecycle controls (Start/Pause/
Resume/Stop/Emergency-stop) across every bot status, risk/wait-reason
surfacing, the order table, and accounts-page error handling.

## Known items

- `npm audit` reports one remaining moderate-severity advisory against
  `next@15.5.25` whose only available fix is a major-version bump to
  Next 16. Upgrading to Next 15 already resolved the critical-severity
  issues present in the originally-scaffolded 14.2.15. Plan a Next 16
  migration separately rather than rushing it into this release.
- The `/ws/bots/{id}` backend WebSocket endpoint exists but this UI uses
  polling (every 4s on the bot detail page) rather than a live WebSocket
  subscription, to keep the auth-proxy story simple. Wiring a WebSocket
  client through the session cookie is a reasonable follow-up.
