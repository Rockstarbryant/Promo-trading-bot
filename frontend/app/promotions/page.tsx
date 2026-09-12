"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api-client";
import type { Promotion } from "@/lib/types";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { Badge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatUsd, formatDateTime } from "@/lib/utils";
import { Plus } from "lucide-react";

export default function PromotionsPage() {
  const [promotions, setPromotions] = useState<Promotion[] | null>(null);

  useEffect(() => {
    api.listPromotions().then(setPromotions).catch(() => setPromotions([]));
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-ash-50">Promotions</h1>
          <p className="text-sm text-ash-400">Configured to match each promotion&apos;s official terms.</p>
        </div>
        <Link href="/promotions/new">
          <Button><Plus size={16} /> New promotion</Button>
        </Link>
      </div>

      <Panel>
        <PanelHeader><PanelTitle>All promotions</PanelTitle></PanelHeader>
        <PanelBody className="p-0">
          {promotions === null ? (
            <div className="px-4 py-8 text-center text-sm text-ash-400">Loading…</div>
          ) : promotions.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-ash-400">
              No promotions yet. Read the official rules first, then create one to match.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-600 text-left text-xs text-ash-400">
                  <th className="px-4 py-2 font-normal">Name</th>
                  <th className="px-4 py-2 font-normal">Type</th>
                  <th className="px-4 py-2 font-normal">Status</th>
                  <th className="px-4 py-2 font-normal">Target</th>
                  <th className="px-4 py-2 font-normal">Ends</th>
                </tr>
              </thead>
              <tbody>
                {promotions.map((p) => (
                  <tr key={p.id} className="border-b border-ink-600/60 last:border-0 hover:bg-ink-700/40">
                    <td className="px-4 py-3">
                      <Link href={`/promotions/${p.id}`} className="text-ash-50 hover:text-signal">{p.name}</Link>
                    </td>
                    <td className="px-4 py-3 text-ash-400">{p.promotion_type.replaceAll("_", " ")}</td>
                    <td className="px-4 py-3"><Badge tone={statusTone(p.status)}>{p.status}</Badge></td>
                    <td className="px-4 py-3 tabular text-ash-400">{formatUsd(p.target_volume)}</td>
                    <td className="px-4 py-3 tabular text-ash-400">{formatDateTime(p.end_time)}</td>
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
