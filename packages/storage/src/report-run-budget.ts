import type { Queryable } from "./types.js";
/** An admitted paid intent owns its money even after cancellation. Only
 * definitely unused AI allocations can be released; generated facts still
 * consume the logical generation when completing a factual-only report. */
export async function releaseUnusedReportAllocation(
  tx: Queryable,
  row: Record<string, unknown>,
  releaseGeneration: boolean
): Promise<boolean> {
  if (row["paid_attempts"] !== 0) return false;
  const unstarted =
    releaseGeneration && row["generation_counted"] === true && row["facts_object_key"] === null;
  await tx.query(
    "UPDATE report_allowance_windows SET generations=generations-$3,held_nano_usd=held_nano_usd-$4 WHERE organization_id=$1 AND starts_at=$2",
    [
      row["organization_id"],
      row["window_starts_at"],
      unstarted ? 1 : 0,
      row["ai_reserved_nano_usd"]
    ]
  );
  return unstarted;
}
