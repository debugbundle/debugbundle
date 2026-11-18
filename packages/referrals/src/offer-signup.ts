import { ProgrammeError } from "./programme-policy.js";
import type { OfferActor } from "../../storage/src/offer-store-helpers.js";
import type { OfferSignupStore } from "../../storage/src/offer-signup-store.js";
/** Shared bounded recovery for browser and worker. Only a durable account-bound
 * signup intent can be retried; encountering another cookie is not authority. */
export async function retryOfferSignupIntent(
  input: {
    signup: Pick<OfferSignupStore, "read" | "take" | "complete">;
    enabled: boolean;
    apply: (actor: OfferActor, code: string) => Promise<unknown>;
  },
  actor: OfferActor
): ReturnType<OfferSignupStore["read"]> {
  if (!input.enabled) return input.signup.read(actor);
  const intent = await input.signup.take(actor);
  if (!intent) return input.signup.read(actor);
  try {
    await input.apply(actor, intent.code);
    await input.signup.complete(intent.intent_id, "completed");
  } catch (error) {
    const terminal =
      error instanceof ProgrammeError &&
      [
        "invalid_offer_code",
        "offer_ineligible",
        "offer_frozen",
        "offer_change_requires_confirmation",
        "programme_claim_limit",
        "programme_changed"
      ].includes(error.code);
    await input.signup.complete(intent.intent_id, terminal ? "rejected" : "retry");
  }
  return input.signup.read(actor);
}
