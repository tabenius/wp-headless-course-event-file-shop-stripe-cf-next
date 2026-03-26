import test from "node:test";
import assert from "node:assert/strict";
import {
  ensureShopMenuEntry,
  filterNavigationByExistence,
} from "../src/lib/menuFilter.js";

test("filterNavigationByExistence removes stale leaf links", async () => {
  const navigation = [
    { href: "/exists", label: "Exists" },
    { href: "/missing", label: "Missing" },
  ];

  const result = await filterNavigationByExistence(navigation, async (href) => {
    return href !== "/missing";
  });

  assert.deepEqual(result, [{ href: "/exists", label: "Exists" }]);
});

test("filterNavigationByExistence keeps children when parent is stale", async () => {
  const navigation = [
    {
      href: "/stale-parent",
      label: "Parent",
      children: [
        { href: "/child-ok", label: "Child OK" },
        { href: "/child-missing", label: "Child Missing" },
      ],
    },
  ];

  const result = await filterNavigationByExistence(navigation, async (href) => {
    return href === "/child-ok";
  });

  assert.deepEqual(result, [
    {
      href: "#",
      label: "Parent",
      children: [{ href: "/child-ok", label: "Child OK" }],
    },
  ]);
});

test("filterNavigationByExistence drops invalid object shapes", async () => {
  const navigation = [
    null,
    { href: "/valid", label: "Valid" },
    { href: "/no-label" },
    { label: "No href" },
  ];

  const result = await filterNavigationByExistence(navigation, async () => true);
  assert.deepEqual(result, [{ href: "/valid", label: "Valid" }]);
});

test("ensureShopMenuEntry appends Shop when /shop is missing", () => {
  const input = [
    { href: "/blog", label: "Blog" },
    { href: "/events", label: "Events" },
  ];
  const result = ensureShopMenuEntry(input);
  assert.equal(result.at(-1)?.href, "/shop");
  assert.equal(result.at(-1)?.label, "Shop");
});

test("ensureShopMenuEntry does not duplicate existing /shop", () => {
  const input = [
    { href: "/shop", label: "BUTIK" },
    { href: "/blog", label: "Blog" },
  ];
  const result = ensureShopMenuEntry(input);
  assert.equal(result.filter((item) => item.href === "/shop").length, 1);
  assert.equal(result[0].label, "BUTIK");
});
