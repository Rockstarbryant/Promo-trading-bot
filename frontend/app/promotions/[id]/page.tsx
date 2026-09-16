"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiClientError } from "@/lib/api-client";
import type { Promotion, PromotionProgress, TradingBot } from "@/lib/types";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { Badge, statusTone } from "@/components/ui/badge";
import { formatUsd, formatPct, formatDateTime, toDatetimeLocalValue } from "@/lib/utils";
import { PromotionForm, type PromotionFormValues } from "@/components/promotion-form";
import { Pencil, Trash2, Bot as BotIcon, Trophy, ExternalLink, Play, Square, Plus } from "lucide-react";

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
    return (
      <div className="flex h-64 items-center justify-center bg-white border-4 border-black font-black uppercase text-2xl tracking-widest text-black">
        <Trophy className="animate-pulse mr-4 text-black" size={40} strokeWidth={2.5} /> Loading Campaign...
      </div>
    );
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
      <div className="flex flex-col gap-6 font-sans">
        <div className="border-b-4 border-black pb-4">
          <h1 className="text-3xl font-black text-black uppercase tracking-tight">Edit Promotion</h1>
          <p className="text-sm font-bold text-black uppercase mt-1">
            Updating pairs will overwrite the complete eligibility list.
          </p>
        </div>
        <PromotionForm
          initial={editInitial}
          submitLabel="Save Changes"
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
    <div className="flex flex-col gap-6 bg-white min-h-screen font-sans">
      {/* Header & Campaign Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 border-b-4 border-black pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-black text-black uppercase tracking-tight">{promotion.name}</h1>
            <Badge tone={statusTone(promotion.status)} className="border-2 border-black rounded-none uppercase font-black bg-white px-3 py-1 text-sm shadow-[2px_2px_0px_rgba(0,0,0,1)]">
              {promotion.status}
            </Badge>
          </div>
          <p className="mt-2 text-sm font-bold text-black uppercase tracking-widest bg-yellow-200 inline-block px-2 py-0.5 border-2 border-black">
            Type: {promotion.promotion_type.replaceAll("_", " ")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {promotion.status === "DRAFT" && (
            <button
              onClick={() => run(() => api.activatePromotion(promotion.id))}
              disabled={busy}
              className="brutalist-btn bg-green-400 text-black"
            >
              <Play size={18} strokeWidth={2.5} /> Activate
            </button>
          )}
          {promotion.status === "ACTIVE" && (
            <button
              onClick={() => run(() => api.endPromotion(promotion.id))}
              disabled={busy}
              className="brutalist-btn bg-orange-500 text-white"
            >
              <Square size={18} strokeWidth={2.5} /> End Campaign
            </button>
          )}
          <button
            onClick={() => setEditing(true)}
            disabled={busy}
            className="brutalist-btn bg-yellow-400 text-black"
          >
            <Pencil size={18} strokeWidth={2.5} /> Edit
          </button>
          <button
            onClick={handleDelete}
            disabled={busy}
            className="brutalist-btn bg-red-600 text-white"
          >
            <Trash2 size={18} strokeWidth={2.5} /> Delete
          </button>
        </div>
      </div>

      {error && (
        <Panel className="border-4 border-black bg-red-400 rounded-none shadow-[4px_4px_0px_rgba(0,0,0,1)]">
          <PanelBody className="px-5 py-4">
            <p className="text-sm font-black uppercase text-black">
              CRITICAL ERROR: {error}
            </p>
          </PanelBody>
        </Panel>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Bots Attached" value={String(promotion.bot_count)} />
        <Stat
          label="Bots Running Now"
          value={String(promotion.running_bot_count)}
          highlight={promotion.running_bot_count > 0}
        />
        <Stat
          label="Strategies In Use"
          value={promotion.strategies_in_use.length ? promotion.strategies_in_use.join(", ") : "—"}
        />
      </div>

      {/* Volume Progress Tracker */}
      <Panel className="border-4 border-black bg-white rounded-none">
        <PanelHeader className="border-b-4 border-black px-5 py-3 bg-yellow-400">
          <PanelTitle className="text-black font-black uppercase tracking-widest flex items-center gap-2">
            <Trophy size={20} strokeWidth={2.5} /> Target Progress
          </PanelTitle>
        </PanelHeader>
        <PanelBody className="flex flex-col gap-4 p-5 bg-gray-50">
          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
            <span className="text-3xl font-black tabular-nums text-black tracking-tight">
              {formatUsd(progress?.qualifying_volume ?? "0")}
            </span>
            <span className="text-sm font-black uppercase text-black">
              Target: {formatUsd(promotion.target_volume)}
            </span>
          </div>

          {/* Brutalist Hard Progress Bar */}
          <div className="h-6 w-full border-4 border-black bg-white p-0.5 shadow-[2px_2px_0px_rgba(0,0,0,1)]">
            <div
              className="h-full bg-green-400 border-r-2 border-black transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          <div className="flex justify-between text-xs font-black uppercase tracking-widest text-black tabular-nums">
            <span>{formatPct(progress?.progress_pct)} Complete</span>
            <span>{formatUsd(progress?.remaining_volume)} Remaining</span>
          </div>
        </PanelBody>
      </Panel>

      {/* Campaign Parameters & Notes */}
      <Panel className="border-4 border-black bg-white rounded-none">
        <PanelHeader className="border-b-4 border-black px-5 py-3 bg-cyan-300">
          <PanelTitle className="text-black font-black uppercase tracking-widest">
            Parameters & Specifications
          </PanelTitle>
        </PanelHeader>
        <PanelBody className="grid grid-cols-2 gap-6 p-5 md:grid-cols-4 bg-gray-50">
          <DetailField label="Start Time" value={formatDateTime(promotion.start_time)} />
          <DetailField label="End Time" value={formatDateTime(promotion.end_time)} />
          <DetailField label="Min Volume" value={formatUsd(promotion.min_volume)} />
          <DetailField label="Max Volume" value={formatUsd(promotion.max_volume)} />
        </PanelBody>

        {promotion.notes && (
          <PanelBody className="border-t-4 border-black p-5 bg-white">
            <div className="text-xs font-black uppercase tracking-widest text-black">Notes & Terms</div>
            <p className="mt-2 text-sm font-bold text-black uppercase whitespace-pre-wrap leading-relaxed">
              {promotion.notes}
            </p>
          </PanelBody>
        )}

        {promotion.rules_url && (
          <PanelBody className="border-t-4 border-black p-4 bg-yellow-200">
            <a
              href={promotion.rules_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-sm font-black uppercase text-black hover:underline"
            >
              Official Rules & Terms <ExternalLink size={16} strokeWidth={2.5} />
            </a>
          </PanelBody>
        )}
      </Panel>

      {/* Pair Eligibility */}
      <Panel className="border-4 border-black bg-white rounded-none">
        <PanelHeader className="border-b-4 border-black px-5 py-3 bg-pink-300">
          <PanelTitle className="text-black font-black uppercase tracking-widest">
            Eligible Trading Pairs
          </PanelTitle>
        </PanelHeader>
        <PanelBody className="flex flex-wrap gap-2 p-5 bg-gray-50">
          {promotion.pairs.length === 0 ? (
            <span className="text-sm font-black uppercase text-black">No pairs configured.</span>
          ) : (
            promotion.pairs.map((p) => (
              <Badge
                key={p.id ?? p.symbol}
                tone={p.is_eligible ? "up" : "muted"}
                className="border-2 border-black rounded-none font-black text-sm px-3 py-1 bg-white uppercase shadow-[2px_2px_0px_rgba(0,0,0,1)]"
              >
                {p.symbol}
              </Badge>
            ))
          )}
        </PanelBody>
      </Panel>

      {/* Attached Bots List */}
      <Panel className="border-4 border-black bg-white rounded-none">
        <PanelHeader className="border-b-4 border-black px-5 py-3 bg-purple-300 flex items-center justify-between">
          <PanelTitle className="text-black font-black uppercase tracking-widest flex items-center gap-2">
            <BotIcon size={20} strokeWidth={2.5} /> Attached Executing Bots
          </PanelTitle>
          <Link
            href="/bots/new"
            className="border-2 border-black bg-white px-3 py-1 text-xs font-black uppercase text-black hover:bg-black hover:text-white transition-none shadow-[2px_2px_0px_rgba(0,0,0,1)] flex items-center gap-1"
          >
            <Plus size={14} strokeWidth={3} /> New Bot
          </Link>
        </PanelHeader>
        <PanelBody className="p-0">
          {bots.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm font-black uppercase tracking-widest text-black bg-gray-50">
              No trading bots currently bound to this promotion.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-4 border-black text-left text-xs font-black uppercase tracking-widest text-black bg-gray-200">
                    <th className="px-5 py-4 whitespace-nowrap">Bot Name</th>
                    <th className="px-5 py-4 whitespace-nowrap">Strategy</th>
                    <th className="px-5 py-4 whitespace-nowrap">Mode</th>
                    <th className="px-5 py-4 whitespace-nowrap">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-black">
                  {bots.map((bot) => (
                    <tr key={bot.id} className="hover:bg-yellow-200 transition-none bg-white">
                      <td className="px-5 py-3">
                        <Link
                          href={`/bots/${bot.id}`}
                          className="flex items-center gap-2 font-black text-black uppercase hover:underline whitespace-nowrap"
                        >
                          <BotIcon size={16} strokeWidth={2.5} /> {bot.name}
                        </Link>
                      </td>
                      <td className="px-5 py-3 font-bold text-black uppercase">{bot.strategy_name ?? "—"}</td>
                      <td className="px-5 py-3">
                        <Badge tone={bot.mode === "LIVE" ? "signal" : "muted"} className="border-2 border-black rounded-none uppercase font-black bg-white">
                          {bot.mode}
                        </Badge>
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={statusTone(bot.status)} className="border-2 border-black rounded-none uppercase font-black bg-white">
                          {bot.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </PanelBody>
      </Panel>

      {/* Custom Button Scoped Styles */}
      <style dangerouslySetInnerHTML={{__html: `
        .brutalist-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          border: 2px solid #000;
          padding: 0.5rem 1rem;
          font-size: 0.875rem;
          font-weight: 900;
          text-transform: uppercase;
          transition: none;
          box-shadow: 3px 3px 0px #000;
        }
        .brutalist-btn:hover:not(:disabled) {
          background-color: #000;
          color: #fff;
          box-shadow: none;
          transform: translate(2px, 2px);
        }
        .brutalist-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}} />
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-xs font-black uppercase tracking-widest text-black">{label}</div>
      <div className="text-base font-bold text-black uppercase tabular-nums truncate" title={value}>{value}</div>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`border-4 border-black px-5 py-4 shadow-[4px_4px_0px_rgba(0,0,0,1)] flex flex-col justify-between ${highlight ? "bg-green-400" : "bg-white"}`}>
      <div className="text-xs font-black uppercase tracking-widest text-black">{label}</div>
      <div className="mt-2 text-2xl font-black tabular-nums text-black tracking-tight">{value}</div>
    </div>
  );
}
