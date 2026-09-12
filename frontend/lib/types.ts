// Mirrors backend/app/schemas/schemas.py — kept in one place so every page
// shares the same shape instead of scattering ad-hoc fetch typing.

export type PromotionType =
  | "SPOT_VOLUME"
  | "SPOT_PAIR_VOLUME"
  | "TRADING_TOURNAMENT"
  | "FEE_VOLUME_CAMPAIGN"
  | "NEW_LISTING_CAMPAIGN";

export type PromotionStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "ENDED";

export type StrategyType =
  | "INTERVAL_ROUND_TRIP"
  | "LIQUIDITY_AWARE_ROUND_TRIP"
  | "MULTI_PAIR_ROTATION"
  | "LOWEST_EXECUTION_COST"
  | "VOLUME_TARGET_SCHEDULER";

export type BotMode = "PAPER" | "LIVE";
export type BotStatus = "STOPPED" | "STARTING" | "RUNNING" | "PAUSED" | "ERROR" | "COMPLETED";
export type OrderSide = "BUY" | "SELL";
export type OrderType = "LIMIT" | "MARKET";
export type OrderStatus =
  | "CREATED" | "SUBMITTED" | "PARTIALLY_FILLED" | "FILLED"
  | "CANCELLED" | "REJECTED" | "EXPIRED";

export interface User {
  id: string;
  email: string;
  is_active: boolean;
}

export interface BinanceAccount {
  id: string;
  label: string;
  api_key: string;
  can_trade: boolean;
  can_withdraw: boolean;
  is_active: boolean;
  last_verified_at: string | null;
}

export interface PromotionPair {
  symbol: string;
  is_eligible: boolean;
  per_pair_target_volume?: string | null;
}

export interface Promotion {
  id: string;
  name: string;
  description: string | null;
  promotion_type: PromotionType;
  status: PromotionStatus;
  start_time: string;
  end_time: string;
  target_volume: string | null;
  min_volume: string | null;
  max_volume: string | null;
  notes: string | null;
  rules_url: string | null;
}

export interface PromotionProgress {
  qualifying_volume: string;
  target_volume: string | null;
  progress_pct: string | null;
  remaining_volume: string | null;
}

export interface StrategyConfiguration {
  id: string;
  name: string;
  strategy_type: StrategyType;
  parameters: Record<string, unknown>;
}

export interface TradingBot {
  id: string;
  name: string;
  mode: BotMode;
  status: BotStatus;
  binance_account_id: string;
  promotion_id: string;
  strategy_config_id: string;
  max_capital: string;
  max_order_size: string;
  max_daily_volume: string;
  max_daily_loss: string;
  max_spread_pct: string;
  max_slippage_pct: string;
  max_exposure: string;
  last_error: string | null;
  last_pause_reason: string | null;
  started_at: string | null;
  stopped_at: string | null;
}

export interface Order {
  id: string;
  bot_id: string;
  symbol: string;
  side: OrderSide;
  order_type: OrderType;
  status: OrderStatus;
  quantity: string;
  price: string | null;
  executed_quantity: string;
  cumulative_quote_quantity: string;
  commission: string;
  commission_asset: string | null;
  is_paper: boolean;
  created_at: string;
  submitted_at: string | null;
  filled_at: string | null;
  cancelled_at: string | null;
  rejection_reason: string | null;
}

export interface AnalyticsSummary {
  total_volume: string;
  qualifying_volume: string;
  num_orders: number;
  filled_orders: number;
  cancelled_orders: number;
  rejected_orders: number;
  total_fees: string;
  total_estimated_slippage: string;
  realized_pnl: string;
  average_spread_pct: string | null;
  average_execution_price_deviation_pct: string | null;
  average_cycle_seconds: string | null;
  volume_by_pair: Record<string, string>;
  volume_by_strategy: Record<string, string>;
  execution_success_rate_pct: string;
  estimated_cost_per_1000_volume: string | null;
}

export interface BotEventMessage {
  event_type: string;
  bot_id: string;
  data: Record<string, unknown>;
}
