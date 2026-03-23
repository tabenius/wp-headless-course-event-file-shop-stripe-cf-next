"use client";

import { useEffect } from "react";

/**
 * Logs page load performance to /api/admin/page-performance after the page
 * becomes fully interactive.
 *
 * Reads TTFB and domComplete from the Navigation Timing API and observes
 * Largest Contentful Paint (LCP) and First Contentful Paint (FCP) via
 * PerformanceObserver.
 *
 * Only fires once per page navigation. The request is a fire-and-forget
 * `sendBeacon` / `fetch` so it does not block rendering.
 */
export function usePagePerformanceLogger() {
  useEffect(() => {
    if (typeof window === "undefined" || typeof performance === "undefined") return;

    let lcp = null;
    let fcp = null;
    let lcpObserver = null;
    let fcpObserver = null;

    function send() {
      const nav = performance.getEntriesByType("navigation")[0];
      if (!nav) return;

      const payload = {
        url: window.location.pathname,
        ttfb: nav.responseStart - nav.requestStart,
        domComplete: nav.domComplete,
        ...(lcp != null ? { lcp } : {}),
        ...(fcp != null ? { fcp } : {}),
      };

      // Use sendBeacon when available so the request survives page unload
      const body = JSON.stringify(payload);
      if (typeof navigator.sendBeacon === "function") {
        navigator.sendBeacon("/api/admin/page-performance", new Blob([body], { type: "application/json" }));
      } else {
        fetch("/api/admin/page-performance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        }).catch(() => {});
      }
    }

    // Observe LCP
    try {
      lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        if (entries.length > 0) {
          lcp = entries[entries.length - 1].startTime;
        }
      });
      lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });
    } catch {
      // Not supported in all browsers
    }

    // Observe FCP
    try {
      fcpObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name === "first-contentful-paint") {
            fcp = entry.startTime;
          }
        }
      });
      fcpObserver.observe({ type: "paint", buffered: true });
    } catch {
      // Not supported in all browsers
    }

    // Send after page is fully loaded — give LCP observer a moment to fire
    function onLoad() {
      setTimeout(send, 1500);
    }

    if (document.readyState === "complete") {
      onLoad();
    } else {
      window.addEventListener("load", onLoad, { once: true });
    }

    return () => {
      lcpObserver?.disconnect();
      fcpObserver?.disconnect();
    };
  }, []); // runs once per mount (i.e. per page navigation in App Router)
}
