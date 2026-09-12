# Risk management

Every bot has these mandatory, user-configurable limits (see
`services/risk/engine.py`):

| Limit | Effect |
|---|---|
| `max_capital` | Total capital the bot may ever have deployed at once |
| `max_order_size` | Largest single order (in quote currency) |
| `max_daily_volume` | Caps how much volume the bot will generate per day |
| `max_daily_loss` | Bot stops trading once realized daily loss reaches this |
| `max_spread_pct` | Bot waits instead of trading if spread exceeds this |
| `max_slippage_pct` | Bot waits instead of trading if estimated slippage exceeds this |
| `max_exposure` | Caps net open position size |
| `max_consecutive_failures` | Bot stops after this many rejected orders in a row |
| `max_stale_order_seconds` | Open limit orders older than this get cancelled |

`RiskEngine.check_pre_trade()` is called before every single order and
checks all of the capital/size/volume/loss/exposure/failure limits above in
one pass. `check_spread` / `check_slippage` are called by the execution
decision engine. `check_stale_order` should be polled by an order-management
routine (or the market worker) to cancel abandoned limit orders — the app
must never leave a limit order open indefinitely.

## Emergency stop

`POST /api/bots/{id}/emergency-stop` immediately stops the bot's trading
loop and attempts to cancel all of that bot's outstanding open orders. It
does **not** automatically liquidate any resulting position — closing out a
position is a trading decision with its own market-impact and cost
implications, and is left to the user (or a future explicit "flatten
position" action) rather than being done silently during what is meant to
be a safety action.

## Paper mode as the default safety rail

A bot cannot go live unless: (a) the deployment sets
`ALLOW_LIVE_TRADING=true`, (b) the bot's `mode` is explicitly set to
`LIVE`, (c) the connected Binance account's key has trading permission, and
(d) that key does **not** have withdrawal permission. Any one of these
being false silently and safely falls back to (or refuses to leave) paper
trading.
