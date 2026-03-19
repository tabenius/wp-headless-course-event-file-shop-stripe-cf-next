import { it, describe } from "node:test";
import assert from "node:assert/strict";
import { slugify, stripHtml } from "../src/lib/slugify.js";

describe("slugify", () => {
  it("lowercases and replaces spaces with hyphens", () => {
    assert.equal(slugify("Hello World"), "hello-world");
  });

  it("strips Swedish diacritics (å/ä/ö)", () => {
    assert.equal(slugify("Åland Är Öppet"), "aland-ar-oppet");
  });

  it("strips punctuation", () => {
    assert.equal(slugify("Hello, World!"), "hello-world");
  });

  it("collapses multiple separators into one hyphen", () => {
    assert.equal(slugify("foo   bar--baz"), "foo-bar-baz");
  });

  it("trims leading and trailing hyphens", () => {
    assert.equal(slugify("--hello--"), "hello");
  });

  it("returns empty string for falsy input", () => {
    assert.equal(slugify(""), "");
    assert.equal(slugify(null), "");
    assert.equal(slugify(undefined), "");
  });

  it("handles numbers", () => {
    assert.equal(slugify("Course 101"), "course-101");
  });
});

describe("stripHtml (slugify.js variant)", () => {
  it("removes HTML tags", () => {
    assert.equal(stripHtml("<p>Hello <b>world</b></p>"), "Hello world");
  });

  it("collapses whitespace", () => {
    assert.equal(stripHtml("<p>  too   many  spaces  </p>"), "too many spaces");
  });

  it("returns empty string for falsy input", () => {
    assert.equal(stripHtml(""), "");
    assert.equal(stripHtml(null), "");
    assert.equal(stripHtml(undefined), "");
  });

  it("passes plain text through unchanged (trimmed)", () => {
    assert.equal(stripHtml("plain text"), "plain text");
  });
});
