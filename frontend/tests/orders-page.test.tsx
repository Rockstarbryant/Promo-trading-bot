import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import OrdersPage from "@/app/orders/page";
import type { Order } from "@/lib/types";

vi.mock("@/lib/api-client", () => ({
  api: { listOrders: vi.fn() },
}));

import { api } from "@/lib/api-client";

const sampleOrder: Order = {
  id: "order-1", bot_id: "bot-1", symbol: "SOLUSDT", side: "BUY", order_type: "MARKET",
  status: "FILLED", quantity: "0.2", price: null, executed_quantity: "0.2",
  cumulative_quote_quantity: "20.00", commission: "0.02", commission_asset: "USDT",
  is_paper: true, created_at: "2026-01-15T10:00:00Z", submitted_at: "2026-01-15T10:00:00Z",
  filled_at: "2026-01-15T10:00:01Z", cancelled_at: null, rejection_reason: null,
};

beforeEach(() => vi.clearAllMocks());

describe("OrdersPage", () => {
  it("renders an empty state with no orders", async () => {
    (api.listOrders as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    render(<OrdersPage />);
    await waitFor(() => expect(screen.getByText("No orders found.")).toBeInTheDocument());
  });

  it("renders order rows with side, status, and PAPER badge", async () => {
    (api.listOrders as ReturnType<typeof vi.fn>).mockResolvedValue([sampleOrder]);
    render(<OrdersPage />);
    await waitFor(() => expect(screen.getByText("SOLUSDT")).toBeInTheDocument());
    expect(screen.getByText("BUY")).toBeInTheDocument();
    expect(screen.getByText("FILLED")).toBeInTheDocument();
    expect(screen.getByText("PAPER")).toBeInTheDocument();
  });

  it("marks a live order as LIVE rather than PAPER", async () => {
    (api.listOrders as ReturnType<typeof vi.fn>).mockResolvedValue([{ ...sampleOrder, is_paper: false }]);
    render(<OrdersPage />);
    await waitFor(() => expect(screen.getByText("LIVE")).toBeInTheDocument());
  });
});
