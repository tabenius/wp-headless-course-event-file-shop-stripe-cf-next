"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { t, getLocale, setLocale } from "@/lib/i18n";
import {
  ADMIN_ACTION_HOTKEYS,
  getAdminTabHotkeyLabel,
  isAdminActionHotkey,
  shouldIgnoreAdminHotkeys,
} from "@/lib/adminHotkeys";
import RagbazLogo from "./ragbaz-logo";

const CHAT_BETA_STORAGE_KEY = "ragbaz_chat_beta_enabled";

const ADMIN_TAB_SET = new Set([
  "welcome",
  "sales",
  "media",
  "products",
  "chat",
  "style",
  "info",
  "support",
]);

function parseTabHash(hashValue) {
  const normalized = String(hashValue || "")
    .replace(/^#\/?/, "")
    .split(/[/?&]/)[0]
    .trim()
    .toLowerCase();
  const tab = normalizeTab(normalized);
  return tab;
}

function normalizeTab(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^#\/?/, "");
  const base = normalized.split(/[/?&]/)[0];
  if (!base) return null;
  if (
    base === "sandbox" ||
    base === "health" ||
    base === "stats" ||
    base === "docs" ||
    base === "documentation"
  ) {
    return "info";
  }
  return ADMIN_TAB_SET.has(base) ? base : null;
}

function hashForTabRoute(value) {
  const normalized = String(value || "").trim().toLowerCase().replace(/^#\/?/, "");
  if (
    normalized === "health" ||
    normalized === "status" ||
    normalized === "info/health"
  ) {
    return "#/info/health";
  }
  if (
    normalized === "stats" ||
    normalized === "statistics" ||
    normalized === "info/stats"
  ) {
    return "#/info/stats";
  }
  if (
    normalized === "docs" ||
    normalized === "documentation" ||
    normalized === "info/docs"
  ) {
    return "#/info/docs";
  }
  const tab = normalizeTab(normalized);
  if (!tab) return null;
  return `#/${tab}`;
}

function getNavItems(chatBetaEnabled) {
  const items = [
    {
      label: t("admin.navSales", "Sales"),
      tab: "sales",
      hotkey: getAdminTabHotkeyLabel("sales"),
    },
    {
      label: t("admin.navMedia", "Asset library"),
      tab: "media",
      hotkey: getAdminTabHotkeyLabel("media"),
    },
    {
      label: t("admin.navProducts"),
      tab: "products",
      hotkey: getAdminTabHotkeyLabel("products"),
    },
    {
      label: t("admin.navSupport"),
      tab: "support",
      hotkey: getAdminTabHotkeyLabel("support"),
    },
    {
      label: t("admin.navStyle"),
      tab: "style",
      hotkey: getAdminTabHotkeyLabel("style"),
    },
    ...(chatBetaEnabled
      ? [
          {
            label: t("admin.navChat"),
            tab: "chat",
            hotkey: getAdminTabHotkeyLabel("chat"),
          },
        ]
      : []),
    {
      label: t("admin.navSystem", "System"),
      tab: "info",
      hotkey: getAdminTabHotkeyLabel("info"),
    },
    {
      label: t("admin.navWelcome", "Welcome"),
      tab: "welcome",
      hotkey: getAdminTabHotkeyLabel("welcome"),
    },
  ];
  return items;
}

const healthDotColor = {
  green: "#059669",
  amber: "#d97706",
  red: "#b91c1c",
};

function getFocusableElements(container) {
  if (!container || typeof container.querySelectorAll !== "function") return [];
  return Array.from(
    container.querySelectorAll(
      [
        "a[href]",
        "button:not([disabled])",
        "input:not([disabled]):not([type='hidden'])",
        "select:not([disabled])",
        "textarea:not([disabled])",
        "[tabindex]:not([tabindex='-1'])",
      ].join(","),
    ),
  ).filter((node) => {
    if (!(node instanceof HTMLElement)) return false;
    if (node.hasAttribute("disabled")) return false;
    if (node.getAttribute("aria-hidden") === "true") return false;
    return true;
  });
}

export default function AdminHeader({ logoUrl }) {
  const router = useRouter();
  const pathname = usePathname();
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window === "undefined") return "welcome";
    return parseTabHash(window.location.hash) || "welcome";
  });
  const [localeState, setLocaleState] = useState(getLocale);
  const [menuOpen, setMenuOpen] = useState(false);
  const [healthState, setHealthState] = useState("amber");
  const [showHealthTooltip, setShowHealthTooltip] = useState(false);
  const ragbazWordmarkRef = useRef(null);
  const subtitleRef = useRef(null);
  const menuDrawerRef = useRef(null);
  const menuToggleButtonRef = useRef(null);
  const lastFocusedBeforeMenuRef = useRef(null);
  const [subtitleScaleX, setSubtitleScaleX] = useState(1);
  const [tickerStats, setTickerStats] = useState(null);
  const [chatBetaEnabled, setChatBetaEnabled] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(CHAT_BETA_STORAGE_KEY) === "true";
  });
  const log = (...args) => console.info("[AdminHeader]", ...args);
  const healthLabelMap = {
    green: t("admin.healthStatusGreen", "All systems operational"),
    amber: t("admin.healthStatusAmber", "Partial connectivity"),
    red: t("admin.healthStatusRed", "Critical issues"),
  };

  useEffect(() => {
    function onTabSwitch(e) {
      const tab = normalizeTab(e?.detail);
      if (!tab) return;
      setActiveTab(tab);
    }
    window.addEventListener("admin:switchTab", onTabSwitch);
    return () => window.removeEventListener("admin:switchTab", onTabSwitch);
  }, []);

  useEffect(() => {
    function onHashChange() {
      const hashTab = parseTabHash(window.location.hash);
      if (hashTab) setActiveTab(hashTab);
    }
    onHashChange();
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    function onHealthStatus(e) {
      setHealthState(e.detail?.status || "amber");
    }
    window.addEventListener("admin:healthStatus", onHealthStatus);
    return () => window.removeEventListener("admin:healthStatus", onHealthStatus);
  }, []);

  useEffect(() => {
    function onStorage(e) {
      if (e.key === CHAT_BETA_STORAGE_KEY) {
        setChatBetaEnabled(e.newValue === "true");
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    log("mounted");
    return () => log("unmounted");
  }, []);

  useEffect(() => {
    log("menu", menuOpen ? "open" : "closed");
  }, [menuOpen]);

  useEffect(() => {
    log("health", healthState);
  }, [healthState]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    lastFocusedBeforeMenuRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const fallbackFocus = menuToggleButtonRef.current;
    const drawer = menuDrawerRef.current;
    const focusable = getFocusableElements(drawer);
    (focusable[0] || drawer)?.focus?.();

    function onKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        setMenuOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const scope = menuDrawerRef.current;
      const nodes = getFocusableElements(scope);
      if (nodes.length === 0) {
        event.preventDefault();
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;
      if (event.shiftKey) {
        if (active === first || !scope?.contains(active)) {
          event.preventDefault();
          last.focus();
        }
        return;
      }
      if (active === last || !scope?.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      const restoreTarget =
        lastFocusedBeforeMenuRef.current || fallbackFocus;
      restoreTarget?.focus?.();
    };
  }, [menuOpen]);

  useEffect(() => {
    function onGlobalHotkey(event) {
      if (shouldIgnoreAdminHotkeys(event)) return;
      if (isAdminActionHotkey(event, "menuToggle")) {
        event.preventDefault();
        setMenuOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", onGlobalHotkey);
    return () => window.removeEventListener("keydown", onGlobalHotkey);
  }, []);

  useEffect(() => {
    function alignSubtitleWidth() {
      const wordmark = ragbazWordmarkRef.current;
      const subtitle = subtitleRef.current;
      if (!wordmark || !subtitle) return;
      const targetWidth = wordmark.getBoundingClientRect().width;
      const baseWidth =
        subtitle.scrollWidth || subtitle.getBoundingClientRect().width;
      if (!targetWidth || !baseWidth) return;
      const nextScale = Math.max(0.88, Math.min(1.35, targetWidth / baseWidth));
      setSubtitleScaleX((prev) =>
        Math.abs(prev - nextScale) < 0.005 ? prev : nextScale,
      );
    }

    alignSubtitleWidth();
    const raf = window.requestAnimationFrame(alignSubtitleWidth);
    const timeoutId = window.setTimeout(alignSubtitleWidth, 120);
    window.addEventListener("resize", alignSubtitleWidth);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timeoutId);
      window.removeEventListener("resize", alignSubtitleWidth);
    };
  }, [localeState]);

  useEffect(() => {
    let cancelled = false;
    async function loadTicker() {
      try {
        const response = await fetch("/api/admin/stats-ticker");
        if (!response.ok) return;
        const json = await response.json().catch(() => null);
        if (!cancelled && json?.ok) setTickerStats(json.stats);
      } catch {
        // Silently ignore — ticker is best-effort
      }
    }
    loadTicker();
    const interval = setInterval(loadTicker, 5 * 60 * 1000); // refresh every 5 min
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (pathname === "/admin/login") return null;

  function buildTickerText(stats) {
    if (!stats) return t("admin.statsTickerUnavailable", "Stats unavailable");
    const parts = [];
    const currency = stats.currency || "SEK";

    if (stats.revenue && typeof stats.revenue === "object") {
      const revEntry = stats.revenue[currency];
      if (revEntry != null) {
        const amount = Math.round(revEntry / 100);
        parts.push(`${t("admin.statsTickerRevenue", "Revenue")}: ${amount.toLocaleString()} ${currency}`);
      }
    }
    if (stats.transactions != null) {
      parts.push(`${t("admin.statsTickerTransactions", "Sales")}: ${stats.transactions}`);
    }
    if (stats.customers != null) {
      parts.push(`${t("admin.statsTickerCustomers", "Customers")}: ${stats.customers}`);
    }
    if (stats.salesPerUser != null) {
      parts.push(`${t("admin.statsTickerSalesPerUser", "Sales/user")}: ${stats.salesPerUser.toFixed(1)}×`);
    }
    if (stats.weeklyAvgHitsPerDay != null) {
      parts.push(`${t("admin.statsTickerHitsPerDay", "Avg hits/day")}: ${stats.weeklyAvgHitsPerDay.toLocaleString()}`);
    }
    return parts.length > 0
      ? parts.join("  ·  ")
      : t("admin.statsTickerUnavailable", "Stats unavailable");
  }

  async function logoutAdmin() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  function switchTab(tab) {
    const safeTab = normalizeTab(tab);
    if (!safeTab) return;
    const nextHash = hashForTabRoute(tab) || `#/${safeTab}`;
    if (pathname !== "/admin") {
      router.push(`/admin${nextHash}`);
      setMenuOpen(false);
      return;
    }
    if (window.location.hash !== nextHash) {
      const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;
      window.history.replaceState(null, "", nextUrl);
    }
    window.dispatchEvent(
      new CustomEvent("admin:switchTab", {
        detail: nextHash.replace(/^#\/?/, ""),
      }),
    );
    setMenuOpen(false);
  }

  const navItems = getNavItems(chatBetaEnabled);
  const tabItems = navItems.filter((item) => item.tab);
  const healthHotkey = getAdminTabHotkeyLabel("health")
    .split("+")
    .pop()
    .toUpperCase();
  const logoutHotkey = ADMIN_ACTION_HOTKEYS.logout.combo
    .split("+")
    .pop()
    .toUpperCase();

  return (
    <header className="admin-header-shell relative overflow-visible w-full sticky top-0 z-40 border-b">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex w-full h-14 items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-center leading-none">
              <button
                ref={menuToggleButtonRef}
                type="button"
                onClick={() => setMenuOpen((prev) => !prev)}
                className="admin-header-control p-2 rounded-lg border focus:outline-none focus:ring-2"
                aria-label={t("admin.menuToggle", "Toggle main menu")}
              >
                <span className="flex flex-col gap-1">
                  <span className="block h-0.5 w-5 bg-current" />
                  <span className="block h-0.5 w-6 bg-current" />
                  <span className="block h-0.5 w-4 bg-current" />
                </span>
              </button>
              <span className="admin-header-hint mt-1 text-[9px] font-medium tracking-wide">
                Ctrl+Alt+M
              </span>
            </div>
            <Link
              href="/admin#/welcome"
              className="admin-header-brand-link flex flex-col items-start justify-center gap-0.5 transition-colors"
              aria-label={t("admin.headerAria", "Goto admin home")}
            >
              <span ref={ragbazWordmarkRef} className="ml-6 inline-flex">
                <RagbazLogo
                  wordmarkOnly
                  noLetterSpacing
                  scale={1.75}
                  color="#c59052"
                  outlineColor="#2b1a0e"
                  outlineWidth={1}
                />
              </span>
              <span
                ref={subtitleRef}
                className="whitespace-nowrap font-semibold uppercase tracking-[0.11em] leading-none"
                style={{
                  marginLeft: "1.5rem",
                  marginTop: "2px",
                  color: "var(--admin-brand-subtitle)",
                  fontSize: "9.5px",
                  transform: `scaleX(${subtitleScaleX})`,
                  transformOrigin: "left center",
                }}
              >
                ARTICULATE STOREFRONT
              </span>
            </Link>
          </div>

          <div className="relative flex items-center gap-3">
            <button
              type="button"
              onClick={() => switchTab("info/health")}
              onMouseEnter={() => setShowHealthTooltip(true)}
              onMouseLeave={() => setShowHealthTooltip(false)}
              onFocus={() => setShowHealthTooltip(true)}
              onBlur={() => setShowHealthTooltip(false)}
              className="admin-header-control flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs focus:outline-none focus:ring-2"
              aria-label={t("admin.healthCheck", "Control check")}
              title={healthLabelMap[healthState]}
            >
              <span>{t("admin.healthStatus", "Status")}</span>
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: healthDotColor[healthState] }}
              />
            </button>
            {showHealthTooltip && (
              <div className="admin-header-popover absolute right-0 top-full z-[80] mt-2 w-64 rounded-lg border p-3 text-xs shadow-xl">
                <p className="font-semibold">
                  {healthLabelMap[healthState]}
                </p>
                <p className="mt-1">
                  {t(
                    "admin.healthTooltipHint",
                    "System checks summarize connector status and environment readiness.",
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => switchTab("info/health")}
                  className="admin-header-control mt-2 inline-flex items-center rounded border px-2 py-1 text-[11px] font-semibold"
                >
                  {t("admin.healthCheck", "Control check")}
                </button>
              </div>
            )}
          </div>

          {menuOpen && (
            <>
              <button
                type="button"
                aria-label="Close menu overlay"
                className="fixed inset-0 top-14 z-40 bg-slate-950/55 backdrop-blur-[1px]"
                onClick={() => setMenuOpen(false)}
              />
              <aside
                ref={menuDrawerRef}
                tabIndex={-1}
                className="admin-header-drawer fixed top-14 left-0 z-50 h-[calc(100dvh-3.5rem)] w-full max-w-sm overflow-y-auto border-r p-4 shadow-2xl"
              >
                <div className="space-y-2">
                  {tabItems.map((item) => {
                    const keyLabel = item.hotkey
                      ? item.hotkey.split("+").pop().toUpperCase()
                      : null;
                    return (
                      <button
                        key={item.tab}
                        type="button"
                        onClick={() => switchTab(item.tab)}
                        className={`admin-header-drawer-item w-full rounded-2xl px-3 py-2.5 text-sm font-medium border transition-colors ${
                          pathname === "/admin" && activeTab === item.tab
                            ? "is-active"
                            : ""
                        }`}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span>{item.label}</span>
                          {keyLabel && (
                            <kbd className="admin-header-kbd rounded border px-2 py-0.5 text-xs font-semibold tracking-wide">
                              {keyLabel}
                            </kbd>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="admin-header-drawer-meta mt-4 space-y-2 text-xs">
                  <div className="flex items-center gap-2">
                    <label className="font-semibold">{t("admin.languageLabel")}</label>
                    <select
                      value={localeState}
                      onChange={(e) => {
                        const next = e.target.value;
                        setLocale(next);
                        setLocaleState(next);
                        router.refresh();
                        setMenuOpen(false);
                      }}
                      className="admin-header-select rounded border px-2 py-1 text-xs"
                    >
                      <option value="sv">Svenska</option>
                      <option value="en">English</option>
                      <option value="es">Español</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => switchTab("info/health")}
                    className="flex items-center justify-between w-full"
                  >
                    <span>{t("admin.healthCheck")}</span>
                    <kbd className="admin-header-kbd rounded border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide">
                      {healthHotkey}
                    </kbd>
                  </button>
                  <button
                    type="button"
                    onClick={logoutAdmin}
                    className="admin-header-danger flex items-center justify-between w-full"
                  >
                    <span>{t("admin.logout", "Logout")}</span>
                    <kbd className="admin-header-kbd rounded border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide">
                      {logoutHotkey}
                    </kbd>
                  </button>
                </div>
              </aside>
            </>
          )}
        </div>
      </div>
      {/* Stats ticker — thin scrolling bar below the main nav row */}
      <div
        className="admin-header-ticker w-full overflow-hidden border-t"
        style={{ height: "1.4rem" }}
        aria-label={t("admin.statsTicker", "Stats")}
      >
        <div
          className="admin-header-ticker-text flex whitespace-nowrap text-[10px] font-medium select-none"
          style={{
            animation: "admin-ticker-scroll 60s linear infinite",
            willChange: "transform",
            paddingTop: "2px",
          }}
        >
          {/* Duplicate text for seamless loop */}
          <span className="px-8">{buildTickerText(tickerStats)}</span>
          <span className="px-8" aria-hidden="true">{buildTickerText(tickerStats)}</span>
          <span className="px-8" aria-hidden="true">{buildTickerText(tickerStats)}</span>
        </div>
      </div>
    </header>
  );
}
