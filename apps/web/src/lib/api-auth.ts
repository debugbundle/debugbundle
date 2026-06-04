import {
  API_BASE,
  buildBrowserSessionHeaders,
  clearBrowserSessionState,
  parseAttachmentFilename,
  readJson,
  rememberSession
} from "./api-client.js";
import type {
  ImportedAccountAvatarRecord,
  SessionRecord
} from "./api-types.js";

export async function getSession(): Promise<SessionRecord | null> {
  const response = await fetch(`${API_BASE}/v1/auth/session`, {
    credentials: "include"
  });

  if (response.status === 401) {
    clearBrowserSessionState();
    return null;
  }

  const body = await readJson<{ session: SessionRecord | null }>(response);
  return rememberSession(body.session);
}

export async function requestEmailCode(payload: {
  email: string;
  accepted_terms: true;
  requested_trial_plan?: "solo" | "team";
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
  requested_trial_plan?: "solo" | "team";
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
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `request_failed_${response.status}`);
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
