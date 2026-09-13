"""
Strategy interface. Adding a new strategy means subclassing StrategyBase and
registering it in `registry.py` — nothing in the execution engine, risk
engine, or Binance client needs to change.

A strategy's job is ONLY to decide *what* to trade next (which pair, which
side, how much) based on market context it's given. It must never place
orders directly, and it must never bypass the execution/risk engines — the
bot worker is the only thing that actually submits orders, and it always
routes every candidate trade through RiskEngine and the execution decision
engine first.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any, Optional


@dataclass
class MarketContext:
    """A snapshot of current conditions for one eligible pair, gathered by
    the bot worker before asking the strategy what to do."""
    symbol: str
    best_bid: Decimal
    best_ask: Decimal
    spread_pct: Decimal
    order_book_bids: list[tuple]
    order_book_asks: list[tuple]
    volume_24h: Optional[Decimal] = None
    estimated_slippage_pct: Optional[Decimal] = None
    liquidity_quality: Optional[str] = None


@dataclass
class StrategyState:
    """Rolling state the strategy needs across ticks: current position in a
    cycle, cycles completed, last action timestamps, etc. Persisted by the
    caller between ticks (kept intentionally generic/JSON-serializable)."""
    data: dict[str, Any] = field(default_factory=dict)


@dataclass
class TradeIntent:
    """What the strategy wants to do next. The bot worker still runs this
    through eligibility, risk, and execution-decision checks before doing
    anything.

    quote_amount is always the USDT (quote) notional used for risk checks
    and volume accounting. base_qty is optional and set on SELL when the
    strategy already holds a known base quantity from the opening BUY.
    """
    symbol: str
    side: str  # BUY / SELL
    quote_amount: Decimal
    rationale: str
    base_qty: Decimal | None = None


class StrategyBase(ABC):
    strategy_type: str

    def __init__(self, parameters: dict[str, Any]):
        self.parameters = parameters
        self.validate_config()

    @abstractmethod
    def validate_config(self) -> None:
        """Raise ValueError if self.parameters is invalid for this strategy."""

    @abstractmethod
    def evaluate_market(self, contexts: list[MarketContext]) -> list[MarketContext]:
        """Filter/rank the given eligible-pair contexts. Return only pairs
        that pass this strategy's own market-quality bar, best first."""

    @abstractmethod
    def should_buy(self, state: StrategyState, contexts: list[MarketContext]) -> Optional[TradeIntent]:
        ...

    @abstractmethod
    def should_sell(self, state: StrategyState, contexts: list[MarketContext]) -> Optional[TradeIntent]:
        ...

    def calculate_order_size(self, state: StrategyState) -> Decimal:
        return Decimal(str(self.parameters.get("order_size")))

    def calculate_execution_parameters(self) -> dict[str, Any]:
        return {
            "max_spread_pct": Decimal(str(self.parameters.get("max_spread_pct", "0.5"))),
            "max_slippage_pct": Decimal(str(self.parameters.get("max_slippage_pct", "0.5"))),
        }
