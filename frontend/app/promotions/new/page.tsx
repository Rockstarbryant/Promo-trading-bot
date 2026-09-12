"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiClientError } from "@/lib/api-client";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import type { PromotionType } from "@/lib/types";

const PROMOTION_TYPES: { value: PromotionType; label: string }[] = [
  { value: "SPOT_VOLUME", label: "Spot trading volume" },
  { value: "SPOT_PAIR_VOLUME", label: "Spot pair volume" },
  { value: "TRADING_TOURNAMENT", label: "Trading tournament" },
  { value: "FEE_VOLUME_CAMPAIGN", label: "Fee / volume campaign" },
  { value: "NEW_LISTING_CAMPAIGN", label: "New listing campaign" },
];

export default function NewPromotionPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [promotionType, setPromotionType] = useState<PromotionType>("SPOT_VOLUME");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [targetVolume, setTargetVolume] = useState("");
  const [pairsText, setPairsText] = useState("SOLUSDT, ETHUSDT");
  const [rulesUrl, setRulesUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const pairs = pairsText
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
        .map((symbol) => ({ symbol, is_eligible: true }));

      const promo = await api.createPromotion({
        name,
        description: description || null,
        promotion_type: promotionType,
        start_time: new Date(startTime).toISOString(),
        end_time: new Date(endTime).toISOString(),
        target_volume: targetVolume || null,
        rules_url: rulesUrl || null,
        pairs,
      });
      router.push(`/promotions/${promo.id}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not create promotion");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-ash-50">New promotion</h1>
        <p className="text-sm text-ash-400">
          Mirror the official promotion&apos;s terms. Risk limits and strategy are set per-bot afterward.
        </p>
      </div>

      <Panel>
        <PanelHeader><PanelTitle>Details</PanelTitle></PanelHeader>
        <PanelBody>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 md:max-w-lg">
            <Field label="Name">
              <Input value={name} onChange={(e) => setName(e.target.value)} required
                placeholder="e.g. Q1 Spot Trading Tournament" />
            </Field>

            <Field label="Promotion type">
              <Select value={promotionType} onChange={(e) => setPromotionType(e.target.value as PromotionType)}>
                {PROMOTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </Select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Start time">
                <Input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
              </Field>
              <Field label="End time">
                <Input type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
              </Field>
            </div>

            <Field label="Eligible pairs" hint="Comma-separated symbols, e.g. SOLUSDT, ETHUSDT">
              <Input value={pairsText} onChange={(e) => setPairsText(e.target.value)} required />
            </Field>

            <Field label="Target volume (USDT)" hint="Used for progress tracking only, not enforced as a limit">
              <Input type="number" min="0" step="0.01" value={targetVolume} onChange={(e) => setTargetVolume(e.target.value)} />
            </Field>

            <Field label="Official rules URL" hint="Optional — keep a link to the exact terms">
              <Input type="url" value={rulesUrl} onChange={(e) => setRulesUrl(e.target.value)} placeholder="https://..." />
            </Field>

            <Field label="Notes">
              <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>

            {error && <p className="text-sm text-market-down">{error}</p>}

            <Button type="submit" disabled={loading} className="self-start">
              {loading ? "Creating…" : "Create promotion"}
            </Button>
          </form>
        </PanelBody>
      </Panel>
    </div>
  );
}
