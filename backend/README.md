# Binance Promo Trader — Backend

FastAPI backend for legitimate participation in Binance Spot promotional
trading-volume programs. Paper trading is the default and is always
available; live trading requires an explicit deployment-level opt-in
(`ALLOW_LIVE_TRADING=true`) plus a per-bot choice, on top of an API key
that has trading permission and does **not** have withdrawal permission.

This application does **not** implement wash trading, self-trading,
spoofing, layering, or any other mechanism intended to manufacture volume
artificially or evade a promotion's rules. It has no withdrawal capability
anywhere in the codebase. You are responsible for confirming that your
trading activity complies with the specific terms of whatever Binance
promotion you configure.

See `../docs/` for architecture, setup, and operational documentation.

## Quick start (local, without Docker)

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# Generate an encryption key and put it in .env as BINANCE_API_ENCRYPTION_KEY:
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

# Point DATABASE_URL/DATABASE_URL_SYNC at a running Postgres instance,
# or use the docker-compose Postgres service (see repo root).

alembic upgrade head
uvicorn app.main:app --reload
```

Open http://localhost:8000/docs for interactive API documentation.

## Quick start (Docker)

From the repository root:

```bash
docker compose up --build postgres backend
```

## Running tests

```bash
pytest
```

61 tests cover: symbol filter validation/rounding, spread and slippage
calculation, the LIMIT/MARKET/WAIT execution decision, paper-trading
simulation, the risk engine, all 5 strategies, promotion eligibility and
volume accounting, and analytics calculations. Binance API calls are never
made in tests — the test suite is fully offline.

## Project layout

See `docs/architecture.md` for a full description. In short:

- `app/services/binance/` — Binance REST client + exchange filter handling
- `app/services/execution/` — spread/slippage math, LIMIT vs MARKET vs WAIT
  decision, paper-trading simulator
- `app/services/risk/` — mandatory risk controls, independent of strategy code
- `app/services/promotions/` — promotion-type abstraction + eligibility/volume
- `app/services/strategies/` — strategy interface + 5 implementations + registry
- `app/workers/bot_worker.py` — orchestrates the above into a running bot loop
- `app/api/` — FastAPI routers
- `app/db/models/` — SQLAlchemy models
