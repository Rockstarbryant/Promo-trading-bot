from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.db.models import (
    Promotion, PromotionPair, PromotionStatus, Order, OrderStatus, PromotionType,
    TradingBot, StrategyConfiguration,
)
from app.schemas.schemas import (
    PromotionCreate, PromotionUpdate, PromotionOut, PromotionPairOut, PromotionProgressOut,
)
from app.core.security import get_current_user_id
from app.services.promotions.engine import get_promotion_handler

router = APIRouter(prefix="/api/promotions", tags=["promotions"])


def _value(v) -> str:
    return v.value if hasattr(v, "value") else v


async def _enrich(promo: Promotion, db: AsyncSession) -> PromotionOut:
    """Attach bot/strategy usage that isn't stored on the Promotion row
    itself, so the promotion detail page can show "N bots running this,
    using strategies X, Y" without a separate round trip per promotion."""
    bots = (
        await db.execute(select(TradingBot).where(TradingBot.promotion_id == promo.id))
    ).scalars().all()

    strategy_ids = {b.strategy_config_id for b in bots}
    strategy_names: list[str] = []
    if strategy_ids:
        strategies = (
            await db.execute(select(StrategyConfiguration).where(StrategyConfiguration.id.in_(strategy_ids)))
        ).scalars().all()
        strategy_names = sorted({s.name for s in strategies})

    running_bot_count = sum(
        1 for b in bots if _value(b.status) in ("RUNNING", "STARTING", "PAUSED")
    )

    return PromotionOut(
        id=promo.id,
        name=promo.name,
        description=promo.description,
        promotion_type=_value(promo.promotion_type),
        status=_value(promo.status),
        start_time=promo.start_time,
        end_time=promo.end_time,
        target_volume=promo.target_volume,
        min_volume=promo.min_volume,
        max_volume=promo.max_volume,
        notes=promo.notes,
        rules_url=promo.rules_url,
        pairs=[PromotionPairOut.model_validate(p) for p in promo.pairs],
        bot_count=len(bots),
        running_bot_count=running_bot_count,
        strategies_in_use=strategy_names,
    )


def _build_pairs(pairs_in) -> tuple[list[PromotionPair], set[str]]:
    """Builds detached PromotionPair rows (deduplicated by symbol) meant to
    be assigned wholesale to `promotion.pairs`, rather than added
    individually — reassigning the collection (instead of manually
    db.delete()-ing old rows) is what lets SQLAlchemy's
    cascade="all, delete-orphan" clean up removed pairs AND keeps the
    in-memory collection consistent for the rest of the request, since a
    directly-deleted child does not disappear from an already-loaded
    parent collection until the session is expired."""
    seen: set[str] = set()
    pairs: list[PromotionPair] = []
    for pair in pairs_in:
        symbol = (pair.symbol or "").strip().upper()
        if not symbol or symbol in seen:
            continue
        seen.add(symbol)
        pairs.append(PromotionPair(
            symbol=symbol,
            is_eligible=pair.is_eligible,
            per_pair_target_volume=pair.per_pair_target_volume,
        ))
    return pairs, seen


@router.post("", response_model=PromotionOut, status_code=status.HTTP_201_CREATED)
async def create_promotion(
    payload: PromotionCreate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    try:
        PromotionType(payload.promotion_type)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Unknown promotion_type: {payload.promotion_type}")

    promotion = Promotion(
        user_id=user_id,
        name=payload.name,
        description=payload.description,
        promotion_type=payload.promotion_type,
        start_time=payload.start_time,
        end_time=payload.end_time,
        target_volume=payload.target_volume,
        min_volume=payload.min_volume,
        max_volume=payload.max_volume,
        notes=payload.notes,
        rules_url=payload.rules_url,
        extra_config=payload.extra_config,
    )
    pairs, seen = _build_pairs(payload.pairs)
    if not seen:
        raise HTTPException(
            status_code=400,
            detail="At least one eligible pair symbol is required.",
        )
    promotion.pairs = pairs

    db.add(promotion)
    await db.commit()
    promotion = await _get_owned_promotion(promotion.id, user_id, db)
    return await _enrich(promotion, db)


@router.get("", response_model=list[PromotionOut])
async def list_promotions(user_id: str = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Promotion).options(selectinload(Promotion.pairs)).where(Promotion.user_id == user_id)
    )
    promotions = result.scalars().all()
    return [await _enrich(p, db) for p in promotions]


