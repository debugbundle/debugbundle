import type { FastifyReply, FastifyRequest } from "fastify";

import { SESSION_COOKIE_NAME, readCookieValue, requireMemberToken } from "../../../packages/auth/src/index.js";
import { validateEvent } from "../../../packages/event-normalizer/src/index.js";
import { redact } from "../../../packages/redaction/src/index.js";
import { isSelfHostMode } from "../../../packages/shared-types/src/index.js";
import type { EventEnvelope } from "../../../packages/shared-types/src/index.js";
import type { ProjectAccessRecord, ResolveMemberResult } from "../../../packages/storage/src/index.js";
import { z } from "zod";
import type { ApiDependencies } from "./api-types.js";
import { ImprovementsCursorSchema, IncidentsCursorSchema, LogsCursorSchema } from "./schemas.js";

export type RequestRateLimitBucket = "retrieval-read" | "retrieval-write" | "management-read" | "management-write";

const REQUEST_RATE_LIMIT_PER_MINUTE: Record<RequestRateLimitBucket, number> = {
  "retrieval-read": 300,
  "retrieval-write": 30,
  "management-read": 200,
  "management-write": 30
};

function toRetryAfterSeconds(retryAfterMs: number): string {
  return String(Math.max(1, Math.ceil(retryAfterMs / 1_000)));
}

export function redactEvent(event: EventEnvelope): EventEnvelope {
  const redactedPayload = redact(event.payload as Parameters<typeof redact>[0]).redacted;
  const reparsed = validateEvent({
    ...event,
    payload: redactedPayload
  });

  if (!reparsed.success) {
    return event;
  }

  return reparsed.data;
}

export function isObjectNotFoundError(error: unknown): boolean {
  return error instanceof Error && error.message === "s3_object_not_found";
}

function normalizeCursorTimestamp(rawValue: string): string | null {
  const strictIso = z.string().datetime().safeParse(rawValue);
  if (strictIso.success) {
    return strictIso.data;
  }

  const parsedMillis = Date.parse(rawValue);
  if (Number.isNaN(parsedMillis)) {
    return null;
  }

  return new Date(parsedMillis).toISOString();
}

export function serializeCursorTimestamp(rawValue: string): string {
  const normalized = normalizeCursorTimestamp(rawValue);
  return normalized ?? rawValue;
}

export function parseLogsCursor(rawCursor: string | undefined): { occurred_at: string; event_id: string } | null {
  if (rawCursor === undefined) {
    return null;
  }

  const separatorIndex = rawCursor.lastIndexOf("|");
  if (separatorIndex <= 0 || separatorIndex >= rawCursor.length - 1) {
    return null;
  }

  const occurredAt = rawCursor.slice(0, separatorIndex);
  const eventId = rawCursor.slice(separatorIndex + 1);
  const normalizedOccurredAt = normalizeCursorTimestamp(occurredAt);
  if (normalizedOccurredAt === null) {
    return null;
  }

  const parsed = LogsCursorSchema.safeParse({ occurred_at: normalizedOccurredAt, event_id: eventId });
  if (!parsed.success) {
    return null;
  }

  return parsed.data;
}

export function parseIncidentsCursor(rawCursor: string | undefined): { last_seen_at: string; incident_id: string } | null {
  if (rawCursor === undefined) {
    return null;
  }

  const separatorIndex = rawCursor.lastIndexOf("|");
  if (separatorIndex <= 0 || separatorIndex >= rawCursor.length - 1) {
    return null;
  }

  const lastSeenAt = rawCursor.slice(0, separatorIndex);
  const incidentId = rawCursor.slice(separatorIndex + 1);
  const normalizedLastSeenAt = normalizeCursorTimestamp(lastSeenAt);
  if (normalizedLastSeenAt === null) {
    return null;
  }

  const parsed = IncidentsCursorSchema.safeParse({ last_seen_at: normalizedLastSeenAt, incident_id: incidentId });
  if (!parsed.success) {
    return null;
  }

  return parsed.data;
}

export function parseImprovementsCursor(rawCursor: string | undefined): { last_detected_at: string; improvement_id: string } | null {
  if (rawCursor === undefined) {
    return null;
  }

  const separatorIndex = rawCursor.lastIndexOf("|");
  if (separatorIndex <= 0 || separatorIndex >= rawCursor.length - 1) {
    return null;
  }

  const lastDetectedAt = rawCursor.slice(0, separatorIndex);
  const improvementId = rawCursor.slice(separatorIndex + 1);
  const normalizedLastDetectedAt = normalizeCursorTimestamp(lastDetectedAt);
  if (normalizedLastDetectedAt === null) {
    return null;
  }

  const parsed = ImprovementsCursorSchema.safeParse({ last_detected_at: normalizedLastDetectedAt, improvement_id: improvementId });
  if (!parsed.success) {
    return null;
  }

  return parsed.data;
}

