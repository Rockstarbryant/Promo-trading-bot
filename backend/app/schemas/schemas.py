"""Pydantic v2 request/response schemas."""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


# ---- Auth ----------------------------------------------------------------

class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    email: EmailStr
    is_active: bool


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ---- Binance accounts ------------------------------------------------------

class BinanceAccountCreate(BaseModel):
    label: str = "Binance Account"
    api_key: str
    api_secret: str

    @field_validator("api_secret")
    @classmethod
    def secret_not_empty(cls, v: str) -> str:
        if not v or len(v) < 10:
            raise ValueError("api_secret looks invalid")
        return v


class BinanceAccountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    label: str
    api_key: str
    can_trade: bool
    can_withdraw: bool
    is_active: bool
    last_verified_at: Optional[datetime] = None
    # api_secret / encrypted_api_secret intentionally never included


# ---- Promotions -----------------------------------------------------------

class PromotionPairIn(BaseModel):
    symbol: str
    is_eligible: bool = True
    per_pair_target_volume: Optional[Decimal] = None


class PromotionCreate(BaseModel):
    name: str
    description: Optional[str] = None
    promotion_type: str
    start_time: datetime
    end_time: datetime
    target_volume: Optional[Decimal] = None
    min_volume: Optional[Decimal] = None
    max_volume: Optional[Decimal] = None
    notes: Optional[str] = None
    rules_url: Optional[str] = None
    extra_config: dict[str, Any] = Field(default_factory=dict)
    pairs: list[PromotionPairIn] = Field(default_factory=list)

    @field_validator("end_time")
    @classmethod
    def end_after_start(cls, v: datetime, info) -> datetime:
        start = info.data.get("start_time")
        if start and v <= start:
            raise ValueError("end_time must be after start_time")
        return v


class PromotionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    description: Optional[str]
    promotion_type: str
    status: str
    start_time: datetime
    end_time: datetime
    target_volume: Optional[Decimal]
    min_volume: Optional[Decimal]
    max_volume: Optional[Decimal]
    notes: Optional[str]
    rules_url: Optional[str]


class PromotionProgressOut(BaseModel):
    qualifying_volume: Decimal
    target_volume: Optional[Decimal]
    progress_pct: Optional[Decimal]
    remaining_volume: Optional[Decimal]


# ---- Strategy configuration -------------------------------------------------

class StrategyConfigurationCreate(BaseModel):
    name: str
    strategy_type: str
    parameters: dict[str, Any]


class StrategyConfigurationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    strategy_type: str
    parameters: dict[str, Any]


# ---- Bots -------------------------------------------------------------------

class TradingBotCreate(BaseModel):
    name: str
    binance_account_id: str
    promotion_id: str
    strategy_config_id: str
    mode: str = "PAPER"

    max_capital: Decimal
    max_order_size: Decimal
    max_daily_volume: Decimal
    max_daily_loss: Decimal
    max_spread_pct: Decimal
    max_slippage_pct: Decimal
    max_exposure: Decimal
    max_consecutive_failures: int = 3
    max_stale_order_seconds: int = 30

    @field_validator("mode")
    @classmethod
    def mode_upper(cls, v: str) -> str:
        v = v.upper()
        if v not in ("PAPER", "LIVE"):
            raise ValueError("mode must be PAPER or LIVE")
        return v


class TradingBotOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    mode: str
    status: str
    binance_account_id: str
    promotion_id: str
    strategy_config_id: str
    max_capital: Decimal
    max_order_size: Decimal
    max_daily_volume: Decimal
    max_daily_loss: Decimal
    max_spread_pct: Decimal
    max_slippage_pct: Decimal
    max_exposure: Decimal
    last_error: Optional[str] = None
    last_pause_reason: Optional[str] = None
    started_at: Optional[datetime] = None
    stopped_at: Optional[datetime] = None


class BotActionOut(BaseModel):
    id: str
    status: str
    message: str


# ---- Orders -----------------------------------------------------------------

class OrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    bot_id: str
    symbol: str
    side: str
    order_type: str
    status: str
    quantity: Decimal
    price: Optional[Decimal]
    executed_quantity: Decimal
    cumulative_quote_quantity: Decimal
    commission: Decimal
    commission_asset: Optional[str]
    is_paper: bool
    created_at: datetime
    submitted_at: Optional[datetime]
    filled_at: Optional[datetime]
    cancelled_at: Optional[datetime]
    rejection_reason: Optional[str]


# ---- Analytics ---------------------------------------------------------------

class AnalyticsSummaryOut(BaseModel):
    total_volume: Decimal
    qualifying_volume: Decimal
    num_orders: int
    filled_orders: int
    cancelled_orders: int
    rejected_orders: int
    total_fees: Decimal
    total_estimated_slippage: Decimal
    realized_pnl: Decimal
    average_spread_pct: Optional[Decimal]
    average_execution_price_deviation_pct: Optional[Decimal]
    average_cycle_seconds: Optional[Decimal]
    volume_by_pair: dict[str, Decimal]
    volume_by_strategy: dict[str, Decimal]
    execution_success_rate_pct: Decimal
    estimated_cost_per_1000_volume: Optional[Decimal]
