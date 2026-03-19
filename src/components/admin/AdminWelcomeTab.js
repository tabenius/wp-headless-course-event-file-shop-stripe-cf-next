"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "@/lib/i18n";

const IMPRESS_SCRIPT_ID = "impress-js-1.1.0";
const BASE_SLIDE_WIDTH = 940;
const BASE_SLIDE_HEIGHT = 420;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function computeSlideLayout() {
  if (typeof window === "undefined") {
    return { slideWidth: 760, slideHeight: 340, frameHeight: 420 };
  }
  const compact = window.innerWidth < 1024;
  const horizontalPadding = compact ? 48 : 220;
  const availableWidth = window.innerWidth - horizontalPadding;
  const slideWidth = clamp(availableWidth, 360, 760);
  const scaledHeight = Math.round((slideWidth / BASE_SLIDE_WIDTH) * BASE_SLIDE_HEIGHT);
  const availableHeight = window.innerHeight - (compact ? 360 : 320);
  const slideHeight = clamp(Math.min(scaledHeight, availableHeight), 220, 360);
  const frameHeight = slideHeight + (compact ? 52 : 72);
  return { slideWidth, slideHeight, frameHeight };
}

function clearImpressClasses(node) {
  if (!node) return;
  for (const cls of Array.from(node.classList)) {
    if (cls.startsWith("impress-")) {
      node.classList.remove(cls);
    }
  }
}

function resetImpressViewportState() {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  const body = document.body;

  clearImpressClasses(html);
  clearImpressClasses(body);

  html.style.removeProperty("height");
  html.style.removeProperty("overflow");
  html.style.removeProperty("overflow-x");
  html.style.removeProperty("overflow-y");

  body.style.removeProperty("height");
  body.style.removeProperty("overflow");
  body.style.removeProperty("overflow-x");
  body.style.removeProperty("overflow-y");
  body.style.removeProperty("touch-action");
}

function MenuShortcutHint() {
  return (
    <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-indigo-300/60 bg-indigo-100/70 px-3 py-1 text-[11px] font-medium text-indigo-900">
      <span>{t("admin.welcomeMenuHint", "Open menu")}</span>
      <kbd className="rounded border border-indigo-300 bg-white px-2 py-0.5 text-[10px] font-semibold tracking-wide text-indigo-800">
        Ctrl+Alt+M
      </kbd>
    </div>
  );
}

function loadImpressScript(onReady) {
  if (typeof window === "undefined") return;
  if (window.impress) {
    onReady();
    return;
  }
  const existing = document.getElementById(IMPRESS_SCRIPT_ID);
  if (existing) {
    existing.addEventListener("load", onReady, { once: true });
    return;
  }
  const script = document.createElement("script");
  script.id = IMPRESS_SCRIPT_ID;
  script.src =
    "https://cdn.jsdelivr.net/npm/impress.js@1.1.0/js/impress.min.js";
  script.async = true;
  script.onload = onReady;
  document.body.appendChild(script);
}

function ArchitectureOverview() {
  return (
    <div className="h-full rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 via-white to-cyan-50 p-6 text-gray-900 shadow-xl">
      <h3 className="text-xl font-semibold text-slate-900">
        End-to-end architecture
      </h3>
      <p className="mt-1 text-sm text-slate-600">
        WordPress content, Stripe payments, and Cloudflare edge delivery in one
        flow.
      </p>
      <div className="mt-5 grid grid-cols-5 gap-3">
        {[
          { label: "WordPress + WPGraphQL", tone: "bg-blue-100 border-blue-200" },
          { label: "RAGBAZ Articulate Plugin", tone: "bg-indigo-100 border-indigo-200" },
          { label: "Storefront Admin + APIs", tone: "bg-fuchsia-100 border-fuchsia-200" },
          { label: "Cloudflare Workers + KV/R2", tone: "bg-cyan-100 border-cyan-200" },
          { label: "Customer Checkout + Access", tone: "bg-emerald-100 border-emerald-200" },
        ].map((item, idx) => (
          <div
            key={item.label}
            className={`rounded-xl border p-3 text-xs font-medium ${item.tone} ${
              idx === 2 ? "ring-2 ring-fuchsia-300" : ""
            }`}
          >
            {item.label}
          </div>
        ))}
      </div>
      <svg viewBox="0 0 900 190" className="mt-4 w-full h-36">
        <defs>
          <linearGradient id="archLine" x1="0%" x2="100%" y1="0%" y2="0%">
            <stop offset="0%" stopColor="#2563eb" />
            <stop offset="50%" stopColor="#9333ea" />
            <stop offset="100%" stopColor="#0e7490" />
          </linearGradient>
        </defs>
        <path
          d="M25 60 C145 160, 245 10, 365 100 C485 170, 585 20, 705 80 C785 120, 845 95, 875 130"
          fill="none"
          stroke="url(#archLine)"
          strokeWidth="8"
          strokeLinecap="round"
        />
        <circle cx="25" cy="60" r="9" fill="#2563eb" />
        <circle cx="365" cy="100" r="10" fill="#9333ea" />
        <circle cx="705" cy="80" r="9" fill="#0e7490" />
      </svg>
      <p className="text-xs text-slate-500">
        This slide intentionally starts wide so the story can zoom into concrete
        admin screens.
      </p>
    </div>
  );
}

