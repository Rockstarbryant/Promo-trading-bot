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

    return app


app = create_app()
