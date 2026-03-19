import { it } from "node:test";
import assert from "node:assert/strict";
import { chunkText, cosine } from "../src/lib/chat/rag-utils.js";

it("chunkText returns single chunk for short text", () => {
  assert.deepEqual(chunkText("hello"), ["hello"]);
});

it("chunkText returns empty array for falsy input", () => {
  assert.deepEqual(chunkText(""), []);
  assert.deepEqual(chunkText(null), []);
});

it("chunkText splits at maxLen boundary", () => {
  const chunks = chunkText("ab".repeat(500), 100);
  assert.ok(chunks.length > 1, "should produce multiple chunks");
  assert.ok(
    chunks.every((c) => c.length <= 100),
    "no chunk exceeds maxLen",
  );
});

it("chunkText preserves all content across chunks", () => {
  const input = "x".repeat(250);
  const chunks = chunkText(input, 100);
  assert.equal(chunks.join(""), input);
});

it("cosine returns 1 for identical unit vectors", () => {
  const v = [1, 0, 0];
  assert.ok(Math.abs(cosine(v, v) - 1) < 1e-6);
});

it("cosine returns 0 for orthogonal vectors", () => {
  assert.ok(Math.abs(cosine([1, 0], [0, 1])) < 1e-6);
});

it("cosine handles zero vector without crashing", () => {
  const result = cosine([0, 0], [1, 1]);
  assert.ok(isFinite(result));
});
