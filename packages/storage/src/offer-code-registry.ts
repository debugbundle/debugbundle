import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ReferralCodeSchema } from "../../referrals/src/referral-contracts.js";
import type { Queryable } from "./types.js";
/** Hold the registry decision until a new promise commits. A concurrent operator
 * block must either precede admission or wait for that existing promise. */
export async function lockOfferCodeForClaim(tx: Queryable, code: string): Promise<void> {
  await tx.query("SELECT id FROM offer_codes WHERE code=$1 FOR SHARE", [code]);
}

/** Both enrolment representations reserve the generated alias in the same
 * transaction as partner creation. Existing aliases are never reassigned. */
export async function registerLegacyOfferCode(
  tx: Queryable,
  raw: { partner_id: string; code: string }
): Promise<boolean> {
  const input = z.object({ partner_id: z.uuid(), code: ReferralCodeSchema }).strict().parse(raw);
  await tx.query(
    "INSERT INTO offer_codes(id,code,kind,partner_id) VALUES($1,$2,'legacy',$3) ON CONFLICT(code) DO NOTHING",
    [randomUUID(), input.code, input.partner_id]
  );
  return (
    (
      await tx.query(
        "SELECT id FROM offer_codes WHERE code=$1 AND partner_id=$2 AND kind='legacy'",
        [input.code, input.partner_id]
      )
    ).rows.length === 1
  );
}
