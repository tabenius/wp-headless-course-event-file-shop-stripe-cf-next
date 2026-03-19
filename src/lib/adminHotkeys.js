export const ADMIN_TAB_HOTKEYS = [
  { tab: "welcome", combo: "Ctrl+Alt+0", match: { code: "Digit0", key: "0" } },
  { tab: "sales", combo: "Ctrl+Alt+1", match: { code: "Digit1", key: "1" } },
  { tab: "stats", combo: "Ctrl+Alt+2", match: { code: "Digit2", key: "2" } },
  { tab: "products", combo: "Ctrl+Alt+3", match: { code: "Digit3", key: "3" } },
  { tab: "support", combo: "Ctrl+Alt+4", match: { code: "Digit4", key: "4" } },
  { tab: "chat", combo: "Ctrl+Alt+5", match: { code: "Digit5", key: "5" } },
  { tab: "health", combo: "Ctrl+Alt+6", match: { code: "Digit6", key: "6" } },
  { tab: "sandbox", combo: "Ctrl+Alt+7", match: { code: "Digit7", key: "7" } },
  { tab: "style", combo: "Ctrl+Alt+8", match: { code: "Digit8", key: "8" } },
  { tab: "storage", combo: "Ctrl+Alt+S", match: { code: "KeyS", key: "s" } },
];

export const ADMIN_ACTION_HOTKEYS = {
  menuToggle: { combo: "Ctrl+Alt+M", match: { code: "KeyM", key: "m" } },
  logout: { combo: "Ctrl+Alt+L", match: { code: "KeyL", key: "l" } },
  search: { combo: "Ctrl+Alt+/", match: { code: "Slash", key: "/" } },
};

function isCtrlAltChord(event) {
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
  return matchesChord(event, rule?.match);
}

export function getAdminTabHotkeyLabel(tab) {
  return ADMIN_TAB_HOTKEYS.find((item) => item.tab === tab)?.combo || null;
}
