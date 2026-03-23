"use client";

/**
 * Displayed when the GraphQL host returns HTTP 429 (Too Many Requests).
 * Shows the raw Varnish/proxy response body and a history of recent attempts.
 */
export default function RateLimitPage({ responseBody = "", history = [], status = 429 }) {
  const grouped = {};
  for (const entry of history) {
    const key = entry.endpoint || "unknown";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(entry);
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-12">
      <div className="max-w-2xl w-full space-y-6">
        {/* Header */}
        <div className="flex items-start gap-3">
          <span className="text-3xl" aria-hidden>⏳</span>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Too Many Requests ({status})
            </h1>
            <p className="mt-1 text-gray-600">
              The WordPress GraphQL server (or Varnish cache in front of it) is
              rate-limiting this storefront. Please wait a moment and then
              reload the page.
            </p>
          </div>
        </div>

        {/* Instructions */}
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800 space-y-1">
          <p className="font-semibold">What you can do:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Wait 30–60 seconds, then reload this page.</li>
            <li>
              Check your WordPress Varnish or server-side rate-limit settings if
              this happens frequently.
            </li>
            <li>
              Set the{" "}
              <code className="font-mono bg-yellow-100 px-1 rounded">
                GRAPHQL_DELAY_MS
              </code>{" "}
              environment variable to add a delay between GraphQL calls.
            </li>
          </ul>
        </div>

        {/* Request history */}
        {history.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-2">
              Recent GraphQL request attempts
            </h2>
            <div className="rounded-lg border border-gray-200 overflow-hidden text-xs font-mono">
              <table className="w-full text-left">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Date / Time</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium hidden sm:table-cell">Endpoint</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {history.slice(0, 15).map((entry, i) => {
                    const d = new Date(entry.ts);
                    const dateStr = d.toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    });
                    const timeStr = d.toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    });
                    const isRateLimit =
                      entry.status === 429 || entry.status === 503;
                    const isOk = entry.ok === true;
                    return (
                      <tr key={i} className={isRateLimit ? "bg-red-50" : ""}>
                        <td className="px-3 py-1.5 whitespace-nowrap text-gray-700">
                          {dateStr}{" "}
                          <span className="text-gray-500">{timeStr}</span>
                        </td>
                        <td className="px-3 py-1.5 whitespace-nowrap">
                          <span
                            className={
                              isRateLimit
                                ? "text-red-600 font-semibold"
                                : isOk
                                  ? "text-green-600"
                                  : "text-orange-500"
                            }
                          >
                            {String(entry.status)}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-gray-400 truncate max-w-xs hidden sm:table-cell">
                          {entry.endpoint}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Raw server response */}
        {responseBody && (
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-2">
              Raw server response
            </h2>
            <pre className="overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 p-4 text-xs text-gray-700 whitespace-pre-wrap break-words max-h-64">
              {responseBody}
            </pre>
          </div>
        )}

        {/* Reload button */}
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="px-5 py-2 rounded bg-gray-800 text-white text-sm font-medium hover:bg-gray-700 transition-colors"
        >
          Reload page
        </button>
      </div>
    </div>
  );
}
