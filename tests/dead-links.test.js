import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyHref,
  extractAnchorsFromHtml,
  summarizeLinkKinds,
} from "../src/lib/deadLinks.js";

test("extractAnchorsFromHtml returns unique href values", () => {
  const html = `
    <p><a href="/alpha">A</a></p>
    <a class="x" href='https://xtas.nu/docs'>B</a>
    <a href="/alpha">dup</a>
  `;
  assert.deepEqual(extractAnchorsFromHtml(html), ["/alpha", "https://xtas.nu/docs"]);
});

test("classifyHref handles internal, pseudo-external and external urls", () => {
  const context = {
    siteHost: "store.example",
    origin: "https://store.example",
  };
  const internal = classifyHref("/shop", context);
  const pseudo = classifyHref("https://xtas.nu/course/a", context);
  const external = classifyHref("https://example.org/path", context);

  assert.equal(internal.kind, "internal");
  assert.equal(internal.translatedPath, "/shop");
  assert.equal(pseudo.kind, "pseudo-external");
  assert.equal(pseudo.translatedPath, "/course/a");
  assert.equal(external.kind, "external");
});

test("classifyHref marks unsupported and invalid links", () => {
  const context = { siteHost: "store.example", origin: "https://store.example" };
  assert.equal(classifyHref("mailto:test@example.com", context).kind, "unsupported");
  assert.equal(classifyHref("javascript:alert(1)", context).kind, "invalid");
  assert.equal(classifyHref("not a url", context).kind, "invalid");
});

test("summarizeLinkKinds aggregates category counters", () => {
  const summary = summarizeLinkKinds([
    { kind: "internal" },
    { kind: "pseudo-external" },
    { kind: "external" },
    { kind: "invalid" },
    { kind: "unsupported" },
  ]);
  assert.equal(summary.total, 5);
  assert.equal(summary.internal, 1);
  assert.equal(summary.pseudoExternal, 1);
  assert.equal(summary.external, 1);
  assert.equal(summary.invalid, 1);
  assert.equal(summary.unsupported, 1);
});
