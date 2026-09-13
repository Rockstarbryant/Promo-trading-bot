"""
The bot worker: the single place where a strategy's intent is turned into
an actual (paper or live) order, after passing through eligibility, risk,
and execution-decision checks — in that order, every tick, no exceptions.

Design goals mirrored here:
- Binance API logic (client.py) is isolated from strategy logic
  (services/strategies) which is isolated from execution logic
  (services/execution) which is isolated from risk management
  (services/risk). This module is the orchestrator that calls all of them
  but contains no exchange-specific or strategy-specific logic itself.
- A bot can be added a new strategy or a new promotion type without any
  change here.
"""
from __future__ import annotations

import asyncio
import time
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.encryption import get_secret_box
from app.core.logging import get_event_logger, log_event
from app.db.models import (
    BinanceAccount, BotStatus, Order, OrderSide, OrderStatus, OrderType,
    Promotion, RiskEvent, RiskEventSeverity, StrategyConfiguration, TradingBot,
    TradingCycle,
)
from app.services.binance.client import BinanceSpotClient
from app.services.binance.exceptions import BinanceError
from app.services.binance.filters import SymbolFilters
from app.services.binance.symbol_repository import SymbolRepository
from app.services.execution.decision_engine import ExecutionAction, decide_execution
from app.services.execution.market_analysis import calculate_spread, liquidity_quality
from app.services.execution.paper_engine import simulate_market_order
from app.services.promotions.engine import check_eligibility
from app.services.risk.engine import RiskEngine, RiskLimits, RiskState
from app.services.strategies.base import MarketContext, StrategyState
from app.services.strategies.registry import build_strategy

logger = get_event_logger()

TICK_INTERVAL_SECONDS = 5


class BotStoppedSignal(Exception):
    """Internal control-flow signal to unwind the loop cleanly."""


