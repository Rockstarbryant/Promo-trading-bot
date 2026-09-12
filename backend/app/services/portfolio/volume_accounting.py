"""
Volume accounting: turns FILLED orders into promotion-qualifying volume,
guarding against double-counting.

Golden rule: only Order rows with status == FILLED (or PARTIALLY_FILLED,
counting only the executed portion) ever contribute to volume. Submitted-
but-unfilled or rejected orders contribute zero.
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal


def _dec(v) -> Decimal:
    return Decimal(str(v))


@dataclass
class VolumeBreakdown:
    total_volume: Decimal
    buy_volume: Decimal
    sell_volume: Decimal
    volume_by_pair: dict[str, Decimal]
    daily_volume: Decimal


def compute_volume(orders: list[dict], today) -> VolumeBreakdown:
    """
    orders: dicts with keys symbol, side, status, cumulative_quote_quantity,
            filled_at (date/datetime or None)
    today: a date to compare filled_at.date() against for daily_volume
    """
    total = Decimal(0)
    buy = Decimal(0)
    sell = Decimal(0)
    by_pair: dict[str, Decimal] = {}
    daily = Decimal(0)

    for o in orders:
        if o["status"] not in ("FILLED", "PARTIALLY_FILLED"):
            continue
        vol = _dec(o.get("cumulative_quote_quantity", 0))
        if vol <= 0:
            continue
        total += vol
        if o["side"] == "BUY":
            buy += vol
        else:
            sell += vol
        by_pair[o["symbol"]] = by_pair.get(o["symbol"], Decimal(0)) + vol

        filled_at = o.get("filled_at")
        if filled_at is not None:
            filled_date = filled_at.date() if hasattr(filled_at, "date") else filled_at
            if filled_date == today:
                daily += vol

    return VolumeBreakdown(total, buy, sell, by_pair, daily)
