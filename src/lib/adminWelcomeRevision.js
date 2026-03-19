export const WELCOME_SEEN_KEY = "ragbaz-admin-welcome-revision";

export function deriveWelcomeRevisionState({
  revision,
  storedRevision,
  defaultShowStory = true,
}) {
  if (!revision) {
    return {
      showRevisionBadge: false,
      showStory: defaultShowStory,
    };
  }
  const hasSeenRevision = storedRevision === revision;
  return {
    showRevisionBadge: !hasSeenRevision,
    showStory: !hasSeenRevision,
  };
}

export function persistWelcomeRevision(storage, revision) {
  if (!revision || !storage?.setItem) return false;
  storage.setItem(WELCOME_SEEN_KEY, revision);
  return true;
}
