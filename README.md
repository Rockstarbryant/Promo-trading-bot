# Binance Promo Trader

A full-stack application for **legitimate** participation in Binance Spot
promotional trading-volume programs — designed to minimize execution costs
(spread, slippage, fees) while accumulating genuine, real trading volume.

This project explicitly does **not** implement wash trading, self-trading,
spoofing, layering, or any mechanism intended to manufacture volume
artificially or evade a promotion's terms. It has no withdrawal capability
anywhere. Paper trading is the default and always available; live trading
requires deliberate opt-in at both the deployment and per-bot level. You
remain responsible for ensuring your usage complies with the specific
Binance promotion's official terms.

```
binance-promo-trader/
├── backend/     FastAPI + SQLAlchemy + Postgres — see backend/README.md
├── frontend/    Next.js + TypeScript + Tailwind + shadcn/ui
├── docs/        Architecture, setup, and operational docs
└── docker-compose.yml
```

## Quick start

```bash
docker compose up --build
```

- Backend API docs: http://localhost:8000/docs
- Frontend dashboard: http://localhost:3000

See `docs/deployment.md` for the full end-to-end checklist, and
`backend/README.md` / `frontend/README.md` for component-specific
instructions.

## Documentation

- [Architecture](docs/architecture.md)
- [Connecting a Binance account](docs/binance-setup.md)
- [Configuring a promotion](docs/promotion-configuration.md)
- [Strategies](docs/strategies.md)
- [Risk management](docs/risk-management.md)
- [Paper trading](docs/paper-trading.md)
- [Deployment](docs/deployment.md)
