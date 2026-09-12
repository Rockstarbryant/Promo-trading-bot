import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import NewPromotionPage from "@/app/promotions/new/page";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/lib/api-client", () => ({
  api: { createPromotion: vi.fn() },
  ApiClientError: class ApiClientError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

import { api, ApiClientError } from "@/lib/api-client";

beforeEach(() => vi.clearAllMocks());

describe("NewPromotionPage", () => {
  it("submits parsed comma-separated pairs as an eligible-pairs array", async () => {
    (api.createPromotion as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "promo-123" });
    render(<NewPromotionPage />);

    fireEvent.change(screen.getByPlaceholderText(/Q1 Spot Trading Tournament/), { target: { value: "My Promo" } });
    fireEvent.change(screen.getByDisplayValue("SOLUSDT, ETHUSDT"), { target: { value: "solusdt, ethusdt , btcusdt" } });

    const [start, end] = screen.getAllByDisplayValue("");
    fireEvent.change(start, { target: { value: "2026-01-01T00:00" } });
    fireEvent.change(end, { target: { value: "2026-06-01T00:00" } });

    fireEvent.click(screen.getByText("Create promotion"));

    await waitFor(() => expect(api.createPromotion).toHaveBeenCalled());
    const payload = (api.createPromotion as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(payload.pairs).toEqual([
      { symbol: "SOLUSDT", is_eligible: true },
      { symbol: "ETHUSDT", is_eligible: true },
      { symbol: "BTCUSDT", is_eligible: true },
    ]);
    expect(push).toHaveBeenCalledWith("/promotions/promo-123");
  });

  it("surfaces an API error message instead of navigating", async () => {
    (api.createPromotion as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ApiClientError("end_time must be after start_time", 400)
    );
    render(<NewPromotionPage />);

    fireEvent.change(screen.getByPlaceholderText(/Q1 Spot Trading Tournament/), { target: { value: "Bad Promo" } });
    const [start, end] = screen.getAllByDisplayValue("");
    fireEvent.change(start, { target: { value: "2026-06-01T00:00" } });
    fireEvent.change(end, { target: { value: "2026-01-01T00:00" } });

    fireEvent.click(screen.getByText("Create promotion"));

    await waitFor(() => expect(screen.getByText("end_time must be after start_time")).toBeInTheDocument());
    expect(push).not.toHaveBeenCalled();
  });
});
