"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "ragbaz-admin-theme";

export default function AdminThemeWrapper({ children, fontVariable }) {
  const [theme, setTheme] = useState("light");

  // Read from localStorage on mount (client only)
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "gruvbox") setTheme("gruvbox");
  }, []);

  // Expose toggle to rest of admin via custom event
  useEffect(() => {
    function onToggle(e) {
      const next = e.detail || (theme === "gruvbox" ? "light" : "gruvbox");
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
  ]
    .filter(Boolean)
    .join(" ");

  return <div className={classes}>{children}</div>;
}
