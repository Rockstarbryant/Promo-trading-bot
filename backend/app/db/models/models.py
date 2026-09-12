"""
SQLAlchemy 2.x ORM models.

Design notes:
- UUID primary keys (stored as strings) so IDs are safe to expose in the API
  and are not guessable/sequential.
- All timestamps are UTC.
- Money/quantity fields use Numeric, never float, to avoid rounding errors
  in volume accounting and risk checks.
"""
from __future__ import annotations

import enum
from decimal import Decimal

from sqlalchemy import (
    Boolean, DateTime, Enum, ForeignKey, Index, Numeric, String, Text, JSON,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, new_uuid, utcnow


# --------------------------------------------------------------------------
# Enums
# --------------------------------------------------------------------------

class PromotionType(str, enum.Enum):
    SPOT_VOLUME = "SPOT_VOLUME"
    SPOT_PAIR_VOLUME = "SPOT_PAIR_VOLUME"
    TRADING_TOURNAMENT = "TRADING_TOURNAMENT"
    FEE_VOLUME_CAMPAIGN = "FEE_VOLUME_CAMPAIGN"
    NEW_LISTING_CAMPAIGN = "NEW_LISTING_CAMPAIGN"


class PromotionStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    ACTIVE = "ACTIVE"
    PAUSED = "PAUSED"
    ENDED = "ENDED"


class StrategyType(str, enum.Enum):
    INTERVAL_ROUND_TRIP = "INTERVAL_ROUND_TRIP"
    LIQUIDITY_AWARE_ROUND_TRIP = "LIQUIDITY_AWARE_ROUND_TRIP"
    MULTI_PAIR_ROTATION = "MULTI_PAIR_ROTATION"
    LOWEST_EXECUTION_COST = "LOWEST_EXECUTION_COST"
    VOLUME_TARGET_SCHEDULER = "VOLUME_TARGET_SCHEDULER"


class BotMode(str, enum.Enum):
    PAPER = "PAPER"
    LIVE = "LIVE"


class BotStatus(str, enum.Enum):
    STOPPED = "STOPPED"
    STARTING = "STARTING"
    RUNNING = "RUNNING"
    PAUSED = "PAUSED"
    ERROR = "ERROR"
    COMPLETED = "COMPLETED"


class OrderSide(str, enum.Enum):
    BUY = "BUY"
    SELL = "SELL"


class OrderType(str, enum.Enum):
    LIMIT = "LIMIT"
    MARKET = "MARKET"


class OrderStatus(str, enum.Enum):
    CREATED = "CREATED"
    SUBMITTED = "SUBMITTED"
    PARTIALLY_FILLED = "PARTIALLY_FILLED"
    FILLED = "FILLED"
    CANCELLED = "CANCELLED"
    REJECTED = "REJECTED"
    EXPIRED = "EXPIRED"


class RiskEventSeverity(str, enum.Enum):
    INFO = "INFO"
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"


# --------------------------------------------------------------------------
# Models
# --------------------------------------------------------------------------

class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    binance_accounts: Mapped[list["BinanceAccount"]] = relationship(back_populates="user")
    promotions: Mapped[list["Promotion"]] = relationship(back_populates="user")


class BinanceAccount(Base, TimestampMixin):
    __tablename__ = "binance_accounts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    label: Mapped[str] = mapped_column(String(100), nullable=False, default="Binance Account")

    # Never store plaintext. api_key is not secret-sensitive on Binance (it's
    # an identifier), but the secret ALWAYS goes through SecretBox before
    # being written here.
    api_key: Mapped[str] = mapped_column(String(255), nullable=False)
    encrypted_api_secret: Mapped[str] = mapped_column(Text, nullable=False)

    can_trade: Mapped[bool] = mapped_column(Boolean, default=False)
    can_withdraw: Mapped[bool] = mapped_column(Boolean, default=False)  # should always be False; enforced at API layer
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_verified_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped["User"] = relationship(back_populates="binance_accounts")
    bots: Mapped[list["TradingBot"]] = relationship(back_populates="binance_account")


class Promotion(Base, TimestampMixin):
    __tablename__ = "promotions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    promotion_type: Mapped[PromotionType] = mapped_column(Enum(PromotionType), nullable=False)
    status: Mapped[PromotionStatus] = mapped_column(Enum(PromotionStatus), default=PromotionStatus.DRAFT)

    start_time: Mapped[DateTime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_time: Mapped[DateTime] = mapped_column(DateTime(timezone=True), nullable=False)

    target_volume: Mapped[Decimal | None] = mapped_column(Numeric(24, 8), nullable=True)
    min_volume: Mapped[Decimal | None] = mapped_column(Numeric(24, 8), nullable=True)
    max_volume: Mapped[Decimal | None] = mapped_column(Numeric(24, 8), nullable=True)

    # Free-form official rules link/notes; user is responsible for compliance.
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    rules_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Promotion-type-specific configuration blob (ranking metrics, fee
    # tiers, etc.) validated by the relevant PromotionType handler.
    extra_config: Mapped[dict] = mapped_column(JSON, default=dict)

    user: Mapped["User"] = relationship(back_populates="promotions")
    pairs: Mapped[list["PromotionPair"]] = relationship(back_populates="promotion", cascade="all, delete-orphan")
    bots: Mapped[list["TradingBot"]] = relationship(back_populates="promotion")

    def is_active_now(self) -> bool:
        now = utcnow()
        return (
            self.status == PromotionStatus.ACTIVE
            and self.start_time <= now <= self.end_time
        )


class PromotionPair(Base, TimestampMixin):
    __tablename__ = "promotion_pairs"
    __table_args__ = (Index("ix_promotion_pairs_promotion_symbol", "promotion_id", "symbol", unique=True),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    promotion_id: Mapped[str] = mapped_column(String(36), ForeignKey("promotions.id"), nullable=False)
    symbol: Mapped[str] = mapped_column(String(20), nullable=False)
    is_eligible: Mapped[bool] = mapped_column(Boolean, default=True)
    per_pair_target_volume: Mapped[Decimal | None] = mapped_column(Numeric(24, 8), nullable=True)

    promotion: Mapped["Promotion"] = relationship(back_populates="pairs")


class StrategyConfiguration(Base, TimestampMixin):
    __tablename__ = "strategy_configurations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    strategy_type: Mapped[StrategyType] = mapped_column(Enum(StrategyType), nullable=False)

    # Strategy-specific parameters (order size, intervals, max cycles, etc.)
    # validated by StrategyBase.validate_config() for the given type.
    parameters: Mapped[dict] = mapped_column(JSON, default=dict)

    bots: Mapped[list["TradingBot"]] = relationship(back_populates="strategy_config")


class TradingBot(Base, TimestampMixin):
    __tablename__ = "trading_bots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    binance_account_id: Mapped[str] = mapped_column(String(36), ForeignKey("binance_accounts.id"), nullable=False)
    promotion_id: Mapped[str] = mapped_column(String(36), ForeignKey("promotions.id"), nullable=False)
    strategy_config_id: Mapped[str] = mapped_column(String(36), ForeignKey("strategy_configurations.id"), nullable=False)

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    mode: Mapped[BotMode] = mapped_column(Enum(BotMode), default=BotMode.PAPER, nullable=False)
    status: Mapped[BotStatus] = mapped_column(Enum(BotStatus), default=BotStatus.STOPPED, nullable=False)

    # Risk limits — mandatory, all configurable, no hard-coded defaults used
    # in production logic (only as form defaults in the frontend).
    max_capital: Mapped[Decimal] = mapped_column(Numeric(24, 8), nullable=False)
    max_order_size: Mapped[Decimal] = mapped_column(Numeric(24, 8), nullable=False)
    max_daily_volume: Mapped[Decimal] = mapped_column(Numeric(24, 8), nullable=False)
    max_daily_loss: Mapped[Decimal] = mapped_column(Numeric(24, 8), nullable=False)
    max_spread_pct: Mapped[Decimal] = mapped_column(Numeric(8, 4), nullable=False)
    max_slippage_pct: Mapped[Decimal] = mapped_column(Numeric(8, 4), nullable=False)
    max_exposure: Mapped[Decimal] = mapped_column(Numeric(24, 8), nullable=False)
    max_consecutive_failures: Mapped[int] = mapped_column(default=3, nullable=False)
    max_stale_order_seconds: Mapped[int] = mapped_column(default=30, nullable=False)

    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_pause_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    stopped_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    binance_account: Mapped["BinanceAccount"] = relationship(back_populates="bots")
    promotion: Mapped["Promotion"] = relationship(back_populates="bots")
    strategy_config: Mapped["StrategyConfiguration"] = relationship(back_populates="bots")
    cycles: Mapped[list["TradingCycle"]] = relationship(back_populates="bot")
    orders: Mapped[list["Order"]] = relationship(back_populates="bot")
    events: Mapped[list["BotEvent"]] = relationship(back_populates="bot")
    risk_events: Mapped[list["RiskEvent"]] = relationship(back_populates="bot")


class TradingCycle(Base, TimestampMixin):
    __tablename__ = "trading_cycles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    bot_id: Mapped[str] = mapped_column(String(36), ForeignKey("trading_bots.id"), nullable=False)
    cycle_number: Mapped[int] = mapped_column(nullable=False)
    symbol: Mapped[str] = mapped_column(String(20), nullable=False)

    gross_volume: Mapped[Decimal] = mapped_column(Numeric(24, 8), default=0)
    fees_paid: Mapped[Decimal] = mapped_column(Numeric(24, 8), default=0)
    realized_pnl: Mapped[Decimal] = mapped_column(Numeric(24, 8), default=0)
    estimated_slippage: Mapped[Decimal] = mapped_column(Numeric(24, 8), default=0)

    started_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), default=utcnow)
    completed_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_completed: Mapped[bool] = mapped_column(Boolean, default=False)

    bot: Mapped["TradingBot"] = relationship(back_populates="cycles")
    orders: Mapped[list["Order"]] = relationship(back_populates="cycle")


class Order(Base, TimestampMixin):
    __tablename__ = "orders"
    __table_args__ = (Index("ix_orders_bot_symbol_status", "bot_id", "symbol", "status"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    bot_id: Mapped[str] = mapped_column(String(36), ForeignKey("trading_bots.id"), nullable=False)
    cycle_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("trading_cycles.id"), nullable=True)
    promotion_id: Mapped[str] = mapped_column(String(36), ForeignKey("promotions.id"), nullable=False)
    strategy_type: Mapped[StrategyType] = mapped_column(Enum(StrategyType), nullable=False)

    client_order_id: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    binance_order_id: Mapped[str | None] = mapped_column(String(64), nullable=True)

    symbol: Mapped[str] = mapped_column(String(20), nullable=False)
    side: Mapped[OrderSide] = mapped_column(Enum(OrderSide), nullable=False)
    order_type: Mapped[OrderType] = mapped_column(Enum(OrderType), nullable=False)
    status: Mapped[OrderStatus] = mapped_column(Enum(OrderStatus), default=OrderStatus.CREATED, nullable=False)

    quantity: Mapped[Decimal] = mapped_column(Numeric(24, 8), nullable=False)
    price: Mapped[Decimal | None] = mapped_column(Numeric(24, 8), nullable=True)
    quote_quantity: Mapped[Decimal | None] = mapped_column(Numeric(24, 8), nullable=True)

    executed_quantity: Mapped[Decimal] = mapped_column(Numeric(24, 8), default=0)
    cumulative_quote_quantity: Mapped[Decimal] = mapped_column(Numeric(24, 8), default=0)
    commission: Mapped[Decimal] = mapped_column(Numeric(24, 8), default=0)
    commission_asset: Mapped[str | None] = mapped_column(String(20), nullable=True)

    is_paper: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    submitted_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    filled_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    bot: Mapped["TradingBot"] = relationship(back_populates="orders")
    cycle: Mapped["TradingCycle"] = relationship(back_populates="orders")
    fills: Mapped[list["Fill"]] = relationship(back_populates="order", cascade="all, delete-orphan")


class Fill(Base, TimestampMixin):
    __tablename__ = "fills"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    order_id: Mapped[str] = mapped_column(String(36), ForeignKey("orders.id"), nullable=False)
    binance_trade_id: Mapped[str | None] = mapped_column(String(64), nullable=True)

    price: Mapped[Decimal] = mapped_column(Numeric(24, 8), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(24, 8), nullable=False)
    quote_quantity: Mapped[Decimal] = mapped_column(Numeric(24, 8), nullable=False)
    commission: Mapped[Decimal] = mapped_column(Numeric(24, 8), default=0)
    commission_asset: Mapped[str | None] = mapped_column(String(20), nullable=True)
    executed_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), default=utcnow)

    order: Mapped["Order"] = relationship(back_populates="fills")


class RiskEvent(Base, TimestampMixin):
    __tablename__ = "risk_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    bot_id: Mapped[str] = mapped_column(String(36), ForeignKey("trading_bots.id"), nullable=False)
    severity: Mapped[RiskEventSeverity] = mapped_column(Enum(RiskEventSeverity), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    details: Mapped[dict] = mapped_column(JSON, default=dict)

    bot: Mapped["TradingBot"] = relationship(back_populates="risk_events")


class MarketSnapshot(Base, TimestampMixin):
    __tablename__ = "market_snapshots"
    __table_args__ = (Index("ix_market_snapshots_symbol_created", "symbol", "created_at"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    symbol: Mapped[str] = mapped_column(String(20), nullable=False)
    best_bid: Mapped[Decimal] = mapped_column(Numeric(24, 8), nullable=False)
    best_ask: Mapped[Decimal] = mapped_column(Numeric(24, 8), nullable=False)
    spread_pct: Mapped[Decimal] = mapped_column(Numeric(8, 4), nullable=False)
    volume_24h: Mapped[Decimal | None] = mapped_column(Numeric(24, 8), nullable=True)
    order_book_snapshot: Mapped[dict] = mapped_column(JSON, default=dict)


class BotEvent(Base, TimestampMixin):
    __tablename__ = "bot_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    bot_id: Mapped[str] = mapped_column(String(36), ForeignKey("trading_bots.id"), nullable=False)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    data: Mapped[dict] = mapped_column(JSON, default=dict)

    bot: Mapped["TradingBot"] = relationship(back_populates="events")


class AuditLog(Base, TimestampMixin):
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    action: Mapped[str] = mapped_column(String(200), nullable=False)
    resource_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    resource_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    metadata_: Mapped[dict] = mapped_column("metadata", JSON, default=dict)
