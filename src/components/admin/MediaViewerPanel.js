"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { t } from "@/lib/i18n";

export default function MediaViewerPanel({ viewerItem, viewerLoading, viewerError, viewerData, onClose }) {
  if (!viewerItem) return null;

  return (
    <div className="rounded border bg-white p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">
            {t("admin.mediaViewerTitle", "Asset viewer")}
          </h3>
          <p className="text-xs text-gray-500 break-all">
            {viewerItem.title || viewerItem.key || viewerItem.url}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 rounded border text-xs hover:bg-gray-100"
        >
          {t("common.close", "Close")}
        </button>
      </div>

      {viewerLoading && (
        <p className="text-xs text-gray-500">
          {t("admin.mediaViewerLoading", "Loading viewer…")}
        </p>
      )}

      {viewerError && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">
          {viewerError}
        </p>
      )}

      {viewerData?.truncated && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
          {t(
            "admin.mediaViewerTruncated",
            "Viewer output is truncated for performance.",
          )}
        </p>
      )}

      {viewerData?.viewerType === "json" && (
        <div className="space-y-2">
          {viewerData.summary && (
            <p className="text-xs text-gray-600">
              {t("admin.mediaJsonSummary", {
                type: viewerData.summary.rootType || "unknown",
                count:
                  viewerData.summary.keyCount === null
                    ? "—"
                    : String(viewerData.summary.keyCount),
              })}
            </p>
          )}
          {viewerData.parseError && (
            <p className="text-xs text-amber-700">
              {t("admin.mediaJsonParseError", "JSON parse warning")}:{" "}
              {viewerData.parseError}
            </p>
          )}
          <pre className="max-h-96 overflow-auto rounded bg-gray-100 p-3 text-xs text-gray-800">
            {viewerData.pretty || ""}
          </pre>
        </div>
      )}

      {viewerData?.viewerType === "yaml" && (
        <div className="space-y-2">
          {Array.isArray(viewerData.topLevelKeys) &&
            viewerData.topLevelKeys.length > 0 && (
              <p className="text-xs text-gray-600">
                {t("admin.mediaYamlKeys", "Top-level keys")}:{" "}
                {viewerData.topLevelKeys.join(", ")}
              </p>
            )}
          <pre className="max-h-96 overflow-auto rounded bg-gray-100 p-3 text-xs text-gray-800">
            {viewerData.text || ""}
          </pre>
        </div>
      )}

      {viewerData?.viewerType === "csv" && (
        <div className="space-y-3">
          {Array.isArray(viewerData.csv?.columns) &&
            viewerData.csv.columns.length > 0 && (
              <div className="overflow-auto border rounded">
                <table className="min-w-full text-xs">
                  <thead className="bg-gray-50 text-gray-600 uppercase tracking-wide">
                    <tr>
                      <th className="text-left px-2 py-1">#</th>
                      <th className="text-left px-2 py-1">
                        {t("common.name", "Name")}
                      </th>
                      <th className="text-left px-2 py-1">
                        {t("admin.mediaAnnotatedType", "Annotated type")}
                      </th>
                      <th className="text-left px-2 py-1">
                        {t("admin.mediaInferredType", "Inferred type")}
                      </th>
                      <th className="text-left px-2 py-1">
                        {t("admin.mediaSample", "Sample")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewerData.csv.columns.map((column) => (
                      <tr key={`${column.index}-${column.name}`} className="border-t">
                        <td className="px-2 py-1">{column.index}</td>
                        <td className="px-2 py-1">{column.name}</td>
                        <td className="px-2 py-1">
                          {column.annotatedType || "—"}
                        </td>
                        <td className="px-2 py-1">
                          {column.inferredType || "—"}
                        </td>
                        <td className="px-2 py-1 break-all">
                          {column.sample || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          {Array.isArray(viewerData.csv?.rows) && viewerData.csv.rows.length > 0 && (
            <div className="overflow-auto border rounded">
              <table className="min-w-full text-xs">
                <tbody>
                  {viewerData.csv.rows.map((row, rowIndex) => (
                    <tr key={`row-${rowIndex}`} className="border-t">
                      {row.map((cell, cellIndex) => (
                        <td key={`cell-${rowIndex}-${cellIndex}`} className="px-2 py-1">
                          {cell || "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {viewerData?.viewerType === "markdown" && (
        <div className="space-y-3">
          {Array.isArray(viewerData.headings) && viewerData.headings.length > 0 && (
            <div className="text-xs text-gray-600">
              {t("admin.mediaMarkdownHeadings", "Headings")}:{" "}
              {viewerData.headings.map((item) => item.text).join(" · ")}
            </div>
          )}
          <article className="prose prose-sm max-w-none rounded border bg-white p-3">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {viewerData.text || ""}
            </ReactMarkdown>
          </article>
        </div>
      )}

      {viewerData?.viewerType === "sqlite" && (
        <div className="space-y-2 text-xs text-gray-700">
          <p>
            {t(
              "admin.mediaSqliteHint",
              "SQLite header view is shown below. Add schema-specific semantics in annotations.",
            )}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <p>
              Page size: <strong>{viewerData.sqlite?.pageSize ?? "—"}</strong>
            </p>
            <p>
              Encoding: <strong>{viewerData.sqlite?.textEncoding ?? "—"}</strong>
            </p>
            <p>
              Page count: <strong>{viewerData.sqlite?.pageCount ?? "—"}</strong>
            </p>
            <p>
              User version: <strong>{viewerData.sqlite?.userVersion ?? "—"}</strong>
            </p>
            <p>
              Schema cookie:{" "}
              <strong>{viewerData.sqlite?.schemaCookie ?? "—"}</strong>
            </p>
          </div>
        </div>
      )}

      {viewerData?.viewerType === "text" && (
        <pre className="max-h-96 overflow-auto rounded bg-gray-100 p-3 text-xs text-gray-800">
          {viewerData.text || ""}
        </pre>
      )}
    </div>
  );
}
