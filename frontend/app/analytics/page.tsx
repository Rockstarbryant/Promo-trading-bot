"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import type { TradingBot, AnalyticsSummary } from "@/lib/types";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { Select } from "@/components/ui/input";
import { formatUsd, formatPct, formatNumber } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export default function AnalyticsPage() {
  const [bots, setBots] = useState<TradingBot[]>([]);
  const [botId, setBotId] = useState("");
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);

  useEffect(() => {
    api.listBots().then((b) => {
      setBots(b);
      if (b[0]) setBotId(b[0].id);
    });
  }, []);

  useEffect(() => {
    if (!botId) return;
    api.getBotAnalytics(botId).then(setSummary).catch(() => setSummary(null));
  }, [botId]);

  const volumeByPairData = summary
    ? Object.entries(summary.volume_by_pair).map(([symbol, volume]) => ({ symbol, volume: parseFloat(volume) }))
    : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-ash-50">Analytics</h1>
          <p className="text-sm text-ash-400">Execution quality and cost, per bot.</p>
        </div>
        <Select value={botId} onChange={(e) => setBotId(e.target.value)} className="w-56">
          {bots.length === 0 && <option value="">No bots yet</option>}
          {bots.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </Select>
      </div>

      {!summary ? (
        <Panel><PanelBody className="text-center text-sm text-ash-400 py-8">
          {bots.length === 0 ? "Create a bot to see analytics here." : "Loading…"}
        </PanelBody></Panel>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Total volume" value={formatUsd(summary.total_volume)} />
            <Stat label="Realized P/L" value={formatUsd(summary.realized_pnl)} />
            <Stat label="Total fees" value={formatUsd(summary.total_fees)} />
            <Stat label="Cost / $1000 volume" value={summary.estimated_cost_per_1000_volume ? formatUsd(summary.estimated_cost_per_1000_volume) : "—"} />
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Filled" value={String(summary.filled_orders)} />
            <Stat label="Cancelled" value={String(summary.cancelled_orders)} />
            <Stat label="Rejected" value={String(summary.rejected_orders)} />
            <Stat label="Success rate" value={formatPct(summary.execution_success_rate_pct)} />
          </div>

          <Panel>
            <PanelHeader><PanelTitle>Volume by pair</PanelTitle></PanelHeader>
            <PanelBody>
              {volumeByPairData.length === 0 ? (
                <div className="py-8 text-center text-sm text-ash-400">No filled orders yet.</div>
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={volumeByPairData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#232B3A" />
                      <XAxis dataKey="symbol" stroke="#8892A6" fontSize={12} />
                      <YAxis stroke="#8892A6" fontSize={12} />
                      <Tooltip
                        contentStyle={{ background: "#141A24", border: "1px solid #232B3A", borderRadius: 4, fontSize: 12 }}
                        labelStyle={{ color: "#E7EAF1" }}
                        formatter={(value: number) => [`$${formatNumber(value)}`, "Volume"]}
                      />
                      <Bar dataKey="volume" fill="#E8A33D" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader><PanelTitle>Execution quality</PanelTitle></PanelHeader>
            <PanelBody className="grid grid-cols-2 gap-4 text-sm md:grid-cols-3">
              <DetailField label="Average spread" value={formatPct(summary.average_spread_pct)} />
              <DetailField label="Avg. price deviation" value={formatPct(summary.average_execution_price_deviation_pct)} />
              <DetailField label="Avg. cycle time" value={summary.average_cycle_seconds ? `${formatNumber(summary.average_cycle_seconds, 0)}s` : "—"} />
              <DetailField label="Total estimated slippage" value={formatUsd(summary.total_estimated_slippage)} />
              <DetailField label="Qualifying volume" value={formatUsd(summary.qualifying_volume)} />
              <DetailField label="Total orders" value={String(summary.num_orders)} />
            </PanelBody>
          </Panel>
        </>
      )}
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
