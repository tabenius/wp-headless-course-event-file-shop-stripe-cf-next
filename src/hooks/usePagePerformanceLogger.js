"use client";

import { useEffect } from "react";

/**
 * Logs page load performance to /api/admin/page-performance after the page
 * becomes fully interactive.
 *
 * Reads TTFB and domComplete from the Navigation Timing API and observes
 * Largest Contentful Paint (LCP), First Contentful Paint (FCP), Interaction to
 * Next Paint (INP), and Cumulative Layout Shift (CLS) via PerformanceObserver.
 *
 * Only fires once per page navigation. The request is a fire-and-forget
 * `sendBeacon` / `fetch` so it does not block rendering.
 */
export function usePagePerformanceLogger() {
  useEffect(() => {
    if (typeof window === "undefined" || typeof performance === "undefined") return;

    let sent = false;
    let lcp = null;
    let fcp = null;
    let inp = null;
    let cls = 0;
    let lcpObserver = null;
    let fcpObserver = null;
    let inpObserver = null;
    let clsObserver = null;

    function getSessionId() {
      try {
        let sid = sessionStorage.getItem("_vsid");
        if (!sid) {
          sid = crypto.randomUUID();
          sessionStorage.setItem("_vsid", sid);
        }
        return sid;
      } catch {
        return "";
      }
    }

    function send() {
      if (sent) return;
      const nav = performance.getEntriesByType("navigation")[0];
      if (!nav) return;
      sent = true;

      const payload = {
        url: `${window.location.pathname}${window.location.search || ""}`,
        referrer: document.referrer || "",
        sessionId: getSessionId(),
        ttfb: nav.responseStart - nav.requestStart,
        domComplete: nav.domComplete,
        navigationType: nav.type || "navigate",
        ...(lcp != null ? { lcp } : {}),
        ...(fcp != null ? { fcp } : {}),
        ...(inp != null ? { inp } : {}),
        ...(cls > 0 ? { cls } : {}),
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

    // Observe INP candidate events
    try {
      inpObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const interactionId = Number(entry?.interactionId || 0);
          const duration = Number(entry?.duration || 0);
          if (!Number.isFinite(duration) || interactionId <= 0) continue;
          inp = inp == null ? duration : Math.max(inp, duration);
        }
      });
      inpObserver.observe({ type: "event", buffered: true, durationThreshold: 40 });
    } catch {
      // Not supported in all browsers
    }

    // Observe CLS
    try {
      clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry || entry.hadRecentInput) continue;
          const value = Number(entry.value || 0);
          if (!Number.isFinite(value) || value <= 0) continue;
          cls += value;
        }
      });
      clsObserver.observe({ type: "layout-shift", buffered: true });
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

    function onPageHidden() {
      if (document.visibilityState === "hidden") {
        send();
      }
    }

    if (document.readyState === "complete") {
      onLoad();
    } else {
      window.addEventListener("load", onLoad, { once: true });
    }
    document.addEventListener("visibilitychange", onPageHidden);
    window.addEventListener("pagehide", send, { once: true });

    return () => {
      document.removeEventListener("visibilitychange", onPageHidden);
      window.removeEventListener("pagehide", send);
      lcpObserver?.disconnect();
      fcpObserver?.disconnect();
      inpObserver?.disconnect();
      clsObserver?.disconnect();
    };
  }, []); // runs once per mount (i.e. per page navigation in App Router)
}
