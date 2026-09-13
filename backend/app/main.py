from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.core.logging import configure_logging
from app.api import auth, accounts, promotions, strategies, bots, orders, analytics, websocket


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    configure_logging(settings.log_level)

    # After a deploy/restart, in-memory workers are gone but DB may still say
    # RUNNING. Re-attach workers so bots keep trading without a manual Start.
    try:
        from sqlalchemy import select
        from app.db.session import AsyncSessionLocal
        from app.db.models import TradingBot, BotStatus
        from app.workers.bot_worker import bot_runner_registry
        from app.api.websocket import manager as ws_manager

        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(TradingBot).where(
                    TradingBot.status.in_([BotStatus.RUNNING, BotStatus.STARTING, BotStatus.PAUSED])
                )
            )
            bots_to_resume = result.scalars().all()
            for bot in bots_to_resume:
                # PAUSED stays paused in-process until user resumes; still start
                # the worker so it can honor DB status.
                if not bot_runner_registry.is_running(bot.id):
                    bot_runner_registry.start(bot.id, AsyncSessionLocal, ws_manager.broadcast)
    except Exception as exc:  # noqa: BLE001
        # Never block startup if resume fails
        import logging
        logging.getLogger("promo_trader").warning("Failed to resume bots on startup: %s", exc)

    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Binance Promo Trader API",
        description=(
            "Backend for legitimate participation in Binance Spot promotional "
            "trading volume programs. Paper trading is the default; live "
            "trading requires explicit deployment-level and per-account opt-in. "
            "This application does not implement wash trading, spoofing, or "
            "any other market-manipulation technique, and has no withdrawal "
            "capability."
        ),
        version="1.0.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(auth.router)
    app.include_router(accounts.router)
    app.include_router(promotions.router)
    app.include_router(strategies.router)
    app.include_router(bots.router)
    app.include_router(orders.router)
    app.include_router(analytics.router)
    app.include_router(websocket.router)

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    # Temporary: discover Render outbound IP for Binance API allowlisting.
    # Remove this route after you have copied the IP.
    @app.get("/debug/egress-ip")
    async def egress_ip():
        import httpx
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get("https://api.ipify.org")
            r.raise_for_status()
            return {"egress_ip": r.text.strip()}

    return app


app = create_app()
