"""
Concrete strategy implementations.

All strategies share the same underlying "round trip" idea (buy then sell
roughly the same notional, so a promotion's volume accrues) — the required
mechanism for genuine, legitimate promotional volume. They differ in *how*
they pick pairs/timing, never in placing anything but real, undisguised
market-facing orders.
"""
from __future__ import annotations

import time
from decimal import Decimal
from typing import Any, Optional

from app.services.strategies.base import (
    MarketContext, StrategyBase, StrategyState, TradeIntent,
)


def _require(params: dict[str, Any], key: str, cast=lambda x: x):
    if key not in params or params[key] is None:
        raise ValueError(f"Missing required strategy parameter: {key}")
    try:
        return cast(params[key])
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Invalid value for strategy parameter {key}: {params[key]}") from exc



def _sell_quote_and_base(state: StrategyState, contexts: list[MarketContext], fallback_order_size: Decimal) -> tuple[Decimal, Decimal | None]:
    """Return (quote_amount_usdt, base_qty_or_None) for a closing SELL.

    Risk and volume accounting must always use quote (USDT). Execution of
    the sell leg should prefer the actual base quantity acquired on the
    opening BUY so we close the position cleanly.
    """
    base_raw = state.data.get("position_base_qty")
    quote_raw = state.data.get("position_quote_qty")
    base_qty = Decimal(str(base_raw)) if base_raw is not None else None

    if quote_raw is not None:
        quote = Decimal(str(quote_raw))
    elif base_qty is not None and contexts:
        # Approximate quote from mid price of the held symbol if available
        symbol = state.data.get("position_symbol")
        ctx = next((c for c in contexts if c.symbol == symbol), contexts[0] if contexts else None)
        if ctx is not None:
            mid = (ctx.best_bid + ctx.best_ask) / Decimal(2)
            quote = base_qty * mid
        else:
            quote = fallback_order_size
    else:
        quote = fallback_order_size

    if quote <= 0:
        quote = fallback_order_size
    return quote, base_qty


class IntervalRoundTripStrategy(StrategyBase):
    """BUY -> wait buy_interval_seconds -> SELL -> wait sell_interval_seconds -> repeat."""

    strategy_type = "INTERVAL_ROUND_TRIP"

    def validate_config(self) -> None:
        _require(self.parameters, "eligible_pairs", list)
        _require(self.parameters, "order_size", Decimal)
        _require(self.parameters, "buy_interval_seconds", int)
        _require(self.parameters, "sell_interval_seconds", int)
        if "max_cycles" in self.parameters and self.parameters["max_cycles"] is not None:
            int(self.parameters["max_cycles"])
        if "max_daily_volume" in self.parameters and self.parameters["max_daily_volume"] is not None:
            Decimal(str(self.parameters["max_daily_volume"]))

    def evaluate_market(self, contexts: list[MarketContext]) -> list[MarketContext]:
        eligible = set(self.parameters["eligible_pairs"])
        return [c for c in contexts if c.symbol in eligible]

    def should_buy(self, state: StrategyState, contexts: list[MarketContext]) -> Optional[TradeIntent]:
        if state.data.get("position_open"):
            return None
        max_cycles = self.parameters.get("max_cycles")
        if max_cycles is not None and state.data.get("cycles_completed", 0) >= int(max_cycles):
            return None
        last_sell_at = state.data.get("last_sell_at")
        if last_sell_at and (time.time() - last_sell_at) < self.parameters["buy_interval_seconds"]:
            return None
        candidates = self.evaluate_market(contexts)
        if not candidates:
            return None
        symbol = candidates[0].symbol
        return TradeIntent(symbol, "BUY", self.calculate_order_size(state), "Interval round trip: opening buy leg")

    def should_sell(self, state: StrategyState, contexts: list[MarketContext]) -> Optional[TradeIntent]:
        if not state.data.get("position_open"):
            return None
        opened_at = state.data.get("position_opened_at", 0)
        if (time.time() - opened_at) < self.parameters["sell_interval_seconds"]:
            return None
        symbol = state.data.get("position_symbol")
        if not symbol:
            return None
        quote, base_qty = _sell_quote_and_base(state, contexts, self.calculate_order_size(state))
        return TradeIntent(symbol, "SELL", quote, "Interval round trip: closing sell leg", base_qty=base_qty)


