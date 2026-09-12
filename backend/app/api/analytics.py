from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.db.models import Order, TradingBot, TradingCycle
from app.schemas.schemas import AnalyticsSummaryOut
from app.core.security import get_current_user_id
from app.services.analytics.calculations import summarize

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/bots/{bot_id}/summary", response_model=AnalyticsSummaryOut)
async def bot_analytics_summary(bot_id: str, user_id: str = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    bot = (
        await db.execute(select(TradingBot).where(TradingBot.id == bot_id, TradingBot.user_id == user_id))
    ).scalar_one_or_none()
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")

    orders = (await db.execute(select(Order).where(Order.bot_id == bot_id))).scalars().all()
    cycles = (await db.execute(select(TradingCycle).where(TradingCycle.bot_id == bot_id))).scalars().all()

    order_dicts = [
        {
            "status": o.status.value if hasattr(o.status, "value") else o.status,
            "symbol": o.symbol,
            "strategy_type": o.strategy_type.value if hasattr(o.strategy_type, "value") else o.strategy_type,
            "cumulative_quote_quantity": o.cumulative_quote_quantity,
            "commission_quote": o.commission,
        }
        for o in orders
    ]
    cycle_dicts = [
        {
            "started_at": c.started_at, "completed_at": c.completed_at,
            "estimated_slippage": c.estimated_slippage, "gross_volume": c.gross_volume,
            "realized_pnl": c.realized_pnl,
        }
        for c in cycles
    ]

    summary = summarize(order_dicts, cycle_dicts)
    return AnalyticsSummaryOut(**summary.__dict__)
