import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveWelcomeRevisionState,
  persistWelcomeRevision,
  WELCOME_SEEN_KEY,
} from "../src/lib/adminWelcomeRevision.js";

test("welcome revision: no configured revision keeps story visible without badge", () => {
  const state = deriveWelcomeRevisionState({
    revision: "",
    storedRevision: null,
    defaultShowStory: true,
  });
  assert.equal(state.showRevisionBadge, false);
  assert.equal(state.showStory, true);
});

test("welcome revision: unseen revision shows badge and story", () => {
  const state = deriveWelcomeRevisionState({
    revision: "abc123",
    storedRevision: null,
    defaultShowStory: true,
  });
  assert.equal(state.showRevisionBadge, true);
  assert.equal(state.showStory, true);
});

test("welcome revision: already seen revision hides badge and story", () => {
  const state = deriveWelcomeRevisionState({
    revision: "abc123",
    storedRevision: "abc123",
    defaultShowStory: true,
  });
  assert.equal(state.showRevisionBadge, false);
  assert.equal(state.showStory, false);
});

test("welcome revision: newer revision re-enables badge and story", () => {
  const state = deriveWelcomeRevisionState({
    revision: "def456",
    storedRevision: "abc123",
    defaultShowStory: true,
  });
  assert.equal(state.showRevisionBadge, true);
  assert.equal(state.showStory, true);
});

test("persistWelcomeRevision writes key when revision exists", () => {
  const writes = [];
  const storage = {
    setItem(key, value) {
      writes.push([key, value]);
    },
  };
  const ok = persistWelcomeRevision(storage, "sha-789");
  assert.equal(ok, true);
  assert.deepEqual(writes, [[WELCOME_SEEN_KEY, "sha-789"]]);
});

test("persistWelcomeRevision skips write for empty revision", () => {
  const writes = [];
  const storage = {
    setItem(key, value) {
      writes.push([key, value]);
    },
  };
  const ok = persistWelcomeRevision(storage, "");
  assert.equal(ok, false);
  assert.deepEqual(writes, []);
});
