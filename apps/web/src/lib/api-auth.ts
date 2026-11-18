import { z } from "zod";
import {
  API_BASE,
  buildBrowserSessionHeaders,
  clearBrowserSessionState,
  getBrowserSessionSnapshot,
  invalidateBrowserSession,
  parseAttachmentFilename,
  readJson,
  rememberSession
} from "./api-client.js";
import type { ImportedAccountAvatarRecord, SessionRecord } from "./api-types.js";

const SessionRenewalSchema = z.object({
  session_id: z.string(),
  expires_at: z.string().datetime(),
  absolute_expires_at: z.string().datetime()
});

export async function renewBrowserSession(): Promise<SessionRecord | null> {
  const snapshot = getBrowserSessionSnapshot();
  if (snapshot.session === null) return null;
  const response = await fetch(`${API_BASE}/v1/auth/session/renew`, {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: buildBrowserSessionHeaders(true),
    body: "{}"
  });
  // Even a late 401 for a prior identity must not sign out its replacement.
  if (getBrowserSessionSnapshot().revision !== snapshot.revision) {
    return getBrowserSessionSnapshot().session;
  }
  const renewed = SessionRenewalSchema.parse(await readJson(response, snapshot.revision));
  const current = getBrowserSessionSnapshot();
  if (
    current.revision !== snapshot.revision ||
    renewed.session_id !== snapshot.session.session_id
  ) {
    return current.session;
  }
  return rememberSession({ ...snapshot.session, expires_at: renewed.expires_at });
}

export async function getSession(): Promise<SessionRecord | null> {
  const snapshot = getBrowserSessionSnapshot();
  const response = await fetch(`${API_BASE}/v1/auth/session`, {
    credentials: "include",
    cache: "no-store"
  });
  const nextSession =
    response.status === 401
      ? null
      : (await readJson<{ session: SessionRecord | null }>(response)).session;

  // A refresh started before sign-out, invalidation or a new sign-in cannot
  // restore old identity/CSRF state or clear the replacement session.
  const current = getBrowserSessionSnapshot();
  if (current.revision !== snapshot.revision) {
    return current.session;
  }
  if (nextSession === null && snapshot.session !== null) {
    invalidateBrowserSession();
  }
  return rememberSession(nextSession);
}

export async function requestEmailCode(payload: {
  email: string;
  accepted_terms: true;
  requested_trial_plan?: "solo" | "team" | "business";
}): Promise<void> {
  await readJson(
    await fetch(`${API_BASE}/v1/auth/request-code`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    })
  );
}

export async function verifyEmailCode(payload: {
  email: string;
  code: string;
  requested_trial_plan?: "solo" | "team" | "business";
}): Promise<SessionRecord> {
  const body = await readJson<{ session: SessionRecord }>(
    await fetch(`${API_BASE}/v1/auth/verify-code`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    })
  );

  return rememberSession(body.session);
}

export async function logout(): Promise<void> {
  const response = await fetch(`${API_BASE}/v1/auth/logout`, {
    method: "POST",
    credentials: "include",
    headers: buildBrowserSessionHeaders()
  });

  if (response.status !== 401) {
    await readJson(response);
  }

  clearBrowserSessionState();
}

export async function exportAccountData(): Promise<{ blob: Blob; filename: string }> {
  const response = await fetch(`${API_BASE}/v1/account/export`, {
    credentials: "include"
  });

  if (!response.ok) {
    await readJson(response);
  }

  return {
    blob: await response.blob(),
    filename:
      parseAttachmentFilename(response.headers.get("Content-Disposition")) ??
      "debugbundle-account-export.json"
  };
}

export async function importAccountAvatarFromGravatar(): Promise<ImportedAccountAvatarRecord> {
  const body = await readJson<{ avatar: ImportedAccountAvatarRecord }>(
    await fetch(`${API_BASE}/v1/account/avatar/import-gravatar`, {
      method: "POST",
      credentials: "include",
      headers: buildBrowserSessionHeaders()
    })
  );

  return body.avatar;
}
