const RENEW_INTERVAL_MS = 5 * 60 * 1_000;
const RETRY_INTERVAL_MS = 60 * 1_000;

export function subscribeToSessionActivity(renew: () => Promise<unknown>): () => void {
  let stopped = false;
  let pending = false;
  let nextAttempt = 0;
  const handleActivity = (event: Event): void => {
    if (
      stopped ||
      pending ||
      !event.isTrusted ||
      document.visibilityState !== "visible" ||
      !document.hasFocus() ||
      Date.now() < nextAttempt
    )
      return;
    pending = true;
    // No timer: an unattended tab must not extend the server's idle deadline.
    void renew()
      .then(
        () => {
          nextAttempt = Date.now() + RENEW_INTERVAL_MS;
        },
        () => {
          nextAttempt = Date.now() + RETRY_INTERVAL_MS;
        }
      )
      .finally(() => {
        pending = false;
      });
  };
  const inputEvents = ["pointerdown", "keydown", "wheel", "visibilitychange"] as const;
  for (const type of inputEvents)
    document.addEventListener(type, handleActivity, { passive: true });
  window.addEventListener("focus", handleActivity);
  return () => {
    stopped = true;
    for (const type of inputEvents) document.removeEventListener(type, handleActivity);
    window.removeEventListener("focus", handleActivity);
  };
}
