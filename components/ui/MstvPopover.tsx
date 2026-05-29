"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { uiMotionClasses } from "@/lib/ui-motion";
import { cn } from "@/lib/utils";

type MstvPopoverPlacement = "bottom-start" | "bottom-end" | "top-start" | "top-end";

type MstvPopoverProps = {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  children: ReactNode;
  placement?: MstvPopoverPlacement;
  offset?: number;
  matchAnchorWidth?: boolean;
  minWidth?: number;
  maxWidth?: number;
  className?: string;
};

const viewportPadding = 12;
const defaultMaxWidth = 360;

function getViewportMetrics() {
  if (typeof window === "undefined") {
    return { width: 0, height: 0, offsetTop: 0, offsetLeft: 0 };
  }

  const visualViewport = window.visualViewport;
  return {
    width: visualViewport?.width ?? window.innerWidth,
    height: visualViewport?.height ?? window.innerHeight,
    offsetTop: visualViewport?.offsetTop ?? 0,
    offsetLeft: visualViewport?.offsetLeft ?? 0,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function MstvPopover({
  open,
  anchorRef,
  onClose,
  children,
  placement = "bottom-start",
  offset = 8,
  matchAnchorWidth = true,
  minWidth = 220,
  maxWidth = defaultMaxWidth,
  className,
}: MstvPopoverProps) {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<CSSProperties | null>(null);

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;

    const anchorRect = anchor.getBoundingClientRect();
    const popoverRect = popoverRef.current?.getBoundingClientRect();
    const viewport = getViewportMetrics();
    const viewportLeft = viewport.offsetLeft + viewportPadding;
    const viewportRight = viewport.offsetLeft + viewport.width - viewportPadding;
    const viewportTop = viewport.offsetTop + viewportPadding;
    const viewportBottom = viewport.offsetTop + viewport.height - viewportPadding;
    const availableWidth = Math.max(160, viewportRight - viewportLeft);
    const desiredWidth = matchAnchorWidth
      ? anchorRect.width
      : Math.max(minWidth, Math.min(maxWidth, anchorRect.width));
    const width = Math.min(Math.max(minWidth, desiredWidth), availableWidth, maxWidth);
    const alignEnd = placement.endsWith("end");
    const preferTop = placement.startsWith("top");
    const unclampedLeft = alignEnd ? anchorRect.right - width : anchorRect.left;
    const left = clamp(unclampedLeft, viewportLeft, viewportRight - width);
    const measuredHeight = popoverRect?.height ?? 0;
    const bottomTop = anchorRect.bottom + offset;
    const topTop = anchorRect.top - measuredHeight - offset;
    const shouldFlipToTop = !preferTop && measuredHeight > 0 && bottomTop + measuredHeight > viewportBottom && topTop >= viewportTop;
    const shouldFlipToBottom = preferTop && measuredHeight > 0 && topTop < viewportTop && bottomTop <= viewportBottom;
    const top = preferTop && !shouldFlipToBottom || shouldFlipToTop
      ? Math.max(viewportTop, topTop)
      : Math.min(bottomTop, viewportBottom);

    setPosition({
      position: "fixed",
      left,
      top,
      width,
      maxHeight: Math.max(120, viewportBottom - top),
      zIndex: 75,
    });
  }, [anchorRef, matchAnchorWidth, maxWidth, minWidth, offset, placement]);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }

    updatePosition();
  }, [children, open, updatePosition]);

  useEffect(() => {
    if (!open) return;

    updatePosition();

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (anchorRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      onClose();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    window.visualViewport?.addEventListener("resize", updatePosition);
    window.visualViewport?.addEventListener("scroll", updatePosition);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      window.visualViewport?.removeEventListener("resize", updatePosition);
      window.visualViewport?.removeEventListener("scroll", updatePosition);
    };
  }, [anchorRef, onClose, open, updatePosition]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={popoverRef}
      style={position ?? { position: "fixed", left: -9999, top: -9999, zIndex: 75 }}
      className={cn(
        "overflow-auto rounded-2xl bg-white p-1.5 text-neutral-800 shadow-[0_12px_36px_rgba(0,0,0,0.055)]",
        uiMotionClasses.scaleIn,
        className,
      )}
    >
      {children}
    </div>,
    document.body,
  );
}
