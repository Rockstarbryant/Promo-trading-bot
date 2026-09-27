"""
Spot balance helpers: reading non-zero account balances and estimating a
USDT-denominated total across all held assets.

Read-only. No trading, no withdrawals — this module only ever calls
GET /api/v3/account and GET /api/v3/ticker/price.

The raw GET /api/v3/account call itself is no longer made directly from
here — see app/services/binance/account_cache.py, which wraps it with a
shared cache and rate-limit circuit breaker. price_non_zero_balances()
below only prices balances that have already been fetched (by the cache
layer), so pricing a snapshot never triggers an extra Binance call.
"""
from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Optional

from app.services.binance.client import BinanceSpotClient
from app.services.binance.exceptions import BinanceError

# Assets treated as ~1 USDT for total-value estimation, without a ticker
# lookup (there usually isn't a liquid ASSETUSDT market for these, or the
# price is trivially 1:1 by design).
STABLE_ASSETS = {"USDT", "BUSD", "USDC", "FDUSD", "TUSD", "DAI"}

# Known Binance spot quote assets, longest-first so e.g. "USDT" is checked
# before a shorter accidental match. Used when we need to split a symbol
# like "BTCUSDT" into base/quote without an exchangeInfo round trip.
KNOWN_QUOTE_ASSETS = [
    "FDUSD", "USDT", "BUSD", "USDC", "TUSD", "DAI",
    "BTC", "ETH", "BNB", "TRY", "EUR", "GBP", "BRL",
]


def split_symbol_heuristic(symbol: str) -> tuple[str, str]:
    """Best-effort base/quote split when we don't have exchangeInfo handy.
    Prefer SymbolRepository.get(symbol).{base_asset,quote_asset} when a
    network round trip is acceptable — this is the offline fallback."""
    symbol = symbol.upper()
    for quote in KNOWN_QUOTE_ASSETS:
        if symbol.endswith(quote) and len(symbol) > len(quote):
            return symbol[: -len(quote)], quote
    return symbol, ""


async def price_non_zero_balances(
    non_zero: list[dict], client: BinanceSpotClient,
) -> tuple[list[dict], Optional[Decimal]]:
    """Takes the raw {"asset","free","locked"} list already fetched by
    account_cache.get_account_snapshot() and attaches a "usdt_value" to
    each entry (still makes one GET /api/v3/ticker/price per non-stable
    asset held — those aren't cached, but they're unsigned/unweighted
    public-data calls, not the signed endpoint that was getting banned).

    Returns (priced_balances, total_usdt_value_or_None). total is None
    only if every asset failed to price (e.g. the account is empty or
    every ticker lookup failed).
    """
    priced: list[dict] = []
    total = Decimal(0)
    any_priced = False
    for entry in non_zero:
        asset = entry["asset"]
        try:
            free = Decimal(str(entry.get("free", "0")))
            locked = Decimal(str(entry.get("locked", "0")))
        except InvalidOperation:
            continue
        qty = free + locked
        out = {"asset": asset, "free": free, "locked": locked}
        if asset in STABLE_ASSETS:
            out["usdt_value"] = qty
            total += qty
            any_priced = True
        else:
            try:
                ticker = await client.get_ticker_price(f"{asset}USDT")
                price = Decimal(str(ticker["price"]))
                value = qty * price
                out["usdt_value"] = value
                total += value
                any_priced = True
            except (BinanceError, InvalidOperation, KeyError):
                out["usdt_value"] = None
        priced.append(out)

    return priced, (total if any_priced else None)
