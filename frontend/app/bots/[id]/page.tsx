"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, ApiClientError } from "@/lib/api-client";
import type { TradingBot, Order, AnalyticsSummary, BotBalance } from "@/lib/types";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { Badge, statusTone } from "@/components/ui/badge";
import { formatUsd, formatPct, formatDateTime, formatNumber } from "@/lib/utils";
import { Play, Pause, Square, AlertOctagon, Trash2, Save, Wallet, Bot, Crosshair, BarChart, Settings, ListOrdered } from "lucide-react";

const POLL_MS = 4000;
const BALANCE_POLL_MS = 15000;

export default function BotDetailPage() {
  const params = useParams<{ id: string }>();
  const [bot, setBot] = useState<TradingBot | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [balance, setBalance] = useState<BotBalance | null>(null);
  const [busy, setBusy] = useState(false);
  const [editLimits, setEditLimits] = useState(false);
  const [limitForm, setLimitForm] = useState<Record<string, string>>({});
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [b, o] = await Promise.all([
      api.getBot(params.id),
      api.listOrders({ bot_id: params.id }),
    ]);
    setBot(b);
    setOrders(o);
    try {
      setAnalytics(await api.getBotAnalytics(params.id));
    } catch {
      setAnalytics(null);
    }
  }, [params.id]);

  const refreshBalance = useCallback(async () => {
    try {
      setBalance(await api.getBotBalance(params.id));
    } catch {
      setBalance(null);
    }
  }, [params.id]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, POLL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    refreshBalance();
    const interval = setInterval(refreshBalance, BALANCE_POLL_MS);
    return () => clearInterval(interval);
  }, [refreshBalance]);

  useEffect(() => {
    if (!bot) return;
    setLimitForm({
      max_capital: String(bot.max_capital),
      max_order_size: String(bot.max_order_size),
      max_daily_volume: String(bot.max_daily_volume),
      max_daily_loss: String(bot.max_daily_loss),
      max_spread_pct: String(bot.max_spread_pct),
      max_slippage_pct: String(bot.max_slippage_pct),
      max_exposure: String(bot.max_exposure),
      max_consecutive_failures: String(bot.max_consecutive_failures ?? 3),
      max_stale_order_seconds: String(bot.max_stale_order_seconds ?? 30),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bot?.id]);

  if (!bot) return (
    <div className="flex h-64 items-center justify-center bg-white border-4 border-black font-black uppercase text-2xl tracking-widest">
      <Bot className="animate-pulse mr-4" size={40} strokeWidth={2.5}/> Loading System...
    </div>
  );

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const isLive = bot.mode === "LIVE";

  return (
    <div className="flex flex-col gap-6 bg-white min-h-screen p-4 md:p-8 font-sans">
      
      {/* Brutalist Mode Banner */}
      <div
        className={`flex items-center justify-between border-4 border-black px-5 py-4 ${
          isLive ? "bg-red-400" : "bg-green-400"
        }`}
      >
        <div className="flex items-center gap-3">
          <Crosshair size={24} strokeWidth={3} className="text-black" />
          <span className="text-sm md:text-base font-black uppercase tracking-widest text-black">
            {isLive ? "LIVE MODE — REAL CAPITAL AT RISK" : "PAPER MODE — SIMULATION ENVIRONMENT"}
          </span>
        </div>
        <Badge tone={statusTone(bot.status)} className="border-2 border-black rounded-none uppercase font-black text-black bg-white px-3 py-1 text-sm shadow-[2px_2px_0px_rgba(0,0,0,1)]">
          {bot.status}
        </Badge>
      </div>

      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 border-b-4 border-black pb-6">
        <div>
          <h1 className="text-3xl font-black text-black uppercase tracking-tight">{bot.name}</h1>
          <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-sm font-bold text-black uppercase">
            {bot.promotion_name ? (
              <span className="bg-yellow-200 px-2 border-2 border-black">PROMO: <Link href={`/promotions/${bot.promotion_id}`} className="hover:underline">{bot.promotion_name}</Link></span>
            ) : <span className="bg-gray-200 px-2 border-2 border-black">NO PROMO LINKED</span>}
            {bot.strategy_name && <span className="bg-cyan-200 px-2 border-2 border-black">STRATEGY: {bot.strategy_name}</span>}
            {bot.binance_account_label && <span className="bg-pink-200 px-2 border-2 border-black">ACCT: {bot.binance_account_label}</span>}
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          {(bot.status === "STOPPED" || bot.status === "ERROR") && (
            <button onClick={() => run(() => api.startBot(bot.id))} disabled={busy} className="brutalist-btn bg-green-400">
              <Play size={18} strokeWidth={2.5} /> Start
            </button>
          )}
          {bot.status === "RUNNING" && (
            <button onClick={() => run(() => api.pauseBot(bot.id))} disabled={busy} className="brutalist-btn bg-yellow-400">
              <Pause size={18} strokeWidth={2.5} /> Pause
            </button>
          )}
          {bot.status === "PAUSED" && (
            <button onClick={() => run(() => api.resumeBot(bot.id))} disabled={busy} className="brutalist-btn bg-green-400">
              <Play size={18} strokeWidth={2.5} /> Resume
            </button>
          )}
          {(bot.status === "RUNNING" || bot.status === "PAUSED") && (
            <button onClick={() => run(() => api.stopBot(bot.id))} disabled={busy} className="brutalist-btn bg-gray-300">
              <Square size={18} strokeWidth={2.5} /> Stop
            </button>
          )}
          <button
            onClick={() => {
              if (confirm("EMERGENCY STOP: Cancels open orders immediately. Continue?")) {
                run(() => api.emergencyStopBot(bot.id));
              }
            }}
            disabled={busy}
            className="brutalist-btn bg-orange-500 text-white border-black"
          >
            <AlertOctagon size={18} strokeWidth={2.5} /> Emergency Stop
          </button>
          {(bot.status === "STOPPED" || bot.status === "ERROR") && (
            <button
              onClick={() => {
                if (confirm("DELETE BOT? Order history for this bot may be removed permanently.")) {
                  run(async () => {
                    await api.deleteBot(bot.id);
                    window.location.href = "/bots";
                  });
                }
              }}
              disabled={busy}
              className="brutalist-btn bg-red-600 text-white"
            >
              <Trash2 size={18} strokeWidth={2.5} /> Delete
            </button>
          )}
        </div>
      </div>

      {(bot.last_pause_reason || bot.last_error) && (
        <Panel className="border-4 border-black bg-red-400 rounded-none shadow-[4px_4px_0px_rgba(0,0,0,1)]">
          <PanelBody className="px-5 py-4">
            <p className="text-sm font-black uppercase text-black">
              {bot.last_error ? "CRITICAL ERROR: " : "SYSTEM HALTED: "}
              {bot.last_error || bot.last_pause_reason}
            </p>
          </PanelBody>
        </Panel>
      )}

      {/* Analytics Grid */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Filled orders" value={String(analytics?.filled_orders ?? 0)} />
        <Stat label="Total volume" value={formatUsd(analytics?.total_volume ?? "0")} />
        <Stat label="Fees paid" value={formatUsd(analytics?.total_fees ?? "0")} />
        <Stat label="Success rate" value={formatPct(analytics?.execution_success_rate_pct ?? "0")} />
      </div>

      {/* Panels */}
      <Panel className="border-4 border-black bg-white rounded-none">
        <PanelHeader className="border-b-4 border-black px-5 py-3 bg-cyan-300">
          <PanelTitle className="text-black font-black uppercase tracking-widest flex items-center gap-2">
            <Bot size={20} strokeWidth={2.5}/> Strategy & Promotion
          </PanelTitle>
        </PanelHeader>
        <PanelBody className="grid grid-cols-2 gap-6 p-5 md:grid-cols-4 bg-gray-50">
          <DetailField label="Strategy" value={bot.strategy_name ?? "—"} />
          <DetailField label="Strategy type" value={bot.strategy_type ? bot.strategy_type.replaceAll("_", " ") : "—"} />
          <DetailField label="Initial order size" value={formatUsd(bot.initial_order_size)} />
          <DetailField label="Eligible pairs" value={(bot.eligible_pairs ?? []).join(", ") || "—"} />
          <DetailField label="Promotion" value={bot.promotion_name ?? "—"} />
          <DetailField label="Binance account" value={bot.binance_account_label ?? "—"} />
        </PanelBody>
      </Panel>

      <Panel className="border-4 border-black bg-white rounded-none">
        <PanelHeader className="border-b-4 border-black px-5 py-3 bg-pink-300 flex items-center justify-between">
          <PanelTitle className="text-black font-black uppercase tracking-widest flex items-center gap-2">
            <Wallet size={20} strokeWidth={2.5} /> Spot Balance ({balance?.symbol ?? "—"})
          </PanelTitle>
          <button onClick={refreshBalance} disabled={busy} className="border-2 border-black bg-white px-3 py-1 text-xs font-black uppercase hover:bg-black hover:text-white transition-none disabled:opacity-50">
            Refresh
          </button>
        </PanelHeader>
        <PanelBody className="grid grid-cols-2 gap-6 p-5 md:grid-cols-4 bg-gray-50">
          {balance?.error ? (
            <p className="col-span-full text-sm font-bold text-red-600 uppercase">{balance.error}</p>
          ) : balance ? (
            <>
              <DetailField label={`${balance.base_asset ?? "Base"} available`} value={formatNumber(balance.base_free, 6)} />
              <DetailField label={`${balance.base_asset ?? "Base"} locked`} value={formatNumber(balance.base_locked, 6)} />
              <DetailField label={`${balance.quote_asset ?? "Quote"} available`} value={formatNumber(balance.quote_free, 2)} />
              <DetailField label={`${balance.quote_asset ?? "Quote"} locked`} value={formatNumber(balance.quote_locked, 2)} />
            </>
          ) : (
            <p className="col-span-full text-sm font-bold text-black uppercase">Loading Ledger...</p>
          )}
        </PanelBody>
      </Panel>

      <Panel className="border-4 border-black bg-white rounded-none">
        <PanelHeader className="border-b-4 border-black px-5 py-3 bg-yellow-400 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <PanelTitle className="text-black font-black uppercase tracking-widest flex items-center gap-2">
            <Settings size={20} strokeWidth={2.5}/> Risk Limits
          </PanelTitle>
          <div className="flex gap-2">
            {!editLimits ? (
              <button onClick={() => setEditLimits(true)} disabled={busy} className="border-2 border-black bg-white px-4 py-1.5 text-xs font-black uppercase hover:bg-black hover:text-white transition-none disabled:opacity-50">
                Edit
              </button>
            ) : (
              <>
                <button onClick={() => setEditLimits(false)} disabled={busy} className="border-2 border-black bg-gray-200 px-4 py-1.5 text-xs font-black uppercase hover:bg-gray-300 transition-none disabled:opacity-50">
                  Cancel
                </button>
                <button
                  onClick={() =>
                    run(async () => {
                      const payload: Record<string, number> = {};
                      for (const [k, v] of Object.entries(limitForm)) {
                        if (v === "" || v == null) continue;
                        payload[k] = Number(v);
                      }
                      await api.updateBot(bot.id, payload);
                      setEditLimits(false);
                      setSaveMsg("PARAMETERS UPDATED");
                      setTimeout(() => setSaveMsg(null), 3000);
                    })
                  }
                  disabled={busy}
                  className="flex items-center gap-1 border-2 border-black bg-green-400 px-4 py-1.5 text-xs font-black uppercase hover:bg-green-300 transition-none disabled:opacity-50"
                >
                  <Save size={14} strokeWidth={3} /> Save
                </button>
              </>
            )}
          </div>
        </PanelHeader>
        <PanelBody className="grid grid-cols-2 gap-6 p-5 md:grid-cols-4 bg-gray-50">
          {editLimits ? (
            <>
              {(
                [
                  ["max_capital", "Max capital ($)"],
                  ["max_order_size", "Max order size ($)"],
                  ["max_daily_volume", "Max daily vol ($)"],
                  ["max_daily_loss", "Max daily loss ($)"],
                  ["max_spread_pct", "Max spread (%)"],
                  ["max_slippage_pct", "Max slippage (%)"],
                  ["max_exposure", "Max exposure ($)"],
                  ["max_consecutive_failures", "Max failures"],
                  ["max_stale_order_seconds", "Max stale (s)"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex flex-col gap-2">
                  <span className="text-xs font-black uppercase tracking-widest text-black">{label}</span>
                  <input
                    className="rounded-none border-2 border-black bg-white px-3 py-2 text-sm font-bold tabular-nums text-black focus:outline-none focus:ring-4 focus:ring-yellow-400"
                    type="number"
                    step="any"
                    value={limitForm[key] ?? ""}
                    onChange={(e) => setLimitForm((f) => ({ ...f, [key]: e.target.value }))}
                  />
                </label>
              ))}
            </>
          ) : (
            <>
              <DetailField label="Max capital" value={formatUsd(bot.max_capital)} />
              <DetailField label="Max order size" value={formatUsd(bot.max_order_size)} />
              <DetailField label="Max daily volume" value={formatUsd(bot.max_daily_volume)} />
              <DetailField label="Max daily loss" value={formatUsd(bot.max_daily_loss)} />
              <DetailField label="Max spread" value={formatPct(bot.max_spread_pct)} />
              <DetailField label="Max slippage" value={formatPct(bot.max_slippage_pct)} />
              <DetailField label="Max exposure" value={formatUsd(bot.max_exposure)} />
              <DetailField label="Max consecutive failures" value={String(bot.max_consecutive_failures ?? 3)} />
            </>
          )}
          {saveMsg && (
            <div className="col-span-full border-4 border-black bg-green-400 p-3 text-sm font-black text-black uppercase tracking-widest mt-2">
              {saveMsg}
            </div>
          )}
        </PanelBody>
      </Panel>

      <Panel className="border-4 border-black bg-white rounded-none">
        <PanelHeader className="border-b-4 border-black px-5 py-3 bg-purple-300">
          <PanelTitle className="text-black font-black uppercase tracking-widest flex items-center gap-2">
            <ListOrdered size={20} strokeWidth={2.5}/> Recent Orders
          </PanelTitle>
        </PanelHeader>
        <PanelBody className="p-0">
          {orders.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm font-black uppercase tracking-widest text-black bg-gray-50">
              No orders registered in ledger.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-4 border-black text-left text-xs font-black uppercase tracking-widest text-black bg-gray-200">
                    <th className="px-5 py-4 whitespace-nowrap">Time</th>
                    <th className="px-5 py-4 whitespace-nowrap">Pair</th>
                    <th className="px-5 py-4 whitespace-nowrap">Side</th>
                    <th className="px-5 py-4 whitespace-nowrap">Type</th>
                    <th className="px-5 py-4 whitespace-nowrap">Quantity</th>
                    <th className="px-5 py-4 whitespace-nowrap">Value</th>
                    <th className="px-5 py-4 whitespace-nowrap">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-black">
                  {orders.map((o) => (
                    <tr key={o.id} className="hover:bg-yellow-200 transition-none">
                      <td className="whitespace-nowrap px-5 py-3 font-bold tabular-nums text-black">{formatDateTime(o.created_at)}</td>
                      <td className="px-5 py-3 font-black text-black">{o.symbol}</td>
                      <td className="px-5 py-3">
                        <Badge tone={o.side === "BUY" ? "up" : "down"} className="border-2 border-black rounded-none uppercase font-black bg-white">
                          {o.side}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 font-bold text-black uppercase">{o.order_type}</td>
                      <td className="px-5 py-3 font-bold tabular-nums text-black">{formatNumber(o.executed_quantity, 6)}</td>
                      <td className="px-5 py-3 font-bold tabular-nums text-black">{formatUsd(o.cumulative_quote_quantity)}</td>
                      <td className="px-5 py-3">
                        <Badge tone={statusTone(o.status)} className="border-2 border-black rounded-none uppercase font-black bg-white">
                          {o.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </PanelBody>
      </Panel>
      
      {/* Utility Styles strictly scoped for this file to handle standard button structures */}
      <style dangerouslySetInnerHTML={{__html: `
        .brutalist-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          border: 2px solid #000;
          padding: 0.5rem 1rem;
          font-size: 0.875rem;
          font-weight: 900;
          text-transform: uppercase;
          transition: none;
        }
        .brutalist-btn:hover:not(:disabled) {
          background-color: #000;
          color: #fff;
        }
        .brutalist-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-4 border-black bg-white px-5 py-4 shadow-[4px_4px_0px_rgba(0,0,0,1)] flex flex-col justify-between">
      <div className="text-xs font-black uppercase tracking-widest text-black">{label}</div>
      <div className="mt-2 text-3xl font-black tabular-nums text-black tracking-tighter">{value}</div>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-xs font-black uppercase tracking-widest text-gray-700">{label}</div>
      <div className="text-base font-bold text-black uppercase truncate" title={value}>{value}</div>
    </div>
  );
}
