"use client";

import { useState } from "react";
import { t } from "@/lib/i18n";
import AdminDocsContextLinks from "./AdminDocsContextLinks";
import SalesTrendChart from "./SalesTrendChart";

// ─── Formatting helpers ───────────────────────────────────────────────────────

function formatAmount(cents, currency) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: (currency || "sek").toUpperCase(),
      minimumFractionDigits: 2,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${(currency || "SEK").toUpperCase()}`;
  }
}

function formatDate(ms) {
  return new Date(ms).toLocaleString("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function resolvePaymentsErrorMessage(code) {
  if (code === "stripe_lookup_failed") {
    return t(
      "admin.paymentsStripeLookupFailed",
      "Could not fetch payments from Stripe right now.",
    );
  }
  if (code === "stripe_auth_failed") {
    return t(
      "admin.paymentsStripeAuthFailed",
      "Stripe authentication failed. Check STRIPE_SECRET_KEY.",
    );
  }
  if (code === "stripe_permission_failed") {
    return t(
      "admin.paymentsStripePermissionFailed",
      "Stripe key lacks permission to list charges.",
    );
  }
  if (code === "stripe_connection_failed") {
    return t(
      "admin.paymentsStripeConnectionFailed",
      "Could not reach Stripe API. Check network connectivity and retry.",
    );
  }
  if (code === "stripe_not_configured") {
    return t(
      "admin.noStripeConfiguredHint",
      "Stripe is not configured. Set STRIPE_SECRET_KEY to load payment data.",
    );
  }
  if (String(code || "").startsWith("http_")) {
    return t(
      "admin.paymentsHttpFailed",
      "Payment service returned an unexpected response.",
    );
  }
  return t("admin.paymentsLoadFailed", "Could not load payments.");
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MetricCard({ label, value, sub, accent = false }) {
  return (
    <div
      className={`rounded-xl p-5 flex flex-col gap-1 border ${
        accent
          ? "bg-slate-950 border-slate-800 text-white"
          : "bg-white border-gray-200 text-gray-900"
      }`}
    >
      <span
        className={`text-[10px] font-bold tracking-widest uppercase ${
          accent ? "text-slate-300" : "text-gray-400"
        }`}
      >
        {label}
      </span>
      <span
        className={`text-3xl font-bold tabular-nums leading-none ${accent ? "text-white" : ""}`}
      >
        {value}
      </span>
      {sub && (
        <span
          className={`text-xs mt-0.5 ${accent ? "text-slate-300" : "text-gray-400"}`}
        >
          {sub}
        </span>
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const styles = {
    succeeded: "admin-status-pill admin-status-pill-success",
    pending: "admin-status-pill admin-status-pill-warning",
    failed: "admin-status-pill admin-status-pill-danger",
  };
  const labels = {
    succeeded: t("admin.paymentStatusSucceeded", "Succeeded"),
    failed: t("admin.paymentStatusFailed", "Failed"),
    pending: t("admin.paymentStatusPending", "Pending"),
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${
        styles[status] || "admin-status-pill admin-status-pill-muted"
      }`}
    >
      {labels[status] || status}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AdminSalesTab({
  payments,
  paymentsEmail,
  setPaymentsEmail,
  loadPayments,
  paymentsLoading,
  paymentsError,
  paymentsErrorCode,
  paymentsStripeConfigured,
  paymentsEmptyReason,
  downloadReceipt,
  downloading,
}) {
  const [dateFilter, setDateFilter] = useState("all");

  const now = Date.now();
  const DAY_MS = 24 * 3600 * 1000;
  const boundaries = {
    today: (() => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    })(),
    week: now - 7 * DAY_MS,
    month: now - 30 * DAY_MS,
    all: 0,
  };

  const filtered = payments.filter(
    (p) => p.created >= (boundaries[dateFilter] ?? 0),
  );
  const succeeded = filtered.filter((p) => p.status === "succeeded");

  // Revenue totals by currency
  const byCurrency = {};
  for (const p of succeeded) {
    const cur = (p.currency || "sek").toUpperCase();
    byCurrency[cur] = (byCurrency[cur] || 0) + p.amount;
  }
  const totals = Object.entries(byCurrency);

  const DATE_FILTERS = [
    { key: "all", label: t("admin.filterAllTime", "All time") },
    { key: "month", label: t("admin.filterThisMonth", "This month") },
    { key: "week", label: t("admin.filterThisWeek", "This week") },
    { key: "today", label: t("admin.filterToday", "Today") },
  ];

  const isLoading = paymentsLoading;
  const paymentErrorDisplay = paymentsErrorCode
    ? resolvePaymentsErrorMessage(paymentsErrorCode)
    : paymentsError ||
      t("admin.paymentsLoadFailed", "Could not load payments.");
  const paymentErrorDetail =
    paymentsError && paymentsError !== paymentErrorDisplay ? paymentsError : "";

  return (
    <div className="space-y-6 min-w-0">
      {/* ── Page header ── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            {t("admin.payments", "Sales")}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {t("admin.salesSubtitle", "Stripe charges, revenue and receipts")}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <AdminDocsContextLinks tab="sales" compact />
          <a
            href="https://dashboard.stripe.com/payments"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-800 transition-colors"
          >
            {t("admin.stripePayments", "View in Stripe")}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 16 16"
              fill="currentColor"
              className="w-3.5 h-3.5"
            >
              <path
                fillRule="evenodd"
                d="M4.5 2a.5.5 0 000 1H11V8.5a.5.5 0 001 0v-7a.5.5 0 00-.5-.5h-7zM3 12.5a.5.5 0 01.5-.5H10V5.5a.5.5 0 011 0v7a.5.5 0 01-.5.5H3.5a.5.5 0 01-.5-.5z"
                clipRule="evenodd"
              />
            </svg>
          </a>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-3 min-w-0">
        {/* Email search */}
        <div className="space-y-1">
          <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            <span>{t("admin.paymentsFilter", "Filter by email")}</span>
          </div>
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5 shadow-sm focus-within:ring-2 focus-within:ring-slate-500 focus-within:border-slate-500">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-4 h-4 text-gray-400 shrink-0"
            >
              <path d="M3 4a2 2 0 00-2 2v1.161l8.441 4.221a1.25 1.25 0 001.118 0L19 7.162V6a2 2 0 00-2-2H3z" />
              <path d="M19 8.839l-7.77 3.885a2.75 2.75 0 01-2.46 0L1 8.839V14a2 2 0 002 2h14a2 2 0 002-2V8.839z" />
            </svg>
            <input
              type="email"
              value={paymentsEmail}
              onChange={(e) => setPaymentsEmail(e.target.value)}
              onKeyDown={(e) =>
                e.key === "Enter" && loadPayments(paymentsEmail)
              }
              placeholder={t("admin.paymentsFilter", "Filter by email")}
              className="text-sm outline-none bg-transparent w-48 max-w-[70vw] placeholder-gray-400"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => loadPayments(paymentsEmail)}
          disabled={isLoading}
          className="self-end p-2 rounded-lg bg-slate-600 text-white hover:bg-slate-700 disabled:opacity-50 transition-colors shadow-sm"
          title={
            isLoading
              ? t("admin.running", "Loading…")
              : t("admin.paymentsReload", "Reload")
          }
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className={`w-4 h-4${isLoading ? " animate-spin" : ""}`}
          >
            <path
              fillRule="evenodd"
              d="M15.312 11.424a5.5 5.5 0 01-9.378 2.495l-1.06 1.06a7 7 0 0012.21-3.555H15.31zm-1.06-4.848A5.5 5.5 0 004.688 8.576H6.69a7 7 0 0112.21 3.555l1.06-1.06a7 7 0 00-5.698-4.499z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        {/* Date pills */}
        <div className="ml-auto space-y-1">
          <div className="flex items-center justify-end gap-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            <span>{t("admin.dateFilter", "Date filter")}</span>
          </div>
          <div className="flex flex-wrap justify-end gap-1">
            {DATE_FILTERS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setDateFilter(key)}
                className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                  dateFilter === key
                    ? "bg-slate-600 text-white shadow-sm"
                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Error banner ── */}
      {paymentsError && !isLoading && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-5 h-5 shrink-0 text-red-400 mt-0.5"
          >
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z"
              clipRule="evenodd"
            />
          </svg>
          <span>{paymentErrorDisplay}</span>
        </div>
      )}

      {/* ── Metric cards ── */}
      {succeeded.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {totals.map(([cur, cents]) => (
            <MetricCard
              key={cur}
              label={`${t("admin.salesRevenue", "Revenue")} · ${cur}`}
              value={formatAmount(cents, cur)}
              accent={totals.length === 1}
            />
          ))}
          <MetricCard
            label={t("admin.salesCount", "Payments")}
            value={succeeded.length}
            sub={
              filtered.length > succeeded.length
                ? `+${filtered.length - succeeded.length} ${t("admin.salesOther", "other")}`
                : undefined
            }
          />
          {totals.length > 1 && (
            <MetricCard
              label={t("admin.salesRevenue", "Revenue")}
              value={totals.map(([cur, c]) => formatAmount(c, cur)).join(" · ")}
              sub={t("admin.salesTotalAllCurrencies", "across all currencies")}
              accent
            />
          )}
        </div>
      )}

      {/* ── Trend chart ── */}
      {!isLoading && !paymentsError && payments.length > 0 && (
        <SalesTrendChart payments={payments} />
      )}

      {/* ── Loading / empty / table ── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24 text-sm text-gray-400">
          <svg
            className="animate-spin w-5 h-5 mr-2 text-slate-400"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v8H4z"
            />
          </svg>
          {t("admin.running", "Loading…")}
        </div>
      ) : paymentsError ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-8 h-8 text-red-400"
            >
              <path
                fillRule="evenodd"
                d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zM12 7.5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0112 7.5zm0 9a1 1 0 100-2 1 1 0 000 2z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-700">
              {paymentErrorDisplay}
            </p>
            {paymentErrorDetail ? (
              <p className="text-xs text-red-500 mt-1 max-w-xs">
                {paymentErrorDetail}
              </p>
            ) : null}
            <p className="text-xs text-gray-400 mt-1 max-w-xs">
              {t(
                "admin.paymentsRetryHint",
                "Try reloading. If this persists, verify Stripe credentials and API access.",
              )}
            </p>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-8 h-8 text-gray-300"
            >
              <path d="M2.273 5.625A4.483 4.483 0 015.25 4.5h13.5c1.141 0 2.183.425 2.977 1.125A3 3 0 0018.75 3H5.25a3 3 0 00-2.977 2.625zM2.273 8.625A4.483 4.483 0 015.25 7.5h13.5c1.141 0 2.183.425 2.977 1.125A3 3 0 0018.75 6H5.25a3 3 0 00-2.977 2.625zM5.25 9a3 3 0 00-3 3v6a3 3 0 003 3h13.5a3 3 0 003-3v-6a3 3 0 00-3-3H15a.75.75 0 000 1.5h3.75a1.5 1.5 0 011.5 1.5V18a1.5 1.5 0 01-1.5 1.5H5.25A1.5 1.5 0 013.75 18v-6a1.5 1.5 0 011.5-1.5H7.5A.75.75 0 007.5 9H5.25z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-700">
              {t("admin.noPayments", "No payments found.")}
            </p>
            <p className="text-xs text-gray-400 mt-1 max-w-xs">
              {!paymentsStripeConfigured
                ? t(
                    "admin.noStripeConfiguredHint",
                    "Stripe is not configured. Set STRIPE_SECRET_KEY to load payment data.",
                  )
                : payments.length > 0
                  ? t(
                      "admin.noPaymentsDateHint",
                      "No payments in this date range — try a wider filter.",
                    )
                  : paymentsEmptyReason === "no_sales_data"
                    ? t(
                        "admin.noSalesDataHint",
                        "Stripe is configured but no charges were found yet for this view.",
                      )
                    : t(
                        "admin.noPaymentsHint",
                        "No charges found for the current filter.",
                      )}
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 overflow-hidden shadow-sm bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">
                    {t("admin.colDate", "Date")}
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-400 uppercase tracking-widest">
                    {t("admin.colDescription", "Description")}
                  </th>
                  <th className="px-4 py-3 text-right text-[11px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">
                    {t("admin.colAmount", "Amount")}
                  </th>
                  <th className="px-4 py-3 text-right text-[11px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">
                    {t("admin.colVat", "VAT")}
                  </th>
                  <th className="px-4 py-3 text-right text-[11px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">
                    {t("admin.colNet", "Net")}
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-400 uppercase tracking-widest">
                    {t("admin.colStatus", "Status")}
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-400 uppercase tracking-widest">
                    {t("admin.colEmail", "Email")}
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-400 uppercase tracking-widest">
                    {t("admin.colReceipt", "Receipt")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((p, i) => (
                  <tr
                    key={p.id}
                    className={`transition-colors hover:bg-slate-50/40 ${i % 2 === 1 ? "bg-gray-50/15" : ""}`}
                  >
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500 font-mono">
                      {formatDate(p.created)}
                    </td>
                    <td className="px-4 py-3 text-gray-700 max-w-xs truncate">
                      {p.description || (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right font-semibold tabular-nums text-gray-900">
                      {formatAmount(p.amount, p.currency)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right text-xs tabular-nums text-gray-700">
                      {typeof p.vatPercent === "number" &&
                      typeof p.vatAmount === "number" ? (
                        <span title={t("admin.vatDerivedFromSettings")}>
                          {formatAmount(p.vatAmount, p.currency)} (
                          {p.vatPercent}%)
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right text-xs font-medium tabular-nums text-gray-700">
                      {typeof p.netAmount === "number" ? (
                        formatAmount(p.netAmount, p.currency)
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 truncate max-w-[180px]">
                      {p.email || <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {p.receiptId ? (
                        <button
                          type="button"
                          onClick={() => downloadReceipt(p.receiptId)}
                          disabled={downloading === p.receiptId}
                          className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-800 disabled:opacity-50 transition-colors"
                        >
                          {downloading === p.receiptId ? (
                            <>
                              <svg
                                className="animate-spin w-3 h-3"
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                              >
                                <circle
                                  className="opacity-25"
                                  cx="12"
                                  cy="12"
                                  r="10"
                                  stroke="currentColor"
                                  strokeWidth="4"
                                />
                                <path
                                  className="opacity-75"
                                  fill="currentColor"
                                  d="M4 12a8 8 0 018-8v8H4z"
                                />
                              </svg>
                              {t("admin.downloading", "…")}
                            </>
                          ) : (
                            <>
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 16 16"
                                fill="currentColor"
                                className="w-3.5 h-3.5"
                              >
                                <path d="M8.75 2.75a.75.75 0 00-1.5 0v5.69L5.03 6.22a.75.75 0 00-1.06 1.06l3.5 3.5a.75.75 0 001.06 0l3.5-3.5a.75.75 0 00-1.06-1.06L8.75 8.44V2.75z" />
                                <path d="M3.5 9.75a.75.75 0 00-1.5 0v1.5A2.75 2.75 0 004.75 14h6.5A2.75 2.75 0 0014 11.25v-1.5a.75.75 0 00-1.5 0v1.5c0 .69-.56 1.25-1.25 1.25h-6.5c-.69 0-1.25-.56-1.25-1.25v-1.5z" />
                              </svg>
                              PDF
                            </>
                          )}
                        </button>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
            <span className="text-xs text-gray-400">
              {filtered.length === payments.length
                ? `${payments.length} ${t("admin.salesCount", "payments")}`
                : `${filtered.length} / ${payments.length} ${t("admin.salesCount", "payments")}`}
            </span>
            {filtered.length > succeeded.length && (
              <span className="text-xs text-amber-600">
                {filtered.length - succeeded.length}{" "}
                {t("admin.salesOther", "other")}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
