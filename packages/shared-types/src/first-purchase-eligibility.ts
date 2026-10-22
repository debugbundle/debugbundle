import { z } from "zod";

const FIRST_PURCHASE_WAIT_MS = 7 * 24 * 60 * 60 * 1_000;
const TimestampSchema = z.string().datetime({ offset: true });

/** Temporary first-purchase policy. Account/customer creation is not paid history. */
export function getFirstPurchaseEligibility(
  input: { trial_started_at: string | null; previously_paid: boolean },
  now: number
): { allowed: boolean; unlocks_at: string | null } {
  if (input.previously_paid) return { allowed: true, unlocks_at: null };
  if (!TimestampSchema.safeParse(input.trial_started_at).success || !Number.isFinite(now))
    return { allowed: false, unlocks_at: null };
  const startedAt = Date.parse(input.trial_started_at!);
  if (!Number.isFinite(startedAt) || startedAt > now) return { allowed: false, unlocks_at: null };
  const unlocksAt = startedAt + FIRST_PURCHASE_WAIT_MS;
  return { allowed: now >= unlocksAt, unlocks_at: new Date(unlocksAt).toISOString() };
}
