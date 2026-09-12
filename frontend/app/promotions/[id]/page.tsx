"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api-client";
import type { Promotion, PromotionProgress } from "@/lib/types";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { Badge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatUsd, formatPct, formatDateTime } from "@/lib/utils";

export default function PromotionDetailPage() {
  const params = useParams<{ id: string }>();
  const [promotion, setPromotion] = useState<Promotion | null>(null);
  const [progress, setProgress] = useState<PromotionProgress | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const promo = await api.getPromotion(params.id);
    setPromotion(promo);
    try {
      setProgress(await api.getPromotionProgress(params.id));
    } catch {
      setProgress(null);
    }
  }

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 10000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  if (!promotion) {
    return <div className="text-sm text-ash-400">Loading…</div>;
  }

  async function handleActivate() {
    setBusy(true);
    await api.activatePromotion(params.id);
    await refresh();
    setBusy(false);
  }

  async function handleEnd() {
    if (!confirm("End this promotion? Any bots attached to it will stop.")) return;
    setBusy(true);
    await api.endPromotion(params.id);
    await refresh();
    setBusy(false);
  }

  const progressPct = progress?.progress_pct ? Math.min(100, parseFloat(progress.progress_pct)) : 0;

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
        <div className="flex gap-2">
          {promotion.status === "DRAFT" && (
            <Button onClick={handleActivate} disabled={busy}>Activate</Button>
          )}
          {promotion.status === "ACTIVE" && (
            <Button variant="danger" onClick={handleEnd} disabled={busy}>End promotion</Button>
          )}
        </div>
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
        {promotion.rules_url && (
          <PanelBody className="border-t border-ink-600 pt-3">
            <a href={promotion.rules_url} target="_blank" rel="noreferrer" className="text-sm text-signal">
              Official rules ↗
            </a>
          </PanelBody>
        )}
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
