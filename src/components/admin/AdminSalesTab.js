"use client";

import { useState } from "react";
import { t } from "@/lib/i18n";

function formatCents(cents, currency) {
  return `${(cents / 100).toFixed(2)} ${(currency || "SEK").toUpperCase()}`;
}

export default function AdminSalesTab({
  payments,
  paymentsEmail,
  setPaymentsEmail,
  loadPayments,
  paymentsLoading,
  paymentsError,
  downloadReceipt,
  downloading,
}) {
  const [dateFilter, setDateFilter] = useState("all");

  // Date filter lower bounds (ms)
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

  // Revenue by currency
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

  return (
    <div className="border rounded p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">
          {t("admin.payments", "Sales")}
        </h2>
        <a
          href="https://dashboard.stripe.com/payments"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-purple-600 hover:underline flex items-center gap-1"
        >
          {t("admin.stripePayments", "View in Stripe")}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-3 h-3"
          >
            <path
              fillRule="evenodd"
              d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5z"
              clipRule="evenodd"
            />
            <path
              fillRule="evenodd"
              d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553l-9.056 8.194a.75.75 0 00-.053 1.06z"
              clipRule="evenodd"
            />
          </svg>
        </a>
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <input
            type="email"
            value={paymentsEmail}
            onChange={(e) => setPaymentsEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadPayments(paymentsEmail)}
            placeholder={t(
              "admin.paymentsFilter",
              "Filter by email (optional)",
            )}
            className="border rounded px-2 py-1.5 text-sm w-52"
          />
          <button
            type="button"
            onClick={() => loadPayments(paymentsEmail)}
            disabled={paymentsLoading}
            className="px-3 py-1.5 rounded border text-sm hover:bg-gray-50 disabled:opacity-50 whitespace-nowrap"
          >
            {paymentsLoading
              ? t("admin.running", "Loading...")
              : t("admin.paymentsReload", "Reload")}
          </button>
        </div>
        <div className="flex gap-1">
          {DATE_FILTERS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setDateFilter(key)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                dateFilter === key
                  ? "bg-purple-600 text-white border-purple-600"
                  : "text-gray-500 border-gray-300 hover:border-purple-400"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {paymentsError && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {paymentsError}
        </div>
      )}

      {/* Revenue summary */}
      {succeeded.length > 0 && (
        <div className="flex flex-wrap gap-6 p-4 bg-purple-50 rounded-lg border border-purple-100">
          {totals.map(([cur, cents]) => (
            <div key={cur}>
              <p className="text-[10px] text-purple-600 font-semibold uppercase tracking-wide">
                {t("admin.salesRevenue", "Revenue")} ({cur})
              </p>
              <p className="text-2xl font-bold text-purple-900">
                {formatCents(cents, cur)}
              </p>
            </div>
          ))}
          <div className="border-l border-purple-200 pl-6">
            <p className="text-[10px] text-purple-600 font-semibold uppercase tracking-wide">
              {t("admin.salesCount", "Payments")}
            </p>
            <p className="text-2xl font-bold text-purple-900">
              {succeeded.length}
            </p>
          </div>
          {filtered.length > succeeded.length && (
            <div className="border-l border-purple-200 pl-6">
              <p className="text-[10px] text-amber-600 font-semibold uppercase tracking-wide">
                {t("admin.salesOther", "Other")}
              </p>
              <p className="text-2xl font-bold text-amber-700">
                {filtered.length - succeeded.length}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Loading */}
      {paymentsLoading ? (
        <div className="flex items-center justify-center py-16 text-sm text-gray-400">
          {t("admin.running", "Loading...")}
        </div>
      ) : filtered.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-12 h-12 text-gray-200"
          >
            <path d="M2.273 5.625A4.483 4.483 0 015.25 4.5h13.5c1.141 0 2.183.425 2.977 1.125A3 3 0 0018.75 3H5.25a3 3 0 00-2.977 2.625zM2.273 8.625A4.483 4.483 0 015.25 7.5h13.5c1.141 0 2.183.425 2.977 1.125A3 3 0 0018.75 6H5.25a3 3 0 00-2.977 2.625zM5.25 9a3 3 0 00-3 3v6a3 3 0 003 3h13.5a3 3 0 003-3v-6a3 3 0 00-3-3H15a.75.75 0 000 1.5h3.75a1.5 1.5 0 011.5 1.5V18a1.5 1.5 0 01-1.5 1.5H5.25A1.5 1.5 0 013.75 18v-6a1.5 1.5 0 011.5-1.5H7.5A.75.75 0 007.5 9H5.25z" />
          </svg>
          <p className="text-sm font-medium text-gray-500">
            {t("admin.noPayments", "No payments found.")}
          </p>
          <p className="text-xs text-gray-400 max-w-xs">
            {payments.length > 0
              ? t(
                  "admin.noPaymentsDateHint",
                  "No payments in this date range — try a wider filter.",
                )
              : t(
                  "admin.noPaymentsHint",
                  "No charges found. Make sure STRIPE_SECRET_KEY is set and the Stripe account has charges.",
                )}
          </p>
        </div>
      ) : (
        /* Table */
        <div className="border rounded overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                    Date
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Description
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                    Amount
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Status
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Email
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Receipt
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 whitespace-nowrap text-gray-500 text-xs">
                      {new Date(p.created).toLocaleString("sv-SE")}
                    </td>
                    <td className="px-3 py-2 text-gray-800 max-w-xs truncate">
                      {p.description || "—"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap font-medium text-gray-900">
                      {formatCents(p.amount, p.currency)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                          p.status === "succeeded"
                            ? "bg-green-100 text-green-800"
                            : p.status === "pending"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-red-100 text-red-800"
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-600 text-xs">
                      {p.email || "—"}
                    </td>
                    <td className="px-3 py-2">
                      {p.receiptId ? (
                        <button
                          type="button"
                          onClick={() => downloadReceipt(p.receiptId)}
                          disabled={downloading === p.receiptId}
                          className="text-purple-700 hover:underline text-xs disabled:opacity-50"
                        >
                          {downloading === p.receiptId
                            ? "Downloading…"
                            : "↓ PDF"}
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2 bg-gray-50 border-t text-xs text-gray-400">
            {filtered.length} of {payments.length} payments
          </div>
        </div>
      )}
    </div>
  );
}
