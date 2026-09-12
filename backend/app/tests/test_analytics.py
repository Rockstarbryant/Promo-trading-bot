from decimal import Decimal
from datetime import datetime, timedelta

from app.services.analytics.calculations import summarize


def test_summarize_basic_counts():
    orders = [
        {"status": "FILLED", "symbol": "SOLUSDT", "strategy_type": "INTERVAL_ROUND_TRIP",
         "cumulative_quote_quantity": "100", "commission_quote": "0.1"},
        {"status": "CANCELLED", "symbol": "SOLUSDT", "strategy_type": "INTERVAL_ROUND_TRIP",
         "cumulative_quote_quantity": "0", "commission_quote": "0"},
        {"status": "REJECTED", "symbol": "SOLUSDT", "strategy_type": "INTERVAL_ROUND_TRIP",
         "cumulative_quote_quantity": "0", "commission_quote": "0"},
    ]
    cycles = []
    summary = summarize(orders, cycles)
    assert summary.num_orders == 3
    assert summary.filled_orders == 1
    assert summary.cancelled_orders == 1
    assert summary.rejected_orders == 1
    assert summary.total_volume == Decimal("100")
    assert summary.total_fees == Decimal("0.1")


def test_summarize_cost_per_1000_volume():
    orders = [
        {"status": "FILLED", "symbol": "SOLUSDT", "strategy_type": "X",
         "cumulative_quote_quantity": "1000", "commission_quote": "1"},
    ]
    cycles = [{"started_at": None, "completed_at": None, "estimated_slippage": "1", "gross_volume": "1000", "realized_pnl": "0"}]
    summary = summarize(orders, cycles)
    assert summary.estimated_cost_per_1000_volume == Decimal("2")  # (1 fee + 1 slippage) / 1000 * 1000


def test_summarize_volume_by_pair_and_strategy():
    orders = [
        {"status": "FILLED", "symbol": "SOLUSDT", "strategy_type": "A", "cumulative_quote_quantity": "50", "commission_quote": "0"},
        {"status": "FILLED", "symbol": "ETHUSDT", "strategy_type": "B", "cumulative_quote_quantity": "30", "commission_quote": "0"},
    ]
    summary = summarize(orders, [])
    assert summary.volume_by_pair == {"SOLUSDT": Decimal("50"), "ETHUSDT": Decimal("30")}
    assert summary.volume_by_strategy == {"A": Decimal("50"), "B": Decimal("30")}


def test_summarize_average_cycle_seconds():
    start = datetime(2026, 1, 1, 0, 0, 0)
    cycles = [
        {"started_at": start, "completed_at": start + timedelta(seconds=100), "estimated_slippage": "0", "gross_volume": "10", "realized_pnl": "0"},
        {"started_at": start, "completed_at": start + timedelta(seconds=200), "estimated_slippage": "0", "gross_volume": "10", "realized_pnl": "0"},
    ]
    summary = summarize([], cycles)
    assert summary.average_cycle_seconds == Decimal("150")


def test_summarize_no_orders_returns_zeroes():
    summary = summarize([], [])
    assert summary.num_orders == 0
    assert summary.execution_success_rate_pct == Decimal(0)
    assert summary.estimated_cost_per_1000_volume is None
