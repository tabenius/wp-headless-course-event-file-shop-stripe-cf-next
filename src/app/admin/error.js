"use client";

export default function AdminError({ error, reset }) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-2xl font-bold">Admin Error</h1>
        <p className="text-gray-600">
          {error?.message || "An unexpected error occurred."}
        </p>
        {error?.digest && (
          <p className="text-xs text-gray-400">Digest: {error.digest}</p>
        )}
        <div className="flex gap-3 justify-center">
          <button
            type="button"
            onClick={() => reset()}
            className="px-4 py-2 rounded bg-gray-800 text-white hover:bg-gray-700"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => (window.location.href = "/admin")}
            className="px-4 py-2 rounded border border-gray-300 hover:bg-gray-50"
          >
            Reload admin
          </button>
        </div>
      </div>
    </div>
  );
}
