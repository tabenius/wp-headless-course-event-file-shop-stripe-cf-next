"use client";

export default function AdminThemeWrapper({ children, fontVariable }) {
  const classes = ["admin-layout", "admin-theme-water", fontVariable]
    .filter(Boolean)
    .join(" ");
  return <div className={classes}>{children}</div>;
}
