export const ADMIN_TAB_HOTKEYS = [
  { tab: "sales", combo: "Ctrl+Alt+1", match: { code: "Digit1", key: "1" } },
  { tab: "media", combo: "Ctrl+Alt+2", match: { code: "Digit2", key: "2" } },
  { tab: "products", combo: "Ctrl+Alt+3", match: { code: "Digit3", key: "3" } },
  { tab: "support", combo: "Ctrl+Alt+4", match: { code: "Digit4", key: "4" } },
  { tab: "style", combo: "Ctrl+Alt+5", match: { code: "Digit5", key: "5" } },
  { tab: "chat", combo: "Ctrl+Alt+6", match: { code: "Digit6", key: "6" } },
  { tab: "info", combo: "Ctrl+Alt+7", match: { code: "Digit7", key: "7" } },
  { tab: "welcome", combo: "Ctrl+Alt+8", match: { code: "Digit8", key: "8" } },
  { tab: "health", combo: "Ctrl+Alt+0", match: { code: "Digit0", key: "0" } },
];

export const ADMIN_ACTION_HOTKEYS = {
  menuToggle: { combo: "Ctrl+Alt+M", match: { code: "KeyM", key: "m" } },
  menuNext: {
    combo: "Ctrl+Alt+Right/Down",
    match: [
      { code: "ArrowRight", key: "arrowright" },
      { code: "ArrowDown", key: "arrowdown" },
    ],
  },
  menuPrev: {
    combo: "Ctrl+Alt+Left/Up",
    match: [
      { code: "ArrowLeft", key: "arrowleft" },
      { code: "ArrowUp", key: "arrowup" },
    ],
  },
  logout: { combo: "Ctrl+Alt+L", match: { code: "KeyL", key: "l" } },
  search: { combo: "Ctrl+Alt+/", match: { code: "Slash", key: "/" } },
};

function isEditableTarget(target) {
  if (!target || typeof target !== "object") return false;
  if (target.isContentEditable) return true;
  const tag = String(target.tagName || "").toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (typeof target.closest === "function") {
    const editableAncestor = target.closest(
      "input, textarea, select, [contenteditable='true'], [contenteditable='']",
    );
    if (editableAncestor) return true;
  }
  return false;
}

function isCtrlAltChord(event) {
  if (event?.getModifierState?.("AltGraph")) return false;
  return Boolean(event?.ctrlKey && event?.altKey);
}

function matchesChord(event, matcher) {
  if (!isCtrlAltChord(event) || !matcher) return false;
  const key = String(event?.key || "").toLowerCase();
  if (matcher.code && event?.code === matcher.code) return true;
  if (matcher.key && key === matcher.key.toLowerCase()) return true;
  return false;
}

export function resolveAdminTabHotkey(event) {
  for (const hotkey of ADMIN_TAB_HOTKEYS) {
    if (matchesChord(event, hotkey.match)) {
      return hotkey.tab;
    }
  }
  return null;
}

export function isAdminActionHotkey(event, action) {
  const rule = ADMIN_ACTION_HOTKEYS[action];
  const matchers = Array.isArray(rule?.match) ? rule.match : [rule?.match];
  return matchers.some((matcher) => matchesChord(event, matcher));
}

export function shouldIgnoreAdminHotkeys(event) {
  return isEditableTarget(event?.target);
}

export function getAdminTabHotkeyLabel(tab) {
  return ADMIN_TAB_HOTKEYS.find((item) => item.tab === tab)?.combo || null;
}
