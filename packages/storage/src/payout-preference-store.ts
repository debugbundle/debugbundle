import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  CreatorPayoutProgrammeSchema,
  PayoutStoredDetailsSchema,
  PayoutPreferenceSummarySchema,
  PayoutProgrammeBalanceSchema,
  SavePayoutPreferenceSchema,
  PayoutPreferenceError,
  maskPayoutDestination,
  type PayoutDetails,
  type PayoutPreferenceSummary
} from "../../referrals/src/payout-preferences.js";
import {
  assertIntegrationSecretEncryptionKey,
  encryptIntegrationSecret,
  decryptIntegrationSecret
} from "./integration-secret-crypto.js";
import { verifiedOfferUser } from "./offer-store-helpers.js";
import { runInTransaction } from "./transaction.js";
import { REFERRAL_FINANCIAL_HOLD_SQL, PAYOUT_PROGRAMME_JOIN_SQL } from "./referral-payout-scope.js";
import type { Queryable } from "./types.js";

type PreferenceRow = Record<string, unknown> & {
  programme_id: string;
  revision: string;
  encrypted_details: string;
  updated_at: string;
};
const columns =
  "programme_id,revision,method,country,currency,masked_destination,encrypted_details,updated_at::text";
function summary(row: PreferenceRow): PayoutPreferenceSummary {
  return PayoutPreferenceSummarySchema.parse({
    programme_id: row.programme_id,
    revision: row.revision,
    method: row["method"],
    country: row["country"],
    currency: row["currency"],
    masked_destination: row["masked_destination"],
    updated_at: new Date(row.updated_at).toISOString()
  });
}
function requireKey(key: string | undefined): string {
  if (!key) throw new PayoutPreferenceError("payout_preferences_unavailable");
  assertIntegrationSecretEncryptionKey(key);
  return key;
}
function decode(row: PreferenceRow, partnerId: string, key: string | undefined): PayoutDetails {
  const envelope = z
    .object({
      partner_id: z.uuid(),
      programme_id: z.uuid(),
      revision: z.uuid(),
      details: PayoutStoredDetailsSchema
    })
    .strict()
    .parse(JSON.parse(decryptIntegrationSecret(row.encrypted_details, requireKey(key))) as unknown);
  if (
    envelope.partner_id !== partnerId ||
    envelope.programme_id !== row.programme_id ||
    envelope.revision !== row.revision ||
    envelope.details.method !== row["method"] ||
    envelope.details.country !== row["country"] ||
    envelope.details.currency !== row["currency"] ||
    maskPayoutDestination(envelope.details.destination) !== row["masked_destination"]
  )
    throw new PayoutPreferenceError("payout_instructions_unavailable");
  return envelope.details;
}
export async function lockPayoutPartner(db: Queryable, partnerId: string): Promise<void> {
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
    `referral-payout:usd:${partnerId}`
  ]);
}
/** Caller owns the financial-admission and partner locks, and inserts the batch
 * before this snapshot. This must complete before claiming any ledger entries. */
