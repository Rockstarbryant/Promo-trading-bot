"""
Pure, well-tested market microstructure calculations: spread and expected
slippage from an order book snapshot. No I/O in this module — it's easy to
unit test and reuse from both live trading and paper-trading simulation.
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal


def _dec(value) -> Decimal:
    return Decimal(str(value))


@dataclass
class SpreadResult:
    best_bid: Decimal
    best_ask: Decimal
    spread_abs: Decimal
    spread_pct: Decimal


def calculate_spread(best_bid, best_ask) -> SpreadResult:
    best_bid, best_ask = _dec(best_bid), _dec(best_ask)
    if best_bid <= 0 or best_ask <= 0 or best_ask < best_bid:
        raise ValueError("Invalid bid/ask for spread calculation")
    mid = (best_bid + best_ask) / 2
    spread_abs = best_ask - best_bid
    spread_pct = (spread_abs / mid) * 100 if mid else Decimal(0)
    return SpreadResult(best_bid, best_ask, spread_abs, spread_pct)


@dataclass
class SlippageResult:
    side: str
    requested_quote_amount: Decimal | None
    requested_base_qty: Decimal | None
    reference_price: Decimal
    average_execution_price: Decimal
    filled_base_qty: Decimal
    filled_quote_qty: Decimal
    slippage_pct: Decimal
    fully_fillable: bool


def estimate_slippage_for_quote_amount(
    side: str,
    quote_amount,
    order_book_levels: list[tuple],
) -> SlippageResult:
    """
    Walk the order book (asks for BUY, bids for SELL) consuming liquidity
    until `quote_amount` worth has been filled, and compute the resulting
    average execution price vs. the best price (top of book).

    order_book_levels: list of (price, quantity) tuples, best price first.
    """
    quote_amount = _dec(quote_amount)
    if quote_amount <= 0:
        raise ValueError("quote_amount must be positive")
    if not order_book_levels:
        raise ValueError("order_book_levels must not be empty")

    reference_price = _dec(order_book_levels[0][0])
    remaining_quote = quote_amount
    filled_base = Decimal(0)
    filled_quote = Decimal(0)

    for price, qty in order_book_levels:
        price, qty = _dec(price), _dec(qty)
        level_quote_value = price * qty
        if level_quote_value <= remaining_quote:
            filled_base += qty
            filled_quote += level_quote_value
            remaining_quote -= level_quote_value
        else:
            take_quote = remaining_quote
            take_base = take_quote / price
            filled_base += take_base
            filled_quote += take_quote
            remaining_quote = Decimal(0)
        if remaining_quote <= 0:
            break

    fully_fillable = remaining_quote <= 0
    avg_price = (filled_quote / filled_base) if filled_base > 0 else reference_price
    slippage_pct = (
        ((avg_price - reference_price) / reference_price * 100)
        if side.upper() == "BUY"
        else ((reference_price - avg_price) / reference_price * 100)
    )

    return SlippageResult(
        side=side.upper(),
        requested_quote_amount=quote_amount,
        requested_base_qty=None,
        reference_price=reference_price,
        average_execution_price=avg_price,
        filled_base_qty=filled_base,
        filled_quote_qty=filled_quote,
        slippage_pct=max(slippage_pct, Decimal(0)),
        fully_fillable=fully_fillable,
    )


def estimate_slippage_for_base_qty(
    side: str,
    base_qty,
    order_book_levels: list[tuple],
) -> SlippageResult:
    base_qty = _dec(base_qty)
    if base_qty <= 0:
        raise ValueError("base_qty must be positive")
    if not order_book_levels:
        raise ValueError("order_book_levels must not be empty")

    reference_price = _dec(order_book_levels[0][0])
    remaining_base = base_qty
    filled_base = Decimal(0)
    filled_quote = Decimal(0)

    for price, qty in order_book_levels:
        price, qty = _dec(price), _dec(qty)
        take_base = min(qty, remaining_base)
        filled_base += take_base
        filled_quote += take_base * price
        remaining_base -= take_base
        if remaining_base <= 0:
            break

    fully_fillable = remaining_base <= 0
    avg_price = (filled_quote / filled_base) if filled_base > 0 else reference_price
    slippage_pct = (
        ((avg_price - reference_price) / reference_price * 100)
        if side.upper() == "BUY"
        else ((reference_price - avg_price) / reference_price * 100)
    )

    return SlippageResult(
        side=side.upper(),
        requested_quote_amount=None,
        requested_base_qty=base_qty,
        reference_price=reference_price,
        average_execution_price=avg_price,
        filled_base_qty=filled_base,
        filled_quote_qty=filled_quote,
        slippage_pct=max(slippage_pct, Decimal(0)),
        fully_fillable=fully_fillable,
    )


def liquidity_quality(order_book_levels: list[tuple], depth_quote_target) -> str:
    """Rough GOOD/FAIR/THIN classification based on how much quote value
    sits within the first several levels relative to a target depth."""
    depth_quote_target = _dec(depth_quote_target)
    total = sum(_dec(p) * _dec(q) for p, q in order_book_levels)
    if total >= depth_quote_target * 3:
        return "GOOD"
    if total >= depth_quote_target:
        return "FAIR"
    return "THIN"
