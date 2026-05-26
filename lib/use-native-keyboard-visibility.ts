"use client";

import { Keyboard } from "@capacitor/keyboard";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

export function isNativeMobileRuntime() {
  if (typeof window === "undefined") return false;
  const maybeCapacitor = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return window.location.protocol === "capacitor:" || Boolean(maybeCapacitor?.isNativePlatform?.());
}

export function useNativeKeyboardVisibility<T extends HTMLElement>(options: {
  enabled?: boolean;
  bottomPadding?: number;
  visibleTopPadding?: number;
  visibleBottomPadding?: number;
  focusDelayMs?: number;
} = {}) {
  const {
    enabled = true,
    bottomPadding = 96,
    visibleTopPadding = 12,
    visibleBottomPadding = 20,
    focusDelayMs = 120,
  } = options;
  const [keyboardInset, setKeyboardInset] = useState(0);
  const scrollContainerRef = useRef<T | null>(null);
  const activeFieldRef = useRef<HTMLElement | null>(null);
  const keyboardInsetRef = useRef(0);

  const scrollFieldIntoView = useCallback((target: HTMLElement, behavior: ScrollBehavior = "smooth") => {
    const container = scrollContainerRef.current;
    if (!enabled || !isNativeMobileRuntime() || !container || !container.contains(target)) return;

    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const viewportBottom = (() => {
      if (typeof window === "undefined") return containerRect.bottom;
      const visualViewport = window.visualViewport;
      if (visualViewport && visualViewport.height < window.innerHeight - 48) {
        return visualViewport.offsetTop + visualViewport.height;
      }
      return window.innerHeight - Math.max(keyboardInsetRef.current, 0);
    })();
    const visibleTop = containerRect.top + visibleTopPadding;
    const visibleBottom = Math.min(containerRect.bottom, viewportBottom) - visibleBottomPadding;

    if (targetRect.bottom > visibleBottom) {
      container.scrollBy({ top: targetRect.bottom - visibleBottom, behavior });
      return;
    }

    if (targetRect.top < visibleTop) {
      container.scrollBy({ top: targetRect.top - visibleTop, behavior });
    }
  }, [enabled, visibleBottomPadding, visibleTopPadding]);

  const handleFieldFocus = useCallback((target: HTMLElement) => {
    if (!enabled || !isNativeMobileRuntime()) return false;
    activeFieldRef.current = target;
    window.setTimeout(() => scrollFieldIntoView(target, "smooth"), focusDelayMs);
    return true;
  }, [enabled, focusDelayMs, scrollFieldIntoView]);

  useEffect(() => {
    if (!enabled || !isNativeMobileRuntime()) return;

    let disposed = false;
    const handles: Array<{ remove: () => Promise<void> | void }> = [];

    function updateKeyboardInset(keyboardHeight: number) {
      if (disposed) return;
      const nextInset = Math.max(0, Math.round(keyboardHeight));
      keyboardInsetRef.current = nextInset;
      setKeyboardInset(nextInset);

      const target = activeFieldRef.current;
      if (!target) return;
      window.setTimeout(() => scrollFieldIntoView(target, "smooth"), 80);
    }

    Keyboard.addListener("keyboardWillShow", (info) => updateKeyboardInset(info.keyboardHeight)).then((handle) => {
      if (disposed) {
        void handle.remove();
        return;
      }
      handles.push(handle);
    });
    Keyboard.addListener("keyboardDidShow", (info) => updateKeyboardInset(info.keyboardHeight)).then((handle) => {
      if (disposed) {
        void handle.remove();
        return;
      }
      handles.push(handle);
    });
    Keyboard.addListener("keyboardWillHide", () => {
      if (disposed) return;
      keyboardInsetRef.current = 0;
      setKeyboardInset(0);
      activeFieldRef.current = null;
    }).then((handle) => {
      if (disposed) {
        void handle.remove();
        return;
      }
      handles.push(handle);
    });

    return () => {
      disposed = true;
      keyboardInsetRef.current = 0;
      activeFieldRef.current = null;
      handles.forEach((handle) => {
        void handle.remove();
      });
    };
  }, [enabled, scrollFieldIntoView]);

  const scrollContainerStyle = useMemo<CSSProperties | undefined>(() => {
    if (keyboardInset <= 0) return undefined;
    return { paddingBottom: `calc(${keyboardInset}px + ${bottomPadding}px + env(safe-area-inset-bottom))` };
  }, [bottomPadding, keyboardInset]);

  const footerLiftStyle = useMemo<CSSProperties | undefined>(() => {
    if (keyboardInset <= 0) return undefined;
    return { marginBottom: `${keyboardInset}px` };
  }, [keyboardInset]);

  return {
    keyboardInset,
    scrollContainerRef,
    scrollContainerStyle,
    footerLiftStyle,
    handleFieldFocus,
    scrollFieldIntoView,
  };
}
