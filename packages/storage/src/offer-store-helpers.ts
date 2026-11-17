import { createHmac } from "node:crypto";
import { z } from "zod";
import {
  ProgrammeError,
  ProgrammeVersionSchema,
  type ProgrammeVersion
} from "../../referrals/src/programme-policy.js";
import { isCurrentBillingOwner } from "./billing-owner.js";
import type { Queryable } from "./types.js";

export interface OfferStorageOptions {
  newClaimsEnabled?: boolean;
  identityHashSecret: string;
}
export const OfferActorSchema = z
  .object({ organization_id: z.uuid(), actor_user_id: z.uuid() })
  .strict();
export type OfferActor = z.infer<typeof OfferActorSchema>;
export const versionColumns = `v.id AS version_id,v.programme_id,v.revision,v.name,v.public_description,
  v.policy,v.state,v.claims_count,v.created_at::text AS created_at`;
export function mapOfferVersion(row: Record<string, unknown>): ProgrammeVersion {
  return ProgrammeVersionSchema.parse({
    ...row,
    created_at: new Date(String(row["created_at"])).toISOString()
  });
}
export async function readOfferVersion(
  db: Queryable,
  id: string,
  lock = false
): Promise<ProgrammeVersion> {
  z.uuid().parse(id);
  const row = (
    await db.query(
      `SELECT ${versionColumns} FROM offer_programme_versions v WHERE v.id=$1${lock ? " FOR UPDATE OF v" : ""}`,
      [id]
    )
  ).rows[0];
  if (!row) throw new ProgrammeError("programme_not_found");
  return mapOfferVersion(row);
}
export async function verifiedOfferUser(db: Queryable, id: string, lock = false): Promise<string> {
  z.uuid().parse(id);
  const row = (
    await db.query<{ email: string }>(
      `SELECT email FROM users WHERE id=$1 AND email_verified_at IS NOT NULL${lock ? " FOR UPDATE" : ""}`,
      [id]
    )
  ).rows[0];
  if (!row) throw new ProgrammeError("operator_authorization_required");
  return row.email;
}
export function offerIdentityHash(
  options: OfferStorageOptions,
  email: string,
  partner = false
): string {
  z.string().min(32).parse(options.identityHashSecret);
  return createHmac("sha256", options.identityHashSecret)
    .update(`referral-${partner ? "partner" : "customer"}:v1:${email.trim().toLowerCase()}`)
    .digest("hex");
}
export async function lockOfferOwner(
  db: Queryable,
  input: OfferActor
): Promise<{ email: string; customer_id: string | null; trial_ends_at: string | null }> {
  const row = (
    await db.query<{ customer_id: string | null; trial_ends_at: string | null }>(
      "SELECT stripe_customer_id AS customer_id,trial_ends_at::text FROM organizations WHERE id=$1 AND suspended_at IS NULL FOR UPDATE",
      [input.organization_id]
    )
  ).rows[0];
  if (!row || !(await isCurrentBillingOwner(db, input.organization_id, input.actor_user_id)))
    throw new ProgrammeError("offer_ineligible");
  return { ...row, email: await verifiedOfferUser(db, input.actor_user_id) };
}
export async function lockOfferIdentity(db: Queryable, hash: string): Promise<void> {
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
    `referral-benefit:${hash}`
  ]);
}
