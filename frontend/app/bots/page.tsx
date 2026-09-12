"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api-client";
import type { TradingBot } from "@/lib/types";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { Badge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/utils";
import { Plus } from "lucide-react";

export default function BotsPage() {
  const [bots, setBots] = useState<TradingBot[] | null>(null);

  useEffect(() => {
    api.listBots().then(setBots).catch(() => setBots([]));
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-ash-50">Bots</h1>
          <p className="text-sm text-ash-400">Each bot pairs one strategy with one promotion and one account.</p>
        </div>
        <Link href="/bots/new"><Button><Plus size={16} /> New bot</Button></Link>
      </div>

      <Panel>
        <PanelBody className="p-0">
          {bots === null ? (
            <div className="px-4 py-8 text-center text-sm text-ash-400">Loading…</div>
          ) : bots.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-ash-400">No bots yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-600 text-left text-xs text-ash-400">
                  <th className="px-4 py-2 font-normal">Name</th>
                  <th className="px-4 py-2 font-normal">Mode</th>
                  <th className="px-4 py-2 font-normal">Status</th>
                  <th className="px-4 py-2 font-normal">Max order size</th>
                  <th className="px-4 py-2 font-normal">Started</th>
                </tr>
              </thead>
              <tbody>
                {bots.map((bot) => (
                  <tr key={bot.id} className="border-b border-ink-600/60 last:border-0 hover:bg-ink-700/40">
                    <td className="px-4 py-3">
                      <Link href={`/bots/${bot.id}`} className="text-ash-50 hover:text-signal">{bot.name}</Link>
                    </td>
                    <td className="px-4 py-3"><Badge tone={bot.mode === "LIVE" ? "signal" : "muted"}>{bot.mode}</Badge></td>
                    <td className="px-4 py-3"><Badge tone={statusTone(bot.status)}>{bot.status}</Badge></td>
                    <td className="px-4 py-3 tabular text-ash-400">${bot.max_order_size}</td>
                    <td className="px-4 py-3 tabular text-ash-400">{formatDateTime(bot.started_at)}</td>
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
