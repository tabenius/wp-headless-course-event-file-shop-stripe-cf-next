"use client";

import { useEffect } from "react";
import { t } from "@/lib/i18n";

const IMPRESS_SCRIPT_ID = "impress-js-1.1.0";

function initImpress() {
  if (typeof window === "undefined") return;
  if (!window.impress) return;
  try {
    window.impress("welcome-impress")?.init();
  } catch (error) {
    console.warn("Failed to init impress.js", error);
  }
}

export default function AdminWelcomeTab({
  onSeenRevision,
  showRevisionBadge,
}) {
  const slideData = [
    {
      id: "starting-point",
      title: t("admin.welcomeSlide1Title", "From the old WordPress limits"),
      body: t(
        "admin.welcomeSlide1Body",
        "You had a pure WordPress site with no WooCommerce or LearnPress checkout, a cluttered admin, and Lighthouse scores stuck around 50 while pages took 5-6 seconds to load.",
      ),
      x: 0,
      y: 0,
    },
    {
      id: "flow",
      title: t("admin.welcomeSlide2Title", "We introduced clarity"),
      body: t(
        "admin.welcomeSlide2Body",
        "RAGBAZ Articulate brings a clean GraphQL admin, hotkey-driven menu, live legend, and a multilingual chat that understands logs, payments, and manuals.",
      ),
      x: 1600,
      y: 0,
    },
    {
      id: "stripe",
      title: t("admin.welcomeSlide3Title", "Sales and Stripe in one place"),
      body: t(
        "admin.welcomeSlide3Body",
        "Payments, refunds, and PDF receipts now live in the admin. Downloadable Stripe receipts, analytics, and a responsive sales panel keep critical data close at hand.",
      ),
      x: 3200,
      y: 0,
    },
    {
      id: "storefront",
      title: t("admin.welcomeSlide4Title", "A performant storefront"),
      body: t(
        "admin.welcomeSlide4Body",
        "The storefront is now on Cloudflare Workers with source maps, Wrangler logs, and impressively fast 2s loads plus 90+ Lighthouse scores.",
      ),
      x: 4800,
      y: 0,
    },
  ];

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.impress) {
      initImpress();
      return;
    }
    if (document.getElementById(IMPRESS_SCRIPT_ID)) {
      initImpress();
      return;
    }
    const script = document.createElement("script");
    script.id = IMPRESS_SCRIPT_ID;
    script.src =
      "https://cdn.jsdelivr.net/npm/impress.js@1.1.0/js/impress.min.js";
    script.async = true;
    script.onload = initImpress;
    document.body.appendChild(script);
    return () => {
      // keep the script for future visits
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !onSeenRevision) return;
    onSeenRevision();
  }, [onSeenRevision]);

  return (
    <div className="border rounded-lg p-6 bg-gradient-to-br from-purple-950 to-purple-900 text-white shadow-lg relative overflow-hidden">
      <div className="mb-4 space-y-1">
        <p className="text-xs uppercase tracking-widest text-purple-200">
          {t("admin.welcomeSubtitle", "RAGBAZ Articulate story")}
        </p>
        <h2 className="text-2xl font-bold">
          {t("admin.welcomeHeadline", "Welcome to your new control room")}
        </h2>
      </div>
      <div className="rounded-2xl bg-white/5 border border-white/20 p-4 h-[420px] overflow-hidden relative">
        <div
          id="welcome-impress"
          className="impress h-full w-full"
          style={{ position: "relative" }}
        >
          {slideData.map((slide) => (
            <div
              key={slide.id}
              className="step rounded-2xl bg-white/90 border border-purple-200 shadow-lg p-8 leading-snug text-gray-800"
              data-x={slide.x}
              data-y={slide.y}
              data-scale="1"
              style={{ width: "680px", height: "360px" }}
            >
              <h3 className="text-xl font-semibold text-purple-900 mb-2">
                {slide.title}
              </h3>
              <p className="text-sm">{slide.body}</p>
            </div>
          ))}
        </div>
      </div>
      <p className="text-xs text-purple-100 mt-3">
        {t(
          "admin.welcomeHint",
          "Use the arrows or scroll to navigate the story.",
        )}
      </p>
      {showRevisionBadge && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-full border border-white/30 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.4em] text-amber-100">
          <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-black text-amber-950">
            {t("admin.welcomeBadgeNew", "New")}
          </span>
          <span>{t("admin.welcomeBadge", "Updated story — check what changed")}</span>
        </div>
      )}
      <div className="mt-3 grid gap-4 md:grid-cols-3 xl:grid-cols-4">
        {[
          {
            tab: "sales",
            title: t("admin.cardSales", "Sales & receipts"),
            body: t(
              "admin.cardSalesBody",
              "Monitor payments, download Stripe receipts, and keep refunds close.",
            ),
            icon: (
              <svg viewBox="0 0 36 36" className="w-10 h-10">
                <rect x="4" y="18" width="6" height="10" fill="#fed7aa" />
                <rect x="14" y="12" width="6" height="16" fill="#fb923c" />
                <rect x="24" y="8" width="6" height="20" fill="#f97316" />
                <path
                  d="M6 26l8-5 8 3 8-8"
                  fill="none"
                  stroke="#93c5fd"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            ),
          },
          {
            tab: "stats",
            title: t("admin.cardStats", "Analytics"),
            body: t(
              "admin.cardStatsBody",
              "Understand traffic, conversions, and Lighthouse lifts since the rebuild.",
            ),
            icon: (
              <svg viewBox="0 0 36 36" className="w-10 h-10">
                <circle cx="8" cy="24" r="4" fill="#ef4444" />
                <circle cx="18" cy="18" r="4" fill="#f97316" />
                <circle cx="28" cy="12" r="4" fill="#22d3ee" />
                <path
                  d="M6 18 Q18 6 30 18"
                  fill="none"
                  stroke="#a78bfa"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            ),
          },
          {
            tab: "products",
            title: t("admin.cardShop", "Shop & catalog"),
            body: t(
              "admin.cardShopBody",
              "Curate WooCommerce/LearnPress products, metadata, and prices.",
            ),
            icon: (
              <svg viewBox="0 0 36 36" className="w-10 h-10">
                <rect x="5" y="12" width="26" height="18" rx="3" fill="#312e81" />
                <path
                  d="M5 12l4-6h18l4 6"
                  fill="none"
                  stroke="#94a3b8"
                  strokeWidth="2"
                />
                <path
                  d="M10 16h16m-16 6h12m-12 6h8"
                  stroke="#fcd34d"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            ),
          },
          {
            tab: "chat",
            title: t("admin.cardChat", "AI Assist"),
            body: t(
              "admin.cardChatBody",
              "Ask about payments, access, docs, and logs with multilingual intelligence.",
            ),
            icon: (
              <svg viewBox="0 0 36 36" className="w-10 h-10">
                <path
                  d="M4 10h28v14H12l-8 8V10z"
                  fill="#0ea5e9"
                  stroke="#fff"
                  strokeWidth="2"
                />
                <circle cx="12" cy="18" r="2" fill="#fff" />
                <circle cx="18" cy="18" r="2" fill="#fff" />
                <circle cx="24" cy="18" r="2" fill="#fff" />
              </svg>
            ),
          },
        ].map((card) => (
          <button
            key={card.tab}
            type="button"
            onClick={() => {
              if (typeof window === "undefined") return;
              window.dispatchEvent(
                new CustomEvent("admin:switchTab", { detail: card.tab }),
              );
            }}
            className="group flex flex-col gap-3 rounded-2xl border border-white/30 bg-white/5 p-4 text-left transition hover:border-white hover:bg-white/20"
          >
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-widest text-white/70">
                {t("admin.welcomeCardGoto", "Go to")}
              </div>
              <div className="text-2xl text-white/70">↗</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-white/10 p-2">{card.icon}</div>
              <div>
                <p className="text-lg font-semibold">{card.title}</p>
                <p className="text-sm text-white/70">{card.body}</p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
