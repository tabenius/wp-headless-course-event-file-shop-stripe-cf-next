"use client";

import Image from "next/image";
import { useState } from "react";

/**
 * next/image wrapper that gracefully hides broken images instead of crashing.
 * Works in both server and client component trees (it's a client component).
 */
export default function SafeImage({ fallback = null, ...props }) {
  const [broken, setBroken] = useState(false);

  if (broken) return fallback;
  if (!props.src) return fallback;

  return <Image {...props} onError={() => setBroken(true)} />;
}
