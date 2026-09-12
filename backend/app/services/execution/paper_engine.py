"""
Paper trading simulator.

Uses real-time market data (order book) to simulate fills the same way a
MARKET order would actually fill, without ever submitting anything to
Binance. This must be available and used by default before a bot is ever
allowed to go LIVE.
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from app.services.execution.market_analysis import (
    estimate_slippage_for_base_qty, estimate_slippage_for_quote_amount,
)

# Binance spot standard taker fee tier used for simulation purposes only.
# Real accounts may have a different effective rate (BNB discount, VIP tier).
DEFAULT_TAKER_FEE_RATE = Decimal("0.001")


@dataclass
class SimulatedFill:
    symbol: str
    side: str
    average_price: Decimal
    filled_base_qty: Decimal
    filled_quote_qty: Decimal
    fee: Decimal
    fee_asset: str
    slippage_pct: Decimal


def simulate_market_order(
    symbol: str,
    side: str,
    order_book_levels: list[tuple],
    quote_amount=None,
    base_qty=None,
    taker_fee_rate=DEFAULT_TAKER_FEE_RATE,
    quote_asset: str = "USDT",
) -> SimulatedFill:
    if quote_amount is not None:
        result = estimate_slippage_for_quote_amount(side, quote_amount, order_book_levels)
    elif base_qty is not None:
        result = estimate_slippage_for_base_qty(side, base_qty, order_book_levels)
    else:
        raise ValueError("Either quote_amount or base_qty must be provided")

    fee = result.filled_quote_qty * Decimal(str(taker_fee_rate))

    return SimulatedFill(
        symbol=symbol,
        side=side.upper(),
        average_price=result.average_execution_price,
        filled_base_qty=result.filled_base_qty,
        filled_quote_qty=result.filled_quote_qty,
        fee=fee,
        fee_asset=quote_asset,
        slippage_pct=result.slippage_pct,
    )


def simulate_limit_order_fill(
    symbol: str,
    side: str,
    limit_price,
    best_bid,
    best_ask,
    quantity,
    taker_fee_rate=DEFAULT_TAKER_FEE_RATE,
    quote_asset: str = "USDT",
) -> SimulatedFill | None:
    """
    Very simple limit-fill simulation: a BUY limit fills immediately (at its
    own price) if limit_price >= best_ask; a SELL limit fills if
    limit_price <= best_bid. Otherwise returns None (order rests, unfilled
    this tick) which mirrors how a real passive limit order behaves.
    """
    limit_price = Decimal(str(limit_price))
    best_bid, best_ask = Decimal(str(best_bid)), Decimal(str(best_ask))
    quantity = Decimal(str(quantity))

    if side.upper() == "BUY" and limit_price >= best_ask:
        fill_price = best_ask
    elif side.upper() == "SELL" and limit_price <= best_bid:
        fill_price = best_bid
    else:
        return None

    quote_qty = fill_price * quantity
    fee = quote_qty * Decimal(str(taker_fee_rate))
    return SimulatedFill(
        symbol=symbol,
        side=side.upper(),
        average_price=fill_price,
        filled_base_qty=quantity,
        filled_quote_qty=quote_qty,
        fee=fee,
        fee_asset=quote_asset,
        slippage_pct=Decimal(0),
    )
