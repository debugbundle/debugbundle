import type { IncomingHttpHeaders } from "node:http";

import type { ProjectTokenContext } from "../../../packages/auth/src/index.js";

export function normalizeProjectTokenOrigin(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    return parsed.origin.toLowerCase();
  } catch {
    return null;
  }
}

export function normalizeProjectTokenAllowedOrigins(values: readonly string[]): string[] | null {
  const normalized = new Set<string>();

  for (const value of values) {
    const origin = normalizeProjectTokenOrigin(value);
    if (origin === null) {
      return null;
    }

    normalized.add(origin);
  }

  return [...normalized].sort();
}

export function getRequestOrigin(headers: IncomingHttpHeaders | Record<string, unknown>): string | null {
  const value = headers.origin;
  if (typeof value !== "string") {
    return null;
  }

  return normalizeProjectTokenOrigin(value);
}

export function isProjectTokenOriginAllowed(input: {
  headers: IncomingHttpHeaders | Record<string, unknown>;
  projectToken: ProjectTokenContext;
}): boolean {
  const allowedOrigins = input.projectToken.allowed_origins ?? [];
  if (allowedOrigins.length === 0) {
    return true;
  }

  const requestOrigin = getRequestOrigin(input.headers);
  if (requestOrigin === null) {
    return false;
  }

  return allowedOrigins.some((origin) => normalizeProjectTokenOrigin(origin) === requestOrigin);
}
