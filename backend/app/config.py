"""
Centralized application configuration.

All tunables (risk limits, intervals, trading pairs, etc.) live in the
database per-bot/per-promotion — NOT here. This file only holds
infrastructure-level settings that come from the environment.
"""
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Database
    database_url: str = "postgresql+asyncpg://promo_user:promo_pass@localhost:5432/promo_trader"
    database_url_sync: str = "postgresql+psycopg2://promo_user:promo_pass@localhost:5432/promo_trader"

    # Binance
    binance_api_base_url: str = "https://api.binance.com"
    binance_ws_base_url: str = "wss://stream.binance.com:9443"
    binance_api_encryption_key: str = ""

    # Auth
    jwt_secret_key: str = "insecure-dev-key-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 10080

    # App
    cors_origins: str = "http://localhost:3000"
    log_level: str = "INFO"
    environment: str = "development"

    # Master safety switch. Even if a user sets a bot to LIVE mode, orders
    # are only ever really submitted if this is also true. This lets an
    # operator hard-disable live trading at the deployment level.
    allow_live_trading: bool = False

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
