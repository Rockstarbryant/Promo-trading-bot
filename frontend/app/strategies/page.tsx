"use client";

import { useEffect, useState } from "react";
import { api, ApiClientError } from "@/lib/api-client";
import type { StrategyConfiguration, StrategyType, StrategyTypeInfo } from "@/lib/types";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, Bot as BotIcon, Sliders, Settings2, AlertOctagon, ServerCrash } from "lucide-react";

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
    <div className="flex flex-col gap-8 font-sans">
      <div className="flex items-center gap-4 border-b-4 border-black pb-4">
        <Sliders className="text-black" size={32} strokeWidth={2.5} />
        <div>
          <h1 className="text-3xl font-black text-black uppercase tracking-tight">Strategies</h1>
          <p className="text-sm font-bold text-black mt-1 uppercase bg-yellow-200 inline-block px-2 border-2 border-black">
            Risk & execution bounds applied to every trade.
          </p>
        </div>
      </div>

      <Panel className="border-4 border-black bg-white rounded-none shadow-[4px_4px_0px_rgba(0,0,0,1)]">
        <PanelHeader className="border-b-4 border-black px-5 py-4 bg-cyan-300">
          <PanelTitle className="text-black font-black uppercase tracking-widest flex items-center gap-2">
            <Settings2 size={20} strokeWidth={2.5} /> Saved Configurations
          </PanelTitle>
        </PanelHeader>
        <PanelBody className="p-0">
          {listError && (
            <div className="border-b-4 border-black bg-red-400 px-5 py-3 flex items-center gap-2 text-sm font-black text-black uppercase">
              <AlertOctagon size={18} strokeWidth={2.5} /> {listError}
            </div>
          )}
          {configs === null ? (
            <div className="px-5 py-16 text-center text-lg font-black uppercase text-black animate-pulse bg-gray-50">
              Loading Parameters...
            </div>
          ) : configs.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-5 py-16 text-center bg-gray-50">
              <ServerCrash size={48} strokeWidth={2} className="text-black mb-4"/>
              <div className="text-lg font-black uppercase text-black">No Configurations Found.</div>
              <div className="text-sm font-bold text-gray-500 mt-2 uppercase">Create a new strategy below.</div>
            </div>
          ) : (
            <div className="flex flex-col divide-y-4 divide-black">
              {configs.map((c) =>
                editingId === c.id ? (
                  <div key={c.id} className="p-5 bg-yellow-200 transition-none">
                    <div className="mb-4 text-sm font-black text-black uppercase tracking-widest border-b-2 border-black pb-2 inline-block">
                      Editing: {c.name}
                    </div>
                    <EditStrategyForm
                      config={c}
                      onDone={async () => { setEditingId(null); await refresh(); }}
                      onCancel={() => setEditingId(null)}
                    />
                  </div>
                ) : (
                  <div key={c.id} className="flex flex-col gap-4 p-5 bg-white hover:bg-gray-100 transition-none">
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="text-xl font-black text-black uppercase">{c.name}</span>
                          <Badge tone="neutral" className="bg-white border-2 border-black text-black font-black shadow-[2px_2px_0px_rgba(0,0,0,1)] uppercase">
                            {typeInfo(c.strategy_type)?.label ?? c.strategy_type.replaceAll("_", " ")}
                          </Badge>
                        </div>
                        <p className="mt-2 text-sm font-bold text-gray-600 uppercase max-w-2xl leading-relaxed">
                          {c.description || "No description provided."}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button variant="secondary" onClick={() => setEditingId(c.id)}>
                          <Pencil size={16} strokeWidth={2.5} /> Edit
                        </Button>
                        <Button variant="danger" onClick={() => handleDelete(c)}>
                          <Trash2 size={16} strokeWidth={2.5} /> Delete
                        </Button>
                      </div>
                    </div>
                    
                    {/* Parameters summary block */}
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 p-3 bg-gray-50 border-2 border-black">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black uppercase text-gray-500 tracking-widest">Pairs</span>
                        <span className="text-sm font-bold text-black uppercase">
                          {Array.isArray(c.parameters.eligible_pairs) ? (c.parameters.eligible_pairs as string[]).join(", ") : "—"}
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black uppercase text-gray-500 tracking-widest">Order Size</span>
                        <span className="text-sm font-bold text-black tabular-nums uppercase">
                          {String(c.parameters.order_size ?? "—")} USDT
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black uppercase text-gray-500 tracking-widest">Usage</span>
                        <span className="inline-flex items-center gap-1.5 text-sm font-black text-black uppercase">
                          <BotIcon size={16} strokeWidth={2.5} />
                          {c.bot_count} bot{c.bot_count === 1 ? "" : "s"}
                        </span>
                      </div>
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-5 md:max-w-2xl bg-white p-5 border-4 border-black shadow-[4px_4px_0px_rgba(0,0,0,1)]">
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
        <div className="grid grid-cols-2 gap-4 border-l-4 border-black pl-4">
          <Field label="Buy interval (s)">
            <Input type="number" min="0" value={buyInterval} onChange={(e) => setBuyInterval(e.target.value)} />
          </Field>
          <Field label="Sell interval (s)">
            <Input type="number" min="0" value={sellInterval} onChange={(e) => setSellInterval(e.target.value)} />
          </Field>
        </div>
      )}
      {needsQualityBounds && (
        <div className="grid grid-cols-2 gap-4 border-l-4 border-black pl-4">
          <Field label="Max spread (%)">
            <Input type="number" min="0" step="0.01" value={maxSpread} onChange={(e) => setMaxSpread(e.target.value)} />
          </Field>
          <Field label="Max slippage (%)">
            <Input type="number" min="0" step="0.01" value={maxSlippage} onChange={(e) => setMaxSlippage(e.target.value)} />
          </Field>
        </div>
      )}
      {needsPacingBounds && (
        <div className="grid grid-cols-2 gap-4 border-l-4 border-black pl-4">
          <Field label="Min interval (s)">
            <Input type="number" min="0" value={minInterval} onChange={(e) => setMinInterval(e.target.value)} />
          </Field>
          <Field label="Max interval (s)">
            <Input type="number" min="0" value={maxInterval} onChange={(e) => setMaxInterval(e.target.value)} />
          </Field>
        </div>
      )}
      {error && <p className="text-sm font-black uppercase text-red-600 bg-red-100 p-2 border-2 border-red-600">{error}</p>}
      <div className="flex gap-3 pt-2">
        <Button type="submit" variant="primary" disabled={loading}>{loading ? "Saving…" : "Save Changes"}</Button>
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
    <Panel className="border-4 border-black bg-white shadow-[4px_4px_0px_rgba(0,0,0,1)]">
      <PanelHeader className="border-b-4 border-black bg-green-400 px-5 py-4">
        <PanelTitle className="text-black font-black uppercase tracking-widest flex items-center gap-2">
          New Strategy Configuration
        </PanelTitle>
      </PanelHeader>
      <PanelBody className="bg-gray-50 p-5">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5 md:max-w-2xl">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. SOL/ETH interval farm" />
          </Field>

          <Field label="Strategy Type" hint={selectedInfo?.description}>
            <Select value={strategyType} onChange={(e) => setStrategyType(e.target.value as StrategyType)}>
              {(types.length ? types : []).map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </Select>
          </Field>

          <Field label="Eligible Pairs" hint="Comma-separated. Multi-pair rotation needs at least 2.">
            <Input value={eligiblePairs} onChange={(e) => setEligiblePairs(e.target.value)} required />
          </Field>

          <Field label="Order Size (USDT)">
            <Input type="number" min="0" step="0.01" value={orderSize} onChange={(e) => setOrderSize(e.target.value)} required />
          </Field>

          {needsRoundTripTiming && (
            <div className="grid grid-cols-2 gap-4 border-l-4 border-black pl-4 bg-white p-3 shadow-[2px_2px_0px_rgba(0,0,0,1)]">
              <Field label="Buy Interval (s)">
                <Input type="number" min="0" value={buyInterval} onChange={(e) => setBuyInterval(e.target.value)} />
              </Field>
              <Field label="Sell Interval (s)">
                <Input type="number" min="0" value={sellInterval} onChange={(e) => setSellInterval(e.target.value)} />
              </Field>
            </div>
          )}

          {needsQualityBounds && (
            <div className="grid grid-cols-2 gap-4 border-l-4 border-black pl-4 bg-white p-3 shadow-[2px_2px_0px_rgba(0,0,0,1)]">
              <Field label="Max Spread (%)">
                <Input type="number" min="0" step="0.01" value={maxSpread} onChange={(e) => setMaxSpread(e.target.value)} />
              </Field>
              <Field label="Max Slippage (%)">
                <Input type="number" min="0" step="0.01" value={maxSlippage} onChange={(e) => setMaxSlippage(e.target.value)} />
              </Field>
            </div>
          )}

          {needsPacingBounds && (
            <div className="grid grid-cols-2 gap-4 border-l-4 border-black pl-4 bg-white p-3 shadow-[2px_2px_0px_rgba(0,0,0,1)]">
              <Field label="Min Interval (s)">
                <Input type="number" min="0" value={minInterval} onChange={(e) => setMinInterval(e.target.value)} />
              </Field>
              <Field label="Max Interval (s)">
                <Input type="number" min="0" value={maxInterval} onChange={(e) => setMaxInterval(e.target.value)} />
              </Field>
            </div>
          )}

          {error && <p className="text-sm font-black uppercase text-red-600 bg-red-100 p-3 border-2 border-red-600">{error}</p>}
          <Button type="submit" variant="primary" disabled={loading} className="self-start mt-2">
            {loading ? "Saving…" : "Save Configuration"}
          </Button>
        </form>
      </PanelBody>
    </Panel>
  );
}
