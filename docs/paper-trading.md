# Paper trading

`app/services/execution/paper_engine.py` simulates fills using the same
real-time order-book data the live path uses:

- `simulate_market_order()` walks the real order book (via
  `estimate_slippage_for_quote_amount`/`_base_qty`) to compute a realistic
  average fill price and a simulated taker fee, exactly like a real MARKET
  order would experience.
- `simulate_limit_order_fill()` fills a simulated LIMIT order only when its
  price has actually crossed the live best bid/ask — otherwise it returns
  `None`, meaning "still resting", just like a real passive limit order.

No paper order is ever sent to Binance. `Order.is_paper` is `True` for
every paper fill, and paper orders never touch `client.place_order`.

## Using it

Every bot is created in `PAPER` mode by default
(`TradingBotCreate.mode` defaults to `"PAPER"`). This should be the default
for any new promotion/strategy combination — validate that a strategy
behaves sensibly, that your risk limits are set the way you expect, and
that the promotion's qualifying-volume accounting matches your
expectations, before ever switching to `LIVE`.

Switching to `LIVE` additionally requires `ALLOW_LIVE_TRADING=true` at the
deployment level — see `docs/risk-management.md`.
