"use client";

import { useEffect, useState } from "react";
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
  "stats",
  "storage",
  "products",
  "chat",
  "health",
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
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;
  const tab = normalized === "sandbox" ? "info" : normalized;
  return ADMIN_TAB_SET.has(tab) ? tab : null;
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
      label: t("admin.navStats"),
      tab: "stats",
      hotkey: getAdminTabHotkeyLabel("stats"),
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
      label: t("admin.healthStatus", "Health"),
      tab: "health",
      hotkey: getAdminTabHotkeyLabel("health"),
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
    { href: "/admin/docs", label: t("admin.documentation") },
  ];
}

const healthDotColor = {
  green: "#059669",
  amber: "#d97706",
  red: "#b91c1c",
};

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
  const log = (...args) => console.info("[AdminHeader]", ...args);
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
      if (!isAdminActionHotkey(event, "menuToggle")) return;
      event.preventDefault();
      setMenuOpen((prev) => !prev);
    }
    window.addEventListener("keydown", onGlobalHotkey);
    return () => window.removeEventListener("keydown", onGlobalHotkey);
  }, []);

  if (pathname === "/admin/login") return null;

  async function logoutAdmin() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  function toggleTheme() {
    const next = adminTheme === "gruvbox" ? "light" : "gruvbox";
    setAdminTheme(next);
    window.dispatchEvent(new CustomEvent("admin:setTheme", { detail: next }));
  }

  function switchTab(tab) {
    const safeTab = normalizeTab(tab);
    if (!safeTab) return;
    if (pathname !== "/admin") {
      router.push(`/admin#/${safeTab}`);
      setMenuOpen(false);
      return;
    }
    window.dispatchEvent(new CustomEvent("admin:switchTab", { detail: safeTab }));
    setMenuOpen(false);
  }

  const navItems = getNavItems();
  const tabItems = navItems.filter((item) => item.tab);
  const docItem = navItems.find((item) => item.href);
  const healthHotkey = getAdminTabHotkeyLabel("health")
    .split("+")
    .pop()
    .toUpperCase();
  const logoutHotkey = ADMIN_ACTION_HOTKEYS.logout.combo
    .split("+")
    .pop()
    .toUpperCase();

  return (
    <header className="w-full sticky top-0 z-40 bg-indigo-950 border-b border-indigo-900">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex w-full h-14 items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-center leading-none">
              <button
                type="button"
                onClick={() => setMenuOpen((prev) => !prev)}
                className="p-2 rounded-lg bg-indigo-900/90 border border-white/30 text-white hover:bg-indigo-800 focus:outline-none focus:ring-2 focus:ring-white"
                aria-label={t("admin.menuToggle", "Toggle main menu")}
              >
                <span className="flex flex-col gap-1">
                  <span className="block h-0.5 w-5 bg-white" />
                  <span className="block h-0.5 w-6 bg-white" />
                  <span className="block h-0.5 w-4 bg-white" />
                </span>
              </button>
              <span className="mt-1 text-[9px] font-medium tracking-wide text-indigo-200">
                Ctrl+Alt+M
              </span>
            </div>
            <Link
              href="/admin#/welcome"
              className="flex items-center gap-2 text-white/95 hover:text-white transition-colors"
              aria-label={t("admin.headerAria", "Goto admin home")}
            >
              <RagbazLogo wordmarkOnly noLetterSpacing />
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white">
                ARTICULATE STOREFRONT
              </span>
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleTheme}
              className="p-2 rounded-full bg-indigo-900/70 border border-white/30 text-white hover:bg-indigo-800 focus:outline-none focus:ring-2 focus:ring-white"
              aria-label={
                adminTheme === "gruvbox"
                  ? t("admin.themeLight", "Switch to light theme")
                  : t("admin.themeDark", "Switch to gruvbox theme")
              }
            >
              {adminTheme === "gruvbox" ? "☀" : "🌙"}
            </button>

            <button
              type="button"
              onClick={() => switchTab("health")}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/20 text-xs text-white"
              title={healthLabelMap[healthState]}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: healthDotColor[healthState] }}
              />
              <span>{t("admin.healthStatus", "Health")}</span>
            </button>
          </div>

          {menuOpen && (
            <>
              <button
                type="button"
                aria-label="Close menu overlay"
                className="fixed inset-0 top-14 z-40 bg-slate-950/55 backdrop-blur-[1px]"
                onClick={() => setMenuOpen(false)}
              />
              <aside className="fixed top-14 left-0 z-50 h-[calc(100dvh-3.5rem)] w-full max-w-sm overflow-y-auto border-r border-white/20 bg-indigo-950/98 p-4 shadow-2xl">
                <div className="mb-3 rounded-2xl border border-white/15 bg-indigo-900/70 p-3 text-indigo-100">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-indigo-200">
                    {t("admin.hotkeys", "Hotkeys")}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <kbd className="rounded-lg border border-white/35 bg-white/10 px-3 py-1 text-base font-semibold tracking-wide text-white">
                      Ctrl
                    </kbd>
                    <span className="text-lg text-indigo-200">+</span>
                    <kbd className="rounded-lg border border-white/35 bg-white/10 px-3 py-1 text-base font-semibold tracking-wide text-white">
                      Alt
                    </kbd>
                  </div>
                  <p className="mt-2 text-[11px] text-indigo-200/95">
                    {t(
                      "admin.hotkeyHintCompact",
                      "Use Ctrl + Alt with the letter below.",
                    )}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {tabItems
                      .filter((item) => item.hotkey)
                      .map((item) => {
                        const keyLabel = item.hotkey
                          .split("+")
                          .pop()
                          .toUpperCase();
                        return (
                          <span
                            key={`legend-${item.tab}`}
                            className="inline-flex items-center gap-1 rounded-md border border-white/25 bg-white/10 px-2 py-1 text-[11px] leading-none"
                          >
                            <span className="font-semibold text-white">
                              {keyLabel}
                            </span>
                            <span className="text-indigo-100/95">
                              {item.label}
                            </span>
                          </span>
                        );
                      })}
                  </div>
                </div>
                <div className="space-y-2">
                  {tabItems.map((item) => (
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
                      </span>
                    </button>
                  ))}
                </div>
                {docItem && (
                  <Link
                    href={docItem.href}
                    className="mt-3 inline-flex items-center justify-center w-full rounded-2xl border border-white/20 px-3 py-2 text-sm text-white hover:bg-white/10"
                    onClick={() => setMenuOpen(false)}
                  >
                    {docItem.label}
                  </Link>
                )}
                <div className="mt-4 space-y-2 text-xs text-indigo-100">
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
                      className="rounded border border-white/20 bg-indigo-900 px-2 py-1 text-xs text-white"
                    >
                      <option value="sv">Svenska</option>
                      <option value="en">English</option>
                      <option value="es">Español</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => switchTab("health")}
                    className="flex items-center justify-between w-full text-white"
                  >
                    <span>{t("admin.healthCheck")}</span>
                    <kbd className="rounded border border-white/25 bg-white/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-indigo-100">
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
