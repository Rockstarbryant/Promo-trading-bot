from datetime import date
from decimal import Decimal

from app.services.portfolio.volume_accounting import compute_volume


def make_order(symbol, side, status, quote_qty, filled_at=None):
    return {
        "symbol": symbol, "side": side, "status": status,
        "cumulative_quote_quantity": quote_qty, "filled_at": filled_at,
    }


def test_only_filled_orders_count():
    today = date(2026, 9, 12)
    orders = [
        make_order("SOLUSDT", "BUY", "FILLED", "100", today),
        make_order("SOLUSDT", "SELL", "REJECTED", "999", today),  # must not count
        make_order("SOLUSDT", "BUY", "SUBMITTED", "999", None),   # must not count
    ]
    breakdown = compute_volume(orders, today)
    assert breakdown.total_volume == Decimal("100")


def test_buy_and_sell_split():
    today = date(2026, 9, 12)
    orders = [
        make_order("SOLUSDT", "BUY", "FILLED", "100", today),
        make_order("SOLUSDT", "SELL", "FILLED", "99", today),
    ]
    breakdown = compute_volume(orders, today)
    assert breakdown.buy_volume == Decimal("100")
    assert breakdown.sell_volume == Decimal("99")
    assert breakdown.total_volume == Decimal("199")


def test_daily_volume_only_counts_today():
    today = date(2026, 9, 12)
    yesterday = date(2026, 9, 11)
    orders = [
        make_order("SOLUSDT", "BUY", "FILLED", "100", today),
        make_order("SOLUSDT", "BUY", "FILLED", "50", yesterday),
    ]
    breakdown = compute_volume(orders, today)
    assert breakdown.daily_volume == Decimal("100")
    assert breakdown.total_volume == Decimal("150")


def test_volume_by_pair_breakdown():
    today = date(2026, 9, 12)
    orders = [
        make_order("SOLUSDT", "BUY", "FILLED", "100", today),
        make_order("ETHUSDT", "BUY", "FILLED", "50", today),
    ]
    breakdown = compute_volume(orders, today)
    assert breakdown.volume_by_pair == {"SOLUSDT": Decimal("100"), "ETHUSDT": Decimal("50")}


def test_partially_filled_counts_executed_portion():
    today = date(2026, 9, 12)
    orders = [make_order("SOLUSDT", "BUY", "PARTIALLY_FILLED", "40", today)]
    breakdown = compute_volume(orders, today)
    assert breakdown.total_volume == Decimal("40")