export async function requireMemberAuth(
  headers: {
    authorization?: string | undefined;
    cookie?: string | undefined;
  },
  dependencies: Pick<ApiDependencies, "memberAuth" | "webAuth">
): Promise<ResolveMemberResult | null> {
  if (headers.authorization === undefined) {
    const browserAuth = await resolveBrowserSession(headers.cookie, dependencies);
    if (browserAuth !== null) {
      return {
        member_id: browserAuth.user_id,
        organization_id: browserAuth.organization_id,
        email: browserAuth.email,
        role: browserAuth.role
      };
    }
  }

  const auth = await requireMemberToken({
    authorizationHeader: headers.authorization,
    resolveByTokenHash: (tokenHash) => dependencies.memberAuth.resolveMemberByTokenHash(tokenHash)
  });
  if (!auth.ok) {
    return null;
  }

  return auth.context;
}

export async function enforceRequestRateLimit(
  request: FastifyRequest,
  reply: FastifyReply,
  dependencies: Pick<ApiDependencies, "authRateLimiter">,
  input: {
    bucket: RequestRateLimitBucket;
    subject: string;
  }
): Promise<boolean> {
  if (isSelfHostMode() || dependencies.authRateLimiter === undefined) {
    return true;
  }

  const rateLimit = await dependencies.authRateLimiter.claimRequest({
    ip: request.ip,
    subject: input.subject,
    bucket: input.bucket,
    limit: REQUEST_RATE_LIMIT_PER_MINUTE[input.bucket],
    now: new Date().toISOString()
  });

  if (rateLimit.allowed) {
    return true;
  }

  await reply.header("Retry-After", toRetryAfterSeconds(rateLimit.retry_after_ms)).status(429).send({
    error: "rate_limited"
  });
  return false;
}

export async function requireRateLimitedMemberAuth(
  request: FastifyRequest,
  reply: FastifyReply,
  dependencies: Pick<ApiDependencies, "memberAuth" | "webAuth" | "authRateLimiter">,
  bucket: RequestRateLimitBucket
): Promise<ResolveMemberResult | null> {
  const member = await requireMemberAuth(request.headers, dependencies);
  if (member === null) {
    await reply.status(401).send({
      error: "invalid_member_token"
    });
    return null;
  }

  if (
    !(await enforceRequestRateLimit(request, reply, dependencies, {
      bucket,
      subject: `member:${member.member_id}`
    }))
  ) {
    return null;
  }

  return member;
}

export async function requireRateLimitedOwnerMemberAuth(
  request: FastifyRequest,
  reply: FastifyReply,
  dependencies: Pick<ApiDependencies, "memberAuth" | "webAuth" | "authRateLimiter">,
  bucket: RequestRateLimitBucket
): Promise<ResolveMemberResult | "forbidden" | null> {
  const member = await requireRateLimitedMemberAuth(request, reply, dependencies, bucket);
  if (member === null) {
    return null;
  }

  if (member.role !== "owner") {
    return "forbidden";
  }

  return member;
}

export async function requireRateLimitedProjectAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  dependencies: Pick<ApiDependencies, "memberAuth" | "webAuth" | "authRateLimiter" | "projectManagement">,
  input: {
    bucket: RequestRateLimitBucket;
    projectId: string;
  }
): Promise<{ member: ResolveMemberResult; access: ProjectAccessRecord } | null> {
  const member = await requireRateLimitedMemberAuth(request, reply, dependencies, input.bucket);
  if (member === null) {
    return null;
  }

  if (dependencies.projectManagement?.resolveProjectAccessForUser === undefined) {
    await reply.status(404).send({ error: "project_not_found" });
    return null;
  }

  const access = await dependencies.projectManagement.resolveProjectAccessForUser({
    user_id: member.member_id,
    project_id: input.projectId
  });
  if (access === null) {
    await reply.status(404).send({ error: "project_not_found" });
    return null;
  }

  return { member, access };
}

export async function resolveBrowserSession(
  cookieHeader: string | undefined,
  dependencies: Pick<ApiDependencies, "webAuth">
): Promise<
  | {
      user_id: string;
      email: string;
      organization_id: string;
      email_verified_at: string | null;
      role: "owner" | "member";
    }
  | null
> {
  if (dependencies.webAuth === undefined) {
    return null;
  }

  const sessionToken = readCookieValue(cookieHeader, SESSION_COOKIE_NAME);
  if (sessionToken === null) {
    return null;
  }

  const session = await dependencies.webAuth.resolveSessionByToken(sessionToken, {
    now: new Date()
  });
  if (session === null) {
    return null;
  }

  return {
    user_id: session.user_id,
    email: session.email,
    organization_id: session.organization_id,
    email_verified_at: session.email_verified_at,
    role: session.role
  };
}

export async function requireOwnerMemberAuth(
  headers: {
    authorization?: string | undefined;
    cookie?: string | undefined;
  },
  dependencies: Pick<ApiDependencies, "memberAuth" | "webAuth">
): Promise<ResolveMemberResult | "forbidden" | null> {
  const principal = await requireMemberAuth(headers, dependencies);
  if (principal === null) {
    return null;
  }

  if (principal.role !== "owner") {
    return "forbidden";
  }

  return principal;
}
