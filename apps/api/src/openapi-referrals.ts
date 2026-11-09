import { z } from "zod";
import {
  ReferralPartnerResponseSchema,
  ReferralJoinResponseSchema,
  ReferralClientsResponseSchema,
  ReferralCustomerResponseSchema,
  ReferralAttributionResponseSchema,
  ReferralCodeSchema
} from "../../../packages/referrals/src/referral-contracts.js";
import { apiError } from "./openapi-components.js";
import { anyMemberAuth, component, type OperationSpec } from "./openapi-model.js";
import {
  ReferralEarningsResponseSchema,
  ReferralPayoutSchema,
  ReferralPartnerEarningsSchema,
  ReferralPayoutPageSchema,
  ReferralOperatorPayoutPageSchema,
  ReferralPayoutClaimSchema,
  ReferralPayoutRecordSchema
} from "../../../packages/referrals/src/referral-ledger-contracts.js";

const failures = {
  "400": { description: "Invalid code, terms version or input.", schema: apiError },
  "401": { description: "Member authentication required.", schema: apiError },
  "403": {
    description:
      "Verified identity or current Owner authority required; restricted tokens cannot access personal finances.",
    schema: apiError
  },
  "409": {
    description: "Prior paid customer, frozen attribution or explicit correction required.",
    schema: apiError
  },
  "404": { description: "Payout record is unavailable.", schema: apiError },
  "429": { description: "Management rate limit exceeded.", schema: apiError },
  "503": {
    description: "Programme disabled or eligibility cannot be verified safely.",
    schema: apiError
  }
};
export function referralOperations(): OperationSpec[] {
  const metadata = { tags: ["Referrals"], security: anyMemberAuth };
  return [
    ...referralFinanceOperations(),
    {
      ...metadata,
      method: "get",
      path: "/v1/referrals/partner",
      operationId: "getReferralPartner",
      summary: "Read your personal partner status and terms",
      responses: {
        ...failures,
        "200": {
          description: "Personal partner profile or null, with public share link.",
          schema: component("ReferralPartnerResponse", ReferralPartnerResponseSchema)
        }
      }
    },
    {
      ...metadata,
      method: "post",
      path: "/v1/referrals/partner",
      operationId: "joinReferralProgram",
      summary: "Join after explicit acceptance of the current terms version",
      requestBody: component(
        "ReferralJoinBody",
        z.object({ terms_version: z.string().min(1).max(100) }).strict()
      ),
      responses: {
        ...failures,
        "200": {
          description: "Idempotently enrolled verified partner; Free users may join.",
          schema: component("ReferralJoinResponse", ReferralJoinResponseSchema)
        }
      }
    },
    {
      ...metadata,
      method: "get",
      path: "/v1/referrals/clients",
      operationId: "listReferralClients",
      summary: "List only your minimal referred client records",
      query: z
        .object({
          limit: z.coerce.number().int().min(1).max(100).default(25),
          before: z.uuid().optional()
        })
        .strict(),
      responses: {
        ...failures,
        "200": {
          description: "Opaque client IDs, dates and statuses; no private customer data.",
          schema: component("ReferralClientsResponse", ReferralClientsResponseSchema)
        }
      }
    },
    {
      ...metadata,
      method: "get",
      path: "/v1/referrals/attribution",
      operationId: "getCustomerReferral",
      summary: "Read the verified current Owner's customer referral",
      responses: {
        ...failures,
        "200": {
          description: "Saved attribution and valid pending link code.",
          schema: component("ReferralCustomerResponse", ReferralCustomerResponseSchema)
        }
      }
    },
    {
      ...metadata,
      method: "post",
      path: "/v1/referrals/attribution",
      operationId: "applyCustomerReferral",
      summary: "Save an eligible new customer's Business referral before checkout",
      requestBody: component(
        "ReferralAttributionBody",
        z
          .object({
            code: ReferralCodeSchema,
            explicit_correction: z.boolean().default(false),
            expected_organization_id: z.uuid().optional()
          })
          .strict()
      ),
      responses: {
        ...failures,
        "200": {
          description: "Attribution saved by the verified Owner; eligibility is read server-side.",
          schema: component("ReferralAttributionResponse", ReferralAttributionResponseSchema)
        }
      }
    },
    {
      tags: ["Referrals"],
      security: [],
      method: "get",
      path: "/v1/referrals/visit/{code}",
      operationId: "visitReferralLink",
      summary:
        "Remember the first valid referral for 30 days and redirect to the configured landing page",
      params: z.object({ code: ReferralCodeSchema }),
      responses: {
        "302": {
          description:
            "Fixed landing redirect; signed HttpOnly SameSite cookie contains no private identity.",
          headers: {
            Location: { description: "Configured product landing page.", schema: z.httpUrl() }
          }
        },
        "429": failures["429"]
      }
    }
  ];
}

