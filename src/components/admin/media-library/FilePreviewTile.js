"use client";

import { resolveAssetFilePreview } from "@/lib/mediaLibraryHelpers";

function FilePreviewGlyph({ group }) {
  if (group === "pdf") {
    return (
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="admin-file-preview-icon"
      >
        <path
          d="M7 3h8l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <path
          d="M15 3v4h4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <path
          d="M8 14h8M8 17h6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        />
      </svg>
    );
  }
  if (group === "table") {
    return (
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="admin-file-preview-icon"
      >
        <rect
          x="4"
          y="5"
          width="16"
          height="14"
          rx="1.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <path
          d="M4 10h16M9 5v14M14 5v14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        />
      </svg>
    );
  }
  if (group === "code") {
    return (
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="admin-file-preview-icon"
      >
        <path
          d="M9 8 5 12l4 4M15 8l4 4-4 4M13 6l-2 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (group === "database") {
    return (
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="admin-file-preview-icon"
      >
        <ellipse
          cx="12"
          cy="6"
          rx="6.5"
          ry="2.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <path
          d="M5.5 6v9c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5V6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <path
          d="M5.5 10.5c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        />
      </svg>
    );
  }
  if (group === "archive") {
    return (
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="admin-file-preview-icon"
      >
        <rect
          x="4"
          y="6"
          width="16"
          height="13"
          rx="1.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <path
          d="M4 10h16M11 6v4h2V6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        />
      </svg>
    );
  }
  if (group === "audio") {
    return (
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="admin-file-preview-icon"
      >
        <path
          d="M10 8v8.5a2.2 2.2 0 1 1-1.4-2.1V9.6l8-1.6v6.9a2.2 2.2 0 1 1-1.4-2.1V6.2L10 8z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (group === "video") {
    return (
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="admin-file-preview-icon"
      >
        <rect
          x="4"
          y="6"
          width="13"
          height="12"
          rx="2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <path
          d="m17 10 3-2v8l-3-2z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (group === "presentation") {
    return (
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="admin-file-preview-icon"
      >
        <rect
          x="4"
          y="5.5"
          width="16"
          height="10.5"
          rx="1.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <path
          d="M12 16v3.5M9 19.5h6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (group === "font") {
    return (
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="admin-file-preview-icon"
      >
        <path
          d="M12 5 6.5 19M12 5 17.5 19M8.2 14h7.6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (group === "binary") {
    return (
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="admin-file-preview-icon"
      >
        <rect
          x="7"
          y="7"
          width="10"
          height="10"
          rx="1.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <path
          d="M4 9h3M4 12h3M4 15h3M17 9h3M17 12h3M17 15h3M9 4v3M12 4v3M15 4v3M9 17v3M12 17v3M15 17v3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (group === "document") {
    return (
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="admin-file-preview-icon"
      >
        <path
          d="M7 3h8l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <path
          d="M15 3v4h4M8 12h8M8 15h8M8 18h6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="admin-file-preview-icon"
    >
      <path
        d="M7 3h8l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path d="M15 3v4h4" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export default function FilePreviewTile({ item, compact = false }) {
  const preview = resolveAssetFilePreview(item);
  return (
    <div
      className={`admin-file-preview ${preview.className} ${
        compact ? "admin-file-preview-sm" : "admin-file-preview-md"
      }`}
      title={item?.fileType || item?.mimeType || preview.label}
      aria-label={item?.fileType || item?.mimeType || preview.label}
    >
      <FilePreviewGlyph group={preview.group} />
      <span className="admin-file-preview-label">{preview.label}</span>
    </div>
  );
}
