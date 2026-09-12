"""
The core LIMIT vs MARKET vs WAIT decision, plus limit price calculation.

This module is intentionally pure/synchronous so it is trivial to unit test.
All actual I/O (fetching the order book, submitting orders) lives in the
bot worker, which calls into this module for the decision and then acts on
it.
"""
from __future__ import annotations

import enum
from dataclasses import dataclass
from decimal import Decimal

from app.services.binance.filters import SymbolFilters
from app.services.execution.market_analysis import (
    SlippageResult, SpreadResult, calculate_spread,
    estimate_slippage_for_quote_amount,
)


class ExecutionAction(str, enum.Enum):
    MARKET = "MARKET"
    LIMIT = "LIMIT"
    WAIT = "WAIT"


@dataclass
class ExecutionDecision:
    action: ExecutionAction
    reason: str
    spread: SpreadResult
    slippage: SlippageResult | None
    limit_price: Decimal | None = None


def decide_execution(
    side: str,
    quote_amount,
    best_bid,
    best_ask,
    order_book_levels: list[tuple],
    max_spread_pct,
    max_slippage_pct,
    symbol_filters: SymbolFilters,
) -> ExecutionDecision:
    """
    Conceptually:

      IF spread very small AND liquidity strong AND slippage below threshold
          -> MARKET
      ELIF spread acceptable AND liquidity acceptable AND a limit order is
           likely to execute
          -> LIMIT
      ELSE
          -> WAIT
    """
    max_spread_pct = Decimal(str(max_spread_pct))
    max_slippage_pct = Decimal(str(max_slippage_pct))

    spread = calculate_spread(best_bid, best_ask)

    if spread.spread_pct > max_spread_pct:
        return ExecutionDecision(
            action=ExecutionAction.WAIT,
            reason=(
                f"Spread {spread.spread_pct:.4f}% exceeds configured maximum "
                f"of {max_spread_pct:.4f}%"
            ),
            spread=spread,
            slippage=None,
        )

    # Only asks matter for BUY slippage, bids for SELL — caller passes the
    # correct side of the book in order_book_levels.
    slippage = estimate_slippage_for_quote_amount(side, quote_amount, order_book_levels)

    if not slippage.fully_fillable:
        return ExecutionDecision(
            action=ExecutionAction.WAIT,
            reason="Insufficient order book depth to fill the requested amount",
            spread=spread,
            slippage=slippage,
        )

    if slippage.slippage_pct <= max_slippage_pct and spread.spread_pct <= (max_spread_pct / 3):
        # Tight spread + acceptable slippage -> immediate MARKET execution
        # is preferable to babysitting a limit order.
        return ExecutionDecision(
            action=ExecutionAction.MARKET,
            reason=(
                f"Spread {spread.spread_pct:.4f}% and estimated slippage "
                f"{slippage.slippage_pct:.4f}% both within tolerance"
            ),
            spread=spread,
            slippage=slippage,
        )

    if slippage.slippage_pct <= max_slippage_pct:
        # Spread/liquidity acceptable but not tight enough for a confident
        # market order -> place a passive LIMIT order instead.
        limit_price = best_bid if side.upper() == "BUY" else best_ask
        limit_price = symbol_filters.round_price(limit_price)
        return ExecutionDecision(
            action=ExecutionAction.LIMIT,
            reason="Conditions acceptable but not tight enough for a market order; placing passive limit",
            spread=spread,
            slippage=slippage,
            limit_price=limit_price,
        )

    return ExecutionDecision(
        action=ExecutionAction.WAIT,
        reason=(
            f"Estimated slippage {slippage.slippage_pct:.4f}% exceeds configured "
            f"maximum of {max_slippage_pct:.4f}%"
        ),
        spread=spread,
        slippage=slippage,
    )
