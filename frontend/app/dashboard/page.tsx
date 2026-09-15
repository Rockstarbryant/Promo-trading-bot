import Link from "next/link";
import { requireSession } from "@/lib/require-session";
import { serverApiFetch } from "@/lib/server-api";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { Badge, statusTone } from "@/components/ui/badge";
import { formatUsd, formatPct, formatDateTime, formatNumber } from "@/lib/utils";
import type { TradingBot, Promotion, PromotionProgress, BinanceAccount, AccountBalance, Order } from "@/lib/types";
import { Plus } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  await requireSession();

  const [bots, promotions, accounts, recentOrders] = await Promise.all([
    serverApiFetch<TradingBot[]>("/bots").catch(() => [] as TradingBot[]),
    serverApiFetch<Promotion[]>("/promotions").catch(() => [] as Promotion[]),
    serverApiFetch<BinanceAccount[]>("/accounts").catch(() => [] as BinanceAccount[]),
    serverApiFetch<Order[]>("/orders?limit=8").catch(() => [] as Order[]),
  ]);

  const activePromotions = promotions.filter((p) => p.status === "ACTIVE");
  const progressByPromotion = new Map<string, PromotionProgress>();
  await Promise.all(
    activePromotions.map(async (p) => {
      try {
        progressByPromotion.set(p.id, await serverApiFetch<PromotionProgress>(`/promotions/${p.id}/progress`));
      } catch {
        // promotion may have no fills yet; leave unset
      }
    })
  );

  // Real Binance spot balance in USDT, aggregated across every connected
  // account — one failed/unverified account doesn't zero out the total.
  const accountBalances = await Promise.all(
    accounts.map((a) =>
      serverApiFetch<AccountBalance>(`/accounts/${a.id}/balance`).catch(
        () => ({ account_id: a.id, label: a.label, balances: [], total_usdt_value: null, error: "unavailable" } as AccountBalance)
      )
    )
  );
  const totalUsdtBalance = accountBalances.reduce(
    (sum, b) => (b.total_usdt_value != null ? sum + parseFloat(b.total_usdt_value) : sum),
    0
  );
  const anyBalancePriced = accountBalances.some((b) => b.total_usdt_value != null);

  const runningBots = bots.filter((b) => b.status === "RUNNING").length;
  const liveBots = bots.filter((b) => b.mode === "LIVE").length;

  const promotionsEndingSoon = [...activePromotions]
    .sort((a, b) => new Date(a.end_time).getTime() - new Date(b.end_time).getTime())
    .slice(0, 3);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-ash-50">Dashboard</h1>
          <p className="text-sm text-ash-400">Everything running right now, at a glance.</p>
        </div>
        <Link href="/bots/new" className="hidden md:block">
          <span className="inline-flex items-center gap-2 rounded bg-signal px-3.5 py-2 text-sm font-medium text-ink-950">
            <Plus size={16} /> New bot
          </span>
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Binance balance"
          value={accounts.length === 0 ? "—" : anyBalancePriced ? formatUsd(totalUsdtBalance) : "—"}
          tone="signal"
        />
        <StatCard label="Bots running" value={String(runningBots)} />
        <StatCard label="Total bots" value={String(bots.length)} />
        <StatCard label="Live-mode bots" value={String(liveBots)} tone={liveBots > 0 ? "signal" : undefined} />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Active promotions" value={String(activePromotions.length)} />
        <StatCard label="Connected accounts" value={String(accounts.length)} />
        <StatCard label="Total promotions" value={String(promotions.length)} />
        <StatCard label="Orders (recent)" value={String(recentOrders.length)} />
      </div>

      <Panel>
        <PanelHeader>
          <PanelTitle>Bots</PanelTitle>
          <Link href="/bots" className="text-xs text-signal">View all</Link>
        </PanelHeader>
        <PanelBody className="p-0">
          {bots.length === 0 ? (
            <EmptyRow message="No bots yet. Connect an account and create your first bot in paper mode." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-600 text-left text-xs text-ash-400">
                  <th className="px-4 py-2 font-normal">Bot</th>
                  <th className="px-4 py-2 font-normal">Strategy</th>
                  <th className="px-4 py-2 font-normal">Mode</th>
                  <th className="px-4 py-2 font-normal">Status</th>
                  <th className="px-4 py-2 font-normal">Started</th>
                </tr>
              </thead>
              <tbody>
                {bots.slice(0, 6).map((bot) => (
                  <tr key={bot.id} className="border-b border-ink-600/60 last:border-0 hover:bg-ink-700/40">
                    <td className="px-4 py-3">
                      <Link href={`/bots/${bot.id}`} className="text-ash-50 hover:text-signal">{bot.name}</Link>
                    </td>
                    <td className="px-4 py-3 text-ash-400">{bot.strategy_name ?? "—"}</td>
                    <td className="px-4 py-3">
                      <Badge tone={bot.mode === "LIVE" ? "signal" : "muted"}>{bot.mode}</Badge>
                    </td>
                    <td className="px-4 py-3"><Badge tone={statusTone(bot.status)}>{bot.status}</Badge></td>
                    <td className="px-4 py-3 tabular text-ash-400">{formatDateTime(bot.started_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </PanelBody>
      </Panel>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel>
          <PanelHeader>
            <PanelTitle>Active promotions</PanelTitle>
            <Link href="/promotions" className="text-xs text-signal">View all</Link>
          </PanelHeader>
          <PanelBody className="p-0">
            {activePromotions.length === 0 ? (
              <EmptyRow message="No active promotions. Create one and activate it to start tracking progress." />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-600 text-left text-xs text-ash-400">
                    <th className="px-4 py-2 font-normal">Promotion</th>
                    <th className="px-4 py-2 font-normal">Qualifying volume</th>
                    <th className="px-4 py-2 font-normal">Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {activePromotions.map((p) => {
                    const progress = progressByPromotion.get(p.id);
                    return (
                      <tr key={p.id} className="border-b border-ink-600/60 last:border-0 hover:bg-ink-700/40">
                        <td className="px-4 py-3">
                          <Link href={`/promotions/${p.id}`} className="text-ash-50 hover:text-signal">{p.name}</Link>
                        </td>
                        <td className="px-4 py-3 tabular">{formatUsd(progress?.qualifying_volume)}</td>
                        <td className="px-4 py-3 tabular">{formatPct(progress?.progress_pct)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader><PanelTitle>Ending soon</PanelTitle></PanelHeader>
          <PanelBody className="p-0">
            {promotionsEndingSoon.length === 0 ? (
              <EmptyRow message="No active promotions with a deadline." />
            ) : (
              <div className="flex flex-col divide-y divide-ink-600/60">
                {promotionsEndingSoon.map((p) => (
                  <Link key={p.id} href={`/promotions/${p.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-ink-700/40">
                    <span className="text-ash-50">{p.name}</span>
                    <span className="tabular text-xs text-ash-400">{formatDateTime(p.end_time)}</span>
                  </Link>
                ))}
              </div>
            )}
          </PanelBody>
        </Panel>
      </div>

      <Panel>
        <PanelHeader>
          <PanelTitle>Recent orders</PanelTitle>
          <Link href="/bots" className="text-xs text-signal">View bots</Link>
        </PanelHeader>
        <PanelBody className="p-0">
          {recentOrders.length === 0 ? (
            <EmptyRow message="No orders placed yet." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-600 text-left text-xs text-ash-400">
                  <th className="px-4 py-2 font-normal">Time</th>
                  <th className="px-4 py-2 font-normal">Pair</th>
                  <th className="px-4 py-2 font-normal">Side</th>
                  <th className="px-4 py-2 font-normal">Quantity</th>
                  <th className="px-4 py-2 font-normal">Value</th>
                  <th className="px-4 py-2 font-normal">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((o) => (
                  <tr key={o.id} className="border-b border-ink-600/60 last:border-0">
                    <td className="whitespace-nowrap px-4 py-2.5 tabular text-ash-400">{formatDateTime(o.created_at)}</td>
                    <td className="px-4 py-2.5 text-ash-50">{o.symbol}</td>
                    <td className="px-4 py-2.5"><Badge tone={o.side === "BUY" ? "up" : "down"}>{o.side}</Badge></td>
                    <td className="px-4 py-2.5 tabular">{formatNumber(o.executed_quantity, 6)}</td>
                    <td className="px-4 py-2.5 tabular">{formatUsd(o.cumulative_quote_quantity)}</td>
                    <td className="px-4 py-2.5"><Badge tone={statusTone(o.status)}>{o.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </PanelBody>
      </Panel>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "signal" }) {
  return (
    <Panel className="px-4 py-3">
      <div className="text-xs text-ash-400">{label}</div>
      <div className={`mt-1 text-2xl font-medium tabular ${tone === "signal" ? "text-signal" : "text-ash-50"}`}>
        {value}
      </div>
    </Panel>
  );
}

function EmptyRow({ message }: { message: string }) {
  return <div className="px-4 py-8 text-center text-sm text-ash-400">{message}</div>;
}
