"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { t, getLocale, setLocale } from "@/lib/i18n";
import RagbazLogo from "./RagbazLogo";

function getNavItems() {
  return [
    { label: t("admin.navWelcome", "Welcome"), tab: "welcome", hotkey: "Ctrl+Alt+0" },
    { label: t("admin.navSales", "Sales"), tab: "sales", hotkey: "Ctrl+Alt+1" },
    { label: t("admin.navStats"), tab: "stats", hotkey: "Ctrl+Alt+2" },
    { label: t("admin.navProducts"), tab: "products", hotkey: "Ctrl+Alt+3" },
    { label: t("admin.navSupport"), tab: "support", hotkey: "Ctrl+Alt+4" },
    { label: t("admin.navChat"), tab: "chat", hotkey: "Ctrl+Alt+5" },
    { label: t("admin.healthStatus", "Health"), tab: "health", hotkey: "Ctrl+Alt+6" },
    { label: t("admin.navSandbox"), tab: "sandbox", hotkey: "Ctrl+Alt+7" },
    { label: t("admin.navStyle"), tab: "style", hotkey: "Ctrl+Alt+8" },
    { label: t("admin.navStorage"), tab: "storage", hotkey: "Ctrl+Alt+S" },
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
  const [activeTab, setActiveTab] = useState("welcome");
  const [localeState, setLocaleState] = useState(getLocale);
  const [adminTheme, setAdminTheme] = useState("light");
  const [menuOpen, setMenuOpen] = useState(false);
  const [healthState, setHealthState] = useState("amber");
  const log = (...args) => console.info("[AdminHeader]", ...args);
  const healthLabelMap = useMemo(
    () => ({
      green: t("admin.healthStatusGreen", "All systems operational"),
      amber: t("admin.healthStatusAmber", "Partial connectivity"),
      red: t("admin.healthStatusRed", "Critical issues"),
    }),
    [],
  );

  useEffect(() => {
    const saved = localStorage.getItem("ragbaz-admin-theme");
    if (saved) setAdminTheme(saved);
  }, []);

  useEffect(() => {
    function onTabSwitch(e) {
      setActiveTab(e.detail);
    }
    window.addEventListener("admin:switchTab", onTabSwitch);
    return () => window.removeEventListener("admin:switchTab", onTabSwitch);
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
    if (pathname !== "/admin") {
      router.push("/admin");
    }
    window.dispatchEvent(new CustomEvent("admin:switchTab", { detail: tab }));
    setMenuOpen(false);
  }

  const navItems = getNavItems();
  const tabItems = navItems.filter((item) => item.tab);
  const docItem = navItems.find((item) => item.href);

  return (
    <header className="w-full sticky top-0 z-40 bg-indigo-950 border-b border-indigo-900">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex w-full h-14 items-center justify-between gap-4">
          <div className="flex items-center gap-4">
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
            <Link
              href="/admin"
              className="flex items-center gap-3 text-white text-sm"
              aria-label={t("admin.headerAria", "Goto admin home")}
            >
              <RagbazLogo
                color="currentColor"
                includeStoreFront
                className="text-3xl"
              />
              {logoUrl && (
                <span className="text-sm text-indigo-100 font-light">
                  {t("admin.headerSub", "Control room")}
                </span>
              )}
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
              <aside className="fixed top-14 left-0 z-50 h-[calc(100vh-3.5rem)] w-full max-w-sm overflow-y-auto border-r border-white/20 bg-indigo-950/98 p-4 shadow-2xl">
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
                        {item.hotkey && (
                          <kbd className="rounded border border-white/25 bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-indigo-100">
                            {item.hotkey}
                          </kbd>
                        )}
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
                    <kbd className="rounded border border-white/25 bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-indigo-100">
                      Ctrl+Alt+6
                    </kbd>
                  </button>
                  <button
                    type="button"
                    onClick={logoutAdmin}
                    className="flex items-center justify-between w-full text-rose-200"
                  >
                    <span>{t("admin.logout", "Logout")}</span>
                    <kbd className="rounded border border-rose-200/40 bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-rose-100">
                      Ctrl+Alt+L
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