function referralFinanceOperations(): OperationSpec[] {
  const metadata = { tags: ["Referrals"], security: anyMemberAuth };
  const payout = component(
    "ReferralPayoutResponse",
    z.object({ payout: ReferralPayoutSchema }).strict()
  );
  const payouts = component(
    "ReferralPayoutList",
    z.object({ payouts: z.array(ReferralPayoutSchema).max(100) }).strict()
  );
  const query = ReferralPayoutPageSchema.extend({
    limit: z.coerce.number().int().min(1).max(100).default(25)
  });
  const params = z.object({ id: z.uuid() }).strict();
  return [
    {
      ...metadata,
      method: "get",
      path: "/v1/referrals/earnings",
      operationId: "getReferralEarnings",
      summary: "Read only your own verified partner earnings and operator availability",
      responses: {
        ...failures,
        "200": {
          description: "Personal balance or null, independent of workspace role.",
          schema: component("ReferralEarningsResponse", ReferralEarningsResponseSchema)
        }
      }
    },
    {
      ...metadata,
      method: "get",
      path: "/v1/referrals/payouts",
      operationId: "listReferralPayouts",
      summary: "List only your own partner payout records",
      query,
      responses: {
        ...failures,
        "200": { description: "Bounded personal manual payout history.", schema: payouts }
      }
    },
    {
      ...metadata,
      method: "get",
      path: "/v1/referrals/operator/balances",
      operationId: "listReferralOperatorBalances",
      summary:
        "List balances as a verified configured DebugBundle operator; workspace Owner/Admin is insufficient",
      query,
      responses: {
        ...failures,
        "200": {
          description: "Bounded partner codes and USD balances; no private client data.",
          schema: component(
            "ReferralOperatorBalances",
            z.object({ partners: z.array(ReferralPartnerEarningsSchema).max(100) }).strict()
          )
        }
      }
    },
    {
      ...metadata,
      method: "get",
      path: "/v1/referrals/operator/payouts",
      operationId: "listReferralOperatorPayouts",
      summary: "List manual payout batches as a configured DebugBundle operator",
      query: ReferralOperatorPayoutPageSchema.extend({
        limit: z.coerce.number().int().min(1).max(100).default(25)
      }),
      responses: {
        ...failures,
        "200": {
          description: "Operator-visible claimed, uncertain and paid batches.",
          schema: payouts
        }
      }
    },
    {
      ...metadata,
      method: "post",
      path: "/v1/referrals/operator/payouts/claim",
      operationId: "claimReferralPayout",
      summary:
        "Reserve the available USD balance with a stable claim UUID; operator only, no transfer",
      requestBody: component("ReferralPayoutClaimBody", ReferralPayoutClaimSchema),
      responses: {
        ...failures,
        "200": {
          description:
            "Frozen batch and amount for external review. Retrying the same claim ID is idempotent.",
          schema: payout
        }
      }
    },
    {
      ...metadata,
      method: "post",
      path: "/v1/referrals/operator/payouts/{id}/uncertain",
      operationId: "markReferralPayoutUncertain",
      summary: "Keep an uncertain external payment claimed for operator reconciliation",
      params,
      requestBody: component("ReferralPayoutUncertainBody", z.object({}).strict()),
      responses: {
        ...failures,
        "200": {
          description: "Uncertain batch remains claimed; no external retry or release.",
          schema: payout
        }
      }
    },
    {
      ...metadata,
      method: "post",
      path: "/v1/referrals/operator/payouts/{id}/paid",
      operationId: "recordReferralPayout",
      summary:
        "Record a verified externally completed payment after explicit operator confirmation",
      params,
      requestBody: component(
        "ReferralPayoutPaidBody",
        ReferralPayoutRecordSchema.omit({ batch_id: true }).extend({
          confirmed_external_payment: z.literal(true)
        })
      ),
      responses: {
        ...failures,
        "200": {
          description: "Immutable paid reference recorded; this action never initiates a transfer.",
          schema: payout
        }
      }
    }
  ];
}
