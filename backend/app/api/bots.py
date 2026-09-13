from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.session import get_db, AsyncSessionLocal
from app.db.models import TradingBot, BotStatus, BinanceAccount, Promotion, StrategyConfiguration
from app.schemas.schemas import TradingBotCreate, TradingBotOut, BotActionOut
from app.core.security import get_current_user_id
from app.workers.bot_worker import bot_runner_registry
from app.api.websocket import manager as ws_manager

router = APIRouter(prefix="/api/bots", tags=["bots"])


async def _get_owned_bot(bot_id: str, user_id: str, db: AsyncSession) -> TradingBot:
    bot = (
        await db.execute(select(TradingBot).where(TradingBot.id == bot_id, TradingBot.user_id == user_id))
    ).scalar_one_or_none()
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
    return bot


@router.post("", response_model=TradingBotOut, status_code=status.HTTP_201_CREATED)
async def create_bot(payload: TradingBotCreate, user_id: str = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    account = (
        await db.execute(select(BinanceAccount).where(BinanceAccount.id == payload.binance_account_id, BinanceAccount.user_id == user_id))
    ).scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Binance account not found")

    promo = (
        await db.execute(select(Promotion).where(Promotion.id == payload.promotion_id, Promotion.user_id == user_id))
    ).scalar_one_or_none()
    if not promo:
        raise HTTPException(status_code=404, detail="Promotion not found")

    strategy_config = (
        await db.execute(select(StrategyConfiguration).where(StrategyConfiguration.id == payload.strategy_config_id, StrategyConfiguration.user_id == user_id))
    ).scalar_one_or_none()
    if not strategy_config:
        raise HTTPException(status_code=404, detail="Strategy configuration not found")

    settings = get_settings()
    if payload.mode == "LIVE" and not settings.allow_live_trading:
        raise HTTPException(
            status_code=400,
            detail="Live trading is disabled at the deployment level (ALLOW_LIVE_TRADING=false). "
                   "Use PAPER mode, or have the operator enable live trading.",
        )
    if payload.mode == "LIVE" and not account.can_trade:
        raise HTTPException(status_code=400, detail="Connected Binance account does not have trading permission")
    if payload.mode == "LIVE" and account.can_withdraw:
        raise HTTPException(
            status_code=400,
            detail="This Binance API key has withdrawal permission enabled. For safety, disable "
                   "withdrawals on the API key before using it for live trading.",
        )

    bot = TradingBot(
        user_id=user_id, name=payload.name, binance_account_id=account.id, promotion_id=promo.id,
        strategy_config_id=strategy_config.id, mode=payload.mode,
        max_capital=payload.max_capital, max_order_size=payload.max_order_size,
        max_daily_volume=payload.max_daily_volume, max_daily_loss=payload.max_daily_loss,
        max_spread_pct=payload.max_spread_pct, max_slippage_pct=payload.max_slippage_pct,
        max_exposure=payload.max_exposure, max_consecutive_failures=payload.max_consecutive_failures,
        max_stale_order_seconds=payload.max_stale_order_seconds,
    )
    db.add(bot)
    await db.commit()
    await db.refresh(bot)
    return bot


@router.get("", response_model=list[TradingBotOut])
async def list_bots(user_id: str = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(TradingBot).where(TradingBot.user_id == user_id))
    return result.scalars().all()


@router.get("/{bot_id}", response_model=TradingBotOut)
async def get_bot(bot_id: str, user_id: str = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    return await _get_owned_bot(bot_id, user_id, db)


@router.post("/{bot_id}/start", response_model=BotActionOut)
async def start_bot(bot_id: str, user_id: str = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    bot = await _get_owned_bot(bot_id, user_id, db)
    if bot_runner_registry.is_running(bot.id):
        return BotActionOut(id=bot.id, status=bot.status.value if hasattr(bot.status, "value") else str(bot.status), message="Bot already running")
    # DB may still say RUNNING after a process restart while the worker is gone.
    bot.status = BotStatus.STARTING
    await db.commit()
    bot_runner_registry.start(bot.id, AsyncSessionLocal, ws_manager.broadcast)
    return BotActionOut(id=bot.id, status="STARTING", message="Bot start requested")


@router.post("/{bot_id}/pause", response_model=BotActionOut)
async def pause_bot(bot_id: str, user_id: str = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    bot = await _get_owned_bot(bot_id, user_id, db)
    bot_runner_registry.pause(bot.id, True)
    # Persist status so the worker's next tick (or any process) honors pause
    # even if the in-memory registry lost the worker after a deploy/restart.
    bot.status = BotStatus.PAUSED
    await db.commit()
    return BotActionOut(id=bot.id, status="PAUSED", message="Pause requested")


@router.post("/{bot_id}/resume", response_model=BotActionOut)
async def resume_bot(bot_id: str, user_id: str = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    bot = await _get_owned_bot(bot_id, user_id, db)
    bot_runner_registry.pause(bot.id, False)
    bot.status = BotStatus.RUNNING
    await db.commit()
    # If the process restarted and the worker is gone, start a new one.
    if not bot_runner_registry.is_running(bot.id):
        bot_runner_registry.start(bot.id, AsyncSessionLocal, ws_manager.broadcast)
    return BotActionOut(id=bot.id, status="RUNNING", message="Resume requested")


@router.post("/{bot_id}/stop", response_model=BotActionOut)
async def stop_bot(bot_id: str, user_id: str = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    bot = await _get_owned_bot(bot_id, user_id, db)
    bot_runner_registry.stop(bot.id)
    bot.status = BotStatus.STOPPED
    bot.stopped_at = datetime.now(timezone.utc)
    await db.commit()
    return BotActionOut(id=bot.id, status="STOPPED", message="Stop requested")


@router.post("/{bot_id}/emergency-stop", response_model=BotActionOut)
async def emergency_stop_bot(bot_id: str, user_id: str = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    """Immediately stops new orders and attempts to cancel outstanding
    bot-created open orders. Does NOT liquidate positions."""
    bot = await _get_owned_bot(bot_id, user_id, db)
    bot_runner_registry.stop(bot.id)

    from app.services.binance.client import BinanceSpotClient
    from app.core.encryption import get_secret_box
    from app.db.models import BinanceAccount, Order, OrderStatus

    account = await db.get(BinanceAccount, bot.binance_account_id)
    open_orders = (
        await db.execute(
            select(Order).where(Order.bot_id == bot.id, Order.status.in_([OrderStatus.SUBMITTED, OrderStatus.PARTIALLY_FILLED]))
        )
    ).scalars().all()

    cancelled_count = 0
    if account and not bot.mode == "PAPER":
        secret = get_secret_box().decrypt(account.encrypted_api_secret)
        client = BinanceSpotClient(api_key=account.api_key, api_secret=secret)
        try:
            for o in open_orders:
                try:
                    await client.cancel_order(o.symbol, orig_client_order_id=o.client_order_id)
                    o.status = OrderStatus.CANCELLED
                    cancelled_count += 1
                except Exception:
                    continue
        finally:
            await client.aclose()
    else:
        for o in open_orders:
            o.status = OrderStatus.CANCELLED
            cancelled_count += 1

    bot.status = BotStatus.STOPPED
    await db.commit()
    return BotActionOut(
        id=bot.id, status="STOPPED",
        message=f"Emergency stop executed. Cancelled {cancelled_count} outstanding order(s). "
                f"No positions were automatically liquidated.",
    )
