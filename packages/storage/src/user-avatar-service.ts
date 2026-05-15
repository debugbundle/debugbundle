import { createHash } from "node:crypto";

import { buildUserAvatarObjectKey } from "./helpers.js";
import type { ObjectStoreClient, UserAvatarRecord } from "./types.js";

const MAX_AVATAR_BYTES = 512_000;
const DEFAULT_AVATAR_FETCH_TIMEOUT_MS = 5_000;
const ALLOWED_AVATAR_CONTENT_TYPES = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp"
]);

export type UserAvatarSource = "github" | "gravatar";

export type ImportUserAvatarResult =
  | {
      ok: true;
      avatar: UserAvatarRecord;
    }
  | {
      ok: false;
      error: "fetch_failed" | "invalid_content_type" | "not_found" | "too_large" | "user_not_found";
    };

export interface UserAvatarStore {
  saveUserAvatar(input: {
    user_id: string;
    source: UserAvatarSource;
    object_key: string;
    content_type: string;
    updated_at: string;
  }): Promise<UserAvatarRecord | null>;
}

function normalizeAvatarContentType(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const normalized = value.split(";")[0]?.trim().toLowerCase() ?? "";
  return ALLOWED_AVATAR_CONTENT_TYPES.has(normalized) ? normalized : null;
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function buildGravatarAvatarUrl(email: string): string {
  const hash = createHash("md5").update(normalizeEmail(email), "utf8").digest("hex");
  return `https://www.gravatar.com/avatar/${hash}?d=404&s=256`;
}

export async function importUserAvatarFromUrl(input: {
  user_id: string;
  source: UserAvatarSource;
  url: string;
  store: UserAvatarStore;
  objectStoreWriter: Pick<ObjectStoreClient, "putObject">;
  fetchImplementation?: typeof fetch;
  timeoutMs?: number;
  now?: string;
}): Promise<ImportUserAvatarResult> {
  const fetchImplementation = input.fetchImplementation ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? DEFAULT_AVATAR_FETCH_TIMEOUT_MS);
  const response = await fetchImplementation(input.url, {
    headers: {
      Accept: "image/*",
      "User-Agent": "debugbundle"
    },
    redirect: "follow",
    signal: controller.signal
  }).catch(() => null).finally(() => {
    clearTimeout(timeout);
  });

  if (response === null) {
    return { ok: false, error: "fetch_failed" };
  }

  if (response.status === 404) {
    return { ok: false, error: "not_found" };
  }

  if (!response.ok) {
    return { ok: false, error: "fetch_failed" };
  }

  const contentLengthHeader = response.headers.get("content-length");
  if (contentLengthHeader !== null) {
    const contentLength = Number.parseInt(contentLengthHeader, 10);
    if (Number.isFinite(contentLength) && contentLength > MAX_AVATAR_BYTES) {
      return { ok: false, error: "too_large" };
    }
  }

  const contentType = normalizeAvatarContentType(response.headers.get("content-type"));
  if (contentType === null) {
    return { ok: false, error: "invalid_content_type" };
  }

  const body = Buffer.from(await response.arrayBuffer());
  if (body.length === 0 || body.length > MAX_AVATAR_BYTES) {
    return { ok: false, error: "too_large" };
  }

  const objectKey = buildUserAvatarObjectKey(input.user_id);
  await input.objectStoreWriter.putObject({
    key: objectKey,
    body,
    contentType
  });

  const avatar = await input.store.saveUserAvatar({
    user_id: input.user_id,
    source: input.source,
    object_key: objectKey,
    content_type: contentType,
    updated_at: input.now ?? new Date().toISOString()
  });

  if (avatar === null) {
    return { ok: false, error: "user_not_found" };
  }

  return {
    ok: true,
    avatar
  };
}
