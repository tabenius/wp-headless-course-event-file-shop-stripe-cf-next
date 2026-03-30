import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { GoogleFontChooser } from "../src/index";

const ADMIN_THEME_OVERRIDES = `
  :root {
    color-scheme: dark;
  }
  body {
    margin: 0;
    background: #002b36;
    color: #eee8d5;
    font-family: "Inter", "Segoe UI", system-ui, sans-serif;
  }
  .rgfc-host {
    min-height: 100vh;
    background: #002b36;
    color: #eee8d5;
    padding: 24px;
  }
  .rgfc-host h1,
  .rgfc-host h2 {
    color: #fdf6e3;
    margin: 0;
  }
  .rgfc-host p {
    color: #93a1a1;
  }
  .rgfc-host .rgfc-card {
    background: #073642;
    border-color: #5f747d;
  }
  .rgfc-host .rgfc-search,
  .rgfc-host .rgfc-preview-text,
  .rgfc-host .rgfc-font-size,
  .rgfc-host .rgfc-axis,
  .rgfc-host .rgfc-css,
  .rgfc-host .rgfc-button,
  .rgfc-host .rgfc-mode-toggle,
  .rgfc-host .rgfc-mode,
  .rgfc-host .rgfc-chip,
  .rgfc-host .rgfc-cat,
  .rgfc-host .rgfc-font-list,
  .rgfc-host .rgfc-axis-reset,
  .rgfc-host .rgfc-star,
  .rgfc-host .rgfc-knob-reset {
    background: #002b36;
    border-color: #5f747d;
    color: #eee8d5;
  }
  .rgfc-host .rgfc-font-row {
    background: #073642;
    border-bottom-color: rgba(95, 116, 125, 0.6);
  }
  .rgfc-host .rgfc-font-row:hover {
    background: #114552;
  }
  .rgfc-host .rgfc-font-row.active {
    background: #cbd5e1;
  }
  .rgfc-host .rgfc-font-row.active .rgfc-font-family,
  .rgfc-host .rgfc-font-row.active .rgfc-font-sub,
  .rgfc-host .rgfc-font-row.active .rgfc-star {
    color: #0f172a;
  }
  .rgfc-host .rgfc-font-family {
    color: #fdf6e3;
  }
  .rgfc-host .rgfc-font-sub,
  .rgfc-host .rgfc-section-title {
    color: #93a1a1;
  }
  .rgfc-host .rgfc-preview {
    background: #002b36;
    border-color: #5f747d;
    color: #fdf6e3;
  }
  .rgfc-host .rgfc-css {
    background: #011d25;
    color: #fdf6e3;
  }
  .rgfc-host .rgfc-mode.active,
  .rgfc-host .rgfc-button.primary,
  .rgfc-host .rgfc-cat.active,
  .rgfc-host .rgfc-star.active {
    background: #cbd5e1;
    border-color: #cbd5e1;
    color: #0f172a;
  }
  .rgfc-host .rgfc-knob svg text {
    fill: #fdf6e3;
  }
  .rgfc-host .rgfc-knob svg path:nth-child(2),
  .rgfc-host .rgfc-knob svg circle:last-of-type {
    stroke: #cbd5e1;
    fill: #cbd5e1;
  }
  .rgfc-host .rgfc-result {
    margin-top: 16px;
    border: 1px solid #5f747d;
    border-radius: 12px;
    background: #073642;
    padding: 14px;
  }
  .rgfc-host .rgfc-result pre {
    margin: 0;
    border: 1px solid #5f747d;
    border-radius: 8px;
    background: #002b36;
    color: #eee8d5;
    padding: 10px;
    font-size: 12px;
    white-space: pre-wrap;
    word-break: break-word;
  }
`;

function ExampleApp() {
  const [applied, setApplied] = useState(null);
  const appliedJson = useMemo(
    () => (applied ? JSON.stringify(applied, null, 2) : "No selection applied yet."),
    [applied],
  );

  return (
    <main className="rgfc-host">
      <style>{ADMIN_THEME_OVERRIDES}</style>
      <div style={{ maxWidth: "1200px", margin: "0 auto", display: "grid", gap: "12px" }}>
        <h1>Google Font Chooser (Admin Theme)</h1>
        <p>Single-file bundled demo aligned to the admin water palette.</p>
        <GoogleFontChooser
          allowAdvancedToggle
          advancedDefault={false}
          onApply={(selection) => setApplied(selection)}
        />
        <section className="rgfc-result">
          <h2 style={{ fontSize: "16px", marginBottom: "10px" }}>Applied selection</h2>
          <pre>{appliedJson}</pre>
        </section>
      </div>
    </main>
  );
}

const rootNode = document.getElementById("app");
if (rootNode) {
  createRoot(rootNode).render(<ExampleApp />);
}
