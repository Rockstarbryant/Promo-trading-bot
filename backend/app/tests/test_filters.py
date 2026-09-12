import pytest
from decimal import Decimal

from app.services.binance.filters import SymbolFilters
from app.services.binance.exceptions import BinanceFilterError

SAMPLE_SYMBOL_INFO = {
    "symbol": "SOLUSDT",
    "status": "TRADING",
    "baseAsset": "SOL",
    "quoteAsset": "USDT",
    "baseAssetPrecision": 8,
    "quoteAssetPrecision": 8,
    "filters": [
        {"filterType": "PRICE_FILTER", "minPrice": "0.01000000", "maxPrice": "100000.00000000", "tickSize": "0.01000000"},
        {"filterType": "LOT_SIZE", "minQty": "0.01000000", "maxQty": "9000.00000000", "stepSize": "0.01000000"},
        {"filterType": "MARKET_LOT_SIZE", "minQty": "0.00000100", "maxQty": "5000.00000000", "stepSize": "0.00000100"},
        {"filterType": "NOTIONAL", "minNotional": "5.00000000", "applyToMarket": True},
    ],
}


@pytest.fixture
def filters():
    return SymbolFilters.from_exchange_info_symbol(SAMPLE_SYMBOL_INFO)


def test_round_price_respects_tick_size(filters):
    assert filters.round_price("100.017") == Decimal("100.01")


def test_round_quantity_respects_step_size(filters):
    assert filters.round_quantity("1.2378") == Decimal("1.23")


def test_valid_limit_order_passes(filters):
    filters.validate_order(side="BUY", order_type="LIMIT", quantity=Decimal("1.00"), price=Decimal("100.00"))


def test_price_below_min_rejected(filters):
    with pytest.raises(BinanceFilterError):
        filters.validate_order(side="BUY", order_type="LIMIT", quantity=Decimal("1.00"), price=Decimal("0.001"))


def test_quantity_below_min_notional_rejected(filters):
    with pytest.raises(BinanceFilterError):
        filters.validate_order(side="BUY", order_type="LIMIT", quantity=Decimal("0.01"), price=Decimal("1.00"))


def test_quantity_not_matching_step_size_rejected(filters):
    with pytest.raises(BinanceFilterError):
        filters.validate_order(side="BUY", order_type="LIMIT", quantity=Decimal("1.005"), price=Decimal("100.00"))


def test_non_trading_symbol_rejected():
    info = dict(SAMPLE_SYMBOL_INFO, status="BREAK")
    f = SymbolFilters.from_exchange_info_symbol(info)
    with pytest.raises(BinanceFilterError):
        f.validate_order(side="BUY", order_type="MARKET", quantity=Decimal("1.0"))
