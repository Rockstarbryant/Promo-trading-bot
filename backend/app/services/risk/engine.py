"""
Mandatory risk controls, independent from strategy and execution logic.

Every strategy tick must pass through RiskEngine.check_pre_trade() before
any order is placed. Nothing in this module knows about Binance, HTTP, or
the database — it operates purely on numbers passed in, so it is fully
unit-testable and reusable for both PAPER and LIVE modes.
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from datetime import datetime, timezone


def _dec(v) -> Decimal:
    return Decimal(str(v))


@dataclass
class RiskLimits:
    max_capital: Decimal
    max_order_size: Decimal
    max_daily_volume: Decimal
    max_daily_loss: Decimal
    max_spread_pct: Decimal
    max_slippage_pct: Decimal
    max_exposure: Decimal
    max_consecutive_failures: int
    max_stale_order_seconds: int

    @classmethod
    def from_bot(cls, bot) -> "RiskLimits":
        return cls(
            max_capital=_dec(bot.max_capital),
            max_order_size=_dec(bot.max_order_size),
            max_daily_volume=_dec(bot.max_daily_volume),
            max_daily_loss=_dec(bot.max_daily_loss),
            max_spread_pct=_dec(bot.max_spread_pct),
            max_slippage_pct=_dec(bot.max_slippage_pct),
            max_exposure=_dec(bot.max_exposure),
            max_consecutive_failures=bot.max_consecutive_failures,
            max_stale_order_seconds=bot.max_stale_order_seconds,
        )


@dataclass
class RiskState:
    """Rolling state the risk engine needs to make its decisions. Populated
    by the caller from the database before each check."""
    daily_volume_used: Decimal
    daily_loss_so_far: Decimal
    current_exposure: Decimal
    consecutive_failures: int
    capital_deployed: Decimal


@dataclass
class RiskCheckResult:
    allowed: bool
    reason: str | None = None
    severity: str = "INFO"


class RiskEngine:
    def __init__(self, limits: RiskLimits):
        self.limits = limits

    def check_pre_trade(
        self,
        proposed_order_size: Decimal,
        state: RiskState,
        side: str = "BUY",
    ) -> RiskCheckResult:
        """Validate a proposed order.

        side: "BUY" or "SELL". Exposure and capital limits only apply when
        opening/increasing a position (BUY). A SELL closes exposure and must
        not be blocked as if it were adding risk — otherwise round-trip bots
        stall after the first fill when max_exposure == order_size.
        """
        proposed_order_size = _dec(proposed_order_size)
        side_u = (side or "BUY").upper()
        is_buy = side_u == "BUY"

        if state.consecutive_failures >= self.limits.max_consecutive_failures:
            return RiskCheckResult(
                False,
                f"{state.consecutive_failures} consecutive execution failures reached "
                f"the configured maximum of {self.limits.max_consecutive_failures}",
                "CRITICAL",
            )

        if proposed_order_size > self.limits.max_order_size:
            return RiskCheckResult(
                False,
                f"Proposed order size {proposed_order_size} exceeds max_order_size "
                f"{self.limits.max_order_size}",
                "WARNING",
            )

        # Volume accrues on both legs of a round trip.
        if state.daily_volume_used + proposed_order_size > self.limits.max_daily_volume:
            return RiskCheckResult(
                False,
                f"Order would push daily volume to "
                f"{state.daily_volume_used + proposed_order_size}, exceeding "
                f"max_daily_volume {self.limits.max_daily_volume}",
                "INFO",
            )

        if state.daily_loss_so_far >= self.limits.max_daily_loss:
            return RiskCheckResult(
                False,
                f"Daily loss {state.daily_loss_so_far} has reached/exceeded "
                f"max_daily_loss {self.limits.max_daily_loss}",
                "CRITICAL",
            )

        # Capital and exposure only increase on BUY (opening a position).
        # Tiny residual after SELL (fees / fill asymmetry) is treated as dust so
        # a full-size BUY is not blocked when max_exposure == order_size.
        if is_buy:
            dust = max(self.limits.max_order_size * Decimal("0.002"), Decimal("0.05"))
            effective_exposure = state.current_exposure if state.current_exposure > dust else Decimal(0)
            effective_capital = state.capital_deployed if state.capital_deployed > dust else Decimal(0)

            if effective_capital + proposed_order_size > self.limits.max_capital + dust:
                return RiskCheckResult(
                    False,
                    f"Order would deploy {effective_capital + proposed_order_size} "
                    f"capital, exceeding max_capital {self.limits.max_capital}",
                    "WARNING",
                )

            if effective_exposure + proposed_order_size > self.limits.max_exposure + dust:
                return RiskCheckResult(
                    False,
                    f"Order would push exposure to {effective_exposure + proposed_order_size}, "
                    f"exceeding max_exposure {self.limits.max_exposure}",
                    "WARNING",
                )

        return RiskCheckResult(True)

    def check_spread(self, spread_pct: Decimal) -> RiskCheckResult:
        if _dec(spread_pct) > self.limits.max_spread_pct:
            return RiskCheckResult(
                False,
                f"Spread {spread_pct}% exceeds configured maximum of {self.limits.max_spread_pct}%",
                "INFO",
            )
        return RiskCheckResult(True)

    def check_slippage(self, slippage_pct: Decimal) -> RiskCheckResult:
        if _dec(slippage_pct) > self.limits.max_slippage_pct:
            return RiskCheckResult(
                False,
                f"Estimated slippage {slippage_pct}% exceeds configured maximum of "
                f"{self.limits.max_slippage_pct}%",
                "INFO",
            )
        return RiskCheckResult(True)

    def check_stale_order(self, submitted_at: datetime, now: datetime | None = None) -> RiskCheckResult:
        now = now or datetime.now(timezone.utc)
        age_seconds = (now - submitted_at).total_seconds()
        if age_seconds > self.limits.max_stale_order_seconds:
            return RiskCheckResult(
                False,
                f"Order has been open {age_seconds:.0f}s, exceeding "
                f"max_stale_order_seconds {self.limits.max_stale_order_seconds}",
                "WARNING",
            )
        return RiskCheckResult(True)
