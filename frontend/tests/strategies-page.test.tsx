import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import StrategiesPage from "@/app/strategies/page";

vi.mock("@/lib/api-client", () => ({
  api: {
    listStrategyConfigs: vi.fn(),
    listStrategyTypes: vi.fn(),
    createStrategyConfig: vi.fn(),
  },
  ApiClientError: class ApiClientError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

import { api } from "@/lib/api-client";

beforeEach(() => {
  vi.clearAllMocks();
  (api.listStrategyConfigs as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (api.listStrategyTypes as ReturnType<typeof vi.fn>).mockResolvedValue([
    "INTERVAL_ROUND_TRIP", "VOLUME_TARGET_SCHEDULER",
  ]);
});

describe("StrategiesPage parameter fields", () => {
  it("shows buy/sell interval fields for Interval Round Trip", async () => {
    render(<StrategiesPage />);
    await waitFor(() => expect(screen.getByText("Buy interval (s)")).toBeInTheDocument());
    expect(screen.getByText("Sell interval (s)")).toBeInTheDocument();
    expect(screen.queryByText("Min interval (s)")).not.toBeInTheDocument();
  });

  it("swaps to pacing bounds for Volume Target Scheduler", async () => {
    render(<StrategiesPage />);
    await waitFor(() => screen.getByText("Volume target scheduler"));

    fireEvent.change(screen.getByDisplayValue("Interval round trip"), {
      target: { value: "VOLUME_TARGET_SCHEDULER" },
    });

    expect(await screen.findByText("Min interval (s)")).toBeInTheDocument();
    expect(screen.getByText("Max interval (s)")).toBeInTheDocument();
    expect(screen.queryByText("Buy interval (s)")).not.toBeInTheDocument();
  });

  it("submits eligible_pairs as an uppercased array", async () => {
    (api.createStrategyConfig as ReturnType<typeof vi.fn>).mockResolvedValue({});
    render(<StrategiesPage />);
    await waitFor(() => screen.getByText("Save configuration"));

    fireEvent.change(screen.getByPlaceholderText(/SOL\/ETH interval farm/), { target: { value: "My Strategy" } });
    fireEvent.click(screen.getByText("Save configuration"));

    await waitFor(() => expect(api.createStrategyConfig).toHaveBeenCalled());
    const payload = (api.createStrategyConfig as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(payload.parameters.eligible_pairs).toEqual(["SOLUSDT"]);
  });
});
