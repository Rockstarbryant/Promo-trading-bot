"""
Pure analytics calculations over a set of fills/orders. No DB/HTTP here —
the API layer queries the DB, converts rows to plain dicts/Decimals, and
calls into this module.
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from statistics import mean


def _dec(v) -> Decimal:
    return Decimal(str(v))


@dataclass
class AnalyticsSummary:
    total_volume: Decimal
    qualifying_volume: Decimal
    num_orders: int
    filled_orders: int
    cancelled_orders: int
    rejected_orders: int
    total_fees: Decimal
    total_estimated_slippage: Decimal
    realized_pnl: Decimal
    average_spread_pct: Decimal | None
    average_execution_price_deviation_pct: Decimal | None
    average_cycle_seconds: Decimal | None
    volume_by_pair: dict[str, Decimal]
    volume_by_strategy: dict[str, Decimal]
    execution_success_rate_pct: Decimal
    estimated_cost_per_1000_volume: Decimal | None


def summarize(orders: list[dict], cycles: list[dict]) -> AnalyticsSummary:
    """
    orders: dicts with keys status, symbol, strategy_type, cumulative_quote_quantity,
            commission (in quote terms), spread_pct_at_submit (optional)
    cycles: dicts with keys started_at, completed_at, estimated_slippage,
            gross_volume, realized_pnl
    """
    num_orders = len(orders)
    filled = [o for o in orders if o["status"] == "FILLED"]
    cancelled = [o for o in orders if o["status"] == "CANCELLED"]
    rejected = [o for o in orders if o["status"] == "REJECTED"]

    total_volume = sum((_dec(o.get("cumulative_quote_quantity", 0)) for o in filled), Decimal(0))
    # commission_quote must be in USDT. Older rows may have stored base-asset
    # commission (e.g. REZ) by mistake — if fee > 2% of that order's volume,
    # treat it as base units and convert via avg fill price.
    total_fees = Decimal(0)
    for o in filled:
        fee = _dec(o.get("commission_quote", 0))
        vol = _dec(o.get("cumulative_quote_quantity", 0))
        base_qty = _dec(o.get("executed_quantity", 0))
        if fee > 0 and vol > 0 and fee > vol * Decimal("0.02") and base_qty > 0:
            # Likely base-asset fee: fee_base * (vol/base_qty) ≈ USDT
            fee = fee * (vol / base_qty)
        total_fees += fee

    volume_by_pair: dict[str, Decimal] = {}
    volume_by_strategy: dict[str, Decimal] = {}
    for o in filled:
        vol = _dec(o.get("cumulative_quote_quantity", 0))
        volume_by_pair[o["symbol"]] = volume_by_pair.get(o["symbol"], Decimal(0)) + vol
        strat = o.get("strategy_type", "UNKNOWN")
        volume_by_strategy[strat] = volume_by_strategy.get(strat, Decimal(0)) + vol

    spreads = [_dec(o["spread_pct_at_submit"]) for o in orders if o.get("spread_pct_at_submit") is not None]
    avg_spread = (sum(spreads) / len(spreads)) if spreads else None

    deviations = [_dec(o["price_deviation_pct"]) for o in filled if o.get("price_deviation_pct") is not None]
    avg_deviation = (sum(deviations) / len(deviations)) if deviations else None

    cycle_durations = []
    total_slippage = Decimal(0)
    realized_pnl = Decimal(0)
    for c in cycles:
        if c.get("completed_at") and c.get("started_at"):
            cycle_durations.append((c["completed_at"] - c["started_at"]).total_seconds())
        total_slippage += _dec(c.get("estimated_slippage", 0))
        realized_pnl += _dec(c.get("realized_pnl", 0))
    avg_cycle_seconds = _dec(mean(cycle_durations)) if cycle_durations else None

    success_rate = (Decimal(len(filled)) / Decimal(num_orders) * 100) if num_orders else Decimal(0)

    cost_per_1000 = None
    if total_volume > 0:
        total_cost = total_fees + total_slippage
        cost_per_1000 = (total_cost / total_volume) * 1000

    return AnalyticsSummary(
        total_volume=total_volume,
        qualifying_volume=total_volume,  # caller should filter `orders` to eligible pairs beforehand
        num_orders=num_orders,
        filled_orders=len(filled),
        cancelled_orders=len(cancelled),
        rejected_orders=len(rejected),
        total_fees=total_fees,
        total_estimated_slippage=total_slippage,
        realized_pnl=realized_pnl,
        average_spread_pct=avg_spread,
        average_execution_price_deviation_pct=avg_deviation,
        average_cycle_seconds=avg_cycle_seconds,
        volume_by_pair=volume_by_pair,
        volume_by_strategy=volume_by_strategy,
        execution_success_rate_pct=success_rate,
        estimated_cost_per_1000_volume=cost_per_1000,
    )
