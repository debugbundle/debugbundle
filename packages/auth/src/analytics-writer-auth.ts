import { randomBytes } from "node:crypto";
import { z } from "zod";
import { hashToken } from "./primitives.js";

export const ANALYTICS_SERVER_WRITER_PREFIX = "dbundle_anl_";
export const ANALYTICS_RELAY_WRITER_PREFIX = "dbundle_anr_";
export type AnalyticsWriterKind = "server" | "relay";

const ContextSchema = z
  .object({
    writer_id: z.string().uuid(),
    project_id: z.string().uuid(),
    organization_id: z.string().uuid(),
    issuer_user_id: z.string().uuid(),
    kind: z.enum(["server", "relay"]),
    expires_at: z.string().datetime(),
    revoked_at: z.string().datetime().nullable()
  })
  .strict();
export type AnalyticsWriterContext = z.infer<typeof ContextSchema>;
export type AnalyticsWriterValidation =
  | { ok: true; context: AnalyticsWriterContext }
  | { ok: false; error: "invalid_token" | "token_expired" | "token_revoked" };

/** New write-only credentials occupy distinct namespaces; no legacy token generation changes. */
export function generateAnalyticsWriterToken(kind: AnalyticsWriterKind): {
  plaintext: string;
  hash: string;
} {
  const prefix = kind === "server" ? ANALYTICS_SERVER_WRITER_PREFIX : ANALYTICS_RELAY_WRITER_PREFIX;
  const plaintext = `${prefix}${randomBytes(32).toString("base64url")}`;
  return { plaintext, hash: hashToken(plaintext) };
}

/** Resolver must recheck current project/organization and issuer management access on every admission. */
export async function validateAnalyticsWriterToken(
  token: unknown,
  resolveByTokenHash: (hash: string) => Promise<unknown>,
  options: { now?: Date; allowedKinds?: readonly AnalyticsWriterKind[] } = {}
): Promise<AnalyticsWriterValidation> {
  const invalid: AnalyticsWriterValidation = { ok: false, error: "invalid_token" };
  if (typeof token !== "string" || !/^dbundle_an[lr]_[A-Za-z0-9_-]{43}$/.test(token))
    return invalid;
  const kind: AnalyticsWriterKind = token.startsWith(ANALYTICS_SERVER_WRITER_PREFIX)
    ? "server"
    : "relay";
  if (!(options.allowedKinds ?? ["server"]).includes(kind)) return invalid;
  const now = options.now ?? new Date();
  if (!Number.isFinite(now.getTime())) return invalid;
  const resolved = ContextSchema.safeParse(await resolveByTokenHash(hashToken(token)));
  if (!resolved.success || resolved.data.kind !== kind) return invalid;
  if (resolved.data.revoked_at !== null) return { ok: false, error: "token_revoked" };
  if (Date.parse(resolved.data.expires_at) <= now.getTime())
    return { ok: false, error: "token_expired" };
  return { ok: true, context: resolved.data };
}