class BotWorker:
    """Runs a single bot's trading loop. One instance per running bot."""

    def __init__(self, bot_id: str, session_factory, broadcast=None):
        self.bot_id = bot_id
        self._session_factory = session_factory
        self._broadcast = broadcast or (lambda *a, **k: None)
        self._stop_requested = False
        self._pause_requested = False
        self.strategy_state = StrategyState()

    def request_stop(self) -> None:
        self._stop_requested = True

    def request_pause(self, pause: bool) -> None:
        self._pause_requested = pause

    async def _emit(self, event_type: str, **data) -> None:
        result = self._broadcast(self.bot_id, event_type, data)
        if asyncio.iscoroutine(result):
            await result

    async def run(self) -> None:
        settings = get_settings()
        async with self._session_factory() as db:
            bot = await db.get(TradingBot, self.bot_id)
            if not bot:
                return
            bot.status = BotStatus.RUNNING
            bot.started_at = datetime.now(timezone.utc)
            bot.last_error = None
            bot.last_pause_reason = None
            await db.commit()
            # Rebuild in-memory strategy state from filled orders so a restart
            # does not open a second BUY while exposure is already at the limit.
            await self._recover_strategy_state(db)
        await self._emit("bot_status", status="RUNNING")

        terminal = False
        try:
            while not self._stop_requested:
                # Honor DB status so Pause/Stop work even after process restart
                # when the in-memory registry no longer holds this worker.
                async with self._session_factory() as db:
                    bot = await db.get(TradingBot, self.bot_id)
                    if not bot:
                        terminal = True
                        break
                    db_status = bot.status
                    if hasattr(db_status, "value"):
                        db_status = db_status.value

                if db_status == BotStatus.STOPPED.value or db_status == "STOPPED":
                    terminal = True
                    break

                if (
                    self._pause_requested
                    or db_status == BotStatus.PAUSED.value
                    or db_status == "PAUSED"
                ):
                    await self._set_status(BotStatus.PAUSED)
                    await asyncio.sleep(TICK_INTERVAL_SECONDS)
                    continue

                await self._set_status(BotStatus.RUNNING)
                try:
                    await self._tick(settings)
                except BotStoppedSignal:
                    # Tick saw non-RUNNING status (e.g. stop mid-tick).
                    terminal = True
                    break
                await asyncio.sleep(TICK_INTERVAL_SECONDS)
        except Exception as exc:  # noqa: BLE001 - top-level worker safety net
            await self._handle_fatal_error(exc)
            terminal = True
        finally:
            if terminal or self._stop_requested:
                await self._set_status(BotStatus.STOPPED, stopped=True)
                await self._emit("bot_status", status="STOPPED")

    async def _set_status(self, status: BotStatus, stopped: bool = False, error: str | None = None) -> None:
        async with self._session_factory() as db:
            bot = await db.get(TradingBot, self.bot_id)
            if not bot:
                return
            bot.status = status
            if stopped:
                bot.stopped_at = datetime.now(timezone.utc)
            if error:
                bot.last_error = error
            await db.commit()

    async def _handle_fatal_error(self, exc: Exception) -> None:
        log_event(logger, "bot_fatal_error", severity="error", bot_id=self.bot_id, error=str(exc))
        async with self._session_factory() as db:
            bot = await db.get(TradingBot, self.bot_id)
            if bot:
                bot.status = BotStatus.ERROR
                bot.last_error = str(exc)
                db.add(RiskEvent(bot_id=self.bot_id, severity=RiskEventSeverity.CRITICAL, reason=str(exc)))
                await db.commit()
        await self._emit("bot_status", status="ERROR", error=str(exc))

    async def _pause_with_reason(self, db: AsyncSession, bot: TradingBot, reason: str) -> None:
        bot.last_pause_reason = reason
        db.add(RiskEvent(bot_id=self.bot_id, severity=RiskEventSeverity.INFO, reason=reason))
        await db.commit()
        await self._emit("bot_paused", reason=reason)
        log_event(logger, "bot_waiting", bot_id=self.bot_id, reason=reason)

    async def _tick(self, settings) -> None:
        async with self._session_factory() as db:
            bot = await db.get(TradingBot, self.bot_id)
            if not bot:
                raise BotStoppedSignal()
            st = bot.status.value if hasattr(bot.status, "value") else bot.status
            if st == "STOPPED":
                raise BotStoppedSignal()
            if st != "RUNNING":
                # PAUSED or other — skip this tick without killing the worker loop
                return

            # Must eager-load pairs: check_eligibility() reads promotion.pairs.
            # Lazy load in async context raises greenlet_spawn / await_only errors.
            promo_result = await db.execute(
                select(Promotion)
                .options(selectinload(Promotion.pairs))
                .where(Promotion.id == bot.promotion_id)
            )
            promotion = promo_result.scalar_one_or_none()
            if not promotion or not promotion.is_active_now():
                await self._pause_with_reason(db, bot, "Promotion is not currently active")
                return

            account = await db.get(BinanceAccount, bot.binance_account_id)
            if not account or not account.is_active:
                await self._pause_with_reason(db, bot, "Binance account is inactive or missing")
                return

            strategy_config = await db.get(StrategyConfiguration, bot.strategy_config_id)
            strategy = build_strategy(strategy_config.strategy_type, strategy_config.parameters)
            eligible_pairs = strategy.parameters.get("eligible_pairs", [])
            exec_params = strategy.calculate_execution_parameters()

            live_mode = bot.mode.value == "LIVE" if hasattr(bot.mode, "value") else bot.mode == "LIVE"
            really_live = live_mode and settings.allow_live_trading

            api_key = account.api_key
            api_secret = get_secret_box().decrypt(account.encrypted_api_secret) if really_live else None

            client = BinanceSpotClient(api_key=api_key if really_live else None,
                                        api_secret=api_secret)
            symbol_repo = SymbolRepository(client)

            try:
                contexts: list[MarketContext] = []
                for symbol in eligible_pairs:
                    eligibility = check_eligibility(promotion, symbol)
                    if not eligibility.eligible:
                        continue
                    try:
                        book = await client.get_order_book(symbol, limit=50)
                    except BinanceError as exc:
                        log_event(logger, "market_data_error", severity="warning", bot_id=self.bot_id,
                                  symbol=symbol, error=exc.message)
                        continue
                    bids = [(p, q) for p, q in book.get("bids", [])]
                    asks = [(p, q) for p, q in book.get("asks", [])]
                    if not bids or not asks:
                        continue
                    spread = calculate_spread(bids[0][0], asks[0][0])
                    contexts.append(MarketContext(
                        symbol=symbol,
                        best_bid=spread.best_bid,
                        best_ask=spread.best_ask,
                        spread_pct=spread.spread_pct,
                        order_book_bids=bids,
                        order_book_asks=asks,
                        liquidity_quality=liquidity_quality(asks, bot.max_order_size),
                    ))

                if not contexts:
                    await self._pause_with_reason(db, bot, "No eligible pairs currently have usable market data")
                    return

                intent = strategy.should_sell(self.strategy_state, contexts) or \
                    strategy.should_buy(self.strategy_state, contexts)

                if not intent:
                    return  # nothing to do this tick; strategy is waiting on its own timers

                ctx = next((c for c in contexts if c.symbol == intent.symbol), None)
                if not ctx:
                    return

                risk_state = await self._load_risk_state(db, bot)
                risk_engine = RiskEngine(RiskLimits.from_bot(bot))

                # Clamp BUY notional to remaining exposure capacity so residual
                # dust from the prior cycle cannot block the next open.
                if intent.side == "BUY":
                    limits = risk_engine.limits
                    dust = max(limits.max_order_size * Decimal("0.002"), Decimal("0.05"))
                    effective_exposure = (
                        risk_state.current_exposure
                        if risk_state.current_exposure > dust
                        else Decimal(0)
                    )
                    remaining = limits.max_exposure - effective_exposure
                    if remaining <= dust:
                        await self._pause_with_reason(
                            db, bot,
                            f"No exposure capacity left "
                            f"(exposure={risk_state.current_exposure}, max={limits.max_exposure})",
                        )
                        return
                    if intent.quote_amount > remaining:
                        intent.quote_amount = remaining

                pre_trade = risk_engine.check_pre_trade(intent.quote_amount, risk_state, side=intent.side)
                if not pre_trade.allowed:
                    await self._pause_with_reason(db, bot, f"Risk check failed: {pre_trade.reason}")
                    return

                book_side = ctx.order_book_asks if intent.side == "BUY" else ctx.order_book_bids
                symbol_filters = await symbol_repo.get(intent.symbol)

                decision = decide_execution(
                    side=intent.side,
                    quote_amount=intent.quote_amount,
                    best_bid=ctx.best_bid,
                    best_ask=ctx.best_ask,
                    order_book_levels=book_side,
                    max_spread_pct=exec_params["max_spread_pct"],
                    max_slippage_pct=exec_params["max_slippage_pct"],
                    symbol_filters=symbol_filters,
                )

                if decision.action == ExecutionAction.WAIT:
                    await self._emit("risk_warning", reason=decision.reason, symbol=intent.symbol)
                    log_event(logger, "execution_wait", bot_id=self.bot_id, symbol=intent.symbol, reason=decision.reason)
                    return

                await self._execute_intent(
                    db, bot, promotion, strategy, intent, decision, symbol_filters,
                    client, really_live, strategy_config.strategy_type,
                )
            finally:
                await client.aclose()

    async def _load_risk_state(self, db: AsyncSession, bot: TradingBot) -> RiskState:
        today = date.today()
        orders = (await db.execute(select(Order).where(Order.bot_id == bot.id))).scalars().all()
        daily_volume = Decimal(0)
        daily_loss = Decimal(0)
        exposure = Decimal(0)
        capital_deployed = Decimal(0)
        # Only count rejects after the current run started so Stop→Start
        # clears a failure streak without deleting order history.
        consecutive_failures = 0
        started = bot.started_at
        for o in reversed(orders):
            if started and o.created_at and o.created_at < started:
                break
            if o.status == OrderStatus.REJECTED:
                consecutive_failures += 1
            elif o.status == OrderStatus.FILLED:
                break
        for o in orders:
            if o.status in (OrderStatus.FILLED, OrderStatus.PARTIALLY_FILLED):
                if o.filled_at and o.filled_at.date() == today:
                    daily_volume += o.cumulative_quote_quantity or Decimal(0)
                if o.side == OrderSide.BUY:
                    exposure += o.cumulative_quote_quantity or Decimal(0)
                else:
                    exposure -= o.cumulative_quote_quantity or Decimal(0)
        exposure = max(exposure, Decimal(0))
        dust = max(Decimal(str(bot.max_order_size)) * Decimal("0.002"), Decimal("0.05"))
        if exposure <= dust:
            exposure = Decimal(0)
        # Capital tied up = current net long exposure (closed cycles free capital).
        capital_deployed = exposure
        return RiskState(
            daily_volume_used=daily_volume,
            daily_loss_so_far=daily_loss,
            current_exposure=exposure,
            consecutive_failures=consecutive_failures,
            capital_deployed=capital_deployed,
        )

    async def _execute_intent(
        self, db, bot: TradingBot, promotion: Promotion, strategy, intent, decision,
        symbol_filters: SymbolFilters, client: BinanceSpotClient, really_live: bool,
        strategy_type,
    ) -> None:
        client_order_id = f"promo-{uuid.uuid4().hex[:24]}"
        order = Order(
            bot_id=bot.id,
            promotion_id=promotion.id,
            strategy_type=strategy_type,
            client_order_id=client_order_id,
            symbol=intent.symbol,
            side=OrderSide(intent.side),
            order_type=OrderType.MARKET if decision.action == ExecutionAction.MARKET else OrderType.LIMIT,
            status=OrderStatus.CREATED,
            quantity=Decimal(0),
            price=decision.limit_price,
            quote_quantity=intent.quote_amount,
            is_paper=not really_live,
        )
        db.add(order)
        await db.flush()

        try:
            if not really_live:
                # Prefer base_qty on SELL so we close the exact position from the BUY fill.
                # BUY continues to size by quote_amount (USDT).
                sim_kwargs = {
                    "symbol": intent.symbol,
                    "side": intent.side,
                    "order_book_levels": (
                        [(decision.slippage.average_execution_price, decision.slippage.filled_base_qty)]
                        if decision.slippage
                        else [(decision.spread.best_ask, Decimal("999999"))]
                    ),
                }
                if intent.side == "SELL" and getattr(intent, "base_qty", None) is not None:
                    sim_kwargs["base_qty"] = intent.base_qty
                else:
                    sim_kwargs["quote_amount"] = intent.quote_amount
                sim = simulate_market_order(**sim_kwargs)
                order.quantity = symbol_filters.round_quantity(sim.filled_base_qty, market=True)
                order.executed_quantity = order.quantity
                order.cumulative_quote_quantity = sim.filled_quote_qty
                order.commission = sim.fee
                order.commission_asset = sim.fee_asset
                order.status = OrderStatus.FILLED
                order.submitted_at = datetime.now(timezone.utc)
                order.filled_at = datetime.now(timezone.utc)
            else:
                # LIVE: SELL must use base quantity capped to free balance (fees often
                # leave slightly less free than the BUY executedQty). BUY uses quote.
                use_base = intent.side == "SELL" and getattr(intent, "base_qty", None) is not None
                if use_base:
                    desired = Decimal(str(intent.base_qty))
                    free = await self._free_base_balance(client, intent.symbol)
                    # Cap to free balance; leave a tiny haircut for fee/rounding dust.
                    sellable = min(desired, free) if free is not None else desired
                    sellable = sellable * Decimal("0.999")
                    live_qty = symbol_filters.round_quantity(sellable, market=True)
                    if live_qty <= 0:
                        raise BinanceError(
                            f"SELL size rounded to zero "
                            f"(desired={desired}, free={free})"
                        )
                    order.quantity = live_qty
                    symbol_filters.validate_order(
                        side=intent.side, order_type=order.order_type.value,
                        quantity=live_qty, price=decision.limit_price, quote_order_qty=None,
                    )
                    resp = await client.place_order(
                        symbol=intent.symbol, side=intent.side, order_type=order.order_type.value,
                        quantity=str(live_qty),
                        price=str(decision.limit_price) if decision.limit_price else None,
                        new_client_order_id=client_order_id,
                    )
                else:
                    symbol_filters.validate_order(
                        side=intent.side, order_type=order.order_type.value,
                        quantity=None, price=decision.limit_price, quote_order_qty=intent.quote_amount,
                    )
                    order.quote_quantity = intent.quote_amount
                    resp = await client.place_order(
                        symbol=intent.symbol, side=intent.side, order_type=order.order_type.value,
                        quote_order_qty=str(intent.quote_amount) if order.order_type == OrderType.MARKET else None,
                        quantity=str(symbol_filters.round_quantity(intent.quote_amount / decision.limit_price))
                            if order.order_type == OrderType.LIMIT and decision.limit_price else None,
                        price=str(decision.limit_price) if decision.limit_price else None,
                        new_client_order_id=client_order_id,
                    )
                order.binance_order_id = str(resp.get("orderId"))
                order.status = OrderStatus.SUBMITTED if resp.get("status") not in ("FILLED",) else OrderStatus.FILLED
                order.submitted_at = datetime.now(timezone.utc)
                order.executed_quantity = Decimal(str(resp.get("executedQty", "0")))
                order.cumulative_quote_quantity = Decimal(str(resp.get("cummulativeQuoteQty", "0")))
                if order.quantity == 0 and order.executed_quantity:
                    order.quantity = order.executed_quantity
                # Commission from fills if present
                fills = resp.get("fills") or []
                if fills:
                    fee = sum(Decimal(str(f.get("commission", 0))) for f in fills)
                    order.commission = fee
                    order.commission_asset = fills[0].get("commissionAsset")
                if order.status == OrderStatus.FILLED:
                    order.filled_at = datetime.now(timezone.utc)

            await db.commit()
            await self._emit(
                "order_filled" if order.status == OrderStatus.FILLED else "order_submitted",
                order_id=order.id, symbol=order.symbol, side=order.side.value,
                quantity=str(order.executed_quantity), quote_value=str(order.cumulative_quote_quantity),
                is_paper=order.is_paper,
            )
            self._update_strategy_state(strategy, order)
        except (BinanceError, Exception) as exc:  # noqa: BLE001
            order.status = OrderStatus.REJECTED
            order.rejection_reason = str(exc)
            db.add(RiskEvent(bot_id=bot.id, severity=RiskEventSeverity.WARNING, reason=f"Order rejected: {exc}"))
            await db.commit()
            await self._emit("risk_warning", reason=f"Order rejected: {exc}", symbol=intent.symbol)



    async def _free_base_balance(self, client: BinanceSpotClient, symbol: str) -> Decimal | None:
        """Return free balance of the base asset for symbol (e.g. REZ for REZUSDT).

        Used on LIVE SELL so we never request more than Binance will allow after fees.
        Returns None if the account cannot be read (caller falls back to desired qty).
        """
        try:
            # REZUSDT -> REZ (spot symbols end with quote asset; common quotes listed)
            quote_suffixes = ("USDT", "USDC", "BUSD", "BTC", "ETH", "BNB", "FDUSD", "TUSD")
            base = symbol
            for q in quote_suffixes:
                if symbol.endswith(q) and len(symbol) > len(q):
                    base = symbol[: -len(q)]
                    break
            acct = await client.get_account()
            for bal in acct.get("balances") or []:
                if bal.get("asset") == base:
                    return Decimal(str(bal.get("free") or "0"))
            return Decimal(0)
        except Exception:
            return None

    async def _recover_strategy_state(self, db: AsyncSession) -> None:
        """If the last filled order was a BUY with no matching SELL after it,
        treat the position as still open so the next tick sells instead of
        buying again (which would fail max_exposure).
        """
        orders = (
            await db.execute(
                select(Order)
                .where(Order.bot_id == self.bot_id, Order.status == OrderStatus.FILLED)
                .order_by(Order.filled_at.asc(), Order.created_at.asc())
            )
        ).scalars().all()
        state = self.strategy_state
        state.data.clear()
        cycles = 0
        open_buy = None
        for o in orders:
            if o.side == OrderSide.BUY:
                open_buy = o
            elif o.side == OrderSide.SELL and open_buy is not None:
                open_buy = None
                cycles += 1
        state.data["cycles_completed"] = cycles
        if open_buy is not None:
            state.data["position_open"] = True
            state.data["position_symbol"] = open_buy.symbol
            state.data["position_base_qty"] = str(open_buy.executed_quantity or 0)
            state.data["position_quote_qty"] = str(open_buy.cumulative_quote_quantity or 0)
            # Allow SELL immediately (do not wait sell_interval after recovery).
            state.data["position_opened_at"] = 0
            log_event(
                logger, "strategy_state_recovered",
                bot_id=self.bot_id,
                symbol=open_buy.symbol,
                base_qty=state.data["position_base_qty"],
                quote_qty=state.data["position_quote_qty"],
                cycles_completed=cycles,
            )
        else:
            state.data["position_open"] = False

    def _update_strategy_state(self, strategy, order: Order) -> None:
        state = self.strategy_state
        if order.side == OrderSide.BUY:
            state.data["position_open"] = True
            state.data["position_symbol"] = order.symbol
            state.data["position_base_qty"] = str(order.executed_quantity)
            state.data["position_quote_qty"] = str(order.cumulative_quote_quantity or 0)
            state.data["position_opened_at"] = time.time()
        else:
            state.data["position_open"] = False
            state.data.pop("position_base_qty", None)
            state.data.pop("position_quote_qty", None)
            state.data.pop("position_symbol", None)
            state.data["last_sell_at"] = time.time()
            state.data["cycles_completed"] = state.data.get("cycles_completed", 0) + 1


class BotRunnerRegistry:
    """Tracks in-process running bots. In a multi-worker deployment this
    would be backed by a distributed task queue (e.g. Celery/RQ) keyed by
    bot_id instead of an in-memory dict — see docs/architecture.md."""

    def __init__(self):
        self._workers: dict[str, BotWorker] = {}
        self._tasks: dict[str, asyncio.Task] = {}

    def is_running(self, bot_id: str) -> bool:
        return bot_id in self._tasks and not self._tasks[bot_id].done()

    def start(self, bot_id: str, session_factory, broadcast) -> None:
        if self.is_running(bot_id):
            return
        worker = BotWorker(bot_id, session_factory, broadcast)
        self._workers[bot_id] = worker
        self._tasks[bot_id] = asyncio.create_task(worker.run())

    def pause(self, bot_id: str, pause: bool) -> None:
        worker = self._workers.get(bot_id)
        if worker:
            worker.request_pause(pause)

    def stop(self, bot_id: str) -> None:
        worker = self._workers.get(bot_id)
        if worker:
            worker.request_stop()


bot_runner_registry = BotRunnerRegistry()