function SalesMockScreen() {
  const rows = [
    {
      id: "ch_3Q82Az2x",
      customer: "emma@xtas.nu",
      amount: "1 490 SEK",
      status: "Succeeded",
      date: "2026-03-17",
    },
    {
      id: "ch_3Q7xWn7p",
      customer: "leo@xtas.nu",
      amount: "990 SEK",
      status: "Succeeded",
      date: "2026-03-16",
    },
    {
      id: "ch_3Q7uT89q",
      customer: "nina@xtas.nu",
      amount: "490 SEK",
      status: "Pending",
      date: "2026-03-15",
    },
  ];
  return (
    <div className="h-full rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-orange-100 p-5 shadow-xl">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            Sales command center
          </h3>
          <p className="text-xs text-gray-500">
            Mock Stripe payments with receipt access and status visibility.
          </p>
        </div>
        <div className="rounded-full bg-emerald-500 px-3 py-1 text-xs font-semibold text-white">
          +2.8% today
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3">
        {[
          { label: "Revenue", value: "52 300 SEK" },
          { label: "Payments", value: "87" },
          { label: "Refunds", value: "4" },
        ].map((metric) => (
          <div key={metric.label} className="rounded-xl bg-white/90 border border-amber-200 p-3">
            <div className="text-[11px] uppercase tracking-wider text-amber-700">
              {metric.label}
            </div>
            <div className="mt-1 text-lg font-semibold text-gray-900">
              {metric.value}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 overflow-hidden rounded-xl border border-amber-200 bg-white">
        <table className="w-full text-xs">
          <thead className="bg-amber-100/70 text-amber-900">
            <tr>
              <th className="px-3 py-2 text-left">Charge</th>
              <th className="px-3 py-2 text-left">Customer</th>
              <th className="px-3 py-2 text-left">Amount</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Date</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-amber-100">
                <td className="px-3 py-2 font-mono text-[11px] text-gray-700">{row.id}</td>
                <td className="px-3 py-2">{row.customer}</td>
                <td className="px-3 py-2 font-semibold">{row.amount}</td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      row.status === "Succeeded"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {row.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-gray-500">{row.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProductsMockScreen() {
  const products = [
    { name: "GraphQL Fundamentals", type: "Course", price: "1 290 SEK", stock: "Active" },
    { name: "Headless Starter Kit", type: "Digital file", price: "490 SEK", stock: "Active" },
    { name: "Cloudflare Ops Manual", type: "Digital file", price: "390 SEK", stock: "Draft" },
    { name: "WPGraphQL Event Template", type: "Product", price: "790 SEK", stock: "Active" },
  ];
  return (
    <div className="h-full rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-indigo-100 p-5 shadow-xl">
      <h3 className="text-lg font-semibold text-gray-900">Product studio</h3>
      <p className="text-xs text-gray-500">
        Mock catalog data with mixed product types and publish state.
      </p>
      <div className="mt-4 grid grid-cols-4 gap-3">
        {products.map((product, index) => (
          <div
            key={product.name}
            className={`rounded-xl border p-3 ${
              index % 2 === 0
                ? "bg-violet-100/60 border-violet-200"
                : "bg-indigo-100/70 border-indigo-200"
            }`}
          >
            <div className="text-[10px] uppercase tracking-wider text-gray-600">
              {product.type}
            </div>
            <div className="mt-1 text-sm font-semibold text-gray-900">
              {product.name}
            </div>
            <div className="mt-2 text-xs text-gray-700">{product.price}</div>
            <div className="mt-2">
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  product.stock === "Active"
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-slate-200 text-slate-700"
                }`}
              >
                {product.stock}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-xl border border-violet-200 bg-white p-3 text-xs text-gray-600">
        Bulk actions, upload storage links, and pricing metadata are managed in
        one panel in the real admin tab.
      </div>
    </div>
  );
}

function ChatMockScreen() {
  return (
    <div className="h-full rounded-2xl border border-cyan-200 bg-gradient-to-br from-cyan-50 via-white to-slate-100 p-5 shadow-xl">
      <h3 className="text-lg font-semibold text-gray-900">
        AI chat support cockpit
      </h3>
      <p className="text-xs text-gray-500">
        Mock conversation grounded in logs, payments, and documentation.
      </p>
      <div className="mt-4 space-y-3">
        <div className="rounded-xl border border-cyan-100 bg-white p-3 text-sm">
          <p className="text-xs uppercase tracking-wider text-gray-500">User</p>
          <p className="mt-1">
            Why are admin requests failing after login?
          </p>
        </div>
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm">
          <p className="text-xs uppercase tracking-wider text-blue-700">AI</p>
          <p className="mt-1 text-gray-800">
            Health is amber because `CF_KV_NAMESPACE_ID` is missing. Session is
            valid, but ticket history falls back to memory and disappears on restart.
          </p>
        </div>
        <div className="rounded-xl border border-cyan-100 bg-white p-3 text-sm">
          <p className="text-xs uppercase tracking-wider text-gray-500">User</p>
          <p className="mt-1">
            Show latest payment receipts for emma@xtas.nu in a table.
          </p>
        </div>
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm">
          <p className="text-xs uppercase tracking-wider text-blue-700">AI</p>
          <p className="mt-1 text-gray-800">
            Found 3 charges. Switching to payment intent and preparing receipt
            links sorted by newest first.
          </p>
        </div>
      </div>
      <div className="mt-4 rounded-xl border border-cyan-200 bg-white p-2 text-xs text-gray-500">
        Intent routing: `payments`, `receipts`, `access`, `support`, `docs`,
        `debug`.
      </div>
    </div>
  );
}

function WelcomeCards({ showRevisionBadge }) {
  const cards = [
    {
      tab: "sales",
      title: t("admin.cardSales", "Sales & receipts"),
      body: t(
        "admin.cardSalesBody",
        "Monitor payments, download Stripe receipts, and keep refunds close.",
      ),
      tone: "from-orange-500/20 via-orange-200/10 to-amber-200/10",
    },
    {
      tab: "stats",
      title: t("admin.cardStats", "Analytics"),
      body: t(
        "admin.cardStatsBody",
        "Understand traffic, conversions, and Lighthouse lifts since the rebuild.",
      ),
      tone: "from-sky-500/20 via-cyan-200/10 to-blue-200/10",
    },
    {
      tab: "storage",
      title: t("admin.navStorage", "Storage"),
      body: t(
        "admin.cardStorageBody",
        "Inspect bucket files and upload paths before attaching digital products.",
      ),
      tone: "from-slate-500/20 via-slate-200/10 to-gray-200/10",
    },
    {
      tab: "products",
      title: t("admin.cardShop", "Shop & catalog"),
      body: t(
        "admin.cardShopBody",
        "Curate WooCommerce/LearnPress products, metadata, and prices.",
      ),
      tone: "from-violet-500/20 via-violet-200/10 to-indigo-200/10",
    },
    {
      tab: "chat",
      title: t("admin.cardChat", "AI Assist"),
      body: t(
        "admin.cardChatBody",
        "Ask about payments, access, docs, and logs with multilingual intelligence.",
      ),
      tone: "from-emerald-500/20 via-emerald-200/10 to-cyan-200/10",
    },
    {
      tab: "support",
      title: t("admin.navSupport", "Support"),
      body: t(
        "admin.cardSupportBody",
        "Track issues, tickets, and updates in one place.",
      ),
      tone: "from-rose-500/20 via-pink-200/10 to-fuchsia-200/10",
    },
  ];

  return (
    <div className="space-y-4">
      {showRevisionBadge && (
        <div className="flex items-center gap-3 rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-amber-900">
          <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-black text-amber-950">
            {t("admin.welcomeBadgeNew", "New")}
          </span>
          <span>{t("admin.welcomeBadge", "Updated story — check what changed")}</span>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <button
            key={card.tab}
            type="button"
            onClick={() => {
              if (typeof window === "undefined") return;
              window.dispatchEvent(
                new CustomEvent("admin:switchTab", { detail: card.tab }),
              );
            }}
            className={`group rounded-2xl border border-slate-200 bg-gradient-to-br ${card.tone} p-4 text-left shadow-sm transition hover:shadow-md hover:border-slate-300`}
          >
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-widest text-slate-600">
                {t("admin.welcomeCardGoto", "Go to")}
              </div>
              <div className="text-xl text-slate-700">↗</div>
            </div>
            <p className="mt-2 text-lg font-semibold text-slate-900">{card.title}</p>
            <p className="mt-1 text-sm text-slate-700">{card.body}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function AdminWelcomeTab({
  onSeenRevision,
  showRevisionBadge,
  showStory = true,
  onHideStory,
  onReplayStory,
}) {
  const [currentStep, setCurrentStep] = useState(0);
  const [slideLayout, setSlideLayout] = useState(computeSlideLayout);

  const keepWelcomeHashStable = useCallback(() => {
    if (typeof window === "undefined") return;
    const expected = "#/welcome";
    if (window.location.hash === expected) return;
    const nextUrl = `${window.location.pathname}${window.location.search}${expected}`;
    window.history.replaceState(null, "", nextUrl);
  }, []);

  useEffect(() => {
    function onResize() {
      setSlideLayout(computeSlideLayout());
    }
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const slideScaleBase = slideLayout.slideWidth / BASE_SLIDE_WIDTH;
  const scaledStep = useCallback(
    (scale) => Number.parseFloat((scale * slideScaleBase).toFixed(3)),
    [slideScaleBase],
  );

  const slides = useMemo(
    () => [
      {
        id: "architecture",
        title: "Big picture first",
        subtitle: "Start wide: understand the full flow before drilling into features.",
        x: 0,
        y: 0,
        z: 0,
        scale: scaledStep(1),
        rotate: 0,
        content: <ArchitectureOverview />,
      },
      {
        id: "sales",
        title: "Zoom to sales",
        subtitle: "Live payment visibility and receipts where operators actually work.",
        x: 1300,
        y: 220,
        z: -250,
        scale: scaledStep(1.08),
        rotate: -6,
        content: <SalesMockScreen />,
      },
      {
        id: "products",
        title: "Then products",
        subtitle: "Catalog curation, pricing, and delivery links from one studio.",
        x: 2800,
        y: -120,
        z: -350,
        scale: scaledStep(1.14),
        rotate: 8,
        content: <ProductsMockScreen />,
      },
      {
        id: "chat",
        title: "Finally AI operations",
        subtitle: "Reasoning over logs, receipts, access, and manuals in one multilingual panel.",
        x: 4300,
        y: 260,
        z: -500,
        scale: scaledStep(1.18),
        rotate: -4,
        content: <ChatMockScreen />,
      },
      {
        id: "landing",
        title: "Ready to operate",
        subtitle: "Exit the story and jump directly into the admin sections.",
        x: 5600,
        y: 20,
        z: -120,
        scale: scaledStep(1.02),
        rotate: 0,
        content: (
          <div className="h-full rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-indigo-50 p-6 shadow-xl">
            <h3 className="text-xl font-semibold text-slate-900">
              Welcome is complete
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              You can replay the presentation later and jump to cards now.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  if (onSeenRevision) onSeenRevision();
                  if (onHideStory) onHideStory();
                }}
                className="rounded-xl bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-600"
              >
                {t("admin.welcomeEnterDashboard", "Enter the dashboard")}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (typeof window === "undefined") return;
                  window.dispatchEvent(
                    new CustomEvent("admin:switchTab", { detail: "stats" }),
                  );
                }}
                className="rounded-xl border border-indigo-300 bg-white px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
              >
                {t("admin.welcomeFinish", "Go to Stats →")}
              </button>
            </div>
          </div>
        ),
      },
    ],
    [onHideStory, onSeenRevision, scaledStep],
  );

  const initAndBind = useCallback(() => {
    if (typeof window === "undefined" || !window.impress) return;
    try {
      window.impress("welcome-impress")?.init();
      window.impress("welcome-impress")?.goto(slides[0].id);
      keepWelcomeHashStable();
    } catch (error) {
      console.warn("Failed to init impress.js", error);
    }
  }, [keepWelcomeHashStable, slides]);

  useEffect(() => {
    if (!showStory) return;
    loadImpressScript(initAndBind);
  }, [showStory, initAndBind]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (showStory) return undefined;
    try {
      window.impress?.("welcome-impress")?.tear?.();
    } catch (_error) {
      // best effort cleanup only
    }
    resetImpressViewportState();
    return undefined;
  }, [showStory]);

  useEffect(
    () => () => {
      if (typeof window === "undefined") return;
      try {
        window.impress?.("welcome-impress")?.tear?.();
      } catch (_error) {
        // best effort cleanup only
      }
      resetImpressViewportState();
    },
    [],
  );

  useEffect(() => {
    if (typeof window === "undefined" || !showStory) return undefined;
    function onStepEnter(event) {
      const id = event?.target?.id;
      const index = slides.findIndex((slide) => slide.id === id);
      if (index >= 0) setCurrentStep(index);
      keepWelcomeHashStable();
    }
    document.addEventListener("impress:stepenter", onStepEnter);
    return () => document.removeEventListener("impress:stepenter", onStepEnter);
  }, [keepWelcomeHashStable, showStory, slides]);

  useEffect(() => {
    if (!showStory) return;
    keepWelcomeHashStable();
  }, [showStory, keepWelcomeHashStable]);

  useEffect(() => {
    if (typeof window === "undefined" || !showStory) return undefined;
    function onKeyDown(event) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (onSeenRevision) onSeenRevision();
      if (onHideStory) onHideStory();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onHideStory, onSeenRevision, showStory]);

  const goToStep = useCallback(
    (index) => {
      if (typeof window === "undefined" || !window.impress) return;
      const normalized = Math.max(0, Math.min(index, slides.length - 1));
      setCurrentStep(normalized);
      try {
        window.impress("welcome-impress")?.goto(slides[normalized].id);
        keepWelcomeHashStable();
      } catch (error) {
        console.warn("Failed to navigate impress slide", error);
      }
    },
    [keepWelcomeHashStable, slides],
  );

  if (!showStory) {
    return (
      <div className="space-y-4 rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-sky-50 p-4 sm:p-6 shadow min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-widest text-indigo-700">
              {t("admin.welcomeSubtitle", "RAGBAZ Articulate StoreFront")}
            </p>
            <h2 className="text-2xl font-semibold text-slate-900">
              {t("admin.welcomeHeadline", "Welcome to your new control room")}
            </h2>
            <MenuShortcutHint />
          </div>
          <button
            type="button"
            onClick={() => {
              if (onReplayStory) onReplayStory();
            }}
            className="rounded-xl border border-indigo-300 bg-white px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50"
          >
            Replay story
          </button>
        </div>
        <WelcomeCards showRevisionBadge={showRevisionBadge} />
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-950 via-indigo-900 to-slate-900 p-4 sm:p-6 text-white shadow-lg min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-indigo-200">
            {t("admin.welcomeSubtitle", "RAGBAZ Articulate StoreFront")}
          </p>
          <h2 className="text-2xl font-semibold">
            {t("admin.welcomeHeadline", "Welcome to your new control room")}
          </h2>
          <div className="mt-1">
            <MenuShortcutHint />
          </div>
          <p className="mt-1 text-sm text-indigo-100">
            {slides[currentStep]?.title} - {slides[currentStep]?.subtitle}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (onSeenRevision) onSeenRevision();
              if (onHideStory) onHideStory();
            }}
            className="rounded-xl border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20"
          >
            {t("admin.welcomeSkip", "Skip to dashboard")}
          </button>
        </div>
      </div>

      <div
        className="relative overflow-hidden rounded-2xl border border-white/20 bg-white/5 p-4"
        style={{ height: `${slideLayout.frameHeight}px` }}
      >
        <div
          id="welcome-impress"
          className="impress h-full w-full"
          data-hash-changes="false"
          style={{ position: "relative" }}
        >
          {slides.map((slide) => (
            <div
              key={slide.id}
              id={slide.id}
              className="step"
              data-x={slide.x}
              data-y={slide.y}
              data-z={slide.z}
              data-scale={slide.scale}
              data-rotate={slide.rotate}
              style={{
                width: `${slideLayout.slideWidth}px`,
                height: `${slideLayout.slideHeight}px`,
              }}
            >
              {slide.content}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {slides.map((slide, index) => (
            <button
              key={slide.id}
              type="button"
              onClick={() => goToStep(index)}
              className={`h-2.5 rounded-full transition-all ${
                currentStep === index
                  ? "w-8 bg-amber-300"
                  : "w-2.5 bg-white/50 hover:bg-white/80"
              }`}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => goToStep(currentStep - 1)}
            className="rounded-xl border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20"
          >
            {t("admin.welcomePrev", "Prev")}
          </button>
          <button
            type="button"
            onClick={() => goToStep(currentStep + 1)}
            className="rounded-xl border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20"
          >
            {t("admin.welcomeNext", "Next")}
          </button>
        </div>
      </div>
      <p className="text-xs text-indigo-100">
        {t("admin.welcomeEscHint", "Press Esc to exit the story at any time")}
      </p>
    </div>
  );
}
