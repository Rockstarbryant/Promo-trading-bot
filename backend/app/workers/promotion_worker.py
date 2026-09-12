"""
Background worker that periodically ends promotions whose end_time has
passed, and stops any bots still attached to them. Run this as a scheduled
task (cron, or an asyncio loop in a long-running process).
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select

from app.core.logging import get_event_logger, log_event
from app.db.models import Promotion, PromotionStatus, TradingBot, BotStatus
from app.workers.bot_worker import bot_runner_registry

logger = get_event_logger()


async def sweep_expired_promotions(session_factory) -> int:
    now = datetime.now(timezone.utc)
    count = 0
    async with session_factory() as db:
        result = await db.execute(
            select(Promotion).where(Promotion.status == PromotionStatus.ACTIVE, Promotion.end_time < now)
        )
        expired = result.scalars().all()
        for promo in expired:
            promo.status = PromotionStatus.ENDED
            bots = (
                await db.execute(select(TradingBot).where(TradingBot.promotion_id == promo.id))
            ).scalars().all()
            for bot in bots:
                if bot.status in (BotStatus.RUNNING, BotStatus.PAUSED, BotStatus.STARTING):
                    bot_runner_registry.stop(bot.id)
                    log_event(logger, "bot_stopped_promotion_ended", bot_id=bot.id, promotion_id=promo.id)
            count += 1
        await db.commit()
    return count
