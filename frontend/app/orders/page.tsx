"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import type { Order } from "@/lib/types";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { Badge, statusTone } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatUsd, formatNumber, formatDateTime } from "@/lib/utils";

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [symbolFilter, setSymbolFilter] = useState("");

  async function refresh() {
    const params = symbolFilter ? { symbol: symbolFilter } : undefined;
    setOrders(await api.listOrders(params));
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolFilter]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-ash-50">Orders</h1>
          <p className="text-sm text-ash-400">Only FILLED orders count toward promotion volume.</p>
        </div>
        <Input
          placeholder="Filter by symbol, e.g. SOLUSDT"
          className="w-56"
          value={symbolFilter}
          onChange={(e) => setSymbolFilter(e.target.value.toUpperCase())}
        />
      </div>

      <Panel>
        <PanelHeader><PanelTitle>All orders</PanelTitle></PanelHeader>
        <PanelBody className="p-0">
          {orders === null ? (
            <div className="px-4 py-8 text-center text-sm text-ash-400">Loading…</div>
          ) : orders.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-ash-400">No orders found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-600 text-left text-xs text-ash-400">
                    <th className="px-4 py-2 font-normal">Time</th>
                    <th className="px-4 py-2 font-normal">Pair</th>
                    <th className="px-4 py-2 font-normal">Side</th>
                    <th className="px-4 py-2 font-normal">Type</th>
                    <th className="px-4 py-2 font-normal">Quantity</th>
                    <th className="px-4 py-2 font-normal">Value</th>
                    <th className="px-4 py-2 font-normal">Fee</th>
                    <th className="px-4 py-2 font-normal">Status</th>
                    <th className="px-4 py-2 font-normal">Mode</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id} className="border-b border-ink-600/60 last:border-0">
                      <td className="whitespace-nowrap px-4 py-2.5 tabular text-ash-400">{formatDateTime(o.created_at)}</td>
                      <td className="px-4 py-2.5 text-ash-50">{o.symbol}</td>
                      <td className="px-4 py-2.5"><Badge tone={o.side === "BUY" ? "up" : "down"}>{o.side}</Badge></td>
                      <td className="px-4 py-2.5 text-ash-400">{o.order_type}</td>
                      <td className="px-4 py-2.5 tabular">{formatNumber(o.executed_quantity, 6)}</td>
                      <td className="px-4 py-2.5 tabular">{formatUsd(o.cumulative_quote_quantity)}</td>
                      <td className="px-4 py-2.5 tabular text-ash-400">
                        {formatNumber(o.commission, 6)} {o.commission_asset || ""}
                      </td>
                      <td className="px-4 py-2.5"><Badge tone={statusTone(o.status)}>{o.status}</Badge></td>
                      <td className="px-4 py-2.5">
                        <Badge tone={o.is_paper ? "muted" : "signal"}>{o.is_paper ? "PAPER" : "LIVE"}</Badge>
                      </td>
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
