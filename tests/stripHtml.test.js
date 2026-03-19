import { it, describe } from "node:test";
import assert from "node:assert/strict";
import { stripHtml } from "../src/lib/stripHtml.js";

describe("stripHtml (WordPress variant)", () => {
  it("strips basic HTML tags", () => {
    const result = stripHtml("<p>Hello <strong>world</strong></p>");
    assert.ok(!result.includes("<"), "no opening angle brackets");
    assert.ok(result.includes("Hello"), "keeps text content");
    assert.ok(result.includes("world"), "keeps nested text");
  });

  it("returns empty string for falsy input", () => {
    assert.equal(stripHtml(""), "");
    assert.equal(stripHtml(null), "");
    assert.equal(stripHtml(undefined), "");
  });

  it("returns empty string for non-string input", () => {
    assert.equal(stripHtml(42), "");
    assert.equal(stripHtml({}), "");
  });

  it("strips WordPress shortcodes", () => {
    const result = stripHtml('[gallery ids="1,2,3"] some text');
    assert.ok(!result.includes("[gallery"), "shortcode removed");
    assert.ok(result.includes("some text"), "text preserved");
  });

  it("passes plain text through", () => {
    const result = stripHtml("just plain text");
    assert.ok(result.includes("just plain text"));
  });

  it("handles self-closing tags", () => {
    const result = stripHtml("line one<br/>line two");
    assert.ok(!result.includes("<br"), "br removed");
    assert.ok(result.includes("line one"), "first line kept");
    assert.ok(result.includes("line two"), "second line kept");
  });
});
