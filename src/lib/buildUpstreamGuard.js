function envFlagEnabled(rawValue, defaultEnabled = true) {
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return defaultEnabled;
  }
  const value = String(rawValue).trim().toLowerCase();
  return !["0", "false", "no", "off"].includes(value);
}

export function isBuildPhase() {
  return (
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.npm_lifecycle_event === "build" ||
    process.env.npm_lifecycle_event === "cf:build" ||
    process.env.npm_lifecycle_event === "cf:deploy" ||
    process.env.__NEXT_PRIVATE_BUILD_WORKER === "1"
  );
}

export function shouldSkipUpstreamDuringBuild() {
  if (!isBuildPhase()) return false;
  return envFlagEnabled(process.env.SKIP_UPSTREAM_DURING_BUILD, true);
}

