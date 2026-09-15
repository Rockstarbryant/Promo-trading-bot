from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.session import get_db, AsyncSessionLocal
from app.db.models import (
    TradingBot, BotStatus, BinanceAccount, Promotion, PromotionPair,
    StrategyConfiguration, Order, RiskEvent, BotEvent, TradingCycle,
)
from app.schemas.schemas import (
    TradingBotCreate, TradingBotUpdate, TradingBotOut, BotActionOut, BotBalanceOut,
)
from app.core.security import get_current_user_id
from app.core.encryption import get_secret_box
from app.services.binance.client import BinanceSpotClient
from app.services.binance.exceptions import BinanceError
from app.services.binance.symbol_repository import SymbolRepository
from app.services.binance.balances import split_symbol_heuristic
from app.workers.bot_worker import bot_runner_registry
from app.api.websocket import manager as ws_manager

router = APIRouter(prefix="/api/bots", tags=["bots"])


def _value(v) -> str:
    return v.value if hasattr(v, "value") else v


def _safe_decimal(value) -> Optional[Decimal]:
    if value is None:
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None


async def _bots_to_out(bots: list[TradingBot], db: AsyncSession) -> list[TradingBotOut]:
    """Enriches bots with the promotion/strategy/account context the UI
    needs (initial order size, strategy in use, promotion name, connected
    account label) in a handful of batched queries rather than N+1 per bot."""
    promo_ids = {b.promotion_id for b in bots}
    strategy_ids = {b.strategy_config_id for b in bots}
    account_ids = {b.binance_account_id for b in bots}

    promos: dict[str, Promotion] = {}
    if promo_ids:
        rows = (await db.execute(select(Promotion).where(Promotion.id.in_(promo_ids)))).scalars().all()
        promos = {p.id: p for p in rows}

    strategies: dict[str, StrategyConfiguration] = {}
    if strategy_ids:
        rows = (
            await db.execute(select(StrategyConfiguration).where(StrategyConfiguration.id.in_(strategy_ids)))
        ).scalars().all()
        strategies = {s.id: s for s in rows}

    accounts: dict[str, BinanceAccount] = {}
    if account_ids:
        rows = (await db.execute(select(BinanceAccount).where(BinanceAccount.id.in_(account_ids)))).scalars().all()
        accounts = {a.id: a for a in rows}

    out: list[TradingBotOut] = []
    for bot in bots:
        promo = promos.get(bot.promotion_id)
        strat = strategies.get(bot.strategy_config_id)
        account = accounts.get(bot.binance_account_id)
        params = strat.parameters if strat and isinstance(strat.parameters, dict) else {}
        eligible_pairs = params.get("eligible_pairs") or []
        out.append(TradingBotOut(
            id=bot.id,
            name=bot.name,
            mode=_value(bot.mode),
            status=_value(bot.status),
            binance_account_id=bot.binance_account_id,
            promotion_id=bot.promotion_id,
            strategy_config_id=bot.strategy_config_id,
            max_capital=bot.max_capital,
            max_order_size=bot.max_order_size,
            max_daily_volume=bot.max_daily_volume,
            max_daily_loss=bot.max_daily_loss,
            max_spread_pct=bot.max_spread_pct,
            max_slippage_pct=bot.max_slippage_pct,
            max_exposure=bot.max_exposure,
            max_consecutive_failures=bot.max_consecutive_failures,
            max_stale_order_seconds=bot.max_stale_order_seconds,
            last_error=bot.last_error,
            last_pause_reason=bot.last_pause_reason,
            started_at=bot.started_at,
            stopped_at=bot.stopped_at,
            promotion_name=promo.name if promo else None,
            strategy_name=strat.name if strat else None,
            strategy_type=_value(strat.strategy_type) if strat else None,
            initial_order_size=_safe_decimal(params.get("order_size")),
            eligible_pairs=[str(p).upper() for p in eligible_pairs],
            binance_account_label=account.label if account else None,
        ))
    return out


async def _bot_to_out(bot: TradingBot, db: AsyncSession) -> TradingBotOut:
    return (await _bots_to_out([bot], db))[0]


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
    # Note: Binance GET /api/v3/account "canWithdraw" is account-level, not the API-key
    # "Enable Withdrawals" checkbox. Blocking on it causes false positives. This app has
    # no withdrawal methods; keep Spot trading + IP restriction as the real controls.

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
    return await _bot_to_out(bot, db)


@router.get("", response_model=list[TradingBotOut])
async def list_bots(user_id: str = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(TradingBot).where(TradingBot.user_id == user_id))
    bots = result.scalars().all()
    return await _bots_to_out(bots, db)


