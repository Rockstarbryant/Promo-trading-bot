# Strategies

All strategies implement `StrategyBase` (`app/services/strategies/base.py`)
and share the same round-trip idea — buy, then later sell roughly the same
notional — since that's the underlying mechanism for genuine promotional
volume. They differ only in *which pair* and *when*.

Every strategy's proposed trade still passes through the risk engine and
the execution decision engine before anything is submitted — a strategy
cannot bypass spread/slippage/risk checks.

## Interval Round Trip
Fixed pair(s), fixed buy/sell intervals. Parameters: `eligible_pairs`,
`order_size`, `buy_interval_seconds`, `sell_interval_seconds`,
optional `max_cycles`.

## Liquidity-Aware Round Trip
Same round-trip timing, but picks whichever eligible pair currently has the
best spread/slippage. Parameters: same as above plus `max_spread_pct`,
`max_slippage_pct`.

## Multi-Pair Rotation
Cycles through eligible pairs in order (>= 2 required), skipping any pair
that currently fails its market-quality checks. Same parameters as
Liquidity-Aware.

## Lowest Execution Cost
Estimates spread + slippage + fee + a simple market-impact proxy per pair
and always trades the currently cheapest. Parameters: same, plus
`taker_fee_rate`.

## Volume Target Scheduler
Paces trading frequency between `min_interval_seconds` and
`max_interval_seconds` based on how far behind a target volume schedule the
promotion is — but it can only speed up or slow down within that
configured range, and it never overrides `max_order_size` /
`max_daily_volume` / any other risk limit to "catch up".

## Adding a new strategy

1. Subclass `StrategyBase` in `services/strategies/implementations.py`.
2. Implement `validate_config`, `evaluate_market`, `should_buy`, `should_sell`.
3. Add one line to `STRATEGY_REGISTRY` in `services/strategies/registry.py`
   and to the `StrategyType` enum in `db/models/models.py` (+ a migration).

Nothing in `app/workers/bot_worker.py`, the risk engine, or the execution
engine needs to change.
