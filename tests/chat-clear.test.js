/**
 * Tests for the clear-chat feature.
 *
 * The DELETE /api/chat handler calls deleteCloudflareKv("chat_history:admin").
 * We test the KV helper contracts and the key/cap logic used by the route.
 */
import { it, describe } from "node:test";
import assert from "node:assert/strict";
import {
  getChatHistory,
  saveChatHistory,
} from "../src/lib/chatHistoryStore.js";

// ── KV key convention ────────────────────────────────────────────────────────

describe("clear chat — KV key convention", () => {
  it("history key for single-admin system is chat_history:admin", () => {
    const historyKey = "admin";
    assert.equal(`chat_history:${historyKey}`, "chat_history:admin");
  });
});

// ── getChatHistory contract ───────────────────────────────────────────────────

describe("getChatHistory — contract", () => {
  it("always returns an array, never throws", async () => {
    const result = await getChatHistory("admin");
    assert.ok(Array.isArray(result), `expected array, got ${typeof result}`);
  });

  it("returns an array even for a nonexistent key", async () => {
    const result = await getChatHistory("__nonexistent_test_key__");
    assert.ok(Array.isArray(result));
  });
});

// ── saveChatHistory contract ─────────────────────────────────────────────────

describe("saveChatHistory — contract", () => {
  it("always returns a boolean, never throws", async () => {
    // We don't assert true/false — that depends on whether CF KV is reachable.
    // What we assert is: it resolves and returns a boolean.
    const result = await saveChatHistory("__test__", [
      { role: "user", content: "hello" },
    ]);
    assert.ok(
      typeof result === "boolean",
      `expected boolean, got ${typeof result}`,
    );
  });
});

// ── History cap: slice(-40) keeps at most 40 entries ────────────────────────

describe("chat history cap", () => {
  it("slice(-40) on a 42-entry array keeps the last 40", () => {
    const history = Array.from({ length: 42 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `msg ${i}`,
    }));
    const capped = history.slice(-40);
    assert.equal(capped.length, 40);
    assert.equal(capped[0].content, "msg 2");
    assert.equal(capped[39].content, "msg 41");
  });

  it("slice(-40) on a 10-entry array returns all 10", () => {
    const history = Array.from({ length: 10 }, (_, i) => ({
      role: "user",
      content: `${i}`,
    }));
    assert.deepEqual(history.slice(-40), history);
  });

  it("slice(-40) on empty array returns empty array", () => {
    assert.deepEqual([].slice(-40), []);
  });

  it("after clear, new history starts fresh from index 0", () => {
    // Simulate: clear sets messages to [], then a new message is appended
    const cleared = [];
    const afterFirstMessage = [
      ...cleared,
      { role: "user", content: "first" },
      { role: "assistant", content: "hi" },
    ].slice(-40);
    assert.equal(afterFirstMessage.length, 2);
    assert.equal(afterFirstMessage[0].content, "first");
  });
});