@router.get("/{bot_id}", response_model=TradingBotOut)
async def get_bot(bot_id: str, user_id: str = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    bot = await _get_owned_bot(bot_id, user_id, db)
    return await _bot_to_out(bot, db)


@router.get("/{bot_id}/balance", response_model=BotBalanceOut)
async def get_bot_balance(bot_id: str, user_id: str = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    """Live Binance spot balance for the base and quote asset of the pair
    this bot trades (e.g. BTC and USDT balances for a bot trading BTCUSDT).
    Read-only — uses the same API key the bot trades with, but never
    submits an order. Works for PAPER bots too, so users can see the real
    funds behind a simulation."""
    bot = await _get_owned_bot(bot_id, user_id, db)
    strategy_config = await db.get(StrategyConfiguration, bot.strategy_config_id)
    account = await db.get(BinanceAccount, bot.binance_account_id)
    if not account:
        return BotBalanceOut(bot_id=bot.id, error="Connected Binance account not found")

    symbol: Optional[str] = None
    if strategy_config and isinstance(strategy_config.parameters, dict):
        pairs = strategy_config.parameters.get("eligible_pairs") or []
        if pairs:
            symbol = str(pairs[0]).upper()
    if not symbol:
        promo_pair = (
            await db.execute(
                select(PromotionPair)
                .where(PromotionPair.promotion_id == bot.promotion_id, PromotionPair.is_eligible.is_(True))
            )
        ).scalars().first()
        if promo_pair:
            symbol = promo_pair.symbol

    if not symbol:
        return BotBalanceOut(bot_id=bot.id, error="No eligible trading pair configured for this bot yet")

    secret = get_secret_box().decrypt(account.encrypted_api_secret)
    client = BinanceSpotClient(api_key=account.api_key, api_secret=secret)
    try:
        repo = SymbolRepository(client)
        try:
            filters = await repo.get(symbol)
            base_asset, quote_asset = filters.base_asset, filters.quote_asset
        except BinanceError:
            base_asset, quote_asset = split_symbol_heuristic(symbol)

        account_info = await client.get_account()
        balances_by_asset = {b["asset"]: b for b in account_info.get("balances", [])}
        base_bal = balances_by_asset.get(base_asset, {"free": "0", "locked": "0"})
        quote_bal = balances_by_asset.get(quote_asset, {"free": "0", "locked": "0"})

        return BotBalanceOut(
            bot_id=bot.id,
            symbol=symbol,
            base_asset=base_asset,
            base_free=_safe_decimal(base_bal.get("free")),
            base_locked=_safe_decimal(base_bal.get("locked")),
            quote_asset=quote_asset,
            quote_free=_safe_decimal(quote_bal.get("free")),
            quote_locked=_safe_decimal(quote_bal.get("locked")),
        )
    except BinanceError as exc:
        return BotBalanceOut(bot_id=bot.id, symbol=symbol, error=exc.message)
    finally:
        await client.aclose()


@router.post("/{bot_id}/start", response_model=BotActionOut)
async def start_bot(bot_id: str, user_id: str = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    bot = await _get_owned_bot(bot_id, user_id, db)
    if bot_runner_registry.is_running(bot.id):
        return BotActionOut(id=bot.id, status=bot.status.value if hasattr(bot.status, "value") else str(bot.status), message="Bot already running")
    # DB may still say RUNNING after a process restart while the worker is gone.
    bot.status = BotStatus.STARTING
    bot.started_at = datetime.now(timezone.utc)
    bot.last_error = None
    bot.last_pause_reason = None
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

    from app.db.models import OrderStatus

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


@router.patch("/{bot_id}", response_model=TradingBotOut)
async def update_bot(
    bot_id: str,
    payload: TradingBotUpdate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    bot = await _get_owned_bot(bot_id, user_id, db)
    data = payload.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")
    for key, value in data.items():
        setattr(bot, key, value)
    await db.commit()
    await db.refresh(bot)
    return await _bot_to_out(bot, db)


@router.delete("/{bot_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_bot(bot_id: str, user_id: str = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    bot = await _get_owned_bot(bot_id, user_id, db)
    status_val = bot.status.value if hasattr(bot.status, "value") else str(bot.status)
    if status_val in ("RUNNING", "PAUSED", "STARTING"):
        raise HTTPException(
            status_code=400,
            detail="Stop the bot before deleting it.",
        )
    if bot_runner_registry.is_running(bot.id):
        bot_runner_registry.stop(bot.id)

    # Remove dependent rows (no ON DELETE CASCADE on these FKs).
    for model in (RiskEvent, BotEvent, Order, TradingCycle):
        rows = (await db.execute(select(model).where(model.bot_id == bot.id))).scalars().all()
        for row in rows:
            await db.delete(row)

    await db.delete(bot)
    await db.commit()
    return None
