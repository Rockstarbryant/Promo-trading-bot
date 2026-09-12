"""
Promotion engine: eligibility checks + qualifying-volume accounting.

Design: a PromotionTypeHandler abstraction lets each promotion type define
its own notion of "qualifying volume" and progress metrics, without the
execution engine or strategies needing to know about promotion types at
all. Adding a new promotion type means adding a new handler class here and
registering it — nothing else changes.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal

from app.db.models import Promotion, PromotionType


@dataclass
class EligibilityResult:
    eligible: bool
    reason: str | None = None


@dataclass
class PromotionProgress:
    qualifying_volume: Decimal
    target_volume: Decimal | None
    progress_pct: Decimal | None
    remaining_volume: Decimal | None


class PromotionTypeHandler(ABC):
    promotion_type: PromotionType

    @abstractmethod
    def compute_qualifying_volume(self, promotion: Promotion, fills: list[dict]) -> Decimal:
        """fills: list of {"symbol","side","quote_qty","timestamp"} dicts for
        FILLED trades only. Never derive volume from submitted-but-unfilled
        orders."""

    def progress(self, promotion: Promotion, fills: list[dict]) -> PromotionProgress:
        qualifying = self.compute_qualifying_volume(promotion, fills)
        target = Decimal(str(promotion.target_volume)) if promotion.target_volume else None
        progress_pct = (qualifying / target * 100) if target and target > 0 else None
        remaining = (target - qualifying) if target is not None else None
        if remaining is not None and remaining < 0:
            remaining = Decimal(0)
        return PromotionProgress(qualifying, target, progress_pct, remaining)


def _sum_volume(fills: list[dict], symbols: set[str] | None = None) -> Decimal:
    total = Decimal(0)
    for f in fills:
        if symbols is not None and f["symbol"] not in symbols:
            continue
        total += Decimal(str(f["quote_qty"]))
    return total


class SpotVolumeHandler(PromotionTypeHandler):
    promotion_type = PromotionType.SPOT_VOLUME

    def compute_qualifying_volume(self, promotion: Promotion, fills: list[dict]) -> Decimal:
        eligible_symbols = {p.symbol for p in promotion.pairs if p.is_eligible} or None
        return _sum_volume(fills, eligible_symbols)


class SpotPairVolumeHandler(PromotionTypeHandler):
    promotion_type = PromotionType.SPOT_PAIR_VOLUME

    def compute_qualifying_volume(self, promotion: Promotion, fills: list[dict]) -> Decimal:
        eligible_symbols = {p.symbol for p in promotion.pairs if p.is_eligible}
        return _sum_volume(fills, eligible_symbols)


class TradingTournamentHandler(PromotionTypeHandler):
    promotion_type = PromotionType.TRADING_TOURNAMENT

    def compute_qualifying_volume(self, promotion: Promotion, fills: list[dict]) -> Decimal:
        eligible_symbols = {p.symbol for p in promotion.pairs if p.is_eligible} or None
        # Ranking metrics against other participants require Binance's own
        # (non-public) leaderboard data; we track our own qualifying volume
        # as the input to that ranking.
        return _sum_volume(fills, eligible_symbols)


class FeeVolumeCampaignHandler(PromotionTypeHandler):
    promotion_type = PromotionType.FEE_VOLUME_CAMPAIGN

    def compute_qualifying_volume(self, promotion: Promotion, fills: list[dict]) -> Decimal:
        eligible_symbols = {p.symbol for p in promotion.pairs if p.is_eligible} or None
        return _sum_volume(fills, eligible_symbols)

    def estimate_net_cost(self, fills: list[dict], fee_field: str = "commission_quote") -> Decimal:
        return sum((Decimal(str(f.get(fee_field, 0))) for f in fills), Decimal(0))


class NewListingCampaignHandler(PromotionTypeHandler):
    promotion_type = PromotionType.NEW_LISTING_CAMPAIGN

    def compute_qualifying_volume(self, promotion: Promotion, fills: list[dict]) -> Decimal:
        eligible_symbols = {p.symbol for p in promotion.pairs if p.is_eligible}
        return _sum_volume(fills, eligible_symbols)


_REGISTRY: dict[PromotionType, PromotionTypeHandler] = {
    h.promotion_type: h()
    for h in (
        SpotVolumeHandler, SpotPairVolumeHandler, TradingTournamentHandler,
        FeeVolumeCampaignHandler, NewListingCampaignHandler,
    )
}


def get_promotion_handler(promotion_type: PromotionType) -> PromotionTypeHandler:
    handler = _REGISTRY.get(promotion_type)
    if not handler:
        raise ValueError(f"No handler registered for promotion type {promotion_type}")
    return handler


def check_eligibility(promotion: Promotion, symbol: str, now: datetime | None = None) -> EligibilityResult:
    now = now or datetime.now(timezone.utc)

    if promotion.status != "ACTIVE" and getattr(promotion.status, "value", promotion.status) != "ACTIVE":
        return EligibilityResult(False, f"Promotion status is {promotion.status}, not ACTIVE")

    if not (promotion.start_time <= now <= promotion.end_time):
        return EligibilityResult(False, "Promotion is outside its configured start/end window")

    eligible_symbols = {p.symbol for p in promotion.pairs if p.is_eligible}
    if eligible_symbols and symbol not in eligible_symbols:
        return EligibilityResult(False, f"{symbol} is not in the promotion's eligible pairs")

    return EligibilityResult(True)
