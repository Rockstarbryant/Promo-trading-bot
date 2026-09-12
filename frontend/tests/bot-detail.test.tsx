import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import BotDetailPage from "@/app/bots/[id]/page";
import type { TradingBot, Order, AnalyticsSummary } from "@/lib/types";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "bot-1" }),
}));

const baseBot: TradingBot = {
  id: "bot-1", name: "Test Bot", mode: "PAPER", status: "RUNNING",
  binance_account_id: "acc-1", promotion_id: "promo-1", strategy_config_id: "strat-1",
  max_capital: "100", max_order_size: "20", max_daily_volume: "2000", max_daily_loss: "5",
  max_spread_pct: "0.15", max_slippage_pct: "0.15", max_exposure: "20",
  last_error: null, last_pause_reason: null, started_at: null, stopped_at: null,
};

const emptyAnalytics: AnalyticsSummary = {
  total_volume: "0", qualifying_volume: "0", num_orders: 0, filled_orders: 0,
  cancelled_orders: 0, rejected_orders: 0, total_fees: "0", total_estimated_slippage: "0",
  realized_pnl: "0", average_spread_pct: null, average_execution_price_deviation_pct: null,
  average_cycle_seconds: null, volume_by_pair: {}, volume_by_strategy: {},
  execution_success_rate_pct: "0", estimated_cost_per_1000_volume: null,
};

vi.mock("@/lib/api-client", () => ({
  api: {
    getBot: vi.fn(),
    listOrders: vi.fn(),
    getBotAnalytics: vi.fn(),
    startBot: vi.fn(),
    pauseBot: vi.fn(),
    resumeBot: vi.fn(),
    stopBot: vi.fn(),
    emergencyStopBot: vi.fn(),
  },
}));

import { api } from "@/lib/api-client";

beforeEach(() => {
  vi.clearAllMocks();
  (api.listOrders as ReturnType<typeof vi.fn>).mockResolvedValue([] as Order[]);
  (api.getBotAnalytics as ReturnType<typeof vi.fn>).mockResolvedValue(emptyAnalytics);
});

describe("BotDetailPage mode banner", () => {
  it("shows the PAPER banner for a paper-mode bot", async () => {
    (api.getBot as ReturnType<typeof vi.fn>).mockResolvedValue(baseBot);
    render(<BotDetailPage />);
    await waitFor(() => expect(screen.getByText(/PAPER — simulated/i)).toBeInTheDocument());
  });

  it("shows the LIVE banner for a live-mode bot", async () => {
    (api.getBot as ReturnType<typeof vi.fn>).mockResolvedValue({ ...baseBot, mode: "LIVE" });
    render(<BotDetailPage />);
    await waitFor(() => expect(screen.getByText(/LIVE — real orders/i)).toBeInTheDocument());
  });
});

describe("BotDetailPage lifecycle controls", () => {
  it("shows Pause and Stop (not Start) when RUNNING", async () => {
    (api.getBot as ReturnType<typeof vi.fn>).mockResolvedValue({ ...baseBot, status: "RUNNING" });
    render(<BotDetailPage />);
    await waitFor(() => expect(screen.getByText("Pause")).toBeInTheDocument());
    expect(screen.getByText("Stop")).toBeInTheDocument();
    expect(screen.queryByText("Start")).not.toBeInTheDocument();
  });

  it("shows Resume (not Pause) when PAUSED", async () => {
    (api.getBot as ReturnType<typeof vi.fn>).mockResolvedValue({ ...baseBot, status: "PAUSED" });
    render(<BotDetailPage />);
    await waitFor(() => expect(screen.getByText("Resume")).toBeInTheDocument());
    expect(screen.queryByText("Pause")).not.toBeInTheDocument();
  });

  it("shows Start when STOPPED", async () => {
    (api.getBot as ReturnType<typeof vi.fn>).mockResolvedValue({ ...baseBot, status: "STOPPED" });
    render(<BotDetailPage />);
    await waitFor(() => expect(screen.getByText("Start")).toBeInTheDocument());
    expect(screen.queryByText("Pause")).not.toBeInTheDocument();
  });

  it("always shows Emergency stop regardless of status", async () => {
    (api.getBot as ReturnType<typeof vi.fn>).mockResolvedValue({ ...baseBot, status: "STOPPED" });
    render(<BotDetailPage />);
    await waitFor(() => expect(screen.getByText("Emergency stop")).toBeInTheDocument());
  });
});

describe("BotDetailPage risk/waiting messages", () => {
  it("surfaces last_pause_reason as a waiting message", async () => {
    (api.getBot as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...baseBot, status: "RUNNING", last_pause_reason: "SOLUSDT spread 0.24% exceeds configured maximum of 0.10%",
    });
    render(<BotDetailPage />);
    await waitFor(() => expect(screen.getByText(/spread 0.24% exceeds configured maximum/)).toBeInTheDocument());
  });

  it("surfaces last_error distinctly from a pause reason", async () => {
    (api.getBot as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...baseBot, status: "ERROR", last_error: "Binance account is inactive or missing",
    });
    render(<BotDetailPage />);
    await waitFor(() => expect(screen.getByText(/Error:/)).toBeInTheDocument());
  });
});
