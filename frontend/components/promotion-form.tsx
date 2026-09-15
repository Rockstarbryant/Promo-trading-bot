"use client";

import { useState } from "react";
import { ApiClientError } from "@/lib/api-client";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import type { PromotionType } from "@/lib/types";

export const PROMOTION_TYPES: { value: PromotionType; label: string }[] = [
  { value: "SPOT_VOLUME", label: "Spot trading volume" },
  { value: "SPOT_PAIR_VOLUME", label: "Spot pair volume" },
  { value: "TRADING_TOURNAMENT", label: "Trading tournament" },
  { value: "FEE_VOLUME_CAMPAIGN", label: "Fee / volume campaign" },
  { value: "NEW_LISTING_CAMPAIGN", label: "New listing campaign" },
];

export interface PromotionFormValues {
  name: string;
  description: string;
  promotionType: PromotionType;
  startTime: string; // datetime-local value
  endTime: string; // datetime-local value
  targetVolume: string;
  minVolume: string;
  maxVolume: string;
  pairsText: string;
  rulesUrl: string;
}

export const EMPTY_PROMOTION_FORM: PromotionFormValues = {
  name: "",
  description: "",
  promotionType: "SPOT_VOLUME",
  startTime: "",
  endTime: "",
  targetVolume: "",
  minVolume: "",
  maxVolume: "",
  pairsText: "SOLUSDT, ETHUSDT",
  rulesUrl: "",
};

function buildPayload(values: PromotionFormValues) {
  const pairs = values.pairsText
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .map((symbol) => ({ symbol, is_eligible: true }));

  return {
    name: values.name,
    description: values.description || null,
    promotion_type: values.promotionType,
    start_time: new Date(values.startTime).toISOString(),
    end_time: new Date(values.endTime).toISOString(),
    target_volume: values.targetVolume || null,
    min_volume: values.minVolume || null,
    max_volume: values.maxVolume || null,
    rules_url: values.rulesUrl || null,
    pairs,
  };
}

export function PromotionForm({
  initial,
  submitLabel,
  busyLabel,
  onSubmit,
  onCancel,
}: {
  initial: PromotionFormValues;
  submitLabel: string;
  busyLabel: string;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
  onCancel?: () => void;
}) {
  const [values, setValues] = useState<PromotionFormValues>(initial);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function set<K extends keyof PromotionFormValues>(key: K, value: PromotionFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await onSubmit(buildPayload(values));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Panel>
      <PanelHeader><PanelTitle>Details</PanelTitle></PanelHeader>
      <PanelBody>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 md:max-w-lg">
          <Field label="Name">
            <Input value={values.name} onChange={(e) => set("name", e.target.value)} required
              placeholder="e.g. Q1 Spot Trading Tournament" />
          </Field>

          <Field label="Promotion type">
            <Select value={values.promotionType} onChange={(e) => set("promotionType", e.target.value as PromotionType)}>
              {PROMOTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Start time">
              <Input type="datetime-local" value={values.startTime} onChange={(e) => set("startTime", e.target.value)} required />
            </Field>
            <Field label="End time">
              <Input type="datetime-local" value={values.endTime} onChange={(e) => set("endTime", e.target.value)} required />
            </Field>
          </div>

          <Field label="Eligible pairs" hint="Comma-separated symbols, e.g. SOLUSDT, ETHUSDT">
            <Input value={values.pairsText} onChange={(e) => set("pairsText", e.target.value)} required />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Target volume (USDT)" hint="Progress tracking only">
              <Input type="number" min="0" step="0.01" value={values.targetVolume} onChange={(e) => set("targetVolume", e.target.value)} />
            </Field>
            <Field label="Min volume (USDT)">
              <Input type="number" min="0" step="0.01" value={values.minVolume} onChange={(e) => set("minVolume", e.target.value)} />
            </Field>
            <Field label="Max volume (USDT)">
              <Input type="number" min="0" step="0.01" value={values.maxVolume} onChange={(e) => set("maxVolume", e.target.value)} />
            </Field>
          </div>

          <Field label="Official rules URL" hint="Optional — keep a link to the exact terms">
            <Input type="url" value={values.rulesUrl} onChange={(e) => set("rulesUrl", e.target.value)} placeholder="https://..." />
          </Field>

          <Field label="Notes">
            <Textarea rows={3} value={values.description} onChange={(e) => set("description", e.target.value)} />
          </Field>

          {error && <p className="text-sm text-market-down">{error}</p>}

          <div className="flex gap-2">
            <Button type="submit" disabled={loading}>
              {loading ? busyLabel : submitLabel}
            </Button>
            {onCancel && (
              <Button type="button" variant="secondary" onClick={onCancel} disabled={loading}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      </PanelBody>
    </Panel>
  );
}
