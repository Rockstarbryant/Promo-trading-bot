"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiClientError } from "@/lib/api-client";
import type { BinanceAccount, Promotion, StrategyConfiguration } from "@/lib/types";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { ShieldAlert } from "lucide-react";

export default function NewBotPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<BinanceAccount[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [strategies, setStrategies] = useState<StrategyConfiguration[]>([]);

  const [name, setName] = useState("");
  const [accountId, setAccountId] = useState("");
  const [promotionId, setPromotionId] = useState("");
  const [strategyId, setStrategyId] = useState("");
  const [mode, setMode] = useState<"PAPER" | "LIVE">("PAPER");

  const [maxCapital, setMaxCapital] = useState("100");
  const [maxOrderSize, setMaxOrderSize] = useState("20");
  const [maxDailyVolume, setMaxDailyVolume] = useState("2000");
  const [maxDailyLoss, setMaxDailyLoss] = useState("5");
  const [maxSpreadPct, setMaxSpreadPct] = useState("0.15");
  const [maxSlippagePct, setMaxSlippagePct] = useState("0.15");
  const [maxExposure, setMaxExposure] = useState("20");
  const [maxConsecutiveFailures, setMaxConsecutiveFailures] = useState("3");
  const [maxStaleOrderSeconds, setMaxStaleOrderSeconds] = useState("30");

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Promise.all([api.listAccounts(), api.listPromotions(), api.listStrategyConfigs()]).then(
      ([a, p, s]) => {
        setAccounts(a);
        setPromotions(p);
        setStrategies(s);
        setAccountId(a[0]?.id ?? "");
        setPromotionId(p[0]?.id ?? "");
        setStrategyId(s[0]?.id ?? "");
      }
    );
  }, []);

  const selectedStrategy = strategies.find((s) => s.id === strategyId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const bot = await api.createBot({
        name, mode,
        binance_account_id: accountId,
        promotion_id: promotionId,
        strategy_config_id: strategyId,
        max_capital: maxCapital,
        max_order_size: maxOrderSize,
        max_daily_volume: maxDailyVolume,
        max_daily_loss: maxDailyLoss,
        max_spread_pct: maxSpreadPct,
        max_slippage_pct: maxSlippagePct,
        max_exposure: maxExposure,
        max_consecutive_failures: Number(maxConsecutiveFailures),
        max_stale_order_seconds: Number(maxStaleOrderSeconds),
      });
      router.push(`/bots/${bot.id}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not create bot");
    } finally {
      setLoading(false);
    }
  }

  const missingDependencies = accounts.length === 0 || promotions.length === 0 || strategies.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-ash-50">New bot</h1>
        <p className="text-sm text-ash-400">Pairs one account, one promotion, and one strategy under its own risk limits.</p>
      </div>

      {missingDependencies && (
        <Panel className="border-signal/30 bg-signal/5">
          <PanelBody className="flex items-start gap-3">
            <ShieldAlert size={18} className="mt-0.5 shrink-0 text-signal" />
            <p className="text-sm text-ash-200">
              You need at least one connected account, one promotion, and one strategy configuration
              before creating a bot.
            </p>
          </PanelBody>
        </Panel>
      )}

      <Panel>
        <PanelHeader><PanelTitle>Configuration</PanelTitle></PanelHeader>
        <PanelBody>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 md:max-w-lg">
            <Field label="Name">
              <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. SOL interval bot" />
            </Field>

            <Field label="Binance account">
              <Select value={accountId} onChange={(e) => setAccountId(e.target.value)} required>
                <option value="" disabled>Select an account</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
              </Select>
            </Field>

            <Field label="Promotion">
              <Select value={promotionId} onChange={(e) => setPromotionId(e.target.value)} required>
                <option value="" disabled>Select a promotion</option>
                {promotions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>

            <Field
              label="Strategy configuration"
              hint={selectedStrategy ? `${selectedStrategy.description} Initial order size: ${selectedStrategy.parameters.order_size ?? "—"} USDT.` : undefined}
            >
              <Select value={strategyId} onChange={(e) => setStrategyId(e.target.value)} required>
                <option value="" disabled>Select a strategy</option>
                {strategies.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.bot_count} bot{s.bot_count === 1 ? "" : "s"} using it)
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Mode" hint="Start in PAPER. Live requires the deployment to allow it and the key to have no withdrawal permission.">
              <Select value={mode} onChange={(e) => setMode(e.target.value as "PAPER" | "LIVE")}>
                <option value="PAPER">Paper (simulated)</option>
                <option value="LIVE">Live (real orders)</option>
              </Select>
            </Field>

            <div className="border-t border-ink-600 pt-4">
              <h3 className="mb-3 text-sm font-medium text-ash-50">Risk limits</h3>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Max capital ($)"><Input type="number" min="0" step="0.01" value={maxCapital} onChange={(e) => setMaxCapital(e.target.value)} required /></Field>
                <Field label="Max order size ($)"><Input type="number" min="0" step="0.01" value={maxOrderSize} onChange={(e) => setMaxOrderSize(e.target.value)} required /></Field>
                <Field label="Max daily volume ($)"><Input type="number" min="0" step="0.01" value={maxDailyVolume} onChange={(e) => setMaxDailyVolume(e.target.value)} required /></Field>
                <Field label="Max daily loss ($)"><Input type="number" min="0" step="0.01" value={maxDailyLoss} onChange={(e) => setMaxDailyLoss(e.target.value)} required /></Field>
                <Field label="Max spread (%)"><Input type="number" min="0" step="0.01" value={maxSpreadPct} onChange={(e) => setMaxSpreadPct(e.target.value)} required /></Field>
                <Field label="Max slippage (%)"><Input type="number" min="0" step="0.01" value={maxSlippagePct} onChange={(e) => setMaxSlippagePct(e.target.value)} required /></Field>
                <Field label="Max exposure ($)"><Input type="number" min="0" step="0.01" value={maxExposure} onChange={(e) => setMaxExposure(e.target.value)} required /></Field>
                <Field label="Max consecutive failures"><Input type="number" min="1" value={maxConsecutiveFailures} onChange={(e) => setMaxConsecutiveFailures(e.target.value)} required /></Field>
                <Field label="Max stale order (s)"><Input type="number" min="1" value={maxStaleOrderSeconds} onChange={(e) => setMaxStaleOrderSeconds(e.target.value)} required /></Field>
              </div>
            </div>

            {error && <p className="text-sm text-market-down">{error}</p>}
            <Button type="submit" disabled={loading || missingDependencies} className="self-start">
              {loading ? "Creating…" : "Create bot"}
            </Button>
          </form>
        </PanelBody>
      </Panel>
    </div>
  );
}
