"""
Background worker that periodically snapshots order-book/spread data for
active bots' eligible pairs into MarketSnapshot rows, for analytics and
historical-replay purposes (see docs/architecture.md, section on the
backtest/replay foundation).
"""
from __future__ import annotations

from sqlalchemy import select

from app.core.logging import get_event_logger, log_event
from app.db.models import MarketSnapshot, TradingBot, BotStatus, StrategyConfiguration
from app.services.binance.client import BinanceSpotClient
from app.services.execution.market_analysis import calculate_spread
from app.services.binance.exceptions import BinanceError

logger = get_event_logger()


async def snapshot_active_markets(session_factory) -> int:
    count = 0
    async with session_factory() as db:
        bots = (
            await db.execute(select(TradingBot).where(TradingBot.status == BotStatus.RUNNING))
        ).scalars().all()
        symbols: set[str] = set()
        for bot in bots:
            config = await db.get(StrategyConfiguration, bot.strategy_config_id)
            symbols.update(config.parameters.get("eligible_pairs", []))

        if not symbols:
            return 0

        client = BinanceSpotClient()
        try:
            for symbol in symbols:
                try:
                    book = await client.get_order_book(symbol, limit=20)
                    ticker = await client.get_ticker_24hr(symbol)
                except BinanceError as exc:
                    log_event(logger, "market_snapshot_error", severity="warning", symbol=symbol, error=exc.message)
                    continue
                if not book.get("bids") or not book.get("asks"):
                    continue
                spread = calculate_spread(book["bids"][0][0], book["asks"][0][0])
                db.add(MarketSnapshot(
                    symbol=symbol, best_bid=spread.best_bid, best_ask=spread.best_ask,
                    spread_pct=spread.spread_pct, volume_24h=ticker.get("volume"),
                    order_book_snapshot={"bids": book["bids"][:10], "asks": book["asks"][:10]},
                ))
                count += 1
            await db.commit()
        finally:
            await client.aclose()
    return count
