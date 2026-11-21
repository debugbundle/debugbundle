import { z } from "zod";
import { PublicOfferPreviewSchema } from "../../../../packages/referrals/src/programme-policy.js";
const PublicOfferResponseSchema = z.object({ offer: PublicOfferPreviewSchema.nullable() }).strict();
import {
  createOfferApi,
  OfferApiError
} from "../../../../packages/referral-client/src/offer-api.js";
import {
  buildApiUrl,
  buildBrowserSessionHeaders,
  readJson,
  ApiRequestError
} from "./api-client.js";

export const offerApi = createOfferApi({
  async request({ method, path, body }) {
    const response = await fetch(buildApiUrl(path), {
      method,
      credentials: "include",
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
      headers: buildBrowserSessionHeaders(body !== undefined),
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    try {
      return { status: response.status, body: await readJson<unknown>(response) };
    } catch (error) {
      if (error instanceof ApiRequestError) throw new OfferApiError(error.status, error.code);
      throw error;
    }
  }
});
const messages: Record<string, string> = {
  payout_preferences_changed:
    "Payment preferences changed. Reload and review the current details before retrying.",
  payout_context_changed:
    "Your account changed. Reload your referrals before saving payment details.",
  payout_preferences_required:
    "The creator needs to save payout preferences for this programme first.",
  payout_preferences_unavailable:
    "Payment preferences are temporarily unavailable. Please retry or contact support.",
  payout_programme_not_owned:
    "This programme is not available for your creator account. Reload your referrals.",
  payout_operator_required: "Payment review requires separate billing-operator access.",
  payout_instructions_unavailable:
    "The recorded payment instructions could not be verified. Do not send a payment until this is resolved.",
  attribution_frozen:
    "An existing offer or checkout has locked attribution. Retry that purchase or contact support.",
  ineligible_customer:
    "This introductory offer is available only before the first eligible paid purchase.",
  invalid_referral_code:
    "This legacy referral code is invalid or is no longer accepting new claims.",
  invalid_offer_code: "This code is invalid or is no longer accepting new claims.",
  creator_code_unavailable: "This code is already in use or reserved. Choose another.",
  creator_code_already_claimed: "Contact support for another code correction.",
  creator_code_changed: "Your preferred code changed. Reload Referrals to review the current code.",
  programme_terms_mismatch: "The terms changed. Reload and review them before joining.",
  programme_claim_limit: "This programme has reached its claim limit.",
  programme_discount_invalid:
    "The discount must leave a positive base invoice for every eligible plan and billing interval. Create a revision with a lower discount.",
  programme_unavailable:
    "This programme is currently unavailable. Saved benefits and earnings remain recorded.",
  programme_payment_setup_failed:
    "The payment discount could not be prepared or verified. The programme was not activated. Retry to check payment setup again.",
  offer_ineligible:
    "This introductory offer is available before your first paid subscription, on its eligible plans.",
  offer_frozen:
    "An existing checkout or payment has locked this offer. Retry that purchase or contact support.",
  offer_context_changed: "The workspace or offer changed. Reload and review the offer again.",
  offer_confirmation_required:
    "The quote changed or expired. Review the offer again before checkout.",
  offer_expired: "This campaign offer has expired. Choose another eligible code or remove it.",
  paid_purchase_locked:
    "Paid purchase is not yet available. Your saved discount will remain available when purchase unlocks."
};
export function offerErrorMessage(error: unknown): string {
  return error instanceof OfferApiError
    ? (messages[error.code] ?? "The offer could not be confirmed. Retry or contact support.")
    : "Offer details could not be reached. Please retry.";
}

/** Anonymous, exact-Origin hint only; authenticated claims use execute("apply"). */
export async function setSignupOfferHint(
  code: string,
  explicit = false
): Promise<z.infer<typeof PublicOfferPreviewSchema> | null> {
  return mutateSignupOfferHint("POST", { code, explicit_correction: explicit });
}

/** Clears only the anonymous hint; saved workspace benefits are managed in Billing. */
export async function clearSignupOfferHint(): Promise<void> {
  if ((await mutateSignupOfferHint("DELETE")) !== null)
    throw new Error("Offer hint was not cleared");
}

async function mutateSignupOfferHint(
  method: "POST" | "DELETE",
  body?: { code: string; explicit_correction: boolean }
): Promise<z.infer<typeof PublicOfferPreviewSchema> | null> {
  const response = await fetch(buildApiUrl("/v2/offers/pending"), {
    method,
    credentials: "include",
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
    headers: buildBrowserSessionHeaders(body !== undefined),
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  try {
    return PublicOfferResponseSchema.parse(await readJson<unknown>(response)).offer;
  } catch (error) {
    if (error instanceof ApiRequestError) throw new OfferApiError(error.status, error.code);
    throw error;
  }
}
