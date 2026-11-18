import { z } from "zod";
import {
  OFFER_OPERATIONS,
  OfferApiError,
  type OfferApi,
  type OfferOperation
} from "../../../packages/referral-client/src/offer-api.js";

const mappings = [
  ["get_referral_payout_policy", "payout_policy"],
  ["get_creator_payout_preferences", "payout_preferences"],
  ["save_creator_payout_preferences", "save_payout_preferences"],
  ["get_referral_programme_payout_balances", "payout_balances"],
  ["prepare_referral_programme_payout", "prepare_payout"],
  ["get_referral_payout_instructions", "payout_instructions"],
  ["get_offer_capabilities", "capabilities"],
  ["list_offer_programmes", "programmes"],
  ["preview_offer", "context"],
  ["get_creator_programme", "creator"],
  ["join_creator_programme", "join"],
  ["claim_creator_code", "code"],
  ["get_customer_offer", "customer"],
  ["apply_customer_offer", "apply"],
  ["remove_customer_offer", "remove"],
  ["preview_offer_purchase", "quote"],
  ["checkout_offer_purchase", "checkout"],
  ["retry_signup_offer", "retry_signup"],
  ["get_offer_programme_performance", "operator_performance"],
  ["list_offer_operator_programmes", "operator_programmes"],
  ["list_offer_operator_codes", "operator_codes"],
  ["list_offer_operator_claims", "operator_claims"],
  ["list_offer_operator_grants", "operator_grants"],
  ["create_offer_programme_draft", "draft"],
  ["configure_offer_provider", "provider"],
  ["set_offer_programme_state", "state"],
  ["create_offer_promotion_code", "promotion_code"],
  ["correct_creator_code", "correct_code"],
  ["block_offer_code", "block_code"],
  ["grant_early_offer_purchase", "early_grant"],
  ["revoke_early_offer_purchase", "revoke_grant"],
  ["revoke_offer_claim", "revoke_claim"]
] as const satisfies readonly (readonly [string, OfferOperation])[];
export const OFFER_MCP_TOOL_NAMES = mappings.map(([name]) => name);
const descriptions: Record<OfferOperation, string> = {
  payout_policy:
    "Read fixed recipient-country, method and settlement-currency choices. Accounting remains in USD.",
  payout_preferences:
    "Read your own accepted programmes and masked payout preferences. Never returns bank destinations.",
  save_payout_preferences:
    "Save your own per-programme payment instructions after explicit user request. Sensitive personal data: never copy it into logs, reports or public content. Requires the exact last-read revision; no transfer occurs.",
  payout_balances:
    "Read available USD earnings and masked setup by programme as a billing-authorised payout operator. Programme delegation grants no payout authority.",
  prepare_payout:
    "Reserve available earnings for exactly one programme and freeze its payment instructions after explicit operator request. Retain and reuse claim_id on retry. Does not initiate a bank transfer.",
  payout_instructions:
    "Explicitly reveal sensitive frozen instructions for one prepared payout as a billing-authorised operator. Audited; never copy details into logs, reports, public output or unrelated tool calls.",
  capabilities: "Read supported versioned offer capabilities.",
  programmes:
    "List public active or scheduled referral and introductory programmes with their exact terms.",
  context:
    "Preview the cheapest eligible public offer, retaining the presented referral code and preferring referrals on price ties. Supply target_plan and interval together for an exact invoice comparison. A preview does not establish eligibility or save a discount.",
  quote:
    "Read-only quote for the current Owner's selected plan and interval. Set include_public_offers=true to discover eligible promotions without a saved claim, preserving any creator; otherwise quote the saved offer. Creates no claim or provider session. Amounts exclude tax, calculated at Checkout.",
  checkout:
    "Start or reconcile the exact signed quoted offer only after explicit human purchase confirmation. May create the confirmed introductory claim and a provider Checkout Session; never call merely to inspect pricing.",
  creator: "Read your own creator programme, branded code, legacy code and share link.",
  join: "Join a versioned referral programme only after the human accepts its exact terms version.",
  code: "Reserve your one memorable creator code. Codes are public and cannot be reassigned to another creator.",
  customer: "Read the verified Owner's current workspace offer and pending public hint.",
  apply:
    "Apply a code to the expected workspace before Checkout. Replacement needs explicit human confirmation; prior paying customers are ineligible.",
  remove:
    "Remove an unreserved customer discount after explicit confirmation. Retains referring partner and history; does not change an issued Checkout.",
  retry_signup:
    "Retry only the current verified signup's already persisted offer intent. Does not claim a newly encountered cookie for an arbitrary account.",
  operator_performance:
    "Read a UTC claim-cohort report of verified cash, actual invoice discounts, commission and reversals. Includes observation coverage; it is not authority to pay.",
  operator_programmes:
    "List programme versions as an explicitly delegated DebugBundle operator, not an ordinary workspace Owner.",
  operator_codes:
    "Page public code ownership and programme bindings as a delegated operator. No private customer identity or credentials.",
  operator_claims:
    "Page minimal customer offer states by public code, workspace or version as a delegated operator.",
  operator_grants:
    "Page early-purchase approval history as a delegated operator. Reasons are private operator support data.",
  draft:
    "Create an immutable programme draft or revision as a delegated operator. Does not activate or publish it.",
  provider:
    "Bind a verified existing Stripe base-only coupon to a draft. Performs read-only provider validation, not coupon creation or payment.",
  state:
    "Change programme lifecycle only after explicit operator instruction. Activation/scheduling automatically prepares or verifies the Stripe discount and freezes terms; it creates no charge. Pausing preserves owed benefits.",
  promotion_code:
    "Reserve an introductory promotion code for one programme version. No stacking or reassignment.",
  correct_code:
    "Correct a creator alias with explicit operator authority and reason. Old aliases remain bound to the same creator.",
  block_code:
    "Block or unblock a public offer code with explicit operator authority and reason. Preserves code ownership, saved claims and financial history.",
  early_grant:
    "Grant one identified offer claim early-purchase permission with explicit operator instruction, reason and expiry. Public codes alone never bypass the wait.",
  revoke_grant:
    "Revoke new early-purchase admission. Cannot revoke an already-issued provider session or undo payment.",
  revoke_claim:
    "Record substantiated offer revocation with explicit operator instruction and reason. Cannot rewrite consumed invoices or earned commission."
};
export const OFFER_MCP_TOOL_CATALOG = mappings.map(([name, key]) => ({
  name,
  group: "referrals" as const,
  annotations: {
    readOnlyHint: OFFER_OPERATIONS[key].read,
    destructiveHint: !OFFER_OPERATIONS[key].read,
    idempotentHint: OFFER_OPERATIONS[key].read,
    openWorldHint: (
      [
        "customer",
        "quote",
        "checkout",
        "apply",
        "retry_signup",
        "provider",
        "state"
      ] as readonly OfferOperation[]
    ).includes(key)
  },
  read: OFFER_OPERATIONS[key].read,
  description: descriptions[key],
  inputSchema: OFFER_OPERATIONS[key].input.extend({
    bearerToken: z.string().min(1),
    ...(OFFER_OPERATIONS[key].operator
      ? { operatorAuthorization: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }
      : {})
  })
}));
export function createOfferMcpTools(
  api: OfferApi
): Record<
  (typeof OFFER_MCP_TOOL_NAMES)[number],
  (input: Record<string, unknown>) => Promise<unknown>
> {
  return Object.fromEntries(
    mappings.map(([name, key]) => [
      name,
      async (raw: Record<string, unknown>) => {
        try {
          const auth = z
            .object({
              bearerToken: z.string().min(1),
              operatorAuthorization: z
                .string()
                .regex(/^[A-Za-z0-9_-]{43}$/)
                .optional()
            })
            .parse(raw);
          const input = { ...raw };
          delete input["bearerToken"];
          delete input["operatorAuthorization"];
          if (OFFER_OPERATIONS[key].operator && !auth.operatorAuthorization)
            throw new Error("operator_authorization_required");
          return await api.execute(key, input, {
            bearerToken: auth.bearerToken,
            ...(auth.operatorAuthorization ? { operatorProof: auth.operatorAuthorization } : {})
          });
        } catch (error) {
          throw new Error(
            `mcp_tool_error:${error instanceof OfferApiError ? error.code : "invalid_offer_input"}`
          );
        }
      }
    ])
  ) as Record<
    (typeof OFFER_MCP_TOOL_NAMES)[number],
    (input: Record<string, unknown>) => Promise<unknown>
  >;
}
