# Deployment

## Local / development

```bash
docker compose up --build postgres backend
```

The backend applies Alembic migrations automatically on container start
(see the `backend` service's `command` in `docker-compose.yml`).

## Environment variables (backend/.env)

See `backend/.env.example` for the full list. At minimum, set:

- `DATABASE_URL` / `DATABASE_URL_SYNC`
- `BINANCE_API_ENCRYPTION_KEY` (generate with the Fernet snippet in
  `.env.example` — losing this key makes all stored Binance secrets
  unrecoverable, so back it up securely, separately from the database)
- `JWT_SECRET_KEY` (use a long random value in any non-local environment)
- `ALLOW_LIVE_TRADING` — leave `false` until you've validated the setup in
  paper mode

## Production notes

- Run Postgres with regular backups; `AuditLog`, `Order`, and `Fill` rows
  are your compliance/record-keeping trail.
- Put the backend behind TLS; never expose port 8000 directly to the
  internet without a reverse proxy.
- `BotRunnerRegistry` (see `docs/architecture.md`) runs bots as in-process
  asyncio tasks. If you deploy multiple backend replicas behind a load
  balancer, either pin bot-related traffic/workers to a single replica or
  replace `BotRunnerRegistry` with a distributed task queue before scaling
  out — running the same bot in two places at once would double its
  effective risk limits.
- Rotate `JWT_SECRET_KEY` and `BINANCE_API_ENCRYPTION_KEY` only with a
  planned migration (rotating the JWT secret invalidates all sessions;
  rotating the encryption key requires re-encrypting all stored
  `encrypted_api_secret` values first).

## End-to-end checklist

1. `docker compose up --build postgres backend`
2. Visit `/docs` and register a user, connect a Binance account (real key
   with Reading + Spot Trading only — no withdrawals), create a promotion
   in `DRAFT`, create a strategy configuration, create a bot in `PAPER`
   mode.
3. `POST /api/promotions/{id}/activate`, then `POST /api/bots/{id}/start`.
4. Watch `GET /api/orders?bot_id=...` and the `/ws/bots/{id}` websocket
   feed for simulated fills.
5. Check `GET /api/promotions/{id}/progress` and
   `GET /api/analytics/bots/{id}/summary`.
6. Once satisfied, set `ALLOW_LIVE_TRADING=true`, create a new bot with
   `mode=LIVE` against a real-trading-enabled key, and start small.
7. `POST /api/bots/{id}/stop` (graceful) or
   `POST /api/bots/{id}/emergency-stop` (cancels open orders immediately)
   when you're done.
