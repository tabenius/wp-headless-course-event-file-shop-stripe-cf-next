import assert from "node:assert/strict";
import test from "node:test";
import { buildRagbazDownloadUrl } from "../src/app/api/admin/health/helpers.js";

test("buildRagbazDownloadUrl trims trailing slash", () => {
  const url = buildRagbazDownloadUrl("https://example.com/");
  assert.equal(
    url,
    "https://example.com/downloads/ragbaz-bridge/ragbaz-bridge.zip",
  );
});

test("buildRagbazDownloadUrl handles origin without trailing slash", () => {
  const url = buildRagbazDownloadUrl("https://example.com");
  assert.equal(
    url,
    "https://example.com/downloads/ragbaz-bridge/ragbaz-bridge.zip",
  );
});
