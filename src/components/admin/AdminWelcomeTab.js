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

export default function AdminWelcomeTab() {
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
    </div>
  );
}
