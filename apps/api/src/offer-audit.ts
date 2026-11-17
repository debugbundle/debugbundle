import { z } from "zod";
import type { FastifyRequest } from "fastify";
/** Audit only explicitly allowed public identifiers and bounded reasons. Never
 * persist bearer/session credentials, delegation proofs or arbitrary payloads. */
export function offerAuditDetails(request: FastifyRequest): {
  target_id: string | null;
  metadata: Record<string, unknown>;
} {
  const params = z.record(z.string(), z.unknown()).safeParse(request.params),
    body = z.record(z.string(), z.unknown()).safeParse(request.body);
  const source = { ...(params.success ? params.data : {}), ...(body.success ? body.data : {}) },
    metadata: Record<string, unknown> = {};
  let target: string | null = null;
  for (const key of ["version_id", "claim_id", "partner_id", "grant_id", "member_token_id"]) {
    const value = z.uuid().safeParse(source[key]);
    if (value.success) {
      metadata[key] = value.data;
      target ??= value.data;
    }
  }
  const reason = z.string().trim().min(1).max(300).safeParse(source["reason"]);
  if (reason.success) metadata["reason"] = reason.data;
  const code = z
    .string()
    .regex(/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/)
    .min(3)
    .max(24)
    .safeParse(source["code"]);
  if (code.success) metadata["code"] = code.data.toUpperCase();
  for (const key of ["state", "expected_state"]) {
    const state = z
      .enum(["draft", "scheduled", "active", "paused", "ended"])
      .safeParse(source[key]);
    if (state.success) metadata[key] = state.data;
  }
  for (const key of ["livemode", "blocked", "explicit_correction", "acknowledge_unlimited"]) {
    if (typeof source[key] === "boolean") metadata[key] = source[key];
  }
  return { target_id: target, metadata };
}
