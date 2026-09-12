import time
from decimal import Decimal

import pytest

from app.services.strategies.base import MarketContext, StrategyState
from app.services.strategies.implementations import (
    IntervalRoundTripStrategy, LiquidityAwareRoundTripStrategy,
    MultiPairRotationStrategy, LowestExecutionCostStrategy,
    VolumeTargetSchedulerStrategy,
)


def ctx(symbol, spread=Decimal("0.05"), slippage=Decimal("0.02"), liquidity="GOOD"):
    return MarketContext(
        symbol=symbol, best_bid=Decimal("100"), best_ask=Decimal("100.05"),
        spread_pct=spread, order_book_bids=[("100", "10")], order_book_asks=[("100.05", "10")],
        estimated_slippage_pct=slippage, liquidity_quality=liquidity,
    )


def test_interval_round_trip_requires_config():
    with pytest.raises(ValueError):
        IntervalRoundTripStrategy({})


def test_interval_round_trip_buys_when_flat():
    strat = IntervalRoundTripStrategy({
        "eligible_pairs": ["SOLUSDT"], "order_size": "20",
        "buy_interval_seconds": 0, "sell_interval_seconds": 0,
    })
    state = StrategyState()
    intent = strat.should_buy(state, [ctx("SOLUSDT")])
    assert intent is not None
    assert intent.side == "BUY"
    assert intent.symbol == "SOLUSDT"


def test_interval_round_trip_no_buy_when_position_open():
    strat = IntervalRoundTripStrategy({
        "eligible_pairs": ["SOLUSDT"], "order_size": "20",
        "buy_interval_seconds": 0, "sell_interval_seconds": 0,
    })
    state = StrategyState(data={"position_open": True})
    assert strat.should_buy(state, [ctx("SOLUSDT")]) is None


def test_interval_round_trip_sells_after_interval():
    strat = IntervalRoundTripStrategy({
        "eligible_pairs": ["SOLUSDT"], "order_size": "20",
        "buy_interval_seconds": 0, "sell_interval_seconds": 0,
    })
    state = StrategyState(data={
        "position_open": True, "position_symbol": "SOLUSDT",
        "position_base_qty": "0.2", "position_opened_at": time.time() - 10,
    })
    intent = strat.should_sell(state, [ctx("SOLUSDT")])
    assert intent is not None
    assert intent.side == "SELL"


def test_liquidity_aware_picks_best_spread():
    strat = LiquidityAwareRoundTripStrategy({
        "eligible_pairs": ["SOLUSDT", "ETHUSDT"], "order_size": "20",
        "buy_interval_seconds": 0, "sell_interval_seconds": 0,
        "max_spread_pct": "0.5", "max_slippage_pct": "0.5",
    })
    contexts = [ctx("SOLUSDT", spread=Decimal("0.3")), ctx("ETHUSDT", spread=Decimal("0.05"))]
    state = StrategyState()
    intent = strat.should_buy(state, contexts)
    assert intent.symbol == "ETHUSDT"


def test_liquidity_aware_filters_out_wide_spread_pairs():
    strat = LiquidityAwareRoundTripStrategy({
        "eligible_pairs": ["SOLUSDT"], "order_size": "20",
        "buy_interval_seconds": 0, "sell_interval_seconds": 0,
        "max_spread_pct": "0.1", "max_slippage_pct": "0.5",
    })
    contexts = [ctx("SOLUSDT", spread=Decimal("0.5"))]
    state = StrategyState()
    assert strat.should_buy(state, contexts) is None


def test_multi_pair_rotation_requires_two_pairs():
    with pytest.raises(ValueError):
        MultiPairRotationStrategy({
            "eligible_pairs": ["SOLUSDT"], "order_size": "20",
            "buy_interval_seconds": 0, "sell_interval_seconds": 0,
        })


def test_multi_pair_rotation_cycles_through_pairs():
    strat = MultiPairRotationStrategy({
        "eligible_pairs": ["SOLUSDT", "ETHUSDT", "BTCUSDT"], "order_size": "20",
        "buy_interval_seconds": 0, "sell_interval_seconds": 0,
        "max_spread_pct": "0.5", "max_slippage_pct": "0.5",
    })
    contexts = [ctx("SOLUSDT"), ctx("ETHUSDT"), ctx("BTCUSDT")]
    state = StrategyState()
    first = strat.should_buy(state, contexts)
    state.data["position_open"] = False  # simulate cycle close
    second = strat.should_buy(state, contexts)
    assert first.symbol != second.symbol


def test_lowest_execution_cost_prefers_cheapest():
    strat = LowestExecutionCostStrategy({
        "eligible_pairs": ["SOLUSDT", "ETHUSDT"], "order_size": "20",
        "buy_interval_seconds": 0, "sell_interval_seconds": 0,
        "taker_fee_rate": "0.001",
    })
    contexts = [
        ctx("SOLUSDT", spread=Decimal("0.3"), slippage=Decimal("0.2"), liquidity="THIN"),
        ctx("ETHUSDT", spread=Decimal("0.01"), slippage=Decimal("0.01"), liquidity="GOOD"),
    ]
    state = StrategyState()
    intent = strat.should_buy(state, contexts)
    assert intent.symbol == "ETHUSDT"


def test_volume_target_scheduler_paces_within_bounds():
    strat = VolumeTargetSchedulerStrategy({
        "eligible_pairs": ["SOLUSDT"], "order_size": "20",
        "min_interval_seconds": 10, "max_interval_seconds": 300,
    })
    state = StrategyState()
    interval = strat._current_interval(state)
    assert 10 <= interval <= 300


def test_volume_target_scheduler_rejects_bad_interval_config():
    with pytest.raises(ValueError):
        VolumeTargetSchedulerStrategy({
            "eligible_pairs": ["SOLUSDT"], "order_size": "20",
            "min_interval_seconds": 300, "max_interval_seconds": 10,
        })


def test_volume_target_scheduler_compute_required_pace():
    strat = VolumeTargetSchedulerStrategy({
        "eligible_pairs": ["SOLUSDT"], "order_size": "20",
        "min_interval_seconds": 10, "max_interval_seconds": 300,
    })
    pace = strat.compute_required_pace(Decimal("1000"), Decimal("200"), Decimal(3600))
    assert pace["remaining_volume"] == Decimal("800")
    assert pace["required_volume_per_hour"] == Decimal("800")
