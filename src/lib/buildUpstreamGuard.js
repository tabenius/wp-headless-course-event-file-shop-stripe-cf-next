function envFlagEnabled(rawValue, defaultEnabled = true) {
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return defaultEnabled;
  }
  const value = String(rawValue).trim().toLowerCase();
  return !["0", "false", "no", "off"].includes(value);
}

function isEdgeLikeRuntime() {
  try {
    return Boolean(globalThis && Reflect.get(globalThis, "EdgeRuntime"));
  } catch {
    return false;
  }
}

export function isBuildPhase() {
  // Runtime requests on Workers/Edge should never be treated as build phase,
  // even if build-time env variables were baked into a server bundle.
  if (isEdgeLikeRuntime()) return false;

  // Explicit marker set by scripts/build-with-lock.mjs.
  if (process.env.RAGBAZ_BUILD_PHASE === "1") return true;

  return (
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.__NEXT_PRIVATE_BUILD_WORKER === "1"
  );
}

export function shouldSkipUpstreamDuringBuild() {
  if (!isBuildPhase()) return false;
  return envFlagEnabled(process.env.SKIP_UPSTREAM_DURING_BUILD, true);
}
