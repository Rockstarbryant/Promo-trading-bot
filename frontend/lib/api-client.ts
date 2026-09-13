"use client";

// Every Client Component talks to the backend exclusively through this
// module, which calls our own /api/proxy/* Route Handlers. No component
// ever constructs a fetch() to the backend directly, and no auth token is
// ever visible to this code — the proxy attaches it server-side.

import type {
  AnalyticsSummary, BinanceAccount, Order, Promotion, PromotionProgress,
  StrategyConfiguration, TradingBot, User,
} from "@/lib/types";

class ApiClientError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(`/api/proxy/${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const isJson = (resp.headers.get("content-type") || "").includes("application/json");
  const body = isJson ? await resp.json().catch(() => null) : null;

  if (!resp.ok) {
    const message = (body && (body.detail as string)) || `Request failed (${resp.status})`;
    throw new ApiClientError(message, resp.status);
  }
  return body as T;
}

export const api = {
  // Accounts
  listAccounts: () => request<BinanceAccount[]>("accounts"),
  connectAccount: (payload: { label: string; api_key: string; api_secret: string }) =>
    request<BinanceAccount>("accounts", { method: "POST", body: JSON.stringify(payload) }),
  deleteAccount: (id: string) => request<void>(`accounts/${id}`, { method: "DELETE" }),

  // Promotions
  listPromotions: () => request<Promotion[]>("promotions"),
  getPromotion: (id: string) => request<Promotion>(`promotions/${id}`),
  getPromotionProgress: (id: string) => request<PromotionProgress>(`promotions/${id}/progress`),
  createPromotion: (payload: Record<string, unknown>) =>
    request<Promotion>("promotions", { method: "POST", body: JSON.stringify(payload) }),
  activatePromotion: (id: string) => request<Promotion>(`promotions/${id}/activate`, { method: "POST" }),
  endPromotion: (id: string) => request<Promotion>(`promotions/${id}/end`, { method: "POST" }),

  // Strategies
  listStrategyTypes: () => request<string[]>("strategies/types"),
  listStrategyConfigs: () => request<StrategyConfiguration[]>("strategies"),
  createStrategyConfig: (payload: { name: string; strategy_type: string; parameters: Record<string, unknown> }) =>
    request<StrategyConfiguration>("strategies", { method: "POST", body: JSON.stringify(payload) }),

  // Bots
  listBots: () => request<TradingBot[]>("bots"),
  getBot: (id: string) => request<TradingBot>(`bots/${id}`),
  createBot: (payload: Record<string, unknown>) =>
    request<TradingBot>("bots", { method: "POST", body: JSON.stringify(payload) }),
  startBot: (id: string) => request<{ status: string; message: string }>(`bots/${id}/start`, { method: "POST" }),
  pauseBot: (id: string) => request<{ status: string; message: string }>(`bots/${id}/pause`, { method: "POST" }),
  resumeBot: (id: string) => request<{ status: string; message: string }>(`bots/${id}/resume`, { method: "POST" }),
  stopBot: (id: string) => request<{ status: string; message: string }>(`bots/${id}/stop`, { method: "POST" }),
  emergencyStopBot: (id: string) =>
    request<{ status: string; message: string }>(`bots/${id}/emergency-stop`, { method: "POST" }),
  updateBot: (id: string, payload: Record<string, unknown>) =>
    request<TradingBot>(`bots/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteBot: (id: string) =>
    request<void>(`bots/${id}`, { method: "DELETE" }),

  // Orders
  listOrders: (params?: { bot_id?: string; symbol?: string }) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return request<Order[]>(`orders${qs ? `?${qs}` : ""}`);
  },

  // Analytics
  getBotAnalytics: (botId: string) => request<AnalyticsSummary>(`analytics/bots/${botId}/summary`),
};

export async function loginRequest(email: string, password: string): Promise<void> {
  const resp = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new ApiClientError(body.detail || "Login failed", resp.status);
  }
}

export async function registerRequest(email: string, password: string): Promise<User> {
  const resp = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new ApiClientError(body.detail || "Registration failed", resp.status);
  }
  return body as User;
}

export async function logoutRequest(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
}

export { ApiClientError };
