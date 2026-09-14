interface Waiter {
  grant: string;
  finish: (release: (() => void) | null) => void;
}

/** Short, bounded local waiting; shared Redis leases remain the final authority. */
export function createOpenAiAdmissionGate(input: { concurrency: number; perGrant: number }): {
  acquire(grant: string, signal?: AbortSignal): Promise<(() => void) | null>;
  close(): void;
} {
  let active = 0;
  let closed = false;
  const grants = new Map<string, number>();
  const waiting: Waiter[] = [];
  const available = (grant: string): boolean =>
    active < input.concurrency && (grants.get(grant) ?? 0) < input.perGrant;

  function reserve(grant: string): () => void {
    active++;
    grants.set(grant, (grants.get(grant) ?? 0) + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      active--;
      const remaining = (grants.get(grant) ?? 1) - 1;
      if (remaining === 0) grants.delete(grant);
      else grants.set(grant, remaining);
      // Skip a saturated grant so it cannot block another grant's available slot.
      while (!closed) {
        const next = waiting.find((waiter) => available(waiter.grant));
        if (next === undefined) break;
        next.finish(reserve(next.grant));
      }
    };
  }

  return {
    acquire(grant: string, signal?: AbortSignal): Promise<(() => void) | null> {
      if (closed || signal?.aborted || input.concurrency <= 0 || input.perGrant <= 0)
        return Promise.resolve(null);
      if (available(grant)) return Promise.resolve(reserve(grant));
      if (waiting.length >= 32 || waiting.filter((entry) => entry.grant === grant).length >= 8) {
        return Promise.resolve(null);
      }
      return new Promise((resolve) => {
        const cancel = (): void => waiter.finish(null);
        const timer = setTimeout(cancel, 1_000);
        timer.unref();
        const waiter: Waiter = {
          grant,
          finish(release) {
            const index = waiting.indexOf(waiter);
            if (index < 0) return;
            waiting.splice(index, 1);
            clearTimeout(timer);
            signal?.removeEventListener("abort", cancel);
            resolve(release);
          }
        };
        waiting.push(waiter);
        signal?.addEventListener("abort", cancel, { once: true });
      });
    },
    close() {
      closed = true;
      for (const waiter of [...waiting]) waiter.finish(null);
    }
  };
}
