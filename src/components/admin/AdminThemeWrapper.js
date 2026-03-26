"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "ragbaz-admin-theme";
const THEME_SEQUENCE = ["light", "gruvbox", "earth", "lollipop"];

function normalizeTheme(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return THEME_SEQUENCE.includes(normalized) ? normalized : "light";
}

function nextTheme(current) {
  const index = THEME_SEQUENCE.indexOf(normalizeTheme(current));
  if (index === -1) return THEME_SEQUENCE[0];
  return THEME_SEQUENCE[(index + 1) % THEME_SEQUENCE.length];
}

export default function AdminThemeWrapper({ children, fontVariable }) {
  const [theme, setTheme] = useState("light");

  // Read from localStorage on mount (client only)
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    setTheme(normalizeTheme(saved));
  }, []);

  // Expose toggle to rest of admin via custom event
  useEffect(() => {
    function onToggle(e) {
      const next = normalizeTheme(e.detail || nextTheme(theme));
      setTheme(next);
      localStorage.setItem(STORAGE_KEY, next);
    }
    window.addEventListener("admin:setTheme", onToggle);
    return () => window.removeEventListener("admin:setTheme", onToggle);
  }, [theme]);

  const classes = [
    "admin-layout",
    fontVariable,
    theme === "gruvbox" ? "admin-gruvbox" : "",
    theme === "earth" ? "admin-earth" : "",
    theme === "lollipop" ? "admin-lollipop" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return <div className={classes}>{children}</div>;
}
