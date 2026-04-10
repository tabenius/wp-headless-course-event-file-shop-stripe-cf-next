import { spawnSync } from "node:child_process";

function isEnabled(value) {
  if (value === undefined || value === null) return false;
  const safe = String(value).trim().toLowerCase();
  if (!safe) return false;
  return ["1", "true", "yes", "on"].includes(safe);
}

const shouldCopyPlugin = isEnabled(process.env.POSTBUILD_PLUGIN_COPY);

if (!shouldCopyPlugin) {
  console.log(
    "postbuild: skipping plugin zip copy (set POSTBUILD_PLUGIN_COPY=1 to enable)",
  );
  process.exit(0);
}

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(npmCmd, ["run", "plugin:copy"], {
  stdio: "inherit",
  env: process.env,
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
