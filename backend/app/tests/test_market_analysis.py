import pytest
from decimal import Decimal

from app.services.execution.market_analysis import (
    calculate_spread, estimate_slippage_for_quote_amount,
    estimate_slippage_for_base_qty, liquidity_quality,
)

ASKS = [("100.00", "1.0"), ("100.05", "2.0"), ("100.10", "5.0")]
BIDS = [("99.95", "1.0"), ("99.90", "2.0"), ("99.85", "5.0")]


def test_calculate_spread():
    result = calculate_spread("99.95", "100.00")
    assert result.spread_abs == Decimal("0.05")
    assert result.spread_pct > 0


def test_calculate_spread_rejects_crossed_book():
    with pytest.raises(ValueError):
        calculate_spread("100.10", "100.00")


def test_slippage_fully_within_top_of_book():
    # $50 worth fits entirely in the first ask level (100 * 1.0 = 100)
    result = estimate_slippage_for_quote_amount("BUY", "50", ASKS)
    assert result.fully_fillable
    assert result.average_execution_price == Decimal("100.00")
    assert result.slippage_pct == 0


def test_slippage_spans_multiple_levels():
    # 100*1.0 = 100, need 150, so also dip into second level for 50 more
    result = estimate_slippage_for_quote_amount("BUY", "150", ASKS)
    assert result.fully_fillable
    assert result.average_execution_price > Decimal("100.00")
    assert result.slippage_pct > 0


def test_slippage_insufficient_depth():
    result = estimate_slippage_for_quote_amount("BUY", "100000", ASKS)
    assert not result.fully_fillable


def test_sell_slippage_uses_bids():
    result = estimate_slippage_for_base_qty("SELL", "1.5", BIDS)
    assert result.fully_fillable
    assert result.average_execution_price <= Decimal("99.95")
    assert result.slippage_pct >= 0


def test_liquidity_quality_thresholds():
    assert liquidity_quality(ASKS, depth_quote_target=10) == "GOOD"
    assert liquidity_quality(ASKS, depth_quote_target=300) == "FAIR"
    assert liquidity_quality(ASKS, depth_quote_target=100000) == "THIN"
