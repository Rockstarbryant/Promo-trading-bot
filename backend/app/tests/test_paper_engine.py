from decimal import Decimal

from app.services.execution.paper_engine import simulate_market_order, simulate_limit_order_fill

ASKS = [("100.00", "1.0"), ("100.05", "2.0")]
BIDS = [("99.95", "1.0"), ("99.90", "2.0")]


def test_simulate_market_buy_computes_fee_and_slippage():
    fill = simulate_market_order("SOLUSDT", "BUY", ASKS, quote_amount="150")
    assert fill.filled_base_qty > 0
    assert fill.fee > 0
    assert fill.slippage_pct >= 0
    assert fill.side == "BUY"


def test_simulate_market_sell_uses_bids():
    fill = simulate_market_order("SOLUSDT", "SELL", BIDS, quote_amount="100")
    assert fill.side == "SELL"
    assert fill.filled_base_qty > 0


def test_limit_buy_fills_when_price_crosses_ask():
    fill = simulate_limit_order_fill("SOLUSDT", "BUY", limit_price="100.05", best_bid="99.95",
                                      best_ask="100.00", quantity="1.0")
    assert fill is not None
    assert fill.average_price == Decimal("100.00")


def test_limit_buy_does_not_fill_when_below_ask():
    fill = simulate_limit_order_fill("SOLUSDT", "BUY", limit_price="99.00", best_bid="99.95",
                                      best_ask="100.00", quantity="1.0")
    assert fill is None


def test_limit_sell_fills_when_price_crosses_bid():
    fill = simulate_limit_order_fill("SOLUSDT", "SELL", limit_price="99.90", best_bid="99.95",
                                      best_ask="100.00", quantity="1.0")
    assert fill is not None
    assert fill.average_price == Decimal("99.95")
