"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api-client";
import type { Promotion } from "@/lib/types";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { Badge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatUsd, formatDateTime } from "@/lib/utils";
import { Plus, Bot as BotIcon, Trophy, ServerCrash } from "lucide-react";

export default function PromotionsPage() {
  const [promotions, setPromotions] = useState<Promotion[] | null>(null);

  useEffect(() => {
    api.listPromotions().then(setPromotions).catch(() => setPromotions([]));
  }, []);

  return (
    <div className="flex flex-col gap-8 font-sans">
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b-4 border-black pb-4 gap-4">
        <div className="flex items-center gap-3">
          <Trophy className="text-black" size={32} strokeWidth={2.5} />
          <div>
            <h1 className="text-2xl font-black text-black uppercase tracking-tight">Promotions</h1>
            <p className="text-sm font-bold text-black mt-1 uppercase">Configured to match official campaign terms.</p>
          </div>
        </div>
        <Link href="/promotions/new" className="shrink-0">
          <Button className="w-full md:w-auto bg-green-400"><Plus size={20} strokeWidth={3} /> New Campaign</Button>
        </Link>
      </div>

      <Panel>
        <PanelHeader className="bg-pink-300"><PanelTitle>Campaign Registry</PanelTitle></PanelHeader>
        <PanelBody className="p-0 bg-gray-50">
          {promotions === null ? (
            <div className="px-5 py-16 text-center text-lg font-black uppercase text-black animate-pulse">Loading Campaigns...</div>
          ) : promotions.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-5 py-16 text-center">
               <ServerCrash size={48} strokeWidth={2} className="text-black mb-4"/>
               <div className="text-lg font-black uppercase text-black">No promotions active.</div>
               <div className="text-sm font-bold text-gray-500 mt-2 uppercase">Read the official rules first, then build a campaign.</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-4 border-black text-left text-xs font-black uppercase tracking-widest text-black bg-gray-200">
                    <th className="px-5 py-4 whitespace-nowrap">Name</th>
                    <th className="px-5 py-4 whitespace-nowrap">Type</th>
                    <th className="px-5 py-4 whitespace-nowrap">Status</th>
                    <th className="px-5 py-4 whitespace-nowrap">Bots</th>
                    <th className="px-5 py-4 whitespace-nowrap">Target</th>
                    <th className="px-5 py-4 whitespace-nowrap">Ends</th>
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-black">
                  {promotions.map((p) => (
                    <tr key={p.id} className="hover:bg-yellow-200 transition-none bg-white">
                      <td className="px-5 py-3">
                        <Link href={`/promotions/${p.id}`} className="text-black font-black uppercase hover:underline whitespace-nowrap">{p.name}</Link>
                      </td>
                      <td className="px-5 py-3 text-black font-bold uppercase">{p.promotion_type.replaceAll("_", " ")}</td>
                      <td className="px-5 py-3 whitespace-nowrap"><Badge tone={statusTone(p.status)}>{p.status}</Badge></td>
                      <td className="px-5 py-3 whitespace-nowrap">
                        {p.bot_count > 0 ? (
                          <span className="inline-flex items-center gap-1.5 tabular-nums font-black text-black">
                            <BotIcon size={16} strokeWidth={2.5} />
                            {p.running_bot_count}/{p.bot_count} RUNNING
                          </span>
                        ) : (
                          <span className="font-bold text-gray-400 uppercase">None</span>
                        )}
                      </td>
                      <td className="px-5 py-3 tabular-nums font-black text-black whitespace-nowrap">{formatUsd(p.target_volume)}</td>
                      <td className="px-5 py-3 tabular-nums font-black text-black whitespace-nowrap">{formatDateTime(p.end_time)}</td>
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
