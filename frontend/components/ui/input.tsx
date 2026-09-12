import { cn } from "@/lib/utils";
import { InputHTMLAttributes, forwardRef, LabelHTMLAttributes, TextareaHTMLAttributes } from "react";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "w-full rounded border border-ink-500 bg-ink-900 px-3 py-2 text-sm text-ash-50",
        "placeholder:text-ash-600 focus:border-signal focus:outline-none min-h-[40px]",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "w-full rounded border border-ink-500 bg-ink-900 px-3 py-2 text-sm text-ash-50",
        "placeholder:text-ash-600 focus:border-signal focus:outline-none",
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";

export function Field({
  label, hint, children,
}: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm text-ash-200">{label}</span>
      {children}
      {hint && <span className="text-xs text-ash-400">{hint}</span>}
    </label>
  );
}

export function Select({
  className, ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "w-full rounded border border-ink-500 bg-ink-900 px-3 py-2 text-sm text-ash-50",
        "focus:border-signal focus:outline-none min-h-[40px]",
        className
      )}
      {...props}
    />
  );
}