class LiquidityAwareRoundTripStrategy(StrategyBase):
    """Same round-trip idea, but picks the best-liquidity eligible pair each
    time rather than trading a fixed pair."""

    strategy_type = "LIQUIDITY_AWARE_ROUND_TRIP"

    def validate_config(self) -> None:
        _require(self.parameters, "eligible_pairs", list)
        _require(self.parameters, "order_size", Decimal)
        _require(self.parameters, "buy_interval_seconds", int)
        _require(self.parameters, "sell_interval_seconds", int)

    def evaluate_market(self, contexts: list[MarketContext]) -> list[MarketContext]:
        eligible = set(self.parameters["eligible_pairs"])
        max_spread = Decimal(str(self.parameters.get("max_spread_pct", "0.5")))
        max_slip = Decimal(str(self.parameters.get("max_slippage_pct", "0.5")))
        candidates = [
            c for c in contexts
            if c.symbol in eligible
            and c.spread_pct <= max_spread
            and (c.estimated_slippage_pct is None or c.estimated_slippage_pct <= max_slip)
        ]
        # Best liquidity first: lowest spread, then lowest slippage.
        return sorted(
            candidates,
            key=lambda c: (c.spread_pct, c.estimated_slippage_pct or Decimal(0)),
        )

    def should_buy(self, state: StrategyState, contexts: list[MarketContext]) -> Optional[TradeIntent]:
        if state.data.get("position_open"):
            return None
        last_sell_at = state.data.get("last_sell_at")
        if last_sell_at and (time.time() - last_sell_at) < self.parameters["buy_interval_seconds"]:
            return None
        ranked = self.evaluate_market(contexts)
        if not ranked:
            return None
        best = ranked[0]
        return TradeIntent(
            best.symbol, "BUY", self.calculate_order_size(state),
            f"Liquidity-aware: {best.symbol} has best spread/slippage among eligible pairs",
        )

    def should_sell(self, state: StrategyState, contexts: list[MarketContext]) -> Optional[TradeIntent]:
        if not state.data.get("position_open"):
            return None
        opened_at = state.data.get("position_opened_at", 0)
        if (time.time() - opened_at) < self.parameters["sell_interval_seconds"]:
            return None
        symbol = state.data.get("position_symbol")
        if not symbol:
            return None
        quote, base_qty = _sell_quote_and_base(state, contexts, self.calculate_order_size(state))
        return TradeIntent(symbol, "SELL", quote, "Liquidity-aware: closing sell leg", base_qty=base_qty)


