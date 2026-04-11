"use client";

import { useState } from "react";

export default function CopyProfileUrlButton({ href = "" }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy(event) {
    event?.preventDefault?.();
    const safeHref = String(href || "").trim();
    if (!safeHref) return;
    const absoluteUrl =
      safeHref.startsWith("http://") || safeHref.startsWith("https://")
        ? safeHref
        : `${window.location.origin}${safeHref.startsWith("/") ? safeHref : `/${safeHref}`}`;
    try {
      await navigator.clipboard.writeText(absoluteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  return (
    <a
      href={href || "#"}
      onClick={handleCopy}
      aria-label={copied ? "Copied profile URL" : "Copy profile URL"}
      title={copied ? "Copied" : "Copy profile URL"}
      className="inline-flex h-8 w-8 items-center justify-center text-slate-700 transition-colors hover:text-slate-950"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5"
        aria-hidden="true"
      >
        <rect x="9" y="9" width="10" height="10" rx="2" />
        <path d="M5 15V7a2 2 0 0 1 2-2h8" />
      </svg>
    </a>
  );
}
