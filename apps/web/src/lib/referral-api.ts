import {
  createReferralApi,
  ReferralApiError
} from "../../../../packages/referral-client/src/index.js";
import {
  ApiRequestError,
  buildApiUrl,
  buildBrowserSessionHeaders,
  readJson
} from "./api-client.js";

// The marker only satisfies the shared client's input shape. Browser requests
// use their HttpOnly session and CSRF header; no bearer credential is sent.
const auth = { bearerToken: "browser-session" };
const api = createReferralApi({
  async request({ method, path, body }) {
    const response = await fetch(buildApiUrl(path), {
      method,
      credentials: "include",
      headers: buildBrowserSessionHeaders(body !== undefined),
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    try {
      return { status: response.status, body: await readJson<unknown>(response) };
    } catch (error) {
      // Preserve the shared client's domain errors without intercepting session invalidation.
      if (error instanceof ApiRequestError) throw new ReferralApiError(error.status, error.code);
      throw error;
    }
  }
});
type Page = { limit?: number; before?: string };
export const referralApi = {
  partner: () => api.partner(auth),
  join: (termsVersion: string) => api.join({ ...auth, termsVersion }),
  clients: (page: Page = {}) => api.clients({ ...auth, ...page }),
  customer: () => api.customer(auth),
  apply: (organizationId: string, code: string, explicitCorrection: boolean) =>
    api.apply({ ...auth, code, explicitCorrection, expectedOrganizationId: organizationId }),
  earnings: () => api.earnings(auth),
  payouts: (page: Page = {}) => api.payouts({ ...auth, ...page }),
  operatorBalances: (page: Page = {}) => api.operatorBalances({ ...auth, ...page }),
  operatorPayouts: (page: Page & { partnerId?: string } = {}) =>
    api.operatorPayouts({ ...auth, ...page }),
  claim: (partnerId: string, claimId: string) => api.claimPayout({ ...auth, partnerId, claimId }),
  uncertain: (batchId: string) => api.markPayoutUncertain({ ...auth, batchId }),
  record: (batchId: string, externalReference: string, confirmedExternalPayment: true) =>
    api.recordPayout({ ...auth, batchId, externalReference, confirmedExternalPayment })
};
const messages: Record<string, string> = {
  email_verification_required: "Verify your email before using referrals.",
  terms_mismatch: "The referral terms have changed. Reload and review them before joining.",
  program_unavailable: "The referral programme is currently unavailable. Please try again later.",
  referral_service_unavailable: "Referral details are temporarily unavailable. Please try again.",
  invalid_referral_code: "This referral code is invalid or no longer accepting new referrals.",
  referral_self_claim: "You cannot refer your own account.",
  ineligible_customer:
    "Referral benefits are available only before your first paid subscription, on Business.",
  attribution_frozen: "This referral is locked for an existing checkout.",
  organization_context_changed: "Your workspace changed. Reload Billing before applying this code.",
  billing_state_changed: "Your billing details changed. Reload Billing and try again.",
  forbidden: "You do not have permission for this referral action.",
  payout_already_claimed:
    "A payment for this partner is already claimed. Review that batch before proceeding.",
  no_available_commission: "There is no available commission to claim.",
  payout_reference_conflict:
    "This payment reference conflicts with an existing record. Check the external payment before continuing."
};
export function referralErrorMessage(error: unknown): string {
  return error instanceof ReferralApiError
    ? (messages[error.code] ??
        "The referral action could not be completed. Please retry or refresh the page.")
    : "The referral service could not be reached. Please try again.";
}
const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
export function formatReferralAmount(minor: number): string {
  return currency.format(minor / 100);
}
