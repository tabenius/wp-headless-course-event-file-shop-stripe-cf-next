"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { t, getLocale, setLocale } from "@/lib/i18n";
import {
  ADMIN_ACTION_HOTKEYS,
  getAdminTabHotkeyLabel,
  isAdminActionHotkey,
} from "@/lib/adminHotkeys";
import RagbazLogo from "./RagbazLogo";

const ADMIN_TAB_SET = new Set([
  "welcome",
  "sales",
  "media",
  "storage",
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

function getNavItems() {
  return [
    {
      label: t("admin.navWelcome", "Welcome"),
      tab: "welcome",
      hotkey: getAdminTabHotkeyLabel("welcome"),
    },
    {
      label: t("admin.navSales", "Sales"),
      tab: "sales",
      hotkey: getAdminTabHotkeyLabel("sales"),
    },
    {
      label: t("admin.navMedia", "Media"),
      tab: "media",
      hotkey: getAdminTabHotkeyLabel("media"),
    },
    {
      label: t("admin.navStorage"),
      tab: "storage",
      hotkey: getAdminTabHotkeyLabel("storage"),
    },
    {
      label: t("admin.navProducts"),
      tab: "products",
      hotkey: getAdminTabHotkeyLabel("products"),
    },
    {
      label: t("admin.navChat"),
      tab: "chat",
      hotkey: getAdminTabHotkeyLabel("chat"),
    },
    {
      label: t("admin.navStyle"),
      tab: "style",
      hotkey: getAdminTabHotkeyLabel("style"),
    },
    {
      label: t("admin.navSandbox"),
      tab: "info",
      hotkey: getAdminTabHotkeyLabel("info"),
    },
    {
      label: t("admin.navSupport"),
      tab: "support",
      hotkey: getAdminTabHotkeyLabel("support"),
    },
  ];
}

const healthDotColor = {
  green: "#059669",
  amber: "#d97706",
  red: "#b91c1c",
};

function buildIconOutline(color, radius) {
  const shadows = [];
  for (let x = -radius; x <= radius; x += 1) {
    for (let y = -radius; y <= radius; y += 1) {
      if (x === 0 && y === 0) continue;
      shadows.push(`${x}px ${y}px 0 ${color}`);
    }
  }
  return shadows.join(", ");
}

const THEME_ICON_OUTLINE_NORMAL = buildIconOutline("#2f2f2f", 1);
const THEME_ICON_OUTLINE_HOVER = buildIconOutline("#000000", 3);

export default function AdminHeader({ logoUrl }) {
  const router = useRouter();
  const pathname = usePathname();
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window === "undefined") return "welcome";
    return parseTabHash(window.location.hash) || "welcome";
  });
  const [localeState, setLocaleState] = useState(getLocale);
  const [adminTheme, setAdminTheme] = useState("light");
  const [menuOpen, setMenuOpen] = useState(false);
  const [healthState, setHealthState] = useState("amber");
  const [showHealthTooltip, setShowHealthTooltip] = useState(false);
  const [themeToggleHovered, setThemeToggleHovered] = useState(false);
  const ragbazWordmarkRef = useRef(null);
  const subtitleRef = useRef(null);
  const [subtitleScaleX, setSubtitleScaleX] = useState(1);
  const log = (...args) => console.info("[AdminHeader]", ...args);
  const toggleTheme = useCallback(() => {
    const next = adminTheme === "gruvbox" ? "light" : "gruvbox";
    setAdminTheme(next);
    window.dispatchEvent(new CustomEvent("admin:setTheme", { detail: next }));
  }, [adminTheme]);
  const healthLabelMap = {
    green: t("admin.healthStatusGreen", "All systems operational"),
    amber: t("admin.healthStatusAmber", "Partial connectivity"),
    red: t("admin.healthStatusRed", "Critical issues"),
  };

  useEffect(() => {
    const saved = localStorage.getItem("ragbaz-admin-theme");
    if (saved) setAdminTheme(saved);
  }, []);

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
    log("mounted");
    return () => log("unmounted");
  }, []);

  useEffect(() => {
    log("menu", menuOpen ? "open" : "closed");
  }, [menuOpen]);

  useEffect(() => {
    log("theme", adminTheme, "health", healthState);
  }, [adminTheme, healthState]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    function onKeyDown(event) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  useEffect(() => {
    function onGlobalHotkey(event) {
      if (isAdminActionHotkey(event, "menuToggle")) {
        event.preventDefault();
        setMenuOpen((prev) => !prev);
        return;
      }
      if (isAdminActionHotkey(event, "themeToggle")) {
        event.preventDefault();
        toggleTheme();
      }
    }
    window.addEventListener("keydown", onGlobalHotkey);
    return () => window.removeEventListener("keydown", onGlobalHotkey);
  }, [toggleTheme]);

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

  if (pathname === "/admin/login") return null;

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

  const navItems = getNavItems();
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
    <header className="admin-header-concrete relative overflow-visible w-full sticky top-0 z-40 bg-[hsl(22_62%_42%)] border-b border-[hsl(22_56%_31%)]">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex w-full h-14 items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-center leading-none">
              <button
                type="button"
                onClick={() => setMenuOpen((prev) => !prev)}
                className="p-2 rounded-lg bg-[hsl(22_54%_30%/0.9)] border border-white/30 text-white hover:bg-[hsl(22_62%_36%)] focus:outline-none focus:ring-2 focus:ring-white"
                aria-label={t("admin.menuToggle", "Toggle main menu")}
              >
                <span className="flex flex-col gap-1">
                  <span className="block h-0.5 w-5 bg-white" />
                  <span className="block h-0.5 w-6 bg-white" />
                  <span className="block h-0.5 w-4 bg-white" />
                </span>
              </button>
              <span className="mt-1 text-[9px] font-medium tracking-wide text-black">
                Ctrl+Alt+M
              </span>
            </div>
            <Link
              href="/admin#/welcome"
              className="flex flex-col items-start justify-center gap-0.5 text-white/95 hover:text-white transition-colors"
              aria-label={t("admin.headerAria", "Goto admin home")}
            >
              <span ref={ragbazWordmarkRef} className="ml-6 inline-flex">
                <RagbazLogo
                  wordmarkOnly
                  noLetterSpacing
                  scale={1.75}
                  color="#00ecff"
                  outlineColor="#000000"
                  outlineWidth={1}
                />
              </span>
              <span
                ref={subtitleRef}
                className="whitespace-nowrap font-semibold uppercase tracking-[0.11em] leading-none text-black"
                style={{
                  marginLeft: "1.5rem",
                  marginTop: "2px",
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
              onClick={toggleTheme}
              onMouseEnter={() => setThemeToggleHovered(true)}
              onMouseLeave={() => setThemeToggleHovered(false)}
              className="appearance-none bg-transparent hover:bg-transparent active:bg-transparent border-0 shadow-none rounded-none px-1 text-[1.35rem] leading-none text-[#ffff00] transition-colors focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0"
              aria-label={
                adminTheme === "gruvbox"
                  ? t("admin.themeLight", "Switch to light theme")
                  : t("admin.themeDark", "Switch to gruvbox theme")
              }
            >
              <span
                style={{
                  color: "#ffff00",
                  textShadow: themeToggleHovered
                    ? THEME_ICON_OUTLINE_HOVER
                    : THEME_ICON_OUTLINE_NORMAL,
                }}
              >
                {adminTheme === "gruvbox" ? "☀" : "🌙"}
              </span>
            </button>

            <button
              type="button"
              onClick={() => switchTab("info/health")}
              onMouseEnter={() => setShowHealthTooltip(true)}
              onMouseLeave={() => setShowHealthTooltip(false)}
              onFocus={() => setShowHealthTooltip(true)}
              onBlur={() => setShowHealthTooltip(false)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[hsl(22_54%_30%/0.9)] border border-white/30 text-xs text-white hover:bg-[hsl(22_62%_36%)] focus:outline-none focus:ring-2 focus:ring-white"
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
              <div className="absolute right-0 top-full z-[80] mt-2 w-64 rounded-lg border border-white/20 bg-[hsl(22_52%_20%/0.95)] p-3 text-xs text-[hsl(39_62%_93%)] shadow-xl">
                <p className="font-semibold text-white">
                  {healthLabelMap[healthState]}
                </p>
                <p className="mt-1 text-[hsl(39_62%_93%)]">
                  {t(
                    "admin.healthTooltipHint",
                    "System checks summarize connector status and environment readiness.",
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => switchTab("info/health")}
                  className="mt-2 inline-flex items-center rounded border border-white/30 px-2 py-1 text-[11px] font-semibold text-white hover:bg-white/10"
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
              <aside className="fixed top-14 left-0 z-50 h-[calc(100dvh-3.5rem)] w-full max-w-sm overflow-y-auto border-r border-white/20 bg-[hsl(22_52%_20%/0.98)] p-4 shadow-2xl">
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
                        className={`w-full rounded-2xl px-3 py-2.5 text-sm font-medium text-white border border-white/10 transition-colors ${
                          pathname === "/admin" && activeTab === item.tab
                            ? "bg-white/20"
                            : "hover:bg-white/10"
                        }`}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span>{item.label}</span>
                          {keyLabel && (
                            <kbd className="rounded border border-white/25 bg-white/10 px-2 py-0.5 text-xs font-semibold tracking-wide text-[hsl(39_62%_93%)]">
                              {keyLabel}
                            </kbd>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-4 space-y-2 text-xs text-[hsl(39_62%_93%)]">
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
                      className="rounded border border-white/20 bg-[hsl(22_66%_36%)] px-2 py-1 text-xs text-white"
                    >
                      <option value="sv">Svenska</option>
                      <option value="en">English</option>
                      <option value="es">Español</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => switchTab("info/health")}
                    className="flex items-center justify-between w-full text-white"
                  >
                    <span>{t("admin.healthCheck")}</span>
                    <kbd className="rounded border border-white/25 bg-white/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-[hsl(39_62%_93%)]">
                      {healthHotkey}
                    </kbd>
                  </button>
                  <button
                    type="button"
                    onClick={logoutAdmin}
                    className="flex items-center justify-between w-full text-rose-200"
                  >
                    <span>{t("admin.logout", "Logout")}</span>
                    <kbd className="rounded border border-rose-200/40 bg-white/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-rose-100">
                      {logoutHotkey}
                    </kbd>
                  </button>
                </div>
              </aside>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
