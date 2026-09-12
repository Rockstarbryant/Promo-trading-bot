import { cn } from "@/lib/utils";

type Tone = "neutral" | "up" | "down" | "signal" | "muted";

const tones: Record<Tone, string> = {
  neutral: "bg-ink-700 text-ash-50 border-ink-500",
  up: "bg-market-up/10 text-market-up border-market-up/40",
  down: "bg-market-down/10 text-market-down border-market-down/40",
  signal: "bg-signal/10 text-signal border-signal/40",
  muted: "bg-ink-700 text-ash-400 border-ink-600",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium", tones[tone])}>
      {children}
    </span>
  );
}

export function statusTone(status: string): Tone {
  if (["RUNNING", "FILLED", "ACTIVE"].includes(status)) return "up";
  if (["ERROR", "REJECTED", "CANCELLED"].includes(status)) return "down";
  if (["PAUSED", "STARTING", "SUBMITTED", "PARTIALLY_FILLED"].includes(status)) return "signal";
  return "muted";
}
