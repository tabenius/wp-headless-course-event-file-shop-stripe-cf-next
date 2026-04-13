"use client";

import Link from "next/link";

export default function Error({ error }) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-2xl font-bold">Something went wrong</h1>
        <p className="text-gray-600">
          {error?.digest
            ? `Error reference: ${error.digest}`
            : "An unexpected error occurred."}
        </p>
        <div className="flex gap-3 justify-center">
          <button
            type="button"
            onClick={() => {
              if (typeof window !== "undefined") {
                window.location.reload();
              }
            }}
            className="px-4 py-2 rounded bg-gray-800 text-white hover:bg-gray-700"
          >
            Try again
          </button>
          <Link
            href="/"
            className="px-4 py-2 rounded border border-gray-300 hover:bg-gray-50"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
