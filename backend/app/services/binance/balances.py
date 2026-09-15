"""
Spot balance helpers: reading non-zero account balances and estimating a
USDT-denominated total across all held assets.

Read-only. No trading, no withdrawals — this module only ever calls
GET /api/v3/account and GET /api/v3/ticker/price.
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


async def fetch_balances_with_usdt_value(
    client: BinanceSpotClient,
) -> tuple[list[dict], Optional[Decimal]]:
    """Returns (non_zero_balances, total_usdt_value_or_None).

    Each balance dict is {"asset", "free", "locked", "usdt_value"} where
    usdt_value may be None if no ASSETUSDT market/price could be found.
    total_usdt_value is None only if every asset failed to price (e.g. the
    account is empty or every ticker lookup failed).
    """
    account = await client.get_account()
    raw_balances = account.get("balances", [])

    non_zero: list[dict] = []
    for b in raw_balances:
        try:
            free = Decimal(str(b.get("free", "0")))
            locked = Decimal(str(b.get("locked", "0")))
        except InvalidOperation:
            continue
        if free == 0 and locked == 0:
            continue
        non_zero.append({"asset": b["asset"], "free": free, "locked": locked})

    total = Decimal(0)
    any_priced = False
    for entry in non_zero:
        asset = entry["asset"]
        qty = entry["free"] + entry["locked"]
        if asset in STABLE_ASSETS:
            entry["usdt_value"] = qty
            total += qty
            any_priced = True
            continue
        try:
            ticker = await client.get_ticker_price(f"{asset}USDT")
            price = Decimal(str(ticker["price"]))
            value = qty * price
            entry["usdt_value"] = value
            total += value
            any_priced = True
        except (BinanceError, InvalidOperation, KeyError):
            entry["usdt_value"] = None

    return non_zero, (total if any_priced else None)
