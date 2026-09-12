"""
Strategy registry: maps StrategyType -> implementation class.

Adding a new strategy is a two-step process: implement StrategyBase in
implementations.py, then add one line here.
"""
from app.db.models import StrategyType
from app.services.strategies.base import StrategyBase
from app.services.strategies.implementations import (
    IntervalRoundTripStrategy,
    LiquidityAwareRoundTripStrategy,
    MultiPairRotationStrategy,
    LowestExecutionCostStrategy,
    VolumeTargetSchedulerStrategy,
)

STRATEGY_REGISTRY: dict[StrategyType, type[StrategyBase]] = {
    StrategyType.INTERVAL_ROUND_TRIP: IntervalRoundTripStrategy,
    StrategyType.LIQUIDITY_AWARE_ROUND_TRIP: LiquidityAwareRoundTripStrategy,
    StrategyType.MULTI_PAIR_ROTATION: MultiPairRotationStrategy,
    StrategyType.LOWEST_EXECUTION_COST: LowestExecutionCostStrategy,
    StrategyType.VOLUME_TARGET_SCHEDULER: VolumeTargetSchedulerStrategy,
}


def build_strategy(strategy_type: StrategyType, parameters: dict) -> StrategyBase:
    cls = STRATEGY_REGISTRY.get(strategy_type)
    if not cls:
        raise ValueError(f"No strategy implementation registered for {strategy_type}")
    return cls(parameters)
