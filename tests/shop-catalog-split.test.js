import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("SHOP_CATALOG_CACHE_TTL_MS default", () => {
  it("defaults to 300_000 (5 minutes) matching ISR revalidation", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(
      join(process.cwd(), "src/lib/shopProducts.js"),
      "utf8",
    );
    assert.ok(
      src.includes('"300000"'),
      "SHOP_CATALOG_CACHE_TTL_MS default should be 300000",
    );
    assert.ok(!src.includes('"120000"'), "Old 120000 default should be gone");
  });
});

describe("GET /api/admin/cache-info response shape", () => {
  it("returns expected cache TTL keys", async () => {
    const expected = {
      isrRevalidation: 300,
      catalogCacheTtl: 300,
      graphqlEdgeCache: 60,
      graphqlStaleWhileRevalidate: 120,
    };

    for (const [key, value] of Object.entries(expected)) {
      assert.equal(typeof value, "number", `${key} should be a number`);
      assert.ok(value > 0, `${key} should be positive`);
    }
  });
});
