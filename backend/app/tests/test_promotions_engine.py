from decimal import Decimal
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from app.services.promotions.engine import (
    get_promotion_handler, check_eligibility, EligibilityResult,
)
from app.db.models import PromotionType


def make_promotion(**overrides):
    now = datetime.now(timezone.utc)
    defaults = dict(
        status="ACTIVE",
        start_time=now - timedelta(hours=1),
        end_time=now + timedelta(hours=1),
        target_volume=Decimal("1000"),
        pairs=[
            SimpleNamespace(symbol="SOLUSDT", is_eligible=True),
            SimpleNamespace(symbol="ETHUSDT", is_eligible=True),
            SimpleNamespace(symbol="DOGEUSDT", is_eligible=False),
        ],
    )
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def make_fills():
    return [
        {"symbol": "SOLUSDT", "side": "BUY", "quote_qty": "100", "timestamp": None},
        {"symbol": "SOLUSDT", "side": "SELL", "quote_qty": "99.5", "timestamp": None},
        {"symbol": "ETHUSDT", "side": "BUY", "quote_qty": "50", "timestamp": None},
        {"symbol": "DOGEUSDT", "side": "BUY", "quote_qty": "1000", "timestamp": None},  # ineligible pair
    ]


def test_spot_volume_handler_only_counts_eligible_pairs():
    handler = get_promotion_handler(PromotionType.SPOT_VOLUME)
    promo = make_promotion()
    volume = handler.compute_qualifying_volume(promo, make_fills())
    assert volume == Decimal("249.5")  # excludes DOGEUSDT


def test_promotion_progress_calculation():
    handler = get_promotion_handler(PromotionType.SPOT_VOLUME)
    promo = make_promotion(target_volume=Decimal("500"))
    progress = handler.progress(promo, make_fills())
    assert progress.qualifying_volume == Decimal("249.5")
    assert progress.remaining_volume == Decimal("250.5")
    assert progress.progress_pct == pytest.approx(Decimal("49.9"), rel=Decimal("0.01"))


def test_eligibility_fails_when_promotion_inactive():
    promo = make_promotion(status="PAUSED")
    result = check_eligibility(promo, "SOLUSDT")
    assert not result.eligible


def test_eligibility_fails_outside_time_window():
    now = datetime.now(timezone.utc)
    promo = make_promotion(start_time=now - timedelta(days=2), end_time=now - timedelta(days=1))
    result = check_eligibility(promo, "SOLUSDT")
    assert not result.eligible


def test_eligibility_fails_for_ineligible_pair():
    promo = make_promotion()
    result = check_eligibility(promo, "DOGEUSDT")
    assert not result.eligible


def test_eligibility_passes_for_eligible_pair():
    promo = make_promotion()
    result = check_eligibility(promo, "SOLUSDT")
    assert result.eligible
