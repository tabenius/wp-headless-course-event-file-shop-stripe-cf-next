import { it, describe } from "node:test";
import assert from "node:assert/strict";
import { decodeEntities } from "../src/lib/decodeEntities.js";

describe("decodeEntities", () => {
  it("decodes named HTML entities", () => {
    assert.equal(decodeEntities("AT&amp;T"), "AT&T");
    assert.equal(decodeEntities("&lt;em&gt;"), "<em>");
    assert.equal(decodeEntities("&quot;hello&quot;"), '"hello"');
    assert.equal(decodeEntities("it&apos;s"), "it's");
  });

  it("decodes ndash and mdash", () => {
    assert.equal(decodeEntities("foo&ndash;bar"), "foo–bar");
    assert.equal(decodeEntities("foo&mdash;bar"), "foo—bar");
  });

  it("decodes decimal numeric entities", () => {
    assert.equal(decodeEntities("&#65;"), "A");
    assert.equal(decodeEntities("&#8364;"), "€");
  });

  it("decodes hex numeric entities", () => {
    assert.equal(decodeEntities("&#x41;"), "A");
    assert.equal(decodeEntities("&#x20AC;"), "€");
  });

  it("leaves unknown named entities untouched", () => {
    assert.equal(decodeEntities("&unknown;"), "&unknown;");
  });

  it("handles strings with no entities", () => {
    assert.equal(decodeEntities("plain text"), "plain text");
  });

  it("returns non-string values as-is", () => {
    assert.equal(decodeEntities(42), 42);
    assert.equal(decodeEntities(null), null);
    assert.equal(decodeEntities(undefined), undefined);
  });

  it("decodes multiple entities in one string", () => {
    assert.equal(decodeEntities("&lt;b&gt;bold&lt;/b&gt;"), "<b>bold</b>");
  });
});
