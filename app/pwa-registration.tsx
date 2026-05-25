"use client";

import { useEffect } from "react";

function isCapacitorRuntime() {
  const maybeCapacitor = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return window.location.protocol === "capacitor:" || Boolean(maybeCapacitor?.isNativePlatform?.());
}

const appBuildId = process.env.NEXT_PUBLIC_APP_BUILD_ID ?? "local";

function isEventItemInlineEditorFocused() {
  const activeElement = document.activeElement;
  return activeElement instanceof HTMLElement && Boolean(activeElement.closest("[data-event-item-inline-editor='true']"));
}

export function PwaRegistration() {
  useEffect(() => {
    let frameId: number | null = null;
    let settleTimer: number | null = null;

    function updateViewportHeight() {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        if (isEventItemInlineEditorFocused()) return;

        const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
        document.documentElement.style.setProperty("--app-height", `${Math.round(viewportHeight)}px`);
        document.documentElement.style.setProperty("--app-viewport-offset-top", `${Math.max(0, Math.round(window.visualViewport?.offsetTop ?? 0))}px`);

        if (document.scrollingElement && document.scrollingElement.scrollTop !== 0) {
          document.scrollingElement.scrollTop = 0;
        }
      });
    }

    function updateViewportHeightAfterInlineEdit(event: FocusEvent) {
      const target = event.target;
      if (!(target instanceof HTMLElement) || !target.closest("[data-event-item-inline-editor='true']")) return;

      if (settleTimer !== null) {
        window.clearTimeout(settleTimer);
      }

      settleTimer = window.setTimeout(() => {
        settleTimer = null;
        updateViewportHeight();
      }, 250);
    }

    updateViewportHeight();

    window.addEventListener("resize", updateViewportHeight);
    window.addEventListener("orientationchange", updateViewportHeight);
    window.addEventListener("focus", updateViewportHeight);
    window.addEventListener("blur", updateViewportHeight);
    window.visualViewport?.addEventListener("resize", updateViewportHeight);
    window.visualViewport?.addEventListener("scroll", updateViewportHeight);
    document.addEventListener("focusout", updateViewportHeightAfterInlineEdit);

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      if (settleTimer !== null) {
        window.clearTimeout(settleTimer);
      }

      window.removeEventListener("resize", updateViewportHeight);
      window.removeEventListener("orientationchange", updateViewportHeight);
      window.removeEventListener("focus", updateViewportHeight);
      window.removeEventListener("blur", updateViewportHeight);
      window.visualViewport?.removeEventListener("resize", updateViewportHeight);
      window.visualViewport?.removeEventListener("scroll", updateViewportHeight);
      document.removeEventListener("focusout", updateViewportHeightAfterInlineEdit);
    };
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (isCapacitorRuntime()) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => {
          void registration.unregister();
        });
      });

      if ("caches" in window) {
        caches.keys().then((keys) => {
          keys
            .filter((key) => key.startsWith("mstv-production-os"))
            .forEach((key) => {
              void caches.delete(key);
            });
        });
      }

      return;
    }

    if (process.env.NODE_ENV !== "production") return;

    const swUrl = `/sw.js?v=${encodeURIComponent(appBuildId)}`;

    navigator.serviceWorker.register(swUrl).then((registration) => {
      void registration.update();
    }).catch((error) => {
      console.error("Failed to register MSTV PWA service worker", error);
    });
  }, []);

  return null;
}
