import type { DiagnosticContextPayload, EvidenceReference } from "./diagnostic-context.js";

const MAX_BYTES = 64 * 1024,
  MAX_FAILURES = 50,
  WINDOW_MS = 5 * 60 * 1000;
interface Window {
  startsAt: number;
  failureAt?: number;
  failureId?: string;
  attempts: Set<string>;
  observations: number;
  resource: boolean;
  ambiguous: boolean;
  pending: number;
  cost: number;
}
interface Pending {
  key: string;
  kind: DiagnosticContextPayload["kind"];
  attempt: string | null;
  bytes: number;
  cost: number;
}
function key(reference: Pick<EvidenceReference, "failure_ref" | "scope">): string {
  return JSON.stringify([reference.failure_ref, reference.scope]);
}
function windowCost(scope: string, value: Window): number {
  // All retained identifiers are validated ASCII UUIDs. Charge the serialized
  // tracker as well as queued payloads; allocator overhead is count-bounded.
  return JSON.stringify({
    scope,
    startsAt: value.startsAt,
    failureAt: value.failureAt,
    failureId: value.failureId,
    attempts: [...value.attempts],
    observations: value.observations,
    resource: value.resource,
    ambiguous: value.ambiguous,
    pending: value.pending
  }).length;
}
function fresh(now: number): Window {
  return {
    startsAt: now,
    attempts: new Set(),
    observations: 0,
    resource: false,
    ambiguous: false,
    pending: 0,
    cost: 0
  };
}
function validBytes(bytes: number): boolean {
  return Number.isSafeInteger(bytes) && bytes >= 0 && bytes <= MAX_BYTES;
}

/** One destination/SDK instance; normalized DTOs only. Offline pending events
 * keep their ownership until ACK/drop. Time expiry never renews those receipts. */
