from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.db.models import Promotion, PromotionPair, Order, OrderStatus, PromotionType
from app.schemas.schemas import PromotionCreate, PromotionOut, PromotionProgressOut
from app.core.security import get_current_user_id
from app.services.promotions.engine import get_promotion_handler

router = APIRouter(prefix="/api/promotions", tags=["promotions"])


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
    db.add(promotion)
    await db.flush()

    # Deduplicate by symbol (comma-separated UI input often repeats pairs).
    seen: set[str] = set()
    for pair in payload.pairs:
        symbol = (pair.symbol or "").strip().upper()
        if not symbol or symbol in seen:
            continue
        seen.add(symbol)
        db.add(PromotionPair(
            promotion_id=promotion.id,
            symbol=symbol,
            is_eligible=pair.is_eligible,
            per_pair_target_volume=pair.per_pair_target_volume,
        ))

    if not seen:
        raise HTTPException(
            status_code=400,
            detail="At least one eligible pair symbol is required.",
        )

    await db.commit()
    await db.refresh(promotion)
    return promotion


@router.get("", response_model=list[PromotionOut])
async def list_promotions(user_id: str = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Promotion).where(Promotion.user_id == user_id))
    return result.scalars().all()


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
    return await _get_owned_promotion(promotion_id, user_id, db)


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


@router.post("/{promotion_id}/activate", response_model=PromotionOut)
async def activate_promotion(promotion_id: str, user_id: str = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    promo = await _get_owned_promotion(promotion_id, user_id, db)
    promo.status = "ACTIVE"
    await db.commit()
    await db.refresh(promo)
    return promo


@router.post("/{promotion_id}/end", response_model=PromotionOut)
async def end_promotion(promotion_id: str, user_id: str = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    promo = await _get_owned_promotion(promotion_id, user_id, db)
    promo.status = "ENDED"
    await db.commit()
    await db.refresh(promo)
    return promo
