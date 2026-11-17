import { z } from "zod";
import type { Queryable } from "./types.js";
/** Expired proofs have no financial purpose. Signup intents are transient;
 * permanent claims, aliases, audit history and accounting are never pruned here. */
export async function pruneOfferTransientState(
  db: Queryable,
  raw: { now: string; limit: number }
): Promise<number> {
  const input = z
    .object({ now: z.string().datetime(), limit: z.number().int().min(1).max(1000) })
    .strict()
    .parse(raw);
  let changed = 0;
  const delegations = await db.query(
    "DELETE FROM offer_operator_delegations WHERE proof_hash IN (SELECT proof_hash FROM offer_operator_delegations WHERE expires_at<=$1::timestamptz ORDER BY expires_at,proof_hash LIMIT $2) RETURNING proof_hash",
    [input.now, input.limit]
  );
  changed += delegations.rows.length;
  if (changed < input.limit) {
    const expired = await db.query(
      "UPDATE offer_signup_intents SET status='expired' WHERE id IN (SELECT id FROM offer_signup_intents WHERE status='pending' AND expires_at<=$1::timestamptz ORDER BY expires_at,id LIMIT $2 FOR UPDATE SKIP LOCKED) RETURNING id",
      [input.now, input.limit - changed]
    );
    changed += expired.rows.length;
  }
  if (changed < input.limit) {
    const terminal = await db.query(
      "DELETE FROM offer_signup_intents WHERE id IN (SELECT id FROM offer_signup_intents WHERE status<>'pending' AND expires_at<$1::timestamptz-interval '30 days' ORDER BY expires_at,id LIMIT $2) RETURNING id",
      [input.now, input.limit - changed]
    );
    changed += terminal.rows.length;
  }
  return changed;
}
