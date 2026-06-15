import assert from "node:assert/strict";
import test from "node:test";
import { buildRagbazDownloadUrl } from "../src/app/api/admin/health/helpers.js";

test("buildRagbazDownloadUrl returns ragbaz.cc default when no env var set", () => {
  const url = buildRagbazDownloadUrl("https://example.com/");
  assert.equal(
    url,
    "https://ragbaz.cc/downloads/ragbaz-bridge/ragbaz-bridge.zip",
  );
});

test("buildRagbazDownloadUrl returns ragbaz.cc default regardless of origin", () => {
  const url = buildRagbazDownloadUrl("https://example.com");
  assert.equal(
    url,
    "https://ragbaz.cc/downloads/ragbaz-bridge/ragbaz-bridge.zip",
  );
});
