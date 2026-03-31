import test from "node:test";
import assert from "node:assert/strict";
import { deriveObjectKeyFromPublicUrl } from "../src/lib/storageObjectKey.js";

test("deriveObjectKeyFromPublicUrl extracts key from plain public URL", () => {
  const key = deriveObjectKeyFromPublicUrl(
    "https://pub-example.r2.dev/uploads/2026/asset.mp4",
    "https://pub-example.r2.dev",
  );
  assert.equal(key, "uploads/2026/asset.mp4");
});

test("deriveObjectKeyFromPublicUrl supports base paths", () => {
  const key = deriveObjectKeyFromPublicUrl(
    "https://cdn.example.com/sofiacerne/uploads/a%20b.mp4?x=1",
    "https://cdn.example.com/sofiacerne",
  );
  assert.equal(key, "uploads/a b.mp4");
});

test("deriveObjectKeyFromPublicUrl returns empty for non-matching host", () => {
  const key = deriveObjectKeyFromPublicUrl(
    "https://other.example.com/uploads/a.mp4",
    "https://pub-example.r2.dev",
  );
  assert.equal(key, "");
});
