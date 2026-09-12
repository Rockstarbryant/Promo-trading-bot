"use client";

import { useEffect, useState } from "react";
import { api, ApiClientError } from "@/lib/api-client";
import type { StrategyConfiguration, StrategyType } from "@/lib/types";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const STRATEGY_LABELS: Record<StrategyType, string> = {
  INTERVAL_ROUND_TRIP: "Interval round trip",
  LIQUIDITY_AWARE_ROUND_TRIP: "Liquidity-aware round trip",
  MULTI_PAIR_ROTATION: "Multi-pair rotation",
  LOWEST_EXECUTION_COST: "Lowest execution cost",
  VOLUME_TARGET_SCHEDULER: "Volume target scheduler",
};

export default function StrategiesPage() {
  const [configs, setConfigs] = useState<StrategyConfiguration[] | null>(null);
  const [types, setTypes] = useState<StrategyType[]>([]);

  async function refresh() {
    const [c, t] = await Promise.all([api.listStrategyConfigs(), api.listStrategyTypes()]);
    setConfigs(c);
    setTypes(t as StrategyType[]);
  }

  useEffect(() => { refresh(); }, []);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-ash-50">Strategies</h1>
        <p className="text-sm text-ash-400">Each strategy still passes every trade through risk and execution checks.</p>
      </div>

      <Panel>
        <PanelHeader><PanelTitle>Saved configurations</PanelTitle></PanelHeader>
        <PanelBody className="p-0">
          {configs === null ? (
            <div className="px-4 py-8 text-center text-sm text-ash-400">Loading…</div>
          ) : configs.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-ash-400">No strategy configurations yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-600 text-left text-xs text-ash-400">
                  <th className="px-4 py-2 font-normal">Name</th>
                  <th className="px-4 py-2 font-normal">Type</th>
                  <th className="px-4 py-2 font-normal">Pairs</th>
                  <th className="px-4 py-2 font-normal">Order size</th>
                </tr>
              </thead>
              <tbody>
                {configs.map((c) => (
                  <tr key={c.id} className="border-b border-ink-600/60 last:border-0">
                    <td className="px-4 py-3 text-ash-50">{c.name}</td>
                    <td className="px-4 py-3"><Badge>{STRATEGY_LABELS[c.strategy_type]}</Badge></td>
                    <td className="px-4 py-3 text-ash-400">
                      {Array.isArray(c.parameters.eligible_pairs) ? (c.parameters.eligible_pairs as string[]).join(", ") : "—"}
                    </td>
                    <td className="px-4 py-3 tabular text-ash-400">{String(c.parameters.order_size ?? "—")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </PanelBody>
      </Panel>

      <NewStrategyForm types={types} onCreated={refresh} />
    </div>
  );
}

function NewStrategyForm({ types, onCreated }: { types: StrategyType[]; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [strategyType, setStrategyType] = useState<StrategyType>("INTERVAL_ROUND_TRIP");
  const [eligiblePairs, setEligiblePairs] = useState("SOLUSDT");
  const [orderSize, setOrderSize] = useState("20");
  const [buyInterval, setBuyInterval] = useState("120");
  const [sellInterval, setSellInterval] = useState("120");
  const [maxSpread, setMaxSpread] = useState("0.15");
  const [maxSlippage, setMaxSlippage] = useState("0.15");
  const [minInterval, setMinInterval] = useState("60");
  const [maxInterval, setMaxInterval] = useState("600");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const needsRoundTripTiming = strategyType !== "VOLUME_TARGET_SCHEDULER";
  const needsQualityBounds = strategyType !== "INTERVAL_ROUND_TRIP";
  const needsPacingBounds = strategyType === "VOLUME_TARGET_SCHEDULER";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const parameters: Record<string, unknown> = {
        eligible_pairs: eligiblePairs.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean),
        order_size: orderSize,
      };
      if (needsRoundTripTiming) {
        parameters.buy_interval_seconds = Number(buyInterval);
        parameters.sell_interval_seconds = Number(sellInterval);
      }
      if (needsQualityBounds) {
        parameters.max_spread_pct = maxSpread;
        parameters.max_slippage_pct = maxSlippage;
      }
      if (needsPacingBounds) {
        parameters.min_interval_seconds = Number(minInterval);
        parameters.max_interval_seconds = Number(maxInterval);
      }
      if (strategyType === "LOWEST_EXECUTION_COST") {
        parameters.taker_fee_rate = "0.001";
      }

      await api.createStrategyConfig({ name, strategy_type: strategyType, parameters });
      setName("");
      onCreated();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not create strategy configuration");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Panel>
      <PanelHeader><PanelTitle>New strategy configuration</PanelTitle></PanelHeader>
      <PanelBody>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 md:max-w-lg">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. SOL/ETH interval farm" />
          </Field>

          <Field label="Strategy type">
            <Select value={strategyType} onChange={(e) => setStrategyType(e.target.value as StrategyType)}>
              {(types.length ? types : Object.keys(STRATEGY_LABELS) as StrategyType[]).map((t) => (
                <option key={t} value={t}>{STRATEGY_LABELS[t]}</option>
              ))}
            </Select>
          </Field>

          <Field label="Eligible pairs" hint="Comma-separated. Multi-pair rotation needs at least 2.">
            <Input value={eligiblePairs} onChange={(e) => setEligiblePairs(e.target.value)} required />
          </Field>

          <Field label="Order size (USDT)">
            <Input type="number" min="0" step="0.01" value={orderSize} onChange={(e) => setOrderSize(e.target.value)} required />
          </Field>

          {needsRoundTripTiming && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Buy interval (s)">
                <Input type="number" min="0" value={buyInterval} onChange={(e) => setBuyInterval(e.target.value)} />
              </Field>
              <Field label="Sell interval (s)">
                <Input type="number" min="0" value={sellInterval} onChange={(e) => setSellInterval(e.target.value)} />
              </Field>
            </div>
          )}

          {needsQualityBounds && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Max spread (%)">
                <Input type="number" min="0" step="0.01" value={maxSpread} onChange={(e) => setMaxSpread(e.target.value)} />
              </Field>
              <Field label="Max slippage (%)">
                <Input type="number" min="0" step="0.01" value={maxSlippage} onChange={(e) => setMaxSlippage(e.target.value)} />
              </Field>
            </div>
          )}

          {needsPacingBounds && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Min interval (s)">
                <Input type="number" min="0" value={minInterval} onChange={(e) => setMinInterval(e.target.value)} />
              </Field>
              <Field label="Max interval (s)">
                <Input type="number" min="0" value={maxInterval} onChange={(e) => setMaxInterval(e.target.value)} />
              </Field>
            </div>
          )}

          {error && <p className="text-sm text-market-down">{error}</p>}
          <Button type="submit" disabled={loading} className="self-start">
            {loading ? "Saving…" : "Save configuration"}
          </Button>
        </form>
      </PanelBody>
    </Panel>
  );
}
