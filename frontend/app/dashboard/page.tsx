import Link from "next/link";
import { requireSession } from "@/lib/require-session";
import { serverApiFetch } from "@/lib/server-api";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { Badge, statusTone } from "@/components/ui/badge";
import { formatUsd, formatPct, formatDateTime, formatNumber } from "@/lib/utils";
import type { TradingBot, Promotion, PromotionProgress, BinanceAccount, AccountBalance, Order } from "@/lib/types";
import { Plus, LayoutDashboard, MonitorX, Timer, TerminalSquare, Search } from "lucide-react";

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
    <div className="flex flex-col gap-6 bg-white min-h-screen p-4 md:p-8 font-sans">
      <div className="flex items-center justify-between border-b-4 border-black pb-4 mb-4">
        <div className="flex items-center gap-3">
          <LayoutDashboard className="text-black" size={32} strokeWidth={2.5} />
          <div>
            <h1 className="text-2xl font-black text-black uppercase tracking-tight">Dashboard</h1>
            <p className="text-sm font-bold text-black mt-1">SYSTEM OVERVIEW</p>
          </div>
        </div>
        <Link href="/bots/new" className="hidden md:block">
          <span className="inline-flex items-center gap-2 border-2 border-black bg-yellow-400 px-5 py-2.5 text-sm font-black uppercase text-black hover:bg-yellow-300">
            <Plus size={20} strokeWidth={3} /> New Bot
          </span>
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="Binance balance"
          value={accounts.length === 0 ? "—" : anyBalancePriced ? formatUsd(totalUsdtBalance) : "—"}
          tone="signal"
        />
        <StatCard label="Bots running" value={String(runningBots)} />
        <StatCard label="Total bots" value={String(bots.length)} />
        <StatCard label="Live-mode bots" value={String(liveBots)} tone={liveBots > 0 ? "signal" : undefined} />
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Active promos" value={String(activePromotions.length)} />
        <StatCard label="Accounts" value={String(accounts.length)} />
        <StatCard label="Total promos" value={String(promotions.length)} />
        <StatCard label="Orders" value={String(recentOrders.length)} />
      </div>

      <Panel className="border-4 border-black bg-white rounded-none">
        <PanelHeader className="border-b-4 border-black px-4 py-3 flex justify-between items-center bg-cyan-300">
          <PanelTitle className="text-black font-black uppercase tracking-widest flex items-center gap-2"><TerminalSquare size={20} strokeWidth={2.5}/> Bots Registry</PanelTitle>
          <Link href="/bots" className="text-xs font-black uppercase text-black border-b-2 border-black hover:bg-black hover:text-white px-1">View All</Link>
        </PanelHeader>
        <PanelBody className="p-0">
          {bots.length === 0 ? (
            <EmptyRow message="No bots initiated. Start your engine." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-4 border-black text-left text-xs text-black font-black uppercase bg-gray-100">
                  <th className="px-4 py-3">Identifier</th>
                  <th className="px-4 py-3">Protocol</th>
                  <th className="px-4 py-3">Mode</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Boot Time</th>
                </tr>
              </thead>
              <tbody>
                {bots.slice(0, 6).map((bot) => (
                  <tr key={bot.id} className="border-b-2 border-black last:border-0 hover:bg-yellow-200">
                    <td className="px-4 py-3">
                      <Link href={`/bots/${bot.id}`} className="text-black font-black hover:underline">{bot.name}</Link>
                    </td>
                    <td className="px-4 py-3 text-black font-semibold">{bot.strategy_name ?? "N/A"}</td>
                    <td className="px-4 py-3">
                      <Badge tone={bot.mode === "LIVE" ? "signal" : "muted"} className="border-2 border-black rounded-none uppercase font-bold">{bot.mode}</Badge>
                    </td>
                    <td className="px-4 py-3"><Badge tone={statusTone(bot.status)} className="border-2 border-black rounded-none uppercase font-bold">{bot.status}</Badge></td>
                    <td className="px-4 py-3 tabular-nums text-black font-bold">{formatDateTime(bot.started_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </PanelBody>
      </Panel>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel className="border-4 border-black bg-white rounded-none">
          <PanelHeader className="border-b-4 border-black px-4 py-3 flex justify-between items-center bg-pink-300">
            <PanelTitle className="text-black font-black uppercase tracking-widest">Active Promotions</PanelTitle>
            <Link href="/promotions" className="text-xs font-black uppercase text-black border-b-2 border-black hover:bg-black hover:text-white px-1">View All</Link>
          </PanelHeader>
          <PanelBody className="p-0">
            {activePromotions.length === 0 ? (
              <EmptyRow message="Zero active promotions detected." />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-4 border-black text-left text-xs text-black font-black uppercase bg-gray-100">
                    <th className="px-4 py-3">Campaign</th>
                    <th className="px-4 py-3">Volume</th>
                    <th className="px-4 py-3">Completion</th>
                  </tr>
                </thead>
                <tbody>
                  {activePromotions.map((p) => {
                    const progress = progressByPromotion.get(p.id);
                    return (
                      <tr key={p.id} className="border-b-2 border-black last:border-0 hover:bg-yellow-200">
                        <td className="px-4 py-3">
                          <Link href={`/promotions/${p.id}`} className="text-black font-black hover:underline">{p.name}</Link>
                        </td>
                        <td className="px-4 py-3 tabular-nums text-black font-bold">{formatUsd(progress?.qualifying_volume)}</td>
                        <td className="px-4 py-3 tabular-nums text-black font-bold">{formatPct(progress?.progress_pct)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </PanelBody>
        </Panel>

        <Panel className="border-4 border-black bg-white rounded-none">
          <PanelHeader className="border-b-4 border-black px-4 py-3 bg-green-300">
            <PanelTitle className="text-black font-black uppercase tracking-widest flex items-center gap-2"><Timer size={20} strokeWidth={2.5}/> Deadlines</PanelTitle>
          </PanelHeader>
          <PanelBody className="p-0">
            {promotionsEndingSoon.length === 0 ? (
              <EmptyRow message="No immediate deadlines." />
            ) : (
              <div className="flex flex-col">
                {promotionsEndingSoon.map((p) => (
                  <Link key={p.id} href={`/promotions/${p.id}`} className="flex items-center justify-between px-4 py-4 border-b-2 border-black last:border-0 hover:bg-yellow-200">
                    <span className="text-black font-black uppercase">{p.name}</span>
                    <span className="tabular-nums text-sm text-white bg-black px-2 py-1 font-bold">{formatDateTime(p.end_time)}</span>
                  </Link>
                ))}
              </div>
            )}
          </PanelBody>
        </Panel>
      </div>

      <Panel className="border-4 border-black bg-white rounded-none">
        <PanelHeader className="border-b-4 border-black px-4 py-3 flex justify-between items-center bg-purple-300">
          <PanelTitle className="text-black font-black uppercase tracking-widest flex items-center gap-2"><Search size={20} strokeWidth={2.5}/> Transaction Log</PanelTitle>
          <Link href="/bots" className="text-xs font-black uppercase text-black border-b-2 border-black hover:bg-black hover:text-white px-1">Check DB</Link>
        </PanelHeader>
        <PanelBody className="p-0">
          {recentOrders.length === 0 ? (
            <EmptyRow message="Transaction log empty." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-4 border-black text-left text-xs text-black font-black uppercase bg-gray-100">
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Asset</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Qty</th>
                  <th className="px-4 py-3">Capital</th>
                  <th className="px-4 py-3">State</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((o) => (
                  <tr key={o.id} className="border-b-2 border-black last:border-0 hover:bg-yellow-200">
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-black font-bold">{formatDateTime(o.created_at)}</td>
                    <td className="px-4 py-3 text-black font-black uppercase">{o.symbol}</td>
                    <td className="px-4 py-3"><Badge tone={o.side === "BUY" ? "up" : "down"} className="border-2 border-black rounded-none uppercase font-bold">{o.side}</Badge></td>
                    <td className="px-4 py-3 tabular-nums text-black font-bold">{formatNumber(o.executed_quantity, 6)}</td>
                    <td className="px-4 py-3 tabular-nums text-black font-bold">{formatUsd(o.cumulative_quote_quantity)}</td>
                    <td className="px-4 py-3"><Badge tone={statusTone(o.status)} className="border-2 border-black rounded-none uppercase font-bold">{o.status}</Badge></td>
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
    <div className={`border-2 border-black px-4 py-4 ${tone === "signal" ? "bg-yellow-100" : "bg-white"}`}>
      <div className="text-xs font-black uppercase text-black tracking-widest">{label}</div>
      <div className="mt-2 text-3xl font-black tabular-nums text-black">
        {value}
      </div>
    </div>
  );
}

function EmptyRow({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center text-black font-bold">
      <MonitorX size={40} strokeWidth={2.5} className="text-black" />
      <span className="uppercase">{message}</span>
    </div>
  );
}
