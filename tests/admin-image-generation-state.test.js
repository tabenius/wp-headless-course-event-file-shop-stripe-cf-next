import test from "node:test";
import assert from "node:assert/strict";
import {
  IMAGE_GENERATION_SNAPSHOT_KEY,
  readImageGenerationSnapshot,
  writeImageGenerationSnapshot,
} from "../src/lib/adminImageGenerationState.js";

function createStorage() {
  const map = new Map();
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
  };
}

test("image generation snapshot write/read roundtrip", () => {
  const storage = createStorage();
  const snapshot = writeImageGenerationSnapshot(
    {
      prompt: "  A nordic cover illustration  ",
      size: "portrait-4-5",
      count: 2,
      generatedCount: 1,
      status: "partial",
      requestId: "abc123",
      updatedAt: "2026-03-19T12:00:00.000Z",
    },
    storage,
  );

  assert.equal(snapshot.prompt, "A nordic cover illustration");
  assert.equal(snapshot.count, 2);
  assert.equal(snapshot.generatedCount, 1);
  assert.equal(snapshot.status, "partial");
  assert.equal(snapshot.requestId, "abc123");
  assert.equal(
    readImageGenerationSnapshot(storage).updatedAt,
    "2026-03-19T12:00:00.000Z",
  );
});

test("image generation snapshot clamps invalid numeric values", () => {
  const storage = createStorage();
  storage.setItem(
    IMAGE_GENERATION_SNAPSHOT_KEY,
    JSON.stringify({
      prompt: "x",
      count: 99,
      generatedCount: -3,
      size: "square",
      status: "ok",
      requestId: "",
      updatedAt: "not-a-date",
    }),
  );
  const snapshot = readImageGenerationSnapshot(storage);
  assert.equal(snapshot.count, 3);
  assert.equal(snapshot.generatedCount, 0);
  assert.equal(snapshot.size, "square");
  assert.equal(snapshot.status, "ok");
});
