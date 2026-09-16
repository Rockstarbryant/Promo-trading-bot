"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api-client";
import type { TradingBot } from "@/lib/types";
import { Panel, PanelBody } from "@/components/ui/panel";
import { Badge, statusTone } from "@/components/ui/badge";
import { formatDateTime, formatUsd } from "@/lib/utils";
import { Plus, Bot, Loader2, MonitorX } from "lucide-react";

export default function BotsPage() {
  const [bots, setBots] = useState<TradingBot[] | null>(null);

  useEffect(() => {
    api.listBots().then(setBots).catch(() => setBots([]));
  }, []);

  return (
    <div className="flex flex-col gap-6 bg-white min-h-screen p-4 md:p-8 font-sans">
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b-4 border-black pb-4 mb-4 gap-4">
        <div className="flex items-center gap-3">
          <Bot className="text-black" size={32} strokeWidth={2.5} />
          <div>
            <h1 className="text-2xl font-black text-black uppercase tracking-tight">Bots</h1>
            <p className="text-sm font-bold text-black mt-1 uppercase">Each bot pairs one strategy with one promotion and one account.</p>
          </div>
        </div>
        <Link href="/bots/new" className="shrink-0">
          <span className="inline-flex items-center justify-center w-full md:w-auto gap-2 border-2 border-black bg-yellow-400 px-5 py-2.5 text-sm font-black uppercase text-black hover:bg-yellow-300">
            <Plus size={20} strokeWidth={3} /> New bot
          </span>
        </Link>
      </div>

      <Panel className="border-4 border-black bg-white rounded-none">
        <PanelBody className="p-0">
          {bots === null ? (
            <div className="flex flex-col items-center justify-center gap-3 px-4 py-16 text-center text-black font-bold">
              <Loader2 size={40} strokeWidth={2.5} className="text-black animate-spin" />
              <span className="uppercase tracking-widest mt-2">Loading Systems...</span>
            </div>
          ) : bots.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 px-4 py-16 text-center text-black font-bold">
              <MonitorX size={40} strokeWidth={2.5} className="text-black" />
              <span className="uppercase tracking-widest mt-2">No bots yet.</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-4 border-black text-left text-xs text-black font-black uppercase bg-gray-100">
                    <th className="px-4 py-3 whitespace-nowrap">Name</th>
                    <th className="px-4 py-3 whitespace-nowrap">Promotion</th>
                    <th className="px-4 py-3 whitespace-nowrap">Strategy</th>
                    <th className="px-4 py-3 whitespace-nowrap">Pairs</th>
                    <th className="px-4 py-3 whitespace-nowrap">Mode</th>
                    <th className="px-4 py-3 whitespace-nowrap">Status</th>
                    <th className="px-4 py-3 whitespace-nowrap">Initial order size</th>
                    <th className="px-4 py-3 whitespace-nowrap">Started</th>
                  </tr>
                </thead>
                <tbody>
                  {bots.map((bot) => (
                    <tr key={bot.id} className="border-b-2 border-black last:border-0 hover:bg-yellow-200">
                      <td className="px-4 py-3">
                        <Link href={`/bots/${bot.id}`} className="text-black font-black hover:underline uppercase whitespace-nowrap">
                          {bot.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-black font-bold uppercase whitespace-nowrap">{bot.promotion_name ?? "—"}</td>
                      <td className="px-4 py-3 text-black font-bold uppercase whitespace-nowrap">{bot.strategy_name ?? "—"}</td>
                      <td className="px-4 py-3 text-black font-bold uppercase whitespace-nowrap">{(bot.eligible_pairs ?? []).join(", ") || "—"}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Badge tone={bot.mode === "LIVE" ? "signal" : "muted"} className="border-2 border-black rounded-none uppercase font-bold">
                          {bot.mode}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Badge tone={statusTone(bot.status)} className="border-2 border-black rounded-none uppercase font-bold">
                          {bot.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-black font-bold whitespace-nowrap">{formatUsd(bot.initial_order_size)}</td>
                      <td className="px-4 py-3 tabular-nums text-black font-bold whitespace-nowrap">{formatDateTime(bot.started_at)}</td>
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
