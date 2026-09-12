# Configuring a promotion

A promotion is a record of *your own* configuration mirroring a Binance
promotion's official rules — this app does not scrape or auto-discover
promotions from Binance. Read the promotion's official terms first and
configure the fields to match:

| Field | Meaning |
|---|---|
| `promotion_type` | One of `SPOT_VOLUME`, `SPOT_PAIR_VOLUME`, `TRADING_TOURNAMENT`, `FEE_VOLUME_CAMPAIGN`, `NEW_LISTING_CAMPAIGN` |
| `start_time` / `end_time` | The promotion's official window (UTC) |
| `eligible pairs` | Which symbols count toward the promotion |
| `target_volume` | The volume target you're aiming for (used for progress %, not enforced as a hard limit) |
| `min_volume` / `max_volume` | Optional — informational bounds from the promotion's rules |
| `notes` / `rules_url` | Keep a copy of the official rules link/text here |

A bot's own **risk limits** (`max_capital`, `max_order_size`,
`max_daily_volume`, etc.) are configured separately when you create the bot
— they are not derived from the promotion.

## Lifecycle

- `DRAFT` — being configured, not yet trading against
- `ACTIVE` — bots attached to this promotion will trade (subject to the
  start/end window still being current)
- `PAUSED` — temporarily halts eligibility checks (bots will pause) without
  ending the promotion record
- `ENDED` — set automatically once `end_time` passes (see
  `app/workers/promotion_worker.py`), or manually via
  `POST /api/promotions/{id}/end`. Any running bots attached to it are
  stopped.

## You are responsible for compliance

Binance's specific promotion terms (eligible order types, minimum hold
times, anti-abuse clauses, etc.) vary by promotion and change over time.
Configuring a promotion here does not verify or guarantee compliance with
Binance's rules — read the official terms and configure accordingly.
