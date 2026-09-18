import { cn } from "@/lib/utils";

type Tone = "neutral" | "up" | "down" | "signal" | "muted";

const tones: Record<Tone, string> = {
  neutral: "bg-white text-black border-black",
  up: "bg-green-400 text-black border-black",
  down: "bg-red-500 text-black border-black",
  signal: "bg-yellow-400 text-black border-black",
  muted: "bg-gray-200 text-gray-500 border-black opacity-80",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded-none border-2 px-2 py-1 text-xs font-black uppercase tracking-widest", tones[tone])}>
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