import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

export function Panel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("border-4 border-black bg-white rounded-none shadow-[4px_4px_0px_rgba(0,0,0,1)] mb-4", className)}
      {...props}
    />
  );
}

export function PanelHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-center justify-between px-5 py-4 border-b-4 border-black bg-cyan-300", className)}
      {...props}
    />
  );
}

export function PanelTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-base font-black uppercase tracking-widest text-black flex items-center gap-2", className)} {...props} />;
}

export function PanelBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...props} />;
}