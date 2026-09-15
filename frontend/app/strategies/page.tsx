"use client";

import { useEffect, useState } from "react";
import { api, ApiClientError } from "@/lib/api-client";
import type { StrategyConfiguration, StrategyType, StrategyTypeInfo } from "@/lib/types";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, Bot as BotIcon } from "lucide-react";

export default function StrategiesPage() {
  const [configs, setConfigs] = useState<StrategyConfiguration[] | null>(null);
  const [types, setTypes] = useState<StrategyTypeInfo[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  async function refresh() {
    const [c, t] = await Promise.all([api.listStrategyConfigs(), api.listStrategyTypes()]);
    setConfigs(c);
    setTypes(t);
  }

  useEffect(() => { refresh(); }, []);

  function typeInfo(t: StrategyType): StrategyTypeInfo | undefined {
    return types.find((x) => x.value === t);
  }

  async function handleDelete(config: StrategyConfiguration) {
    if (config.bot_count > 0) {
      alert(`This strategy is used by ${config.bot_count} bot(s). Delete or reassign them first.`);
      return;
    }
    if (!confirm(`Delete strategy "${config.name}"? This cannot be undone.`)) return;
    setListError(null);
    try {
      await api.deleteStrategyConfig(config.id);
      await refresh();
    } catch (err) {
      setListError(err instanceof ApiClientError ? err.message : "Could not delete strategy");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-ash-50">Strategies</h1>
        <p className="text-sm text-ash-400">Each strategy still passes every trade through risk and execution checks.</p>
      </div>

      <Panel>
        <PanelHeader><PanelTitle>Saved configurations</PanelTitle></PanelHeader>
        <PanelBody className="p-0">
          {listError && <p className="px-4 py-3 text-sm text-market-down">{listError}</p>}
          {configs === null ? (
            <div className="px-4 py-8 text-center text-sm text-ash-400">Loading…</div>
          ) : configs.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-ash-400">No strategy configurations yet.</div>
          ) : (
            <div className="flex flex-col divide-y divide-ink-600/60">
              {configs.map((c) =>
                editingId === c.id ? (
                  <div key={c.id} className="p-4">
                    <EditStrategyForm
                      config={c}
                      onDone={async () => { setEditingId(null); await refresh(); }}
                      onCancel={() => setEditingId(null)}
                    />
                  </div>
                ) : (
                  <div key={c.id} className="flex flex-col gap-2 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-ash-50">{c.name}</span>
                          <Badge>{typeInfo(c.strategy_type)?.label ?? c.strategy_type.replaceAll("_", " ")}</Badge>
                        </div>
                        <p className="mt-1 max-w-2xl text-sm text-ash-400">{c.description}</p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button variant="secondary" onClick={() => setEditingId(c.id)}>
                          <Pencil size={14} /> Edit
                        </Button>
                        <Button variant="danger" onClick={() => handleDelete(c)}>
                          <Trash2 size={14} /> Delete
                        </Button>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-ash-400">
                      <span>
                        Pairs:{" "}
                        <span className="text-ash-200">
                          {Array.isArray(c.parameters.eligible_pairs) ? (c.parameters.eligible_pairs as string[]).join(", ") : "—"}
                        </span>
                      </span>
                      <span>
                        Order size: <span className="tabular text-ash-200">{String(c.parameters.order_size ?? "—")} USDT</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <BotIcon size={13} />
                        {c.bot_count} bot{c.bot_count === 1 ? "" : "s"} using this
                      </span>
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </PanelBody>
      </Panel>

      <NewStrategyForm types={types} onCreated={refresh} />
    </div>
  );
}

function parametersForm(strategyType: StrategyType, params: Record<string, unknown>) {
  return {
    eligiblePairs: Array.isArray(params.eligible_pairs) ? (params.eligible_pairs as string[]).join(", ") : "",
    orderSize: String(params.order_size ?? ""),
    buyInterval: String(params.buy_interval_seconds ?? "120"),
    sellInterval: String(params.sell_interval_seconds ?? "120"),
    maxSpread: String(params.max_spread_pct ?? "0.15"),
    maxSlippage: String(params.max_slippage_pct ?? "0.15"),
    minInterval: String(params.min_interval_seconds ?? "60"),
    maxInterval: String(params.max_interval_seconds ?? "600"),
  };
}

function EditStrategyForm({
  config, onDone, onCancel,
}: { config: StrategyConfiguration; onDone: () => void; onCancel: () => void }) {
  const strategyType = config.strategy_type;
  const initial = parametersForm(strategyType, config.parameters);

  const [name, setName] = useState(config.name);
  const [eligiblePairs, setEligiblePairs] = useState(initial.eligiblePairs);
  const [orderSize, setOrderSize] = useState(initial.orderSize);
  const [buyInterval, setBuyInterval] = useState(initial.buyInterval);
  const [sellInterval, setSellInterval] = useState(initial.sellInterval);
  const [maxSpread, setMaxSpread] = useState(initial.maxSpread);
  const [maxSlippage, setMaxSlippage] = useState(initial.maxSlippage);
  const [minInterval, setMinInterval] = useState(initial.minInterval);
  const [maxInterval, setMaxInterval] = useState(initial.maxInterval);
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
        ...config.parameters,
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
      await api.updateStrategyConfig(config.id, { name, parameters });
      onDone();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not save strategy configuration");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 md:max-w-lg">
      <Field label="Name">
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
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
      <div className="flex gap-2">
        <Button type="submit" disabled={loading}>{loading ? "Saving…" : "Save changes"}</Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={loading}>Cancel</Button>
      </div>
    </form>
  );
}

function NewStrategyForm({ types, onCreated }: { types: StrategyTypeInfo[]; onCreated: () => void }) {
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
  const selectedInfo = types.find((t) => t.value === strategyType);

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

          <Field label="Strategy type" hint={selectedInfo?.description}>
            <Select value={strategyType} onChange={(e) => setStrategyType(e.target.value as StrategyType)}>
              {(types.length ? types : []).map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
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
