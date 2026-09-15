"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiClientError } from "@/lib/api-client";
import type { Promotion, PromotionProgress, TradingBot } from "@/lib/types";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { Badge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatUsd, formatPct, formatDateTime, toDatetimeLocalValue } from "@/lib/utils";
import { PromotionForm, type PromotionFormValues } from "@/components/promotion-form";
import { Pencil, Trash2, Bot as BotIcon } from "lucide-react";

export default function PromotionDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [promotion, setPromotion] = useState<Promotion | null>(null);
  const [progress, setProgress] = useState<PromotionProgress | null>(null);
  const [bots, setBots] = useState<TradingBot[]>([]);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [promo, allBots] = await Promise.all([api.getPromotion(params.id), api.listBots()]);
    setPromotion(promo);
    setBots(allBots.filter((b) => b.promotion_id === params.id));
    try {
      setProgress(await api.getPromotionProgress(params.id));
    } catch {
      setProgress(null);
    }
  }, [params.id]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 10000);
    return () => clearInterval(interval);
  }, [refresh]);

  if (!promotion) {
    return <div className="text-sm text-ash-400">Loading…</div>;
  }

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (bots.length > 0) {
      alert("Delete or reassign the bots using this promotion before deleting it.");
      return;
    }
    if (!confirm(`Delete "${promotion!.name}" permanently? This cannot be undone.`)) return;
    await run(async () => {
      await api.deletePromotion(promotion!.id);
      router.push("/promotions");
    });
  }

  const progressPct = progress?.progress_pct ? Math.min(100, parseFloat(progress.progress_pct)) : 0;

  const editInitial: PromotionFormValues = {
    name: promotion.name,
    description: promotion.description ?? "",
    promotionType: promotion.promotion_type,
    startTime: toDatetimeLocalValue(promotion.start_time),
    endTime: toDatetimeLocalValue(promotion.end_time),
    targetVolume: promotion.target_volume ?? "",
    minVolume: promotion.min_volume ?? "",
    maxVolume: promotion.max_volume ?? "",
    pairsText: promotion.pairs.map((p) => p.symbol).join(", "),
    rulesUrl: promotion.rules_url ?? "",
  };

  if (editing) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-lg font-semibold text-ash-50">Edit promotion</h1>
          <p className="text-sm text-ash-400">Changing eligible pairs replaces the full pair list.</p>
        </div>
        <PromotionForm
          initial={editInitial}
          submitLabel="Save changes"
          busyLabel="Saving…"
          onCancel={() => setEditing(false)}
          onSubmit={async (payload) => {
            await api.updatePromotion(promotion.id, payload);
            setEditing(false);
            await refresh();
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-ash-50">{promotion.name}</h1>
            <Badge tone={statusTone(promotion.status)}>{promotion.status}</Badge>
          </div>
          <p className="text-sm text-ash-400">{promotion.promotion_type.replaceAll("_", " ")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {promotion.status === "DRAFT" && (
            <Button onClick={() => run(() => api.activatePromotion(promotion.id))} disabled={busy}>Activate</Button>
          )}
          {promotion.status === "ACTIVE" && (
            <Button variant="danger" onClick={() => run(() => api.endPromotion(promotion.id))} disabled={busy}>End promotion</Button>
          )}
          <Button variant="secondary" onClick={() => setEditing(true)} disabled={busy}>
            <Pencil size={16} /> Edit
          </Button>
          <Button variant="danger" onClick={handleDelete} disabled={busy}>
            <Trash2 size={16} /> Delete
          </Button>
        </div>
      </div>

      {error && (
        <Panel className="border-market-down/40 bg-market-down/5">
          <PanelBody><p className="text-sm text-market-down">{error}</p></PanelBody>
        </Panel>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="Bots attached" value={String(promotion.bot_count)} />
        <Stat label="Bots running now" value={String(promotion.running_bot_count)} tone={promotion.running_bot_count > 0 ? "up" : undefined} />
        <Stat label="Strategies in use" value={promotion.strategies_in_use.length ? promotion.strategies_in_use.join(", ") : "—"} />
      </div>

      <Panel>
        <PanelHeader><PanelTitle>Progress</PanelTitle></PanelHeader>
        <PanelBody className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-medium tabular text-ash-50">
              {formatUsd(progress?.qualifying_volume ?? "0")}
            </span>
            <span className="text-sm text-ash-400 tabular">
              of {formatUsd(promotion.target_volume)} target
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-ink-700">
            <div className="h-full bg-signal transition-[width]" style={{ width: `${progressPct}%` }} />
          </div>
          <div className="flex justify-between text-xs text-ash-400 tabular">
            <span>{formatPct(progress?.progress_pct)} complete</span>
            <span>{formatUsd(progress?.remaining_volume)} remaining</span>
          </div>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader><PanelTitle>Details</PanelTitle></PanelHeader>
        <PanelBody className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
          <DetailField label="Start" value={formatDateTime(promotion.start_time)} />
          <DetailField label="End" value={formatDateTime(promotion.end_time)} />
          <DetailField label="Min volume" value={formatUsd(promotion.min_volume)} />
          <DetailField label="Max volume" value={formatUsd(promotion.max_volume)} />
        </PanelBody>
        {promotion.notes && (
          <PanelBody className="border-t border-ink-600 pt-3">
            <div className="text-xs text-ash-400">Notes</div>
            <p className="mt-1 text-sm text-ash-200 whitespace-pre-wrap">{promotion.notes}</p>
          </PanelBody>
        )}
        {promotion.rules_url && (
          <PanelBody className="border-t border-ink-600 pt-3">
            <a href={promotion.rules_url} target="_blank" rel="noreferrer" className="text-sm text-signal">
              Official rules ↗
            </a>
          </PanelBody>
        )}
      </Panel>

      <Panel>
        <PanelHeader><PanelTitle>Eligible pairs</PanelTitle></PanelHeader>
        <PanelBody className="flex flex-wrap gap-1.5">
          {promotion.pairs.length === 0 ? (
            <span className="text-sm text-ash-400">No pairs configured.</span>
          ) : (
            promotion.pairs.map((p) => (
              <Badge key={p.id ?? p.symbol} tone={p.is_eligible ? "up" : "muted"}>{p.symbol}</Badge>
            ))
          )}
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader className="flex items-center justify-between">
          <PanelTitle>Bots running this promotion</PanelTitle>
          <Link href="/bots/new" className="text-xs text-signal">New bot</Link>
        </PanelHeader>
        <PanelBody className="p-0">
          {bots.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-ash-400">
              No bots attached yet.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-600 text-left text-xs text-ash-400">
                  <th className="px-4 py-2 font-normal">Bot</th>
                  <th className="px-4 py-2 font-normal">Strategy</th>
                  <th className="px-4 py-2 font-normal">Mode</th>
                  <th className="px-4 py-2 font-normal">Status</th>
                </tr>
              </thead>
              <tbody>
                {bots.map((bot) => (
                  <tr key={bot.id} className="border-b border-ink-600/60 last:border-0 hover:bg-ink-700/40">
                    <td className="px-4 py-3">
                      <Link href={`/bots/${bot.id}`} className="flex items-center gap-2 text-ash-50 hover:text-signal">
                        <BotIcon size={14} className="text-ash-400" /> {bot.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-ash-400">{bot.strategy_name ?? "—"}</td>
                    <td className="px-4 py-3"><Badge tone={bot.mode === "LIVE" ? "signal" : "muted"}>{bot.mode}</Badge></td>
                    <td className="px-4 py-3"><Badge tone={statusTone(bot.status)}>{bot.status}</Badge></td>
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

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-ash-400">{label}</div>
      <div className="tabular text-ash-50">{value}</div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "up" }) {
  return (
    <Panel className="px-4 py-3">
      <div className="text-xs text-ash-400">{label}</div>
      <div className={`mt-1 text-xl font-medium tabular ${tone === "up" ? "text-market-up" : "text-ash-50"}`}>
        {value}
      </div>
    </Panel>
  );
}