async def _get_owned_promotion(promotion_id: str, user_id: str, db: AsyncSession) -> Promotion:
    promo = (
        await db.execute(
            select(Promotion)
            .options(selectinload(Promotion.pairs))
            .where(Promotion.id == promotion_id, Promotion.user_id == user_id)
        )
    ).scalar_one_or_none()
    if not promo:
        raise HTTPException(status_code=404, detail="Promotion not found")
    return promo


@router.get("/{promotion_id}", response_model=PromotionOut)
async def get_promotion(promotion_id: str, user_id: str = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    promo = await _get_owned_promotion(promotion_id, user_id, db)
    return await _enrich(promo, db)


@router.get("/{promotion_id}/progress", response_model=PromotionProgressOut)
async def get_promotion_progress(promotion_id: str, user_id: str = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    promo = await _get_owned_promotion(promotion_id, user_id, db)
    orders = (
        await db.execute(select(Order).where(Order.promotion_id == promotion_id, Order.status == OrderStatus.FILLED))
    ).scalars().all()
    fills = [
        {"symbol": o.symbol, "side": o.side.value, "quote_qty": o.cumulative_quote_quantity, "timestamp": o.filled_at}
        for o in orders
    ]
    handler = get_promotion_handler(PromotionType(promo.promotion_type.value if hasattr(promo.promotion_type, "value") else promo.promotion_type))
    progress = handler.progress(promo, fills)
    return PromotionProgressOut(
        qualifying_volume=progress.qualifying_volume,
        target_volume=progress.target_volume,
        progress_pct=progress.progress_pct,
        remaining_volume=progress.remaining_volume,
    )


@router.patch("/{promotion_id}", response_model=PromotionOut)
async def update_promotion(
    promotion_id: str,
    payload: PromotionUpdate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Edit any promotion detail — name, type, dates, volume targets, notes,
    rules link, or (by sending `pairs`) the entire eligible-pair list."""
    promo = await _get_owned_promotion(promotion_id, user_id, db)
    data = payload.model_dump(exclude_unset=True, exclude={"pairs"})

    if data.get("promotion_type") is not None:
        try:
            PromotionType(data["promotion_type"])
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Unknown promotion_type: {data['promotion_type']}")

    if data.get("status") is not None:
        try:
            PromotionStatus(data["status"])
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Unknown status: {data['status']}")

    new_start = data.get("start_time", promo.start_time)
    new_end = data.get("end_time", promo.end_time)
    if new_end <= new_start:
        raise HTTPException(status_code=400, detail="end_time must be after start_time")

    for key, value in data.items():
        setattr(promo, key, value)

    if payload.pairs is not None:
        pairs, seen = _build_pairs(payload.pairs)
        if not seen:
            raise HTTPException(status_code=400, detail="At least one eligible pair symbol is required.")
        promo.pairs = pairs

    await db.commit()
    promo = await _get_owned_promotion(promotion_id, user_id, db)
    return await _enrich(promo, db)


@router.delete("/{promotion_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_promotion(promotion_id: str, user_id: str = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    promo = await _get_owned_promotion(promotion_id, user_id, db)
    attached_bots = (
        await db.execute(select(TradingBot).where(TradingBot.promotion_id == promo.id))
    ).scalars().all()
    if attached_bots:
        raise HTTPException(
            status_code=400,
            detail=f"Delete or reassign the {len(attached_bots)} bot(s) using this promotion before deleting it.",
        )
    await db.delete(promo)
    await db.commit()
    return None


@router.post("/{promotion_id}/activate", response_model=PromotionOut)
async def activate_promotion(promotion_id: str, user_id: str = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    promo = await _get_owned_promotion(promotion_id, user_id, db)
    promo.status = "ACTIVE"
    await db.commit()
    promo = await _get_owned_promotion(promotion_id, user_id, db)
    return await _enrich(promo, db)


@router.post("/{promotion_id}/end", response_model=PromotionOut)
async def end_promotion(promotion_id: str, user_id: str = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    promo = await _get_owned_promotion(promotion_id, user_id, db)
    promo.status = "ENDED"
    await db.commit()
    promo = await _get_owned_promotion(promotion_id, user_id, db)
    return await _enrich(promo, db)
