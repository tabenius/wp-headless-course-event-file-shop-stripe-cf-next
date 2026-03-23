"use client";

import { usePagePerformanceLogger } from "@/hooks/usePagePerformanceLogger";

/** Invisible component placed in the root layout to log page load performance. */
export default function PagePerformanceLogger() {
  usePagePerformanceLogger();
  return null;
}
