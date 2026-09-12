# Architecture

## Layering

```
API (FastAPI routers)
   |
   v
Services
   binance/      <- Binance REST integration + symbol filter validation
   execution/    <- spread/slippage math, LIMIT/MARKET/WAIT decision, paper sim
   risk/         <- mandatory pre-trade risk checks
   promotions/   <- promotion-type abstraction, eligibility, qualifying volume
   strategies/   <- strategy interface + implementations + registry
   analytics/    <- pure calculations over orders/cycles
   portfolio/    <- volume accounting from FILLED orders
   |
   v
workers/bot_worker.py  <- orchestrates all of the above into a running loop
   |
   v
db/models/  <- SQLAlchemy ORM (Postgres)
```

Each service package only depends on the ones below it in this diagram, and
never on `app.api` or `app.workers`. This is what makes it possible to:

- add a new **strategy** without touching the Binance client, the risk
  engine, or the execution engine — implement `StrategyBase` in
  `services/strategies/implementations.py` and register it in
  `services/strategies/registry.py`;
- add a new **promotion type** without touching the execution engine —
  implement `PromotionTypeHandler` in `services/promotions/engine.py` and
  register it in the module-level `_REGISTRY` dict;
- unit test spread/slippage math, the risk engine, and all 5 strategies
  with zero I/O and zero mocking, because none of those modules touch the
  network or the database.

## The trading loop (`app/workers/bot_worker.py`)

Every tick, in this fixed order:

1. Confirm the promotion is `ACTIVE` and within its start/end window.
2. Confirm the linked Binance account is active.
3. Build a `MarketContext` per eligible pair from a live order-book fetch
   (skipping any pair with stale/missing data).
4. Ask the strategy `should_sell()` then `should_buy()` for a `TradeIntent`
   (sell takes priority so open positions get closed before opening new ones).
5. Run `RiskEngine.check_pre_trade()` against the intent's order size and the
   bot's current daily volume / exposure / capital / consecutive-failure
   state, loaded fresh from the database each tick.
6. Run `decide_execution()` (spread check -> slippage estimate -> MARKET /
   LIMIT / WAIT).
7. If WAIT: emit a `risk_warning` websocket event with a human-readable
   reason (e.g. *"Waiting — SOLUSDT spread 0.24% exceeds configured maximum
   of 0.10%"*) and do nothing else this tick.
8. Otherwise submit the order — through the **paper simulator** if the bot
   is in PAPER mode or if `ALLOW_LIVE_TRADING=false` at the deployment
   level, or through the real Binance client if the bot is LIVE and the
   deployment allows it — after validating against `SymbolFilters`.
9. Persist the `Order` row (and update in-memory strategy state), and
   broadcast a websocket event.

Nothing in this loop ever counts an order as promotional volume until it
reaches `FILLED` in the database — see `services/portfolio/volume_accounting.py`.

## Bot process model (current scope vs. production)

`BotRunnerRegistry` in `bot_worker.py` currently runs each active bot as an
`asyncio.Task` inside the API process itself. This is intentionally simple
for this version and works fine for a single backend instance. If you scale
to multiple backend replicas, replace `BotRunnerRegistry` with a proper
distributed task queue (Celery, RQ, Dramatiq, or a Kubernetes Job per bot)
keyed by `bot_id`, so exactly one worker ever owns a given bot at a time —
the rest of the architecture (services layer) does not need to change.

## Security

- Binance API secrets are encrypted at rest with Fernet
  (`app/core/encryption.py`) and are never included in any API response
  schema (`BinanceAccountOut` has no secret field at all).
- Structured logging (`app/core/logging.py`) redacts any dict key that looks
  like a credential before it is ever written to a log line.
- There is no withdrawal endpoint or client method anywhere in the codebase.
- Live trading requires both a deployment-level flag
  (`ALLOW_LIVE_TRADING=true`) and a per-bot `mode=LIVE` choice, and is
  refused outright if the connected API key has withdrawal permission
  enabled.

## Backtest / replay foundation

`services/strategies/base.py`'s `MarketContext`/`StrategyState` split and
`app/workers/market_worker.py`'s `MarketSnapshot` persistence exist so that,
later, a replay driver can feed historical `MarketSnapshot` rows through the
same `StrategyBase.should_buy/should_sell` methods used live — no strategy
code needs to change to support backtesting.
