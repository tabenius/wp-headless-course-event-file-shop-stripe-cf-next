"use client";

import { useEffect } from "react";
import { t } from "@/lib/i18n";
import AdminDocsContextLinks from "./AdminDocsContextLinks";
import AdminFieldHelpLink from "./AdminFieldHelpLink";

export default function AdminConnectorsTab({
  healthChecks,
  healthLoading,
  webhookUrl,
  ragbazDownloadUrl,
  runHealthCheck,
}) {
  useEffect(() => {
    console.info("[AdminConnectorsTab] mounted");
    return () => console.info("[AdminConnectorsTab] unmounted");
  }, []);

  useEffect(() => {
    console.info("[AdminConnectorsTab] props", {
      hasChecks: !!healthChecks,
      webhook: !!webhookUrl,
      ragbaz: !!ragbazDownloadUrl,
      loading: healthLoading,
    });
  }, [healthChecks, webhookUrl, ragbazDownloadUrl, healthLoading]);

  return (
    <div className="border rounded p-4 space-y-3 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">{t("admin.healthCheck")}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <AdminDocsContextLinks tab="info" compact />
          <button
            type="button"
            onClick={runHealthCheck}
            className="px-4 py-2 rounded border hover:bg-gray-50 disabled:opacity-50"
            disabled={healthLoading}
            title={t("admin.healthCheckDesc")}
          >
            {healthLoading ? t("admin.running") : t("admin.runCheck")}
          </button>
        </div>
      </div>
      {healthChecks ? (
        <ul className="space-y-2 text-sm">
          {Object.entries(healthChecks).map(([key, value]) => (
            <li key={key} className="flex items-start gap-2">
              <span
                className={`inline-block w-2 h-2 rounded-full mt-1.5 ${
                  value?.ok ? "bg-green-600" : "bg-red-600"
                }`}
              />
              <span>
                <strong>{key}:</strong>{" "}
                {value?.message || t("common.noDetails")}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-600">{t("admin.healthCheckDesc")}</p>
      )}

      {webhookUrl && (
        <div className="bg-gray-50 border rounded p-4 space-y-2 text-sm">
          <div className="inline-flex items-center gap-1">
            <h3 className="font-semibold">{t("admin.stripeWebhook")}</h3>
            <AdminFieldHelpLink slug="technical-manual" />
          </div>
          <p className="text-gray-600">
            {t("admin.stripeWebhookConfigureIn")}{" "}
            <a
              href="https://dashboard.stripe.com/webhooks"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-700 underline"
            >
              {t("admin.stripeWebhookDashboardLink")}
            </a>
          </p>
          <div className="flex items-center gap-2">
            <label className="text-gray-500 shrink-0">
              {t("admin.endpointUrl")}:
            </label>
            <code className="bg-white border rounded px-2 py-1 text-xs break-all flex-1 select-all">
              {webhookUrl}
            </code>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(webhookUrl);
              }}
              className="px-2 py-1 rounded border hover:bg-gray-100 text-xs whitespace-nowrap"
              title={t("common.copy")}
            >
              {t("common.copy")}
            </button>
          </div>
          <p className="text-gray-500">
            {t("admin.eventsToListen")}:{" "}
            <code className="bg-white border rounded px-1 text-xs">
              checkout.session.completed
            </code>
          </p>
        </div>
      )}

      {ragbazDownloadUrl && (
        <div className="bg-gray-50 border rounded p-4 space-y-2 text-sm">
          <div className="inline-flex items-center gap-1">
            <h3 className="font-semibold">{t("admin.ragbazPlugin")}</h3>
            <AdminFieldHelpLink slug="quick-start" />
          </div>
          <p className="text-gray-600">{t("admin.ragbazPluginDesc")}</p>
          <div className="flex items-center gap-2">
            <a
              className="px-3 py-2 rounded border bg-white hover:bg-gray-100 text-sm"
              href={ragbazDownloadUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("admin.downloadRagbaz")}
            </a>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(ragbazDownloadUrl)}
              className="px-2 py-1 rounded border hover:bg-gray-100 text-xs whitespace-nowrap"
              title={t("common.copy")}
            >
              {t("common.copy")}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-gray-500 shrink-0">WP-CLI:</label>
            <code className="bg-white border rounded px-2 py-1 text-xs break-all flex-1 select-all">
              {`wp plugin install ${ragbazDownloadUrl} --activate`}
            </code>
            <button
              type="button"
              onClick={() =>
                navigator.clipboard.writeText(
                  `wp plugin install ${ragbazDownloadUrl} --activate`,
                )
              }
              className="px-2 py-1 rounded border hover:bg-gray-100 text-xs whitespace-nowrap"
              title={t("common.copy")}
            >
              {t("common.copy")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
