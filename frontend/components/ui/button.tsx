import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const variants: Record<Variant, string> = {
  primary: "bg-signal text-ink-950 hover:bg-signal-dim disabled:opacity-40",
  secondary: "bg-ink-700 text-ash-50 border border-ink-500 hover:bg-ink-600 disabled:opacity-40",
  danger: "bg-market-down/90 text-ash-50 hover:bg-market-down disabled:opacity-40",
  ghost: "text-ash-200 hover:bg-ink-700 disabled:opacity-40",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded px-3.5 py-2 text-sm font-medium transition-colors",
        "min-h-[40px]",
        variants[variant],
        className
      )}
      {...props}
    />
  )
);
Button.displayName = "Button";
