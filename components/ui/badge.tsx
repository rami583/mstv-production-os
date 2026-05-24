import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({
  className,
  children,
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full bg-white/80 px-2.5 py-1 text-sm font-semibold uppercase tracking-[0.08em] text-stone-500",
        className,
      )}
    >
      {children}
    </span>
  );
}
