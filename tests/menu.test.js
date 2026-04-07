import test from "node:test";
import assert from "node:assert/strict";
import {
  ensureCoreMenuEntries,
  ensureCoreMenuEntriesByExistence,
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

  const result = await filterNavigationByExistence(
    navigation,
    async () => true,
  );
  assert.deepEqual(result, [{ href: "/valid", label: "Valid" }]);
});

test("ensureCoreMenuEntries appends core links when missing", () => {
  const input = [
    { href: "/blog", label: "Blog" },
    { href: "/custom", label: "Custom" },
  ];
  const result = ensureCoreMenuEntries(input);
  const hrefs = result.map((item) => item.href);
  assert.ok(hrefs.includes("/blog"));
  assert.ok(hrefs.includes("/events"));
  assert.ok(hrefs.includes("/courses"));
  assert.ok(hrefs.includes("/shop"));
});

test("ensureCoreMenuEntries does not duplicate existing core routes", () => {
  const input = [
    { href: "/blog", label: "BLOG" },
    { href: "/events", label: "EVENEMANG" },
    { href: "/courses", label: "KURSER" },
    { href: "/shop", label: "BUTIK" },
    { href: "/blog", label: "Blog" },
  ];
  const result = ensureCoreMenuEntries(input);
  assert.equal(result.filter((item) => item.href === "/shop").length, 1);
  assert.equal(result.filter((item) => item.href === "/blog").length, 2);
  assert.equal(result.filter((item) => item.href === "/events").length, 1);
  assert.equal(result.filter((item) => item.href === "/courses").length, 1);
});

test("ensureCoreMenuEntriesByExistence only appends verified core routes", async () => {
  const input = [{ href: "/custom", label: "Custom" }];
  const result = await ensureCoreMenuEntriesByExistence(input, async (href) =>
    ["/events", "/shop"].includes(href),
  );
  const hrefs = result.map((item) => item.href);
  assert.ok(hrefs.includes("/events"));
  assert.ok(hrefs.includes("/shop"));
  assert.ok(!hrefs.includes("/blog"));
  assert.ok(!hrefs.includes("/courses"));
});