class MultiPairRotationStrategy(StrategyBase):
    """Rotates through eligible pairs in order, skipping any that currently
    fail market-quality checks."""

    strategy_type = "MULTI_PAIR_ROTATION"

    def validate_config(self) -> None:
        pairs = _require(self.parameters, "eligible_pairs", list)
        if len(pairs) < 2:
            raise ValueError("Multi-pair rotation requires at least 2 eligible_pairs")
        _require(self.parameters, "order_size", Decimal)
        _require(self.parameters, "buy_interval_seconds", int)
        _require(self.parameters, "sell_interval_seconds", int)

    def evaluate_market(self, contexts: list[MarketContext]) -> list[MarketContext]:
        eligible = set(self.parameters["eligible_pairs"])
        max_spread = Decimal(str(self.parameters.get("max_spread_pct", "0.5")))
        max_slip = Decimal(str(self.parameters.get("max_slippage_pct", "0.5")))
        return [
            c for c in contexts
            if c.symbol in eligible
            and c.spread_pct <= max_spread
            and (c.estimated_slippage_pct is None or c.estimated_slippage_pct <= max_slip)
        ]

    def _next_pair(self, state: StrategyState, passing_symbols: list[str]) -> Optional[str]:
        pairs = self.parameters["eligible_pairs"]
        last_index = state.data.get("rotation_index", -1)
        for offset in range(1, len(pairs) + 1):
            idx = (last_index + offset) % len(pairs)
            if pairs[idx] in passing_symbols:
                state.data["rotation_index"] = idx
                return pairs[idx]
        return None

    def should_buy(self, state: StrategyState, contexts: list[MarketContext]) -> Optional[TradeIntent]:
        if state.data.get("position_open"):
            return None
        last_sell_at = state.data.get("last_sell_at")
        if last_sell_at and (time.time() - last_sell_at) < self.parameters["buy_interval_seconds"]:
            return None
        passing = [c.symbol for c in self.evaluate_market(contexts)]
        symbol = self._next_pair(state, passing)
        if not symbol:
            return None
        return TradeIntent(symbol, "BUY", self.calculate_order_size(state),
                            f"Multi-pair rotation: next eligible pair is {symbol}")

    def should_sell(self, state: StrategyState, contexts: list[MarketContext]) -> Optional[TradeIntent]:
        if not state.data.get("position_open"):
            return None
        opened_at = state.data.get("position_opened_at", 0)
        if (time.time() - opened_at) < self.parameters["sell_interval_seconds"]:
            return None
        symbol = state.data.get("position_symbol")
        if not symbol:
            return None
        quote, base_qty = _sell_quote_and_base(state, contexts, self.calculate_order_size(state))
        return TradeIntent(symbol, "SELL", quote, "Multi-pair rotation: closing sell leg", base_qty=base_qty)


class LowestExecutionCostStrategy(StrategyBase):
    """Continuously estimates total execution cost (spread + slippage + fee
    + a simple market-impact proxy) per eligible pair and trades whichever
    is currently cheapest."""

    strategy_type = "LOWEST_EXECUTION_COST"

    def validate_config(self) -> None:
        _require(self.parameters, "eligible_pairs", list)
        _require(self.parameters, "order_size", Decimal)
        _require(self.parameters, "buy_interval_seconds", int)
        _require(self.parameters, "sell_interval_seconds", int)
        Decimal(str(self.parameters.get("taker_fee_rate", "0.001")))

    def _execution_cost_pct(self, ctx: MarketContext) -> Decimal:
        fee_pct = Decimal(str(self.parameters.get("taker_fee_rate", "0.001"))) * 100
        slippage_pct = ctx.estimated_slippage_pct or Decimal(0)
        # Simple market-impact proxy: penalize thin books beyond THIN.
        impact_pct = Decimal("0.05") if ctx.liquidity_quality == "THIN" else Decimal(0)
        return ctx.spread_pct + slippage_pct + fee_pct + impact_pct

    def evaluate_market(self, contexts: list[MarketContext]) -> list[MarketContext]:
        eligible = set(self.parameters["eligible_pairs"])
        candidates = [c for c in contexts if c.symbol in eligible]
        return sorted(candidates, key=self._execution_cost_pct)

    def should_buy(self, state: StrategyState, contexts: list[MarketContext]) -> Optional[TradeIntent]:
        if state.data.get("position_open"):
            return None
        last_sell_at = state.data.get("last_sell_at")
        if last_sell_at and (time.time() - last_sell_at) < self.parameters["buy_interval_seconds"]:
            return None
        ranked = self.evaluate_market(contexts)
        if not ranked:
            return None
        best = ranked[0]
        cost = self._execution_cost_pct(best)
        return TradeIntent(best.symbol, "BUY", self.calculate_order_size(state),
                            f"Lowest execution cost: {best.symbol} at ~{cost:.4f}% total cost")

    def should_sell(self, state: StrategyState, contexts: list[MarketContext]) -> Optional[TradeIntent]:
        if not state.data.get("position_open"):
            return None
        opened_at = state.data.get("position_opened_at", 0)
        if (time.time() - opened_at) < self.parameters["sell_interval_seconds"]:
            return None
        symbol = state.data.get("position_symbol")
        if not symbol:
            return None
        quote, base_qty = _sell_quote_and_base(state, contexts, self.calculate_order_size(state))
        return TradeIntent(symbol, "SELL", quote, "Lowest execution cost: closing sell leg", base_qty=base_qty)


