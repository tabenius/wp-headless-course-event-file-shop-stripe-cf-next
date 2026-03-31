import assert from "node:assert/strict";
import { mock } from "node:test";
import test from "node:test";

// Mock @/lib dependencies before importing digitalProducts
mock.module("@/lib/cloudflareKv", {
  namedExports: {
    isCloudflareKvConfigured: mock.fn(() => false),
    readCloudflareKvJson: mock.fn(async () => null),
    writeCloudflareKvJson: mock.fn(async () => true),
  },
});

mock.module("@/lib/contentCategories", {
  namedExports: {
    deriveDigitalProductCategories: mock.fn(() => ({
      categories: [],
      categorySlugs: [],
    })),
  },
});

mock.module("@/lib/slugify", {
  namedExports: {
    slugify: mock.fn((str) =>
      String(str || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, ""),
    ),
  },
});

const {
  isProductListable,
  sanitizeProductForTest,
} = await import("../src/lib/digitalProducts.js");

// --- Task 1: free field ---

test("sanitizeProduct preserves free: true and forces priceCents to 0", () => {
  const product = sanitizeProductForTest({
    name: "Free Guide",
    slug: "free-guide",
    free: true,
    priceCents: 9900,
    productMode: "digital_file",
    fileUrl: "https://example.com/files/guide.pdf",
  });
  assert.ok(product, "product should not be null");
  assert.equal(product.free, true);
  assert.equal(product.priceCents, 0);
});

test("sanitizeProduct defaults free to false", () => {
  const product = sanitizeProductForTest({
    name: "Paid Guide",
    slug: "paid-guide",
    priceCents: 9900,
    productMode: "digital_file",
    fileUrl: "https://example.com/files/guide.pdf",
  });
  assert.ok(product, "product should not be null");
  assert.equal(product.free, false);
  assert.equal(product.priceCents, 9900);
});

test("isProductListable returns true for free product", () => {
  assert.equal(
    isProductListable({ active: true, free: true, priceCents: 0 }),
    true,
  );
});

test("isProductListable returns true for paid product with price > 0", () => {
  assert.equal(
    isProductListable({ active: true, free: false, priceCents: 9900 }),
    true,
  );
});

test("isProductListable returns false for ambiguous pricing (free: false, priceCents: 0)", () => {
  assert.equal(
    isProductListable({ active: true, free: false, priceCents: 0 }),
    false,
  );
});

test("isProductListable returns false for inactive product", () => {
  assert.equal(
    isProductListable({ active: false, free: true, priceCents: 0 }),
    false,
  );
});
