"use client";

import { createPortal } from "react-dom";
import { uiMotionClasses } from "@/lib/ui-motion";
import { mstvLayerClassNames, type MstvLayer } from "@/lib/ui-layers";
import { cn } from "@/lib/utils";
import type { HTMLAttributes, PointerEvent, ReactNode } from "react";

type MstvModalPosition = "center" | "sheet" | "custom";

type MstvModalSurfaceProps = {
  children: ReactNode;
  onClose: () => void;
  open?: boolean;
  layer?: MstvLayer;
  position?: MstvModalPosition;
  closeOnBackdrop?: boolean;
  animated?: boolean;
  className?: string;
};

const modalPositionClassNames: Record<MstvModalPosition, string> = {
  center: "items-center justify-center p-3 sm:p-6",
  sheet: "items-end justify-center p-3 sm:items-center sm:p-6",
  custom: "",
};

export const mstvModalPanelClassName = "rounded-2xl bg-white shadow-sm shadow-black/5";

export function MstvModalSurface({
  children,
  onClose,
  open = true,
  layer = "modal",
  position = "sheet",
  closeOnBackdrop = true,
  animated = true,
  className,
}: MstvModalSurfaceProps) {
  if (!open || typeof document === "undefined") return null;

  function handlePointerDown(pointerEvent: PointerEvent<HTMLDivElement>) {
    if (closeOnBackdrop && pointerEvent.target === pointerEvent.currentTarget) {
      onClose();
    }
  }

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 flex bg-black/35",
        mstvLayerClassNames[layer],
        modalPositionClassNames[position],
        animated && uiMotionClasses.modalBackdropIn,
        className,
      )}
      onPointerDown={handlePointerDown}
    >
      {children}
    </div>,
    document.body,
  );
}

export function MstvModalPanel({
  children,
  className,
  animated = true,
  stopPointerDown = true,
  onPointerDown,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  animated?: boolean;
  stopPointerDown?: boolean;
}) {
  return (
    <div
      className={cn(mstvModalPanelClassName, animated && uiMotionClasses.modalPanelIn, className)}
      onPointerDown={(pointerEvent) => {
        if (stopPointerDown) pointerEvent.stopPropagation();
        onPointerDown?.(pointerEvent);
      }}
      {...props}
    >
      {children}
    </div>
  );
}
