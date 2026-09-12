from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.db.models import Order, TradingBot
from app.schemas.schemas import OrderOut
from app.core.security import get_current_user_id

router = APIRouter(prefix="/api/orders", tags=["orders"])


@router.get("", response_model=list[OrderOut])
async def list_orders(
    bot_id: str | None = Query(default=None),
    symbol: str | None = Query(default=None),
    limit: int = Query(default=100, le=500),
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    query = select(Order).join(TradingBot, Order.bot_id == TradingBot.id).where(TradingBot.user_id == user_id)
    if bot_id:
        query = query.where(Order.bot_id == bot_id)
    if symbol:
        query = query.where(Order.symbol == symbol.upper())
    query = query.order_by(Order.created_at.desc()).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{order_id}", response_model=OrderOut)
async def get_order(order_id: str, user_id: str = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    order = (
        await db.execute(
            select(Order).join(TradingBot, Order.bot_id == TradingBot.id)
            .where(Order.id == order_id, TradingBot.user_id == user_id)
        )
    ).scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order
