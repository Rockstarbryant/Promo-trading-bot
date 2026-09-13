"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api-client";
import type { TradingBot, Order, AnalyticsSummary } from "@/lib/types";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { Badge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatUsd, formatPct, formatDateTime, formatNumber } from "@/lib/utils";
import { Play, Pause, Square, AlertOctagon, Trash2, Save } from "lucide-react";

const POLL_MS = 4000;

export default function BotDetailPage() {
  const params = useParams<{ id: string }>();
  const [bot, setBot] = useState<TradingBot | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
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

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, POLL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

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
    // Intentionally only re-seed the form when switching bots; edits stay local until Save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bot?.id]);

  if (!bot) return <div className="text-sm text-ash-400">Loading…</div>;

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
    <div className="flex flex-col gap-6">
      {/* The mode banner is deliberately impossible to miss. */}
      <div
        className={`flex items-center justify-between rounded border px-4 py-3 ${
          isLive ? "border-market-down bg-market-down/10" : "border-market-up bg-market-up/10"
        }`}
      >
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${isLive ? "bg-market-down" : "bg-market-up"}`} />
          <span className={`text-sm font-semibold ${isLive ? "text-market-down" : "text-market-up"}`}>
            {isLive ? "LIVE — real orders on Binance" : "PAPER — simulated, no real orders"}
          </span>
        </div>
        <Badge tone={statusTone(bot.status)}>{bot.status}</Badge>
      </div>

      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-ash-50">{bot.name}</h1>
        <div className="flex flex-wrap gap-2">
          {(bot.status === "STOPPED" || bot.status === "ERROR") && (
            <Button onClick={() => run(() => api.startBot(bot.id))} disabled={busy}>
              <Play size={16} /> Start
            </Button>
          )}
          {bot.status === "RUNNING" && (
            <Button variant="secondary" onClick={() => run(() => api.pauseBot(bot.id))} disabled={busy}>
              <Pause size={16} /> Pause
            </Button>
          )}
          {bot.status === "PAUSED" && (
            <Button onClick={() => run(() => api.resumeBot(bot.id))} disabled={busy}>
              <Play size={16} /> Resume
            </Button>
          )}
          {(bot.status === "RUNNING" || bot.status === "PAUSED") && (
            <Button variant="secondary" onClick={() => run(() => api.stopBot(bot.id))} disabled={busy}>
              <Square size={16} /> Stop
            </Button>
          )}
          <Button
            variant="danger"
            onClick={() => {
              if (confirm("Emergency stop: cancels open orders immediately. Continue?")) {
                run(() => api.emergencyStopBot(bot.id));
              }
            }}
            disabled={busy}
          >
            <AlertOctagon size={16} /> Emergency stop
          </Button>
          {(bot.status === "STOPPED" || bot.status === "ERROR") && (
            <Button
              variant="danger"
              onClick={() => {
                if (confirm("Delete this bot permanently? Order history for this bot may be removed.")) {
                  run(async () => {
                    await api.deleteBot(bot.id);
                    window.location.href = "/bots";
                  });
                }
              }}
              disabled={busy}
            >
              <Trash2 size={16} /> Delete
            </Button>
          )}
        </div>
      </div>

      {(bot.last_pause_reason || bot.last_error) && (
        <Panel className={bot.last_error ? "border-market-down/40 bg-market-down/5" : "border-signal/30 bg-signal/5"}>
          <PanelBody>
            <p className="text-sm text-ash-200">
              {bot.last_error ? "Error: " : "Waiting — "}
              {bot.last_error || bot.last_pause_reason}
            </p>
          </PanelBody>
        </Panel>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Filled orders" value={String(analytics?.filled_orders ?? 0)} />
        <Stat label="Total volume" value={formatUsd(analytics?.total_volume ?? "0")} />
        <Stat label="Fees paid" value={formatUsd(analytics?.total_fees ?? "0")} />
        <Stat label="Success rate" value={formatPct(analytics?.execution_success_rate_pct ?? "0")} />
      </div>

      <Panel>
        <PanelHeader className="flex items-center justify-between gap-2">
          <PanelTitle>Risk limits</PanelTitle>
          <div className="flex gap-2">
            {!editLimits ? (
              <Button variant="secondary" onClick={() => setEditLimits(true)} disabled={busy}>
                Edit
              </Button>
            ) : (
              <>
                <Button
                  variant="secondary"
                  onClick={() => setEditLimits(false)}
                  disabled={busy}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() =>
                    run(async () => {
                      const payload: Record<string, number> = {};
                      for (const [k, v] of Object.entries(limitForm)) {
                        if (v === "" || v == null) continue;
                        payload[k] = Number(v);
                      }
                      await api.updateBot(bot.id, payload);
                      setEditLimits(false);
                      setSaveMsg("Risk limits saved");
                      setTimeout(() => setSaveMsg(null), 3000);
                    })
                  }
                  disabled={busy}
                >
                  <Save size={16} /> Save
                </Button>
              </>
            )}
          </div>
        </PanelHeader>
        <PanelBody className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
          {editLimits ? (
            <>
              {(
                [
                  ["max_capital", "Max capital ($)"],
                  ["max_order_size", "Max order size ($)"],
                  ["max_daily_volume", "Max daily volume ($)"],
                  ["max_daily_loss", "Max daily loss ($)"],
                  ["max_spread_pct", "Max spread (%)"],
                  ["max_slippage_pct", "Max slippage (%)"],
                  ["max_exposure", "Max exposure ($)"],
                  ["max_consecutive_failures", "Max consecutive failures"],
                  ["max_stale_order_seconds", "Max stale order (s)"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex flex-col gap-1">
                  <span className="text-xs text-ash-400">{label}</span>
                  <input
                    className="rounded border border-ink-600 bg-ink-800 px-2 py-1.5 tabular text-ash-50"
                    type="number"
                    step="any"
                    value={limitForm[key] ?? ""}
                    onChange={(e) =>
                      setLimitForm((f) => ({ ...f, [key]: e.target.value }))
                    }
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
              <DetailField
                label="Max consecutive failures"
                value={String(bot.max_consecutive_failures ?? 3)}
              />
            </>
          )}
          {saveMsg && (
            <div className="col-span-full text-sm text-market-up">{saveMsg}</div>
          )}
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader><PanelTitle>Recent orders</PanelTitle></PanelHeader>
        <PanelBody className="p-0">
          {orders.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-ash-400">No orders yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-600 text-left text-xs text-ash-400">
                    <th className="px-4 py-2 font-normal">Time</th>
                    <th className="px-4 py-2 font-normal">Pair</th>
                    <th className="px-4 py-2 font-normal">Side</th>
                    <th className="px-4 py-2 font-normal">Type</th>
                    <th className="px-4 py-2 font-normal">Quantity</th>
                    <th className="px-4 py-2 font-normal">Value</th>
                    <th className="px-4 py-2 font-normal">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id} className="border-b border-ink-600/60 last:border-0">
                      <td className="whitespace-nowrap px-4 py-2.5 tabular text-ash-400">{formatDateTime(o.created_at)}</td>
                      <td className="px-4 py-2.5 text-ash-50">{o.symbol}</td>
                      <td className="px-4 py-2.5">
                        <Badge tone={o.side === "BUY" ? "up" : "down"}>{o.side}</Badge>
                      </td>
                      <td className="px-4 py-2.5 text-ash-400">{o.order_type}</td>
                      <td className="px-4 py-2.5 tabular">{formatNumber(o.executed_quantity, 6)}</td>
                      <td className="px-4 py-2.5 tabular">{formatUsd(o.cumulative_quote_quantity)}</td>
                      <td className="px-4 py-2.5"><Badge tone={statusTone(o.status)}>{o.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </PanelBody>
      </Panel>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Panel className="px-4 py-3">
      <div className="text-xs text-ash-400">{label}</div>
      <div className="mt-1 text-xl font-medium tabular text-ash-50">{value}</div>
    </Panel>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-ash-400">{label}</div>
      <div className="tabular text-ash-50">{value}</div>
    </div>
  );
}