export async function capturePayoutInstructions(
  db: Queryable,
  input: {
    partner_id: string;
    programme_id: string;
    batch_id: string;
    preference_revision: string;
    now: string;
  },
  encryptionKey: string | undefined
): Promise<void> {
  const row = (
    await db.query<PreferenceRow>(
      `SELECT ${columns} FROM referral_payout_preferences WHERE partner_id=$1 AND programme_id=$2 FOR UPDATE`,
      [input.partner_id, input.programme_id]
    )
  ).rows[0];
  if (!row) throw new PayoutPreferenceError("payout_preferences_required");
  if (row.revision !== input.preference_revision)
    throw new PayoutPreferenceError("payout_preferences_changed");
  decode(row, input.partner_id, encryptionKey);
  await db.query(
    `INSERT INTO referral_payout_instructions(batch_id,programme_id,preference_revision,method,country,currency,masked_destination,encrypted_details,captured_at)
    SELECT $3,programme_id,revision,method,country,currency,masked_destination,encrypted_details,$4::timestamptz
    FROM referral_payout_preferences WHERE partner_id=$1 AND programme_id=$2`,
    [input.partner_id, input.programme_id, input.batch_id, input.now]
  );
}
export interface PayoutPreferenceStore {
  configured: boolean;
  list(userId: string): Promise<z.infer<typeof CreatorPayoutProgrammeSchema>[]>;
  save(userId: string, raw: unknown): Promise<PayoutPreferenceSummary>;
  balances(partnerId: string, now: string): Promise<z.infer<typeof PayoutProgrammeBalanceSchema>[]>;
  instructions(batchId: string): Promise<{
    batch_id: string;
    partner_id: string;
    programme_id: string;
    revision: string;
    details: PayoutDetails;
  } | null>;
}
export function createPayoutPreferenceStore(input: {
  db: Queryable;
  encryptionKey?: string;
}): PayoutPreferenceStore {
  if (input.encryptionKey) assertIntegrationSecretEncryptionKey(input.encryptionKey);
  const db = input.db;
  return {
    configured: input.encryptionKey !== undefined,
    async list(userId: string) {
      await verifiedOfferUser(db, userId);
      const rows = (
        await db.query<Record<string, unknown>>(
          `WITH owned AS (
        SELECT DISTINCT ON(v.programme_id) p.id AS partner_id,v.programme_id,v.name
        FROM referral_partners p JOIN offer_creator_memberships m ON m.partner_id=p.id
        JOIN offer_programme_versions v ON v.id=m.version_id WHERE p.user_id=$1
        ORDER BY v.programme_id,v.revision DESC)
        SELECT o.programme_id,o.name,s.revision,s.method,s.country,s.currency,s.masked_destination,s.updated_at::text
        FROM owned o LEFT JOIN referral_payout_preferences s ON s.partner_id=o.partner_id AND s.programme_id=o.programme_id
        ORDER BY o.programme_id LIMIT 101`,
          [userId]
        )
      ).rows;
      // Do not silently hide an accepted agreement behind a partial list.
      if (rows.length > 100) throw new PayoutPreferenceError("payout_programme_limit");
      return rows.map((row) =>
        CreatorPayoutProgrammeSchema.parse({
          programme_id: row["programme_id"],
          name: row["name"],
          preference: row["revision"] ? summary(row as PreferenceRow) : null
        })
      );
    },
    async save(userId: string, raw: unknown) {
      const request = SavePayoutPreferenceSchema.parse(raw),
        key = requireKey(input.encryptionKey);
      return runInTransaction(db, async (tx) => {
        await verifiedOfferUser(tx, userId, true);
        const owner = (
          await tx.query<{ partner_id: string }>(
            `SELECT p.id AS partner_id FROM referral_partners p
          WHERE p.user_id=$1 AND EXISTS(SELECT 1 FROM offer_creator_memberships m JOIN offer_programme_versions v ON v.id=m.version_id WHERE m.partner_id=p.id AND v.programme_id=$2)`,
            [userId, request.programme_id]
          )
        ).rows[0];
        if (!owner) throw new PayoutPreferenceError("payout_programme_not_owned");
        await lockPayoutPartner(tx, owner.partner_id);
        const previous = (
          await tx.query<{ revision: string }>(
            "SELECT revision FROM referral_payout_preferences WHERE partner_id=$1 AND programme_id=$2 FOR UPDATE",
            [owner.partner_id, request.programme_id]
          )
        ).rows[0];
        if ((previous?.revision ?? null) !== request.expected_revision)
          throw new PayoutPreferenceError("payout_preferences_changed");
        const revision = randomUUID(),
          details = request.details;
        const ciphertext = encryptIntegrationSecret(
          JSON.stringify({
            partner_id: owner.partner_id,
            programme_id: request.programme_id,
            revision,
            details
          }),
          key
        );
        const row = (
          await tx.query<PreferenceRow>(
            `INSERT INTO referral_payout_preferences(partner_id,programme_id,revision,method,country,currency,masked_destination,encrypted_details)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(partner_id,programme_id) DO UPDATE SET
          revision=excluded.revision,method=excluded.method,country=excluded.country,currency=excluded.currency,
          masked_destination=excluded.masked_destination,encrypted_details=excluded.encrypted_details,updated_at=now() RETURNING ${columns}`,
            [
              owner.partner_id,
              request.programme_id,
              revision,
              details.method,
              details.country,
              details.currency,
              maskPayoutDestination(details.destination),
              ciphertext
            ]
          )
        ).rows[0]!;
        return summary(row);
      });
    },
    async balances(partnerId: string, now: string) {
      z.uuid().parse(partnerId);
      z.string().datetime().parse(now);
      const rows = (
        await db.query<Record<string, unknown>>(
          `SELECT payout_version.programme_id,
        coalesce(max(payout_version.name),'Legacy Business referral') AS name,
        sum(CASE WHEN l.amount_minor<0 OR (NOT i.payout_held AND ${REFERRAL_FINANCIAL_HOLD_SQL} AND l.available_at<=$2::timestamptz) THEN l.amount_minor ELSE 0 END)::text AS available_minor,
        sum(CASE WHEN l.amount_minor<0 THEN l.amount_minor ELSE 0 END)::text AS negative_minor
        FROM referral_commission_ledger l JOIN referral_invoice_balances i ON i.invoice_id=l.invoice_id
        ${PAYOUT_PROGRAMME_JOIN_SQL} WHERE l.partner_id=$1 AND NOT EXISTS(SELECT 1 FROM referral_payout_entries e WHERE e.ledger_entry_id=l.id)
        GROUP BY payout_version.programme_id ORDER BY payout_version.programme_id NULLS FIRST LIMIT 101`,
          [partnerId, now]
        )
      ).rows;
      if (rows.length > 100) throw new PayoutPreferenceError("payout_programme_limit");
      const preferences = (
        await db.query<PreferenceRow>(
          `SELECT ${columns} FROM referral_payout_preferences WHERE partner_id=$1 LIMIT 101`,
          [partnerId]
        )
      ).rows;
      if (preferences.length > 100) throw new PayoutPreferenceError("payout_programme_limit");
      const negativeTotal = rows.reduce(
        (sum, row) => sum + BigInt(String(row["negative_minor"])),
        0n
      );
      return rows.map((row) =>
        PayoutProgrammeBalanceSchema.parse({
          programme_id: row["programme_id"],
          name: row["name"],
          available_minor: Number(
            BigInt(String(row["available_minor"])) +
              negativeTotal -
              BigInt(String(row["negative_minor"]))
          ),
          preference: preferences.find((p) => p.programme_id === row["programme_id"])
            ? summary(preferences.find((p) => p.programme_id === row["programme_id"])!)
            : null
        })
      );
    },
    async instructions(batchId: string) {
      z.uuid().parse(batchId);
      const row = (
        await db.query<PreferenceRow & { partner_id: string }>(
          `SELECT s.programme_id,s.preference_revision AS revision,s.method,s.country,s.currency,s.masked_destination,s.encrypted_details,s.captured_at::text AS updated_at,b.partner_id
        FROM referral_payout_batches b LEFT JOIN referral_payout_instructions s ON s.batch_id=b.id WHERE b.id=$1`,
          [batchId]
        )
      ).rows[0];
      if (!row) throw new PayoutPreferenceError("payout_not_found");
      if (!row.programme_id) return null;
      return {
        batch_id: batchId,
        partner_id: row.partner_id,
        programme_id: row.programme_id,
        revision: row.revision,
        details: decode(row, row.partner_id, input.encryptionKey)
      };
    }
  };
}
