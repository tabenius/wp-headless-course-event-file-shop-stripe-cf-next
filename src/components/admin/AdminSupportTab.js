"use client";

import { t } from "@/lib/i18n";

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
                      disabled={!commentText.trim()}
                    >
                      {t("admin.addComment")}
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
    </div>
  );
}
