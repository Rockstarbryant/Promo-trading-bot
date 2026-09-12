import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AccountsPage from "@/app/accounts/page";

vi.mock("@/lib/api-client", () => ({
  api: {
    listAccounts: vi.fn(),
    connectAccount: vi.fn(),
    deleteAccount: vi.fn(),
  },
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

describe("AccountsPage API error handling", () => {
  it("shows a human-readable error when the account list fails to load", async () => {
    (api.listAccounts as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ApiClientError("Not authenticated", 401)
    );
    render(<AccountsPage />);
    await waitFor(() => expect(screen.getByText("Not authenticated")).toBeInTheDocument());
  });

  it("shows a human-readable error when connecting an account fails", async () => {
    (api.listAccounts as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (api.connectAccount as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ApiClientError("Could not verify Binance credentials: Invalid API-key", 400)
    );
    render(<AccountsPage />);

    await waitFor(() => expect(screen.getByText("No accounts connected yet.")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/API key/), { target: { value: "bad-key" } });
    fireEvent.change(screen.getByLabelText(/API secret/), { target: { value: "bad-secret-value" } });
    fireEvent.click(screen.getByText("Connect account"));

    await waitFor(() =>
      expect(screen.getByText(/Could not verify Binance credentials/)).toBeInTheDocument()
    );
  });

  it("renders permission badges reflecting actual account state", async () => {
    (api.listAccounts as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: "acc-1", label: "Main", api_key: "ABCDEFGHIJKL", can_trade: true,
        can_withdraw: false, is_active: true, last_verified_at: "2026-01-01T00:00:00Z",
      },
    ]);
    render(<AccountsPage />);
    await waitFor(() => expect(screen.getByText("Main")).toBeInTheDocument());
    expect(screen.getByText("Trade ✓")).toBeInTheDocument();
    expect(screen.getByText("Withdraw off")).toBeInTheDocument();
  });
});
