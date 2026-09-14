/** Bounded process-local alert sampling; per-request metadata logs remain authoritative. */
export function createOperationalPressureSampler(now: () => number = Date.now) {
  const windows = new Map<"capacity_rejected" | "rate_limited", { start: number; count: number }>();
  return (kind: "capacity_rejected" | "rate_limited"): boolean => {
    const timestamp = now();
    let window = windows.get(kind);
    if (window === undefined || timestamp - window.start >= 60_000 || timestamp < window.start) {
      window = { start: timestamp, count: 0 };
      windows.set(kind, window);
    }
    // Saturate the counter so both retained state and emitted signals are bounded.
    if (window.count >= 10) return false;
    window.count += 1;
    return window.count === 10;
  };
}
