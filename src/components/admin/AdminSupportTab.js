"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "@/lib/i18n";
import { tenantConfig } from "@/lib/tenantConfig";

export default function AdminSupportTab({
  tickets,
  ticketsLoading,
  ticketsError,
  selectedTicket,
  setSelectedTicketId,
  newTicket,
  setNewTicket,
  commentText,
  setCommentText,
  createSupportTicket,
  updateSupportTicket,
  ticketSaving,
  payments,
  paymentsEmail,
  setPaymentsEmail,
  loadPayments,
  paymentsLoading,
  paymentsError,
  paymentsErrorCode,
  paymentsStripeConfigured,
  downloadReceipt,
  downloading,
}) {
  const [deadLinks, setDeadLinks] = useState([]);
  const [deadLinksTotals, setDeadLinksTotals] = useState(null);
  const [deadLinksLoading, setDeadLinksLoading] = useState(false);
  const [deadLinksError, setDeadLinksError] = useState("");
  const [deadLinksFilter, setDeadLinksFilter] = useState("all");
  const [deadLinksGeneratedAt, setDeadLinksGeneratedAt] = useState("");

  const loadDeadLinks = useCallback(async () => {
    setDeadLinksLoading(true);
    setDeadLinksError("");
    try {
      const res = await fetch("/api/admin/dead-links?limit=120");
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "dead_links_scan_failed");
      }
      setDeadLinks(Array.isArray(json.links) ? json.links : []);
      setDeadLinksTotals(json.totals || null);
      setDeadLinksGeneratedAt(json.generatedAt || "");
    } catch (error) {
      setDeadLinksError(
        error?.message || t("admin.deadLinksScanFailed", "Failed to scan links."),
      );
    } finally {
      setDeadLinksLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDeadLinks().catch(() => {});
  }, [loadDeadLinks]);

  const filteredDeadLinks = useMemo(() => {
    if (deadLinksFilter === "all") return deadLinks;
    if (deadLinksFilter === "broken") {
      return deadLinks.filter((link) => link.reachability === "broken");
    }
    return deadLinks.filter((link) => link.kind === deadLinksFilter);
  }, [deadLinks, deadLinksFilter]);

  const paymentsErrorDisplay =
    paymentsErrorCode === "stripe_lookup_failed"
      ? t(
          "admin.paymentsStripeLookupFailed",
          "Could not fetch payments from Stripe right now.",
        )
      : paymentsErrorCode === "stripe_auth_failed"
        ? t(
            "admin.paymentsStripeAuthFailed",
            "Stripe authentication failed. Check STRIPE_SECRET_KEY.",
          )
        : paymentsErrorCode === "stripe_permission_failed"
          ? t(
              "admin.paymentsStripePermissionFailed",
              "Stripe key lacks permission to list charges.",
            )
          : paymentsErrorCode === "stripe_connection_failed"
            ? t(
                "admin.paymentsStripeConnectionFailed",
                "Could not reach Stripe API. Check network connectivity and retry.",
              )
      : paymentsError;

  function kindLabel(kind) {
    if (kind === "internal") return t("admin.deadLinksKindInternal", "Internal");
    if (kind === "pseudo-external") {
      return t("admin.deadLinksKindPseudo", "Pseudo external");
    }
    if (kind === "external") return t("admin.deadLinksKindExternal", "External");
    if (kind === "invalid") return t("admin.deadLinksKindInvalid", "Invalid");
    if (kind === "unsupported") {
      return t("admin.deadLinksKindUnsupported", "Unsupported");
    }
    return kind || "—";
  }

  return (
    <div className="border rounded p-4 sm:p-5 space-y-4 min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">
            {t("admin.supportTickets")}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {t("admin.supportIntro")}
          </p>
        </div>
        <div className="text-xs text-gray-500 bg-gray-50 border rounded px-3 py-2">
          <div className="font-semibold text-gray-700 mb-1">
            {t("admin.storageBackend")}
          </div>
          {process.env.CF_R2_BUCKET_NAME || process.env.S3_BUCKET_NAME ? (
            <div>
              R2 bucket (
              {(
                process.env.CF_R2_BUCKET_NAME || process.env.S3_BUCKET_NAME
              ).slice(0, 24)}
              …)
            </div>
          ) : process.env.CF_KV_NAMESPACE_ID ? (
            <div>
              Cloudflare KV ({process.env.CF_KV_NAMESPACE_ID.slice(0, 8)}…)
            </div>
          ) : (
            <div className="text-red-700">No R2/KV configured</div>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="space-y-4">
          <div className="border rounded p-3 space-y-2 bg-gray-50">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">Tickets</h3>
              {ticketsLoading && (
                <span className="text-[11px] text-gray-500">
                  {t("common.loading")}
                </span>
              )}
            </div>
            {ticketsError && (
              <p className="text-xs text-red-600">{ticketsError}</p>
            )}
            {tickets.length === 0 && !ticketsLoading ? (
              <p className="text-xs text-gray-500">{t("admin.noTickets")}</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-auto pr-1">
                {tickets.map((ticket) => (
                  <button
                    key={ticket.id}
                    type="button"
                    onClick={() => setSelectedTicketId(ticket.id)}
                    className={`w-full text-left border rounded px-3 py-2 text-sm transition-colors ${
                      selectedTicket?.id === ticket.id
                        ? "border-purple-400 bg-purple-50"
                        : "border-gray-200 hover:border-gray-300 bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-gray-800 truncate">
                        {ticket.title}
                      </span>
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-full capitalize ${
                          ticket.priority === "critical"
                            ? "bg-red-100 text-red-800"
                            : ticket.priority === "moderate"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {t(
                          ticket.priority === "critical"
                            ? "admin.priorityCritical"
                            : ticket.priority === "moderate"
                              ? "admin.priorityModerate"
                              : "admin.priorityLow",
                        )}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-gray-500 mt-1">
                      <span
                        className={`px-2 py-0.5 rounded-full capitalize ${
                          ticket.status === "resolved"
                            ? "bg-green-100 text-green-800"
                            : ticket.status === "will-fix"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {t(
                          ticket.status === "resolved"
                            ? "admin.statusResolved"
                            : ticket.status === "will-fix"
                              ? "admin.statusWillFix"
                              : "admin.statusOpen",
                        )}
                      </span>
                      <span>
                        {new Date(
                          ticket.updatedAt || ticket.createdAt,
                        ).toLocaleString("sv-SE")}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="border rounded p-3 space-y-2">
            <h3 className="text-sm font-semibold text-gray-700">
              {t("admin.newTicket")}
            </h3>
            <input
              type="text"
              className="w-full border rounded px-3 py-2 text-sm"
              placeholder={t("admin.ticketTitle")}
              value={newTicket.title}
              onChange={(e) =>
                setNewTicket((prev) => ({ ...prev, title: e.target.value }))
              }
            />
            <textarea
              className="w-full border rounded px-3 py-2 text-sm min-h-[100px]"
              placeholder={t("admin.ticketDescription")}
              value={newTicket.description}
              onChange={(e) =>
                setNewTicket((prev) => ({
                  ...prev,
                  description: e.target.value,
                }))
              }
            />
            <div className="flex items-center gap-2 text-sm">
              <label className="text-gray-600">{t("admin.priority")}:</label>
              <select
                value={newTicket.priority}
                onChange={(e) =>
                  setNewTicket((prev) => ({
                    ...prev,
                    priority: e.target.value,
                  }))
                }
                className="border rounded px-2 py-1 text-sm"
              >
                <option value="critical">{t("admin.priorityCritical")}</option>
                <option value="moderate">{t("admin.priorityModerate")}</option>
                <option value="low">{t("admin.priorityLow")}</option>
              </select>
            </div>
            {(process.env.NEXT_PUBLIC_BUILD_TIME ||
              process.env.NEXT_PUBLIC_GIT_SHA) && (
              <div className="text-xs text-gray-400 bg-gray-50 rounded px-2 py-1">
                <span className="font-medium text-gray-500">
                  {t("admin.buildInfo")}:
                </span>{" "}
                {process.env.NEXT_PUBLIC_BUILD_TIME
                  ? new Date(process.env.NEXT_PUBLIC_BUILD_TIME).toLocaleString(
                      "sv-SE",
                    )
                  : ""}
                {process.env.NEXT_PUBLIC_GIT_SHA
                  ? ` (${process.env.NEXT_PUBLIC_GIT_SHA.slice(0, 7)})`
                  : ""}
              </div>
            )}
            <button
              type="button"
              onClick={createSupportTicket}
              className="w-full px-3 py-2 rounded bg-gray-900 text-white hover:bg-gray-800 text-sm"
            >
              {t("admin.createTicket")}
            </button>
          </div>
        </div>

        <div className="md:col-span-2 border rounded p-4 space-y-3 min-h-[340px]">
          {selectedTicket ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {selectedTicket.title}
                  </h3>
                  <p className="text-xs text-gray-500">
                    {new Date(selectedTicket.createdAt).toLocaleString("sv-SE")}
                  </p>
                </div>
                <select
                  className="border rounded px-2 py-1 text-sm"
                  value={selectedTicket.status}
                  onChange={(e) =>
                    updateSupportTicket({ status: e.target.value })
                  }
                >
                  <option value="open">{t("admin.statusOpen")}</option>
                  <option value="will-fix">{t("admin.statusWillFix")}</option>
                  <option value="resolved">{t("admin.statusResolved")}</option>
                </select>
              </div>
              {selectedTicket.description && (
                <p className="text-sm text-gray-700 whitespace-pre-wrap">
                  {selectedTicket.description}
                </p>
              )}
              {(selectedTicket.buildTime || selectedTicket.gitSha) && (
                <p className="text-xs text-gray-400">
                  <span className="font-medium text-gray-500">
                    {t("admin.buildInfo")}:
                  </span>{" "}
                  {selectedTicket.buildTime
                    ? new Date(selectedTicket.buildTime).toLocaleString("sv-SE")
                    : ""}
                  {selectedTicket.gitSha
                    ? ` (${selectedTicket.gitSha.slice(0, 7)})`
                    : ""}
                </p>
              )}

              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-gray-700">
                  {t("admin.comments")}
                </h4>
                <div className="space-y-2 max-h-48 overflow-auto pr-1">
                  {(selectedTicket.comments || []).length === 0 ? (
                    <p className="text-xs text-gray-500">
                      {t("admin.noComments")}
                    </p>
                  ) : (
                    selectedTicket.comments.map((c) => (
                      <div
                        key={c.id}
                        className="border rounded px-3 py-2 bg-gray-50 text-sm"
                      >
                        <div className="flex items-center justify-between text-[11px] text-gray-500">
                          <span>{c.author || "admin"}</span>
                          <span>
                            {new Date(c.createdAt).toLocaleString("sv-SE")}
                          </span>
                        </div>
                        <p className="text-gray-800 text-sm whitespace-pre-wrap mt-1">
                          {c.text}
                        </p>
                      </div>
                    ))
                  )}
                </div>
                <div className="space-y-2">
                  <textarea
                    className="w-full border rounded px-3 py-2 text-sm"
                    placeholder={t("admin.commentPlaceholder")}
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        updateSupportTicket({ comment: commentText })
                      }
                      className="px-4 py-2 rounded bg-purple-700 text-white hover:bg-purple-800 text-sm disabled:opacity-50"
                      disabled={!commentText.trim() || ticketSaving}
                    >
                      {ticketSaving ? "…" : t("admin.addComment")}
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-500">{t("admin.noTickets")}</p>
          )}
        </div>
      </div>

      <div className="border rounded p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-800">
            {t("admin.payments")}
          </h3>
          <div className="flex items-center gap-2">
            <input
              type="email"
              value={paymentsEmail}
              onChange={(e) => setPaymentsEmail(e.target.value)}
              placeholder={t("admin.paymentsFilter")}
              className="border rounded px-2 py-1 text-sm"
            />
            <button
              type="button"
              onClick={() => loadPayments(paymentsEmail)}
              className="px-3 py-1.5 rounded border text-sm hover:bg-gray-50 disabled:opacity-50"
              disabled={paymentsLoading}
            >
              {paymentsLoading ? t("admin.running") : t("admin.paymentsReload")}
            </button>
          </div>
        </div>
        {paymentsError && (
          <p className="text-sm text-red-600">{paymentsErrorDisplay}</p>
        )}
        {!paymentsStripeConfigured && !paymentsError && (
          <p className="text-sm text-amber-700">
            {t(
              "admin.noStripeConfiguredHint",
              "Stripe is not configured. Set STRIPE_SECRET_KEY to load payment data.",
            )}
          </p>
        )}
        {!paymentsError && payments.length === 0 ? (
          <p className="text-sm text-gray-500">
            {paymentsStripeConfigured
              ? t(
                  "admin.noSalesDataHint",
                  "Stripe is configured but no charges were found yet for this view.",
                )
              : t("admin.noPayments")}
          </p>
        ) : !paymentsError ? (
          <div className="max-h-80 overflow-auto border rounded">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-100 text-gray-600">
                <tr>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Amount</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Email</th>
                  <th className="px-3 py-2 text-left">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2">
                      {new Date(p.created).toLocaleString("sv-SE")}
                    </td>
                    <td className="px-3 py-2">
                      {(p.amount / 100).toFixed(2)} {p.currency?.toUpperCase()}
                    </td>
                    <td className="px-3 py-2 capitalize">{p.status}</td>
                    <td className="px-3 py-2">{p.email || "—"}</td>
                    <td className="px-3 py-2">
                      {p.receiptUrl ? (
                        <button
                          type="button"
                          onClick={() => downloadReceipt(p.receiptId)}
                          className="text-purple-700 underline text-left"
                          disabled={downloading === p.receiptId}
                        >
                          {downloading === p.receiptId
                            ? "Downloading…"
                            : "Download"}
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
        ) : null}
      </div>

      <div className="border rounded p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">
              {t("admin.deadLinksTitle", "Dead-link finder")}
            </h3>
            <p className="text-xs text-gray-500">
              {t(
                "admin.deadLinksHint",
                `Scans content anchor tags and classifies internal, pseudo-external (${tenantConfig.customDomainExample}) and external links.`,
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={deadLinksFilter}
              onChange={(event) => setDeadLinksFilter(event.target.value)}
              className="border rounded px-2 py-1 text-sm"
            >
              <option value="all">{t("admin.deadLinksFilterAll", "All")}</option>
              <option value="broken">{t("admin.deadLinksFilterBroken", "Broken")}</option>
              <option value="internal">{t("admin.deadLinksFilterInternal", "Internal")}</option>
              <option value="pseudo-external">
                {t("admin.deadLinksFilterPseudo", "Pseudo external")}
              </option>
              <option value="external">{t("admin.deadLinksFilterExternal", "External")}</option>
            </select>
            <button
              type="button"
              onClick={() => loadDeadLinks()}
              disabled={deadLinksLoading}
              className="px-3 py-1.5 rounded border text-sm hover:bg-gray-50 disabled:opacity-50"
            >
              {deadLinksLoading
                ? t("admin.running", "Running…")
                : t("admin.deadLinksRescan", "Rescan")}
            </button>
          </div>
        </div>

        {deadLinksTotals && (
          <div className="grid gap-2 text-xs sm:grid-cols-3 lg:grid-cols-6">
            <div className="rounded border border-gray-200 bg-gray-50 px-2 py-1.5">
              {t("admin.deadLinksTotal", "Total")}:{" "}
              <span className="font-semibold">{deadLinksTotals.total ?? 0}</span>
            </div>
            <div className="rounded border border-indigo-200 bg-indigo-50 px-2 py-1.5">
              {t("admin.deadLinksKindInternal", "Internal")}:{" "}
              <span className="font-semibold">{deadLinksTotals.internal ?? 0}</span>
            </div>
            <div className="rounded border border-cyan-200 bg-cyan-50 px-2 py-1.5">
              {t("admin.deadLinksKindPseudo", "Pseudo external")}:{" "}
              <span className="font-semibold">
                {deadLinksTotals.pseudoExternal ?? 0}
              </span>
            </div>
            <div className="rounded border border-violet-200 bg-violet-50 px-2 py-1.5">
              {t("admin.deadLinksKindExternal", "External")}:{" "}
              <span className="font-semibold">{deadLinksTotals.external ?? 0}</span>
            </div>
            <div className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1.5">
              {t("admin.deadLinksReachable", "Reachable")}:{" "}
              <span className="font-semibold">{deadLinksTotals.ok ?? 0}</span>
            </div>
            <div className="rounded border border-rose-200 bg-rose-50 px-2 py-1.5">
              {t("admin.deadLinksBroken", "Broken")}:{" "}
              <span className="font-semibold">{deadLinksTotals.broken ?? 0}</span>
            </div>
          </div>
        )}

        {deadLinksGeneratedAt && (
          <p className="text-xs text-gray-500">
            {t("admin.deadLinksLastScan", "Last scan")}:{" "}
            {new Date(deadLinksGeneratedAt).toLocaleString("sv-SE")}
          </p>
        )}

        {deadLinksError && <p className="text-sm text-red-600">{deadLinksError}</p>}

        {!deadLinksError && filteredDeadLinks.length === 0 ? (
          <p className="text-sm text-gray-500">
            {t("admin.deadLinksEmpty", "No links matched this filter.")}
          </p>
        ) : !deadLinksError ? (
          <div className="max-h-96 overflow-auto border rounded">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-100 text-gray-600">
                <tr>
                  <th className="px-3 py-2 text-left">
                    {t("admin.deadLinksColumnType", "Type")}
                  </th>
                  <th className="px-3 py-2 text-left">
                    {t("admin.deadLinksColumnLink", "Link")}
                  </th>
                  <th className="px-3 py-2 text-left">
                    {t("admin.deadLinksColumnStatus", "Status")}
                  </th>
                  <th className="px-3 py-2 text-left">
                    {t("admin.deadLinksColumnSources", "Sources")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredDeadLinks.map((link) => (
                  <tr key={`${link.kind}:${link.href}`} className="hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                        {kindLabel(link.kind)}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noreferrer"
                        className="break-all text-purple-700 underline"
                      >
                        {link.href}
                      </a>
                      {link.kind === "pseudo-external" && link.translatedPath && (
                        <div className="mt-1 text-xs text-cyan-700">
                          {t("admin.deadLinksTranslatedTo", "Translated to")}:{" "}
                          <code>{link.translatedPath}</code>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {link.reachability === "ok" ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
                          {t("admin.deadLinksStatusOk", "Reachable")}
                        </span>
                      ) : link.reachability === "broken" ? (
                        <div className="space-y-1">
                          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-700">
                            {t("admin.deadLinksStatusBroken", "Broken")}
                          </span>
                          <div className="text-xs text-rose-700">
                            {link.statusCode || link.error || "error"}
                          </div>
                        </div>
                      ) : link.reachability === "unchecked" ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                          {t("admin.deadLinksStatusUnchecked", "Unchecked")}
                        </span>
                      ) : (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                          {t("admin.deadLinksStatusSkipped", "Skipped")}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="space-y-1 text-xs text-gray-700">
                        <div>
                          {t("admin.deadLinksOccurrences", "Occurrences")}:{" "}
                          <span className="font-semibold">{link.occurrences || 0}</span>
                        </div>
                        {(link.sources || []).slice(0, 3).map((source) => (
                          <a
                            key={`${source.kind}:${source.uri}`}
                            href={source.uri}
                            target="_blank"
                            rel="noreferrer"
                            className="block break-all text-gray-600 underline"
                            title={source.title}
                          >
                            {source.kind}: {source.title || source.uri}
                          </a>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}
