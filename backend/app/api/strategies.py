from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.db.models import StrategyConfiguration, StrategyType
from app.schemas.schemas import StrategyConfigurationCreate, StrategyConfigurationOut
from app.core.security import get_current_user_id
from app.services.strategies.registry import build_strategy, STRATEGY_REGISTRY

router = APIRouter(prefix="/api/strategies", tags=["strategies"])


@router.get("/types")
async def list_strategy_types():
    return [t.value for t in STRATEGY_REGISTRY.keys()]


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
    return config


@router.get("", response_model=list[StrategyConfigurationOut])
async def list_strategy_configs(user_id: str = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(StrategyConfiguration).where(StrategyConfiguration.user_id == user_id))
    return result.scalars().all()
