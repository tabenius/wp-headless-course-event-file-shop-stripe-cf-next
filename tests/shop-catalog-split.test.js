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
    assert.ok(
      !src.includes('"120000"'),
      "Old 120000 default should be gone",
    );
  });
});
