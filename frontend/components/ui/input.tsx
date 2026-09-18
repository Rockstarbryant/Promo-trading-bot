import { cn } from "@/lib/utils";
import { InputHTMLAttributes, forwardRef, TextareaHTMLAttributes } from "react";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "w-full rounded-none border-2 border-black bg-white px-3 py-2 text-sm font-bold text-black shadow-[2px_2px_0px_rgba(0,0,0,1)]",
        "placeholder:text-gray-400 placeholder:font-normal focus:border-black focus:outline-none focus:ring-4 focus:ring-yellow-400 min-h-[40px]",
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
        "w-full rounded-none border-2 border-black bg-white px-3 py-2 text-sm font-bold text-black shadow-[2px_2px_0px_rgba(0,0,0,1)]",
        "placeholder:text-gray-400 placeholder:font-normal focus:border-black focus:outline-none focus:ring-4 focus:ring-yellow-400",
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
    <label className="flex flex-col gap-2">
      <span className="text-sm font-black uppercase tracking-widest text-black">{label}</span>
      {children}
      {hint && <span className="text-xs font-bold text-gray-500 uppercase">{hint}</span>}
    </label>
  );
}

export function Select({
  className, ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "w-full rounded-none border-2 border-black bg-white px-3 py-2 text-sm font-bold text-black shadow-[2px_2px_0px_rgba(0,0,0,1)]",
        "focus:border-black focus:outline-none focus:ring-4 focus:ring-yellow-400 min-h-[40px] appearance-none",
        className
      )}
      {...props}
    />
  );
}