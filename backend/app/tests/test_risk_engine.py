import pytest
from decimal import Decimal
from datetime import datetime, timedelta, timezone

from app.services.risk.engine import RiskEngine, RiskLimits, RiskState


def make_limits(**overrides):
    defaults = dict(
        max_capital=Decimal("100"), max_order_size=Decimal("20"),
        max_daily_volume=Decimal("2000"), max_daily_loss=Decimal("5"),
        max_spread_pct=Decimal("0.10"), max_slippage_pct=Decimal("0.10"),
        max_exposure=Decimal("20"), max_consecutive_failures=3,
        max_stale_order_seconds=30,
    )
    defaults.update(overrides)
    return RiskLimits(**defaults)


def make_state(**overrides):
    defaults = dict(
        daily_volume_used=Decimal(0), daily_loss_so_far=Decimal(0),
        current_exposure=Decimal(0), consecutive_failures=0, capital_deployed=Decimal(0),
    )
    defaults.update(overrides)
    return RiskState(**defaults)


def test_order_within_limits_allowed():
    engine = RiskEngine(make_limits())
    result = engine.check_pre_trade(Decimal("10"), make_state())
    assert result.allowed


def test_order_exceeding_max_order_size_rejected():
    engine = RiskEngine(make_limits())
    result = engine.check_pre_trade(Decimal("25"), make_state())
    assert not result.allowed
    assert "max_order_size" in result.reason


def test_order_exceeding_capital_rejected():
    engine = RiskEngine(make_limits())
    result = engine.check_pre_trade(Decimal("15"), make_state(capital_deployed=Decimal("90")))
    assert not result.allowed


def test_consecutive_failures_blocks_trading():
    engine = RiskEngine(make_limits(max_consecutive_failures=3))
    result = engine.check_pre_trade(Decimal("5"), make_state(consecutive_failures=3))
    assert not result.allowed
    assert result.severity == "CRITICAL"


def test_daily_loss_limit_blocks_trading():
    engine = RiskEngine(make_limits())
    result = engine.check_pre_trade(Decimal("5"), make_state(daily_loss_so_far=Decimal("5")))
    assert not result.allowed
    assert result.severity == "CRITICAL"


def test_daily_volume_limit_blocks_trading():
    engine = RiskEngine(make_limits(max_daily_volume=Decimal("100")))
    result = engine.check_pre_trade(Decimal("10"), make_state(daily_volume_used=Decimal("95")))
    assert not result.allowed


def test_exposure_limit_blocks_trading():
    engine = RiskEngine(make_limits(max_exposure=Decimal("20")))
    result = engine.check_pre_trade(Decimal("15"), make_state(current_exposure=Decimal("10")))
    assert not result.allowed


def test_spread_check():
    engine = RiskEngine(make_limits(max_spread_pct=Decimal("0.10")))
    assert engine.check_spread(Decimal("0.05")).allowed
    assert not engine.check_spread(Decimal("0.20")).allowed


def test_slippage_check():
    engine = RiskEngine(make_limits(max_slippage_pct=Decimal("0.10")))
    assert engine.check_slippage(Decimal("0.05")).allowed
    assert not engine.check_slippage(Decimal("0.20")).allowed


def test_stale_order_check():
    engine = RiskEngine(make_limits(max_stale_order_seconds=30))
    now = datetime.now(timezone.utc)
    fresh = now - timedelta(seconds=5)
    stale = now - timedelta(seconds=60)
    assert engine.check_stale_order(fresh, now=now).allowed
    assert not engine.check_stale_order(stale, now=now).allowed
