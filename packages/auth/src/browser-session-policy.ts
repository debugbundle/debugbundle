import type { WebSessionRecord } from "./primitives.js";

export const BROWSER_SESSION_IDLE_MS = 7 * 24 * 60 * 60 * 1_000;
export const BROWSER_SESSION_ABSOLUTE_MS = 30 * 24 * 60 * 60 * 1_000;

export function browserSessionAbsoluteExpiry(createdAt: string): string {
  return new Date(Date.parse(createdAt) + BROWSER_SESSION_ABSOLUTE_MS).toISOString();
}

export interface RenewBrowserSessionInput {
  session_token_hash: string;
  now: string;
  idle_lifetime_ms: number;
  absolute_lifetime_ms: number;
}

export interface RenewedBrowserSession {
  session_id: string;
  expires_at: string;
  absolute_expires_at: string;
}

export function isBrowserSessionInactive(session: WebSessionRecord, now: Date): boolean {
  const createdAt = Date.parse(session.created_at);
  const expiresAt = Date.parse(session.expires_at);
  const time = now.getTime();
  return (
    session.revoked_at !== null ||
    !Number.isFinite(createdAt) ||
    !Number.isFinite(expiresAt) ||
    !Number.isFinite(time) ||
    createdAt > time ||
    expiresAt <= time ||
    createdAt + BROWSER_SESSION_ABSOLUTE_MS <= time
  );
}
