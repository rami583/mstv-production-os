import * as React from "react";
import { mstvRadiusClassNames } from "@/lib/ui-radii";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(mstvRadiusClassNames.card, "bg-white", className)} {...props} />;
}
