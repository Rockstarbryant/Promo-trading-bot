import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const variants: Record<Variant, string> = {
  primary: "bg-yellow-400 text-black border-black hover:bg-black hover:text-white shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-1 hover:translate-y-1",
  secondary: "bg-white text-black border-black hover:bg-gray-200 shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-1 hover:translate-y-1",
  danger: "bg-red-500 text-black border-black hover:bg-black hover:text-white shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-1 hover:translate-y-1",
  ghost: "text-black border-transparent hover:border-black hover:bg-yellow-200",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-none border-2 px-5 py-2.5 text-sm font-black uppercase tracking-widest transition-all duration-75 disabled:opacity-50 disabled:cursor-not-allowed",
        "min-h-[40px]",
        variants[variant],
        className
      )}
      {...props}
    />
  )
);
Button.displayName = "Button";