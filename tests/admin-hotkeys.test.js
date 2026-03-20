import assert from "node:assert/strict";
import test from "node:test";
import {
  ADMIN_ACTION_HOTKEYS,
  ADMIN_TAB_HOTKEYS,
  getAdminTabHotkeyLabel,
  isAdminActionHotkey,
  resolveAdminTabHotkey,
} from "../src/lib/adminHotkeys.js";

function eventFor({ code, key = "", ctrlKey = true, altKey = true }) {
  return { code, key, ctrlKey, altKey };
}

test("admin tab hotkeys stay unique and stable", () => {
  const combos = ADMIN_TAB_HOTKEYS.map((item) => item.combo);
  const unique = new Set(combos);
  assert.equal(unique.size, combos.length, "tab combos must be unique");

  assert.deepEqual(
    ADMIN_TAB_HOTKEYS.map((item) => item.tab),
    [
      "welcome",
      "sales",
      "stats",
      "storage",
      "products",
      "chat",
      "health",
      "style",
      "info",
      "support",
      "media",
    ],
  );
});

test("resolveAdminTabHotkey maps every configured tab hotkey", () => {
  for (const hotkey of ADMIN_TAB_HOTKEYS) {
    const event = eventFor({
      code: hotkey.match.code,
      key: hotkey.match.key || "",
    });
    assert.equal(resolveAdminTabHotkey(event), hotkey.tab);
  }
});

test("resolveAdminTabHotkey ignores non Ctrl+Alt chords", () => {
  const event = eventFor({ code: "Digit1", key: "1", ctrlKey: false });
  assert.equal(resolveAdminTabHotkey(event), null);
});

test("action hotkeys detect menu toggle, next/prev tab, and logout", () => {
  assert.equal(
    isAdminActionHotkey(eventFor({ code: "KeyM", key: "m" }), "menuToggle"),
    true,
  );
  assert.equal(
    isAdminActionHotkey(eventFor({ code: "KeyT", key: "t" }), "themeToggle"),
    true,
  );
  assert.equal(
    isAdminActionHotkey(
      eventFor({ code: "ArrowRight", key: "ArrowRight" }),
      "menuNext",
    ),
    true,
  );
  assert.equal(
    isAdminActionHotkey(
      eventFor({ code: "ArrowDown", key: "ArrowDown" }),
      "menuNext",
    ),
    true,
  );
  assert.equal(
    isAdminActionHotkey(
      eventFor({ code: "ArrowLeft", key: "ArrowLeft" }),
      "menuPrev",
    ),
    true,
  );
  assert.equal(
    isAdminActionHotkey(
      eventFor({ code: "ArrowUp", key: "ArrowUp" }),
      "menuPrev",
    ),
    true,
  );
  assert.equal(
    isAdminActionHotkey(eventFor({ code: "KeyL", key: "l" }), "logout"),
    true,
  );
  assert.equal(
    isAdminActionHotkey(eventFor({ code: "KeyM", key: "m" }), "search"),
    false,
  );
});

test("tab labels returned by getAdminTabHotkeyLabel remain user-facing", () => {
  assert.equal(getAdminTabHotkeyLabel("welcome"), "Ctrl+Alt+0");
  assert.equal(getAdminTabHotkeyLabel("storage"), "Ctrl+Alt+3");
  assert.equal(getAdminTabHotkeyLabel("support"), "Ctrl+Alt+9");
  assert.equal(getAdminTabHotkeyLabel("media"), "Ctrl+Alt+A");
  assert.equal(ADMIN_ACTION_HOTKEYS.menuToggle.combo, "Ctrl+Alt+M");
});
