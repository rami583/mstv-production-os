import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
};

export function Button({ className, variant = "secondary", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-full px-4 text-base font-medium transition duration-200 focus:outline-none focus:ring-2 focus:ring-stone-300 disabled:pointer-events-none disabled:opacity-50",
        variant === "primary" && "bg-[#bb2720] text-white hover:bg-[#a7211b]",
        variant === "secondary" && "border border-stone-200 bg-white text-stone-700 hover:bg-stone-50",
        variant === "ghost" && "text-stone-600 hover:bg-white/70 hover:text-stone-950",
        className,
      )}
      {...props}
    />
  );
}
