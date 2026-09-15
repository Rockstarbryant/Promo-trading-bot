from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.db.models import StrategyConfiguration, StrategyType, TradingBot
from app.schemas.schemas import (
    StrategyConfigurationCreate, StrategyConfigurationUpdate, StrategyConfigurationOut, StrategyTypeInfo,
)
from app.core.security import get_current_user_id
from app.services.strategies.registry import build_strategy, STRATEGY_REGISTRY

router = APIRouter(prefix="/api/strategies", tags=["strategies"])

STRATEGY_LABELS: dict[StrategyType, str] = {
    StrategyType.INTERVAL_ROUND_TRIP: "Interval round trip",
    StrategyType.LIQUIDITY_AWARE_ROUND_TRIP: "Liquidity-aware round trip",
    StrategyType.MULTI_PAIR_ROTATION: "Multi-pair rotation",
    StrategyType.LOWEST_EXECUTION_COST: "Lowest execution cost",
    StrategyType.VOLUME_TARGET_SCHEDULER: "Volume target scheduler",
}

# Kept in sync with the docstring on each class in
# app/services/strategies/implementations.py — surfaced in the UI so users
# know what each strategy actually does before attaching it to a bot.
STRATEGY_DESCRIPTIONS: dict[StrategyType, str] = {
    StrategyType.INTERVAL_ROUND_TRIP: (
        "Buys one eligible pair, waits a fixed interval, sells, waits again, and repeats. "
        "The simplest way to generate steady promotion-qualifying volume on a single pair "
        "at a predictable pace."
    ),
    StrategyType.LIQUIDITY_AWARE_ROUND_TRIP: (
        "Runs the same buy-then-sell round trip, but before opening a position it checks "
        "every eligible pair and picks whichever currently has the tightest spread and "
        "lowest slippage. Use this when several pairs qualify and you want each trade to "
        "cost as little as possible."
    ),
    StrategyType.MULTI_PAIR_ROTATION: (
        "Cycles through a list of eligible pairs in order, skipping any that currently fail "
        "your spread/slippage limits. Spreads volume across multiple pairs instead of "
        "concentrating it on one — useful when a promotion requires or rewards trading "
        "several pairs (requires at least 2 eligible pairs)."
    ),
    StrategyType.LOWEST_EXECUTION_COST: (
        "Continuously estimates total execution cost — spread, slippage, taker fee, and a "
        "thin-book penalty — across all eligible pairs, and always trades whichever is "
        "cheapest right now. Prioritizes minimizing cost per unit of volume over anything else."
    ),
    StrategyType.VOLUME_TARGET_SCHEDULER: (
        "Paces how often it trades based on the promotion's remaining target volume and time "
        "left: it speeds up if you're behind schedule and slows down if you're ahead, but "
        "never trades outside the bot's configured risk limits. Best when you have a specific "
        "volume target and a deadline."
    ),
}


def _value(v) -> str:
    return v.value if hasattr(v, "value") else v


def _label(strategy_type) -> str:
    try:
        return STRATEGY_LABELS[StrategyType(strategy_type)]
    except ValueError:
        return str(strategy_type)


def _description(strategy_type) -> str:
    try:
        return STRATEGY_DESCRIPTIONS[StrategyType(strategy_type)]
    except ValueError:
        return ""


@router.get("/types", response_model=list[StrategyTypeInfo])
async def list_strategy_types():
    return [
        StrategyTypeInfo(value=t.value, label=STRATEGY_LABELS[t], description=STRATEGY_DESCRIPTIONS[t])
        for t in STRATEGY_REGISTRY.keys()
    ]


async def _enrich(config: StrategyConfiguration, db: AsyncSession) -> StrategyConfigurationOut:
    bots = (
        await db.execute(select(TradingBot).where(TradingBot.strategy_config_id == config.id))
    ).scalars().all()
    strategy_type = _value(config.strategy_type)
    return StrategyConfigurationOut(
        id=config.id,
        name=config.name,
        strategy_type=strategy_type,
        parameters=config.parameters,
        description=_description(strategy_type),
        bot_count=len(bots),
    )


async def _get_owned_config(config_id: str, user_id: str, db: AsyncSession) -> StrategyConfiguration:
    config = (
        await db.execute(
            select(StrategyConfiguration).where(StrategyConfiguration.id == config_id, StrategyConfiguration.user_id == user_id)
        )
    ).scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="Strategy configuration not found")
    return config


@router.post("", response_model=StrategyConfigurationOut, status_code=status.HTTP_201_CREATED)
async def create_strategy_config(
    payload: StrategyConfigurationCreate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    try:
        strategy_type = StrategyType(payload.strategy_type)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Unknown strategy_type: {payload.strategy_type}")

    # Validate parameters immediately by constructing the strategy — this
    # surfaces missing/invalid config at creation time, not at bot runtime.
    try:
        build_strategy(strategy_type, payload.parameters)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    config = StrategyConfiguration(
        user_id=user_id, name=payload.name, strategy_type=strategy_type, parameters=payload.parameters,
    )
    db.add(config)
    await db.commit()
    await db.refresh(config)
    return await _enrich(config, db)


@router.get("", response_model=list[StrategyConfigurationOut])
async def list_strategy_configs(user_id: str = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(StrategyConfiguration).where(StrategyConfiguration.user_id == user_id))
    configs = result.scalars().all()
    return [await _enrich(c, db) for c in configs]


@router.get("/{config_id}", response_model=StrategyConfigurationOut)
async def get_strategy_config(config_id: str, user_id: str = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    config = await _get_owned_config(config_id, user_id, db)
    return await _enrich(config, db)


@router.patch("/{config_id}", response_model=StrategyConfigurationOut)
async def update_strategy_config(
    config_id: str,
    payload: StrategyConfigurationUpdate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    config = await _get_owned_config(config_id, user_id, db)
    data = payload.model_dump(exclude_unset=True)

    if "parameters" in data and data["parameters"] is not None:
        try:
            build_strategy(StrategyType(_value(config.strategy_type)), data["parameters"])
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        config.parameters = data["parameters"]

    if data.get("name"):
        config.name = data["name"]

    await db.commit()
    await db.refresh(config)
    return await _enrich(config, db)


@router.delete("/{config_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_strategy_config(config_id: str, user_id: str = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    config = await _get_owned_config(config_id, user_id, db)
    bots = (
        await db.execute(select(TradingBot).where(TradingBot.strategy_config_id == config.id))
    ).scalars().all()
    if bots:
        raise HTTPException(
            status_code=400,
            detail=f"Delete or reassign the {len(bots)} bot(s) using this strategy before deleting it.",
        )
    await db.delete(config)
    await db.commit()
    return None
