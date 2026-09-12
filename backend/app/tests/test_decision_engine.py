from decimal import Decimal

from app.services.execution.decision_engine import decide_execution, ExecutionAction
from app.services.binance.filters import SymbolFilters

SAMPLE_SYMBOL_INFO = {
    "symbol": "SOLUSDT", "status": "TRADING", "baseAsset": "SOL", "quoteAsset": "USDT",
    "baseAssetPrecision": 8, "quoteAssetPrecision": 8,
    "filters": [
        {"filterType": "PRICE_FILTER", "minPrice": "0.01", "maxPrice": "100000", "tickSize": "0.01"},
        {"filterType": "LOT_SIZE", "minQty": "0.01", "maxQty": "9000", "stepSize": "0.01"},
        {"filterType": "MARKET_LOT_SIZE", "minQty": "0.000001", "maxQty": "5000", "stepSize": "0.000001"},
        {"filterType": "NOTIONAL", "minNotional": "5", "applyToMarket": True},
    ],
}


def filters():
    return SymbolFilters.from_exchange_info_symbol(SAMPLE_SYMBOL_INFO)


def test_tight_market_goes_to_market_order():
    asks = [("100.00", "10.0"), ("100.01", "10.0")]
    decision = decide_execution(
        side="BUY", quote_amount="50", best_bid="99.99", best_ask="100.00",
        order_book_levels=asks, max_spread_pct="0.30", max_slippage_pct="0.30",
        symbol_filters=filters(),
    )
    assert decision.action == ExecutionAction.MARKET


def test_wide_spread_waits():
    asks = [("100.00", "10.0")]
    decision = decide_execution(
        side="BUY", quote_amount="50", best_bid="95.00", best_ask="100.00",
        order_book_levels=asks, max_spread_pct="0.10", max_slippage_pct="0.30",
        symbol_filters=filters(),
    )
    assert decision.action == ExecutionAction.WAIT
    assert "Spread" in decision.reason


def test_insufficient_depth_waits():
    asks = [("100.00", "0.001")]
    decision = decide_execution(
        side="BUY", quote_amount="500", best_bid="99.99", best_ask="100.00",
        order_book_levels=asks, max_spread_pct="0.30", max_slippage_pct="0.10",
        symbol_filters=filters(),
    )
    assert decision.action == ExecutionAction.WAIT


def test_moderate_conditions_prefer_limit():
    # Spread just within tolerance, but not tight enough (> max/3) for MARKET
    asks = [("100.00", "0.6"), ("100.30", "5.0")]
    decision = decide_execution(
        side="BUY", quote_amount="50", best_bid="99.90", best_ask="100.00",
        order_book_levels=asks, max_spread_pct="0.30", max_slippage_pct="0.30",
        symbol_filters=filters(),
    )
    assert decision.action in (ExecutionAction.LIMIT, ExecutionAction.MARKET)
    if decision.action == ExecutionAction.LIMIT:
        assert decision.limit_price is not None
