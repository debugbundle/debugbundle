import { z } from "zod";
import { getBillingCatalogPrice } from "../../shared-types/src/billing-catalog.js";
import {
  ProgrammeError,
  ProgrammeStateSchema,
  previewOfferPrice,
  type ProgrammeVersion,
  type ProgrammeState
} from "./programme-policy.js";

export const ProgrammeStateChangeSchema = z
  .object({
    version_id: z.uuid(),
    state: ProgrammeStateSchema,
    expected_state: ProgrammeStateSchema,
    acknowledge_unlimited: z.boolean()
  })
  .strict();
export const programmeTransitions: Record<ProgrammeState, ProgrammeState[]> = {
  draft: ["scheduled", "active", "ended"],
  scheduled: ["active", "paused", "ended"],
  active: ["paused", "ended"],
  paused: ["active", "ended"],
  ended: []
};
/** Check before provider preparation and again under the storage lock. */
export function assertProgrammeStateChange(
  version: ProgrammeVersion,
  input: z.infer<typeof ProgrammeStateChangeSchema>
): void {
  if (
    version.version_id !== input.version_id ||
    version.state !== input.expected_state ||
    !programmeTransitions[version.state].includes(input.state)
  )
    throw new ProgrammeError("programme_changed");
  if (input.state !== "active" && input.state !== "scheduled") return;
  if (
    version.policy.eligible_plans.some((plan) =>
      version.policy.eligible_intervals.some(
        (interval) =>
          previewOfferPrice(
            getBillingCatalogPrice(plan, interval, "plan").amount_minor,
            version.policy
          ).payable_minor === 0
      )
    )
  )
    throw new ProgrammeError("programme_discount_invalid");
  if (version.policy.max_claims === null && !input.acknowledge_unlimited)
    throw new ProgrammeError("programme_unavailable");
}