export class DiagnosticCaptureBudget {
  private readonly windows = new Map<string, Window>();
  private readonly pending = new Map<string, Pending>();
  private readonly metadata = new Map<string, number>();
  private heldBytes = 0;
  get accountedBytes(): number {
    let bytes = this.heldBytes;
    for (const window of this.windows.values()) bytes += window.cost;
    return bytes;
  }
  /** Charge normalized late-correlation metadata retained outside this tracker. */
  retainMetadata(id: string, bytes: number): boolean {
    const previous = this.metadata.get(id) ?? 0,
      cost = bytes + id.length;
    if (
      !validBytes(bytes) ||
      (!this.metadata.has(id) && this.metadata.size >= MAX_FAILURES) ||
      this.accountedBytes - previous + cost > MAX_BYTES
    )
      return false;
    this.metadata.set(id, cost);
    this.heldBytes += cost - previous;
    return true;
  }
  releaseMetadata(id: string): void {
    const cost = this.metadata.get(id);
    if (cost === undefined) return;
    this.heldBytes -= cost;
    this.metadata.delete(id);
  }
  private prune(now: number): void {
    for (const [scope, window] of this.windows)
      if (window.pending === 0 && now >= window.startsAt + WINDOW_MS) this.windows.delete(scope);
  }
  registerFailure(reference: EvidenceReference, eventId: string, now: number): boolean {
    if (!Number.isFinite(now)) return false;
    this.prune(now);
    const scope = key(reference),
      previous = this.windows.get(scope);
    if (previous?.failureId !== undefined && previous.failureId !== eventId) {
      previous.ambiguous = true;
      previous.cost = windowCost(scope, previous);
      return false;
    }
    if (previous === undefined && this.windows.size >= MAX_FAILURES) return false;
    const next = {
      ...(previous ?? fresh(now)),
      failureId: eventId,
      failureAt: previous?.failureAt ?? now
    };
    next.cost = windowCost(scope, next);
    if (this.accountedBytes - (previous?.cost ?? 0) + next.cost > MAX_BYTES) return false;
    this.windows.set(scope, next);
    return !next.ambiguous;
  }
  reserve(eventId: string, payload: DiagnosticContextPayload, bytes: number, now: number): boolean {
    if (!validBytes(bytes) || !Number.isFinite(now) || this.pending.has(eventId)) return false;
    this.prune(now);
    const scope = key(payload),
      previous = this.windows.get(scope);
    if ((previous === undefined && this.windows.size >= MAX_FAILURES) || previous?.ambiguous)
      return false;
    const next = {
      ...(previous ?? fresh(now)),
      attempts: new Set(previous?.attempts),
      pending: (previous?.pending ?? 0) + 1
    };
    if (
      now < next.startsAt ||
      now > (next.failureAt ?? next.startsAt) + WINDOW_MS ||
      next.observations >= 20
    )
      return false;
    const attempt = payload.kind === "recovery" ? payload.attempt_id : null;
    if (attempt !== null) {
      if (!next.attempts.has(attempt) && next.attempts.size >= 5) return false;
      next.attempts.add(attempt);
    } else {
      if (
        next.resource ||
        next.failureId !==
          (payload.kind === "resource_observation" ? payload.source_event_id : null) ||
        next.failureAt === undefined ||
        now > next.failureAt + 30_000
      )
        return false;
      next.resource = true;
    }
    next.observations++;
    next.cost = windowCost(scope, next);
    const cost = bytes + eventId.length + scope.length + 64;
    if (this.accountedBytes - (previous?.cost ?? 0) + next.cost + cost > MAX_BYTES) return false;
    this.windows.set(scope, next);
    this.pending.set(eventId, { key: scope, kind: payload.kind, attempt, bytes, cost });
    this.heldBytes += cost;
    return true;
  }
  adjust(eventId: string, bytes: number): boolean {
    const entry = this.pending.get(eventId);
    if (!entry || !validBytes(bytes) || this.accountedBytes + bytes - entry.bytes > MAX_BYTES)
      return false;
    this.heldBytes += bytes - entry.bytes;
    entry.cost += bytes - entry.bytes;
    entry.bytes = bytes;
    return true;
  }
  replace(
    originalId: string,
    eventId: string,
    payload: DiagnosticContextPayload,
    bytes: number,
    now: number
  ): boolean {
    const entry = this.pending.get(originalId),
      scope = key(payload),
      attempt = payload.kind === "recovery" ? payload.attempt_id : null;
    if (entry && entry.key === scope && entry.kind === payload.kind && entry.attempt === attempt) {
      if (eventId !== originalId) {
        if (this.pending.has(eventId)) {
          this.release([originalId]);
          return false;
        }
        this.pending.delete(originalId);
        this.pending.set(eventId, entry);
        const delta = eventId.length - originalId.length;
        entry.cost += delta;
        this.heldBytes += delta;
      }
      if (!this.adjust(eventId, bytes) || !this.isEligible(eventId, payload)) {
        this.release([eventId]);
        return false;
      }
      return true;
    }
    this.release([originalId]);
    return this.reserve(eventId, payload, bytes, now);
  }
  isEligible(eventId: string, payload: DiagnosticContextPayload): boolean {
    const entry = this.pending.get(eventId),
      window = this.windows.get(key(payload));
    return (
      !!entry &&
      entry.key === key(payload) &&
      window !== undefined &&
      !window.ambiguous &&
      (payload.kind === "recovery" || window.failureId === payload.source_event_id)
    );
  }
  release(eventIds: readonly string[]): void {
    for (const id of eventIds) {
      const entry = this.pending.get(id);
      if (!entry) continue;
      this.heldBytes -= entry.cost;
      this.pending.delete(id);
      const window = this.windows.get(entry.key);
      if (window) {
        window.pending = Math.max(0, window.pending - 1);
        window.cost = windowCost(entry.key, window);
      }
    }
  }
  clear(): void {
    this.windows.clear();
    this.pending.clear();
    this.metadata.clear();
    this.heldBytes = 0;
  }
}
