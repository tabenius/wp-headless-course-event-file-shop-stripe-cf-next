"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "@/lib/i18n";
import { readImageGenerationSnapshot } from "@/lib/adminImageGenerationState";

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
  const availableHeight = window.innerHeight - (compact ? 300 : 260);
  const slideHeight = clamp(Math.min(scaledHeight, availableHeight), 220, 360);
  const frameHeight = slideHeight + (compact ? 40 : 52);
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

function tearImpress() {
  if (typeof window === "undefined") return;
  try {
    window.impress?.("welcome-impress")?.tear?.();
  } catch (_error) {
    // best effort cleanup only
  }
  try {
    window.impress?.()?.tear?.();
  } catch (_error) {
    // best effort cleanup only
  }
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

function formatSnapshotTime(isoString) {
  if (!isoString) return "—";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("sv-SE");
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

function ArchitectureSystemMapSlide() {
  return (
    <div className="h-full rounded-2xl border border-sky-300 bg-gradient-to-br from-slate-100 via-white to-blue-50 p-5 text-slate-900 shadow-xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">
            Platform architecture map
          </h3>
          <p className="text-xs text-slate-700">
            Based on the docs architecture: edge worker in the center, systems
            around it.
          </p>
        </div>
        <div className="rounded-full border border-indigo-400 bg-indigo-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-indigo-900">
          docs/architecture
        </div>
      </div>

      <div className="mt-4 grid grid-cols-12 gap-2">
        <div className="col-span-3 rounded-xl border border-blue-300 bg-blue-100 p-2.5 text-xs">
          <p className="font-semibold text-blue-900">Browser / Admin UI</p>
          <p className="mt-1 text-blue-800">React + App Router pages</p>
        </div>
        <div className="col-span-6 rounded-xl border-2 border-fuchsia-400 bg-fuchsia-100 p-2.5 text-xs shadow-sm">
          <p className="font-semibold text-fuchsia-900">Cloudflare Worker</p>
          <p className="mt-1 text-fuchsia-900">
            Next.js edge runtime, API routes, auth, routing
          </p>
        </div>
        <div className="col-span-3 rounded-xl border border-cyan-300 bg-cyan-100 p-2.5 text-xs">
          <p className="font-semibold text-cyan-900">OAuth + Session</p>
          <p className="mt-1 text-cyan-800">Cookie sessions + providers</p>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-4 gap-2">
        <div className="rounded-xl border border-emerald-300 bg-emerald-100 p-2.5 text-xs">
          <p className="font-semibold text-emerald-900">WordPress + WPGraphQL</p>
          <p className="mt-1 text-emerald-800">Pages, products, courses, events</p>
        </div>
        <div className="rounded-xl border border-violet-300 bg-violet-100 p-2.5 text-xs">
          <p className="font-semibold text-violet-900">Stripe</p>
          <p className="mt-1 text-violet-800">Checkout, receipts, webhooks</p>
        </div>
        <div className="rounded-xl border border-rose-300 bg-rose-100 p-2.5 text-xs">
          <p className="font-semibold text-rose-900">KV + R2</p>
          <p className="mt-1 text-rose-800">Access lists + digital files</p>
        </div>
        <div className="rounded-xl border border-teal-300 bg-teal-100 p-2.5 text-xs">
          <p className="font-semibold text-teal-900">Resend + Support</p>
          <p className="mt-1 text-teal-800">Receipts, tickets, notifications</p>
        </div>
      </div>

      <svg viewBox="0 0 900 120" className="mt-3 h-20 w-full rounded-lg border border-slate-200 bg-white/70 px-2">
        <defs>
          <marker
            id="arch-arrow"
            markerWidth="10"
            markerHeight="8"
            refX="8"
            refY="4"
            orient="auto"
          >
            <path d="M0,0 L10,4 L0,8 Z" fill="#64748b" />
          </marker>
        </defs>
        <text x="40" y="30" fontSize="11" fill="#334155">Browser</text>
        <text x="350" y="30" fontSize="11" fill="#334155">Worker</text>
        <text x="740" y="30" fontSize="11" fill="#334155">Systems</text>
        <line
          x1="100"
          y1="26"
          x2="330"
          y2="26"
          stroke="#64748b"
          strokeWidth="2"
          markerEnd="url(#arch-arrow)"
        />
        <line
          x1="430"
          y1="26"
          x2="710"
          y2="26"
          stroke="#64748b"
          strokeWidth="2"
          markerEnd="url(#arch-arrow)"
        />
        <line
          x1="430"
          y1="64"
          x2="710"
          y2="64"
          stroke="#64748b"
          strokeWidth="2"
          markerEnd="url(#arch-arrow)"
        />
        <line
          x1="330"
          y1="90"
          x2="100"
          y2="90"
          stroke="#64748b"
          strokeWidth="2"
          markerEnd="url(#arch-arrow)"
        />
        <text x="465" y="20" fontSize="10" fill="#475569">GraphQL / REST</text>
        <text x="460" y="58" fontSize="10" fill="#475569">Stripe API + KV/R2</text>
        <text x="180" y="84" fontSize="10" fill="#475569">HTML + JSON + assets</text>
      </svg>
    </div>
  );
}

function ArchitectureFlowSlide() {
  return (
    <div className="h-full rounded-2xl border border-indigo-300 bg-gradient-to-br from-slate-100 via-white to-blue-50 p-5 shadow-xl">
      <h3 className="text-lg font-semibold text-slate-900">
        Information flow and control flow
      </h3>
      <p className="mt-1 text-xs text-slate-700">
        The same backbone powers content fetching, checkout, and post-payment
        access grants.
      </p>
      <div className="mt-4 grid h-[255px] grid-cols-12 gap-3">
        <div className="col-span-6 rounded-xl border border-indigo-300 bg-white p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-800">
            Runtime sequence
          </p>
          <ol className="mt-2 space-y-1.5 text-xs text-slate-800">
            <li>1. Client opens route and worker resolves content source.</li>
            <li>2. Worker loads WordPress content + user access state.</li>
            <li>3. If locked: worker creates Stripe checkout session.</li>
            <li>4. Stripe webhook returns to worker after completion.</li>
            <li>5. Worker writes access grant and stores receipt metadata.</li>
            <li>6. Admin dashboards read the same payment/access signals.</li>
          </ol>
          <div className="mt-2 rounded-lg border border-indigo-200 bg-indigo-100 px-2 py-1.5 text-[11px] text-indigo-900">
            Shared state contracts: product id, category, VAT, access keys,
            receipt id.
          </div>
        </div>
        <div className="col-span-6 rounded-xl border border-slate-300 bg-white p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-800">
            Flow diagram
          </p>
          <svg viewBox="0 0 460 218" className="mt-2 h-[195px] w-full">
            <rect x="12" y="16" width="120" height="38" rx="9" fill="#dbeafe" stroke="#60a5fa" />
            <text x="24" y="39" fontSize="11" fill="#1e3a8a">Client</text>

            <rect x="170" y="16" width="132" height="38" rx="9" fill="#f5d0fe" stroke="#d946ef" />
            <text x="186" y="39" fontSize="11" fill="#701a75">Worker APIs</text>

            <rect x="326" y="16" width="118" height="38" rx="9" fill="#dcfce7" stroke="#34d399" />
            <text x="344" y="39" fontSize="11" fill="#065f46">WordPress</text>

            <rect x="326" y="86" width="118" height="38" rx="9" fill="#ede9fe" stroke="#8b5cf6" />
            <text x="356" y="109" fontSize="11" fill="#4c1d95">Stripe</text>

            <rect x="326" y="156" width="118" height="38" rx="9" fill="#ffe4e6" stroke="#fb7185" />
            <text x="356" y="179" fontSize="11" fill="#9f1239">KV / R2</text>

            <line x1="132" y1="35" x2="170" y2="35" stroke="#475569" strokeWidth="2" />
            <line x1="302" y1="35" x2="326" y2="35" stroke="#475569" strokeWidth="2" />
            <line x1="302" y1="102" x2="326" y2="102" stroke="#475569" strokeWidth="2" />
            <line x1="302" y1="172" x2="326" y2="172" stroke="#475569" strokeWidth="2" />

            <line x1="326" y1="50" x2="302" y2="50" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4 4" />
            <line x1="326" y1="116" x2="302" y2="116" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4 4" />
            <line x1="326" y1="186" x2="302" y2="186" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4 4" />

            <line x1="170" y1="50" x2="132" y2="50" stroke="#475569" strokeWidth="2" />
            <text x="48" y="76" fontSize="10" fill="#475569">Paywall + unlocked content</text>
          </svg>
        </div>
      </div>
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
          <p className="text-xs text-gray-700">
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
          <thead className="bg-amber-200 text-amber-950">
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
                <td className="px-3 py-2 text-gray-700">{row.date}</td>
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
      <p className="text-xs text-gray-700">
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
            <div className="text-[10px] uppercase tracking-wider text-gray-700">
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
      <div className="mt-4 rounded-xl border border-violet-200 bg-white p-3 text-xs text-gray-700">
        Bulk actions, upload storage links, and pricing metadata are managed in
        one panel in the real admin tab.
      </div>
    </div>
  );
}

function ImagePromptLiveScreen() {
  const [quota, setQuota] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [snapshot, setSnapshot] = useState(null);

  const refreshSnapshot = useCallback(() => {
    if (typeof window === "undefined") return;
    setSnapshot(readImageGenerationSnapshot(window.localStorage));
  }, []);

  useEffect(() => {
    refreshSnapshot();
    if (typeof window === "undefined") return undefined;
    function onSnapshotUpdate() {
      refreshSnapshot();
    }
    window.addEventListener("admin:imageSnapshotUpdated", onSnapshotUpdate);
    window.addEventListener("storage", onSnapshotUpdate);
    return () => {
      window.removeEventListener("admin:imageSnapshotUpdated", onSnapshotUpdate);
      window.removeEventListener("storage", onSnapshotUpdate);
    };
  }, [refreshSnapshot]);

  useEffect(() => {
    let cancelled = false;
    async function loadQuota() {
      setLoading(true);
      setLoadError("");
      try {
        const res = await fetch("/api/admin/generate-image");
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || "image_state_unavailable");
        }
        if (!cancelled) {
          setQuota(json.quota || null);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(String(error?.message || "image_state_unavailable"));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    loadQuota();
    return () => {
      cancelled = true;
    };
  }, []);

  const fallbackMode = !loading && (Boolean(loadError) || !quota);
  const used = Number.isFinite(quota?.used) ? quota.used : 0;
  const limit = Number.isFinite(quota?.limit) ? quota.limit : 0;
  const remaining = Number.isFinite(quota?.remaining) ? quota.remaining : 0;
  const progressPercent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const promptPreview = snapshot?.prompt
    ? snapshot.prompt.slice(0, 220)
    : "";

  return (
    <div className="h-full rounded-2xl border border-fuchsia-200 bg-gradient-to-br from-fuchsia-50 via-white to-pink-100 p-5 shadow-xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            {t("admin.welcomeImageLiveTitle", "AI image generator status")}
          </h3>
          <p className="text-xs text-gray-700">
            {fallbackMode
              ? t(
                  "admin.welcomeImageReadOnlyHint",
                  "Read-only fallback is active. Open Products to generate images.",
                )
              : t(
                  "admin.welcomeImageLiveHint",
                  "Live state from the admin image generator quota and latest run snapshot.",
                )}
          </p>
        </div>
        <span
          className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${
            fallbackMode
              ? "border-amber-300 bg-amber-100 text-amber-900"
              : "border-emerald-300 bg-emerald-100 text-emerald-900"
          }`}
        >
          {fallbackMode
            ? t("admin.welcomeImageReadOnlyBadge", "read-only fallback")
            : t("admin.welcomeImageLiveBadge", "live")}
        </span>
      </div>
      <div className="mt-4 grid h-[255px] grid-cols-12 gap-3">
        <div className="col-span-7 rounded-xl border border-fuchsia-200 bg-white p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-fuchsia-800">
            {t("admin.welcomeImageQuotaTitle", "Quota")}
          </p>
          {loading ? (
            <div className="mt-3 space-y-2">
              <div className="h-3 w-full animate-pulse rounded bg-fuchsia-100" />
              <div className="h-3 w-4/5 animate-pulse rounded bg-fuchsia-100" />
            </div>
          ) : (
            <div className="mt-2 space-y-2 text-xs text-gray-700">
              <div className="flex items-center justify-between gap-2">
                <span>{t("admin.welcomeImageQuotaUsed", "Used today")}</span>
                <span className="font-semibold">
                  {used} / {limit || "?"}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-fuchsia-100">
                <div
                  className="h-full bg-fuchsia-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span>{t("admin.welcomeImageQuotaRemaining", "Remaining")}</span>
                <span className="font-semibold">{remaining}</span>
              </div>
              <div className="rounded border border-fuchsia-100 bg-fuchsia-50 px-2 py-1">
                {t("admin.welcomeImageQuotaReset", "Resets")}:
                {" "}
                {quota?.resetsAt
                  ? new Date(quota.resetsAt).toLocaleString("sv-SE")
                  : "—"}
              </div>
            </div>
          )}
          <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-slate-800">
            <div className="rounded border border-gray-300 bg-white px-2 py-1.5 font-medium">
              {t("admin.welcomeImageSettingSize", "Size")}: {snapshot?.size || "portrait-4-5"}
            </div>
            <div className="rounded border border-gray-300 bg-white px-2 py-1.5 font-medium">
              {t("admin.welcomeImageSettingCount", "Count")}: {snapshot?.count ?? 1}
            </div>
            <div className="rounded border border-gray-300 bg-white px-2 py-1.5 font-medium">
              {t("admin.welcomeImageSettingStatus", "Status")}: {snapshot?.status || "idle"}
            </div>
          </div>
          {fallbackMode && (
            <div className="mt-3 rounded border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs text-amber-900">
              {t(
                "admin.welcomeImageFallbackHint",
                "Could not read live quota from the API. This snapshot stays read-only until the endpoint responds again.",
              )}
            </div>
          )}
          <div className="mt-2 text-[11px] text-gray-500">
            {t("admin.welcomeImageLastRun", "Last run")}:
            {" "}
            {formatSnapshotTime(snapshot?.updatedAt)}
          </div>
        </div>
        <div className="col-span-5 rounded-xl border border-fuchsia-200 bg-white p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-fuchsia-800">
            {t("admin.welcomeImagePromptTitle", "Latest prompt")}
          </p>
          <div className="mt-2 h-[188px] overflow-auto rounded-lg border border-dashed border-fuchsia-300 bg-gradient-to-br from-fuchsia-100 to-rose-100 p-3 text-xs text-fuchsia-950">
            {promptPreview ||
              t(
                "admin.welcomeImageNoPrompt",
                "No prompt has been generated yet. Open Products and run the image generator to populate this snapshot.",
              )}
          </div>
          <div className="mt-2 text-[11px] text-gray-500">
            {t("admin.welcomeImageGeneratedCount", "Images generated in last run")}:
            {" "}
            {snapshot?.generatedCount ?? 0}
          </div>
        </div>
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
      <p className="text-xs text-gray-700">
        Mock conversation grounded in logs, payments, and documentation.
      </p>
      <div className="mt-4 space-y-3">
        <div className="rounded-xl border border-cyan-100 bg-white p-3 text-sm">
          <p className="text-xs uppercase tracking-wider text-gray-700">User</p>
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
          <p className="text-xs uppercase tracking-wider text-gray-700">User</p>
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
      <div className="mt-4 rounded-xl border border-cyan-200 bg-white p-2 text-xs text-gray-700">
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
        id: "architecture-map",
        title: "Architecture map",
        subtitle: "Start wide: core systems and their responsibilities.",
        x: 0,
        y: 0,
        z: 0,
        scale: scaledStep(1),
        rotate: 0,
        content: <ArchitectureSystemMapSlide />,
      },
      {
        id: "architecture-flow",
        title: "Flow of information",
        subtitle: "Requests, payment callbacks, and access writes in one sequence.",
        x: 1200,
        y: -140,
        z: -200,
        scale: scaledStep(1.06),
        rotate: 6,
        content: <ArchitectureFlowSlide />,
      },
      {
        id: "story-sales",
        title: "Zoom to sales",
        subtitle: "Live payment visibility and receipts where operators actually work.",
        x: 2480,
        y: 180,
        z: -320,
        scale: scaledStep(1.08),
        rotate: -6,
        content: <SalesMockScreen />,
      },
      {
        id: "story-products",
        title: "Then products",
        subtitle: "Catalog curation, pricing, and delivery links from one studio.",
        x: 3860,
        y: -120,
        z: -380,
        scale: scaledStep(1.14),
        rotate: 8,
        content: <ProductsMockScreen />,
      },
      {
        id: "story-image",
        title: "Image prompt generator",
        subtitle:
          "Live image-generator status with quota and latest run snapshot (read-only fallback supported).",
        x: 5260,
        y: 110,
        z: -440,
        scale: scaledStep(1.16),
        rotate: -5,
        content: <ImagePromptLiveScreen />,
      },
      {
        id: "story-chat",
        title: "Finally AI operations",
        subtitle: "Reasoning over logs, receipts, access, and manuals in one multilingual panel.",
        x: 6680,
        y: 240,
        z: -520,
        scale: scaledStep(1.18),
        rotate: -4,
        content: <ChatMockScreen />,
      },
      {
        id: "landing",
        title: "Ready to operate",
        subtitle: "Exit the story and jump directly into the admin sections.",
        x: 8050,
        y: 20,
        z: -140,
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
    } catch (error) {
      console.warn("Failed to init impress.js", error);
    }
  }, [slides]);

  useEffect(() => {
    if (!showStory) return;
    loadImpressScript(initAndBind);
  }, [showStory, initAndBind]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (showStory) return undefined;
    tearImpress();
    resetImpressViewportState();
    return undefined;
  }, [showStory]);

  useEffect(
    () => () => {
      if (typeof window === "undefined") return;
      tearImpress();
      resetImpressViewportState();
    },
    [],
  );

  useEffect(() => {
    if (typeof window === "undefined" || !showStory) return undefined;
    window.__RAGBAZ_IMPRESS_ACTIVE__ = true;
    return () => {
      window.__RAGBAZ_IMPRESS_ACTIVE__ = false;
    };
  }, [showStory]);

  useEffect(() => {
    if (typeof window === "undefined" || !showStory) return undefined;
    function onStepEnter(event) {
      const id = event?.target?.id;
      const index = slides.findIndex((slide) => slide.id === id);
      if (index >= 0) setCurrentStep(index);
    }
    document.addEventListener("impress:stepenter", onStepEnter);
    return () => document.removeEventListener("impress:stepenter", onStepEnter);
  }, [showStory, slides]);

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
      } catch (error) {
        console.warn("Failed to navigate impress slide", error);
      }
    },
    [slides],
  );

  useEffect(() => {
    if (typeof window === "undefined" || !showStory) return undefined;
    function onKeyNav(event) {
      const tag = (event.target && event.target.tagName) || "";
      const isFormField =
        ["INPUT", "TEXTAREA", "SELECT"].includes(tag) ||
        event.target?.isContentEditable;
      if (isFormField) return;
      if (event.key === "ArrowRight" || event.key === "PageDown") {
        event.preventDefault();
        goToStep(currentStep + 1);
        return;
      }
      if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        goToStep(currentStep - 1);
      }
    }
    window.addEventListener("keydown", onKeyNav);
    return () => window.removeEventListener("keydown", onKeyNav);
  }, [currentStep, goToStep, showStory]);

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
    <div className="space-y-3 rounded-2xl border border-sky-200/45 bg-gradient-to-br from-indigo-900 via-blue-900 to-slate-900 p-3 sm:p-4 text-white shadow-lg min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-widest text-sky-100">
            {t("admin.welcomeSubtitle", "RAGBAZ Articulate StoreFront")}
          </p>
          <h2 className="text-2xl font-semibold">
            {t("admin.welcomeHeadline", "Welcome to your new control room")}
          </h2>
          <div className="mt-0.5">
            <MenuShortcutHint />
          </div>
          <p className="mt-0.5 text-sm text-sky-100">
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
        className="relative overflow-hidden rounded-2xl border border-sky-200/35 bg-slate-900/45 p-2.5"
        style={{ height: `${slideLayout.frameHeight}px` }}
      >
        <div
          id="welcome-impress"
          className="impress h-full w-full"
          data-hash="false"
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
                  : "w-2.5 bg-sky-200/65 hover:bg-sky-100"
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
      <p className="text-xs text-sky-100">
        {t("admin.welcomeEscHint", "Press Esc to exit the story at any time")}
      </p>
    </div>
  );
}