class VolumeTargetSchedulerStrategy(StrategyBase):
    """Paces trading frequency based on remaining target volume and time
    remaining in the promotion, WITHOUT ever exceeding configured risk
    limits — it can only slow down or speed up within max_order_size /
    max_daily_volume, never override them."""

    strategy_type = "VOLUME_TARGET_SCHEDULER"

    def validate_config(self) -> None:
        _require(self.parameters, "eligible_pairs", list)
        _require(self.parameters, "order_size", Decimal)
        _require(self.parameters, "min_interval_seconds", int)
        _require(self.parameters, "max_interval_seconds", int)
        if self.parameters["min_interval_seconds"] > self.parameters["max_interval_seconds"]:
            raise ValueError("min_interval_seconds cannot exceed max_interval_seconds")

    def compute_required_pace(
        self, target_volume: Decimal, current_volume: Decimal, seconds_remaining: Decimal,
    ) -> dict[str, Decimal]:
        remaining_volume = max(target_volume - current_volume, Decimal(0))
        hours_remaining = max(seconds_remaining / Decimal(3600), Decimal("0.0001"))
        required_per_hour = remaining_volume / hours_remaining
        order_size = self.calculate_order_size(StrategyState())
        required_cycles = (remaining_volume / (order_size * 2)) if order_size > 0 else Decimal(0)
        return {
            "remaining_volume": remaining_volume,
            "required_volume_per_hour": required_per_hour,
            "required_cycles": required_cycles,
        }

    def _current_interval(self, state: StrategyState) -> int:
        pace = state.data.get("behind_schedule_ratio", Decimal(1))
        min_i, max_i = self.parameters["min_interval_seconds"], self.parameters["max_interval_seconds"]
        # More behind schedule (ratio > 1) -> shorter interval, but never
        # below the configured floor.
        pace = Decimal(str(pace))
        scaled = int(max_i / max(pace, Decimal("0.1")))
        return max(min_i, min(max_i, scaled))

    def evaluate_market(self, contexts: list[MarketContext]) -> list[MarketContext]:
        eligible = set(self.parameters["eligible_pairs"])
        return [c for c in contexts if c.symbol in eligible]

    def should_buy(self, state: StrategyState, contexts: list[MarketContext]) -> Optional[TradeIntent]:
        if state.data.get("position_open"):
            return None
        last_sell_at = state.data.get("last_sell_at")
        interval = self._current_interval(state)
        if last_sell_at and (time.time() - last_sell_at) < interval:
            return None
        candidates = self.evaluate_market(contexts)
        if not candidates:
            return None
        return TradeIntent(candidates[0].symbol, "BUY", self.calculate_order_size(state),
                            f"Volume target scheduler: pacing interval={interval}s")

    def should_sell(self, state: StrategyState, contexts: list[MarketContext]) -> Optional[TradeIntent]:
        if not state.data.get("position_open"):
            return None
        opened_at = state.data.get("position_opened_at", 0)
        interval = self._current_interval(state)
        if (time.time() - opened_at) < interval:
            return None
        symbol = state.data.get("position_symbol")
        if not symbol:
            return None
        quote, base_qty = _sell_quote_and_base(state, contexts, self.calculate_order_size(state))
        return TradeIntent(symbol, "SELL", quote, "Volume target scheduler: closing sell leg", base_qty=base_qty)
