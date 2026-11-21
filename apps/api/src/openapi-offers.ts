import { z } from "zod";
import {
  OFFER_OPERATIONS,
  type OfferOperation
} from "../../../packages/referral-client/src/offer-api.js";
import {
  PublicOfferCodeSchema,
  PublicOfferPreviewSchema
} from "../../../packages/referrals/src/programme-policy.js";
import {
  OfferDelegationIssueSchema,
  OfferDelegationSchema
} from "../../../packages/referrals/src/offer-operator-contracts.js";
import { apiError } from "./openapi-components.js";
import {
  ReferralVisitCaptureSchema,
  ReferralVisitConfirmSchema,
  ReferralVisitReceiptSchema
} from "../../../packages/referrals/src/referral-visit-contract.js";
import {
  anyMemberAuth,
  browserSessionAuth,
  component,
  type OperationSpec
} from "./openapi-model.js";
const summaries: Record<OfferOperation, string> = {
  payout_policy: "Read product-wide payout methods, currencies and recipient countries",
  payout_preferences: "Read your accepted programmes and masked payout setup",
  save_payout_preferences:
    "Save encrypted payment preferences for your own programme with an exact revision",
  payout_balances: "Read programme-specific available USD balances as a billing payout operator",
  prepare_payout: "Prepare one programme payout and freeze the selected payment instructions",
  payout_instructions:
    "Reveal sensitive frozen payment instructions as a billing payout operator; audited and never cached",
  capabilities: "Read whether new programme claims are enabled",
  programmes: "List currently available programme terms",
  context:
    "Preview the cheapest eligible code/promotion; supply target_plan and interval together for exact prices. Referrals win ties.",
  creator: "Read your accepted creator programme and codes",
  join: "Join after explicit acceptance of the exact programme terms",
  code: "Reserve a branded creator code or replace it once with the expected current code",
  creator_code_status: "Read whether your preferred branded creator code can be replaced",
  creator_analytics:
    "Read private aggregate link visits and referral activity over 7, 30 or 90 UTC days",
  customer: "Read the verified Owner's saved workspace offer",
  quote:
    "Review exact initial and renewal amounts; include_public_offers opts into read-only discovery without a saved claim",
  checkout: "Confirm or reconcile the exact signed introductory purchase",
  apply: "Apply or explicitly replace an eligible workspace offer",
  remove: "Explicitly remove an unused workspace discount",
  retry_signup: "Retry only the current verified signup's durable offer intent",
  operator_performance:
    "Read bounded UTC claim-cohort performance from verified financial projections",
  operator_programmes: "List immutable programme versions as an authorised operator",
  operator_codes: "Page public code ownership and programme bindings as an authorised operator",
  operator_claims: "Page minimal customer offer states as an authorised operator",
  operator_grants: "Page early-purchase approval history as an authorised operator",
  draft:
    "Create an immutable draft with an optional promotion_code saved atomically; code conflicts roll back the draft",
  provider: "Validate and bind an existing base-only Stripe coupon",
  state: "Explicitly activate, schedule, pause or end a programme",
  promotion_code: "Reserve a permanent promotional code",
  correct_code: "Correct a creator alias with a retained reason and old aliases",
  block_code: "Block or unblock new use of a public code with a reason",
  early_grant: "Approve temporary early purchase for one verified saved claim",
  revoke_grant: "Revoke new early-purchase admission",
  revoke_claim: "Revoke an unused offer while preserving financial records"
};
const failures = {
  "400": { description: "Invalid bounded input.", schema: apiError },
  "401": {
    description: "Verified session or unrestricted member credential required.",
    schema: apiError
  },
  "403": {
    description: "Owner, scope, exact Origin or CSRF requirement failed.",
    schema: apiError
  },
  "404": { description: "Operator authority or resource unavailable.", schema: apiError },
  "409": {
    description: "Eligibility, immutable selection, claim limit or explicit confirmation conflict.",
    schema: apiError
  },
  "429": { description: "Rate limit exceeded.", schema: apiError },
  "503": {
    description: "Offer or provider eligibility could not be confirmed safely.",
    schema: apiError
  }
};
const publicNames = new Set<OfferOperation>(["capabilities", "programmes", "context"]);
const publicResponse = z.object({ offer: PublicOfferPreviewSchema.nullable() }).strict();
export function offerOperations(): OperationSpec[] {
  const operations: OperationSpec[] = Object.entries(OFFER_OPERATIONS).map(([name, operation]) => {
    const params = Object.fromEntries(
      [...operation.path.matchAll(/:(\w+)/g)].map((match) => [match[1]!, z.uuid()])
    );
    const input = operation.input as z.ZodObject<Record<string, z.ZodType>>;
    const body = z
      .object(Object.fromEntries(Object.entries(input.shape).filter(([key]) => !(key in params))))
      .strict();
    return {
      method: operation.method === "GET" ? "get" : "post",
      path: operation.path.replace(/:(\w+)/g, "{$1}"),
      operationId: `offer_${name}`,
      summary: summaries[name as OfferOperation],
      tags: ["Referrals"],
      security: publicNames.has(name as OfferOperation)
        ? []
        : operation.operator
          ? [...browserSessionAuth, { memberBearerToken: [], offerOperatorAuthorization: [] }]
          : anyMemberAuth,
      ...(Object.keys(params).length ? { params: z.object(params) } : {}),
      ...(operation.method === "GET"
        ? { query: input }
        : { requestBody: component(`Offer_${name}_Input`, body) }),
      responses: {
        ...failures,
        "200": {
          description:
            "Validated result; private, no-store. Operator bearer calls also require a live, explicitly browser-issued, action-scoped 15-minute proof. New claims and financial obligations are separate.",
          schema: component(`Offer_${name}_Response`, operation.response)
        }
      }
    };
  });
  operations.push({
    method: "get",
    path: "/v2/offers/visit/{code}",
    operationId: "visitOffer",
    summary:
      "Remember the first valid pending code for 30 days and redirect only to the configured site",
    tags: ["Referrals"],
    security: [],
    params: z.object({ code: PublicOfferCodeSchema }),
    responses: {
      ...failures,
      "302": {
        description:
          "Configured destination, with a signed host-only HttpOnly cookie when a new hint is accepted.",
        headers: {
          Location: {
            description:
              "Configured public site destination. The server may add the public code as a visit hint. Caller query destinations are ignored.",
            schema: z.url()
          },
          "Set-Cookie": {
            description: "Public-code hint only; grants no account or early-purchase authority.",
            schema: z.string()
          }
        }
      }
    }
  });
  for (const operation of [
    {
      path: "visit-receipts",
      name: "captureReferralVisit",
      summary: "Issue or reuse a signed anonymous referral-link visit receipt for up to 24 hours",
      input: ReferralVisitCaptureSchema,
      output: z.object({ visit: ReferralVisitReceiptSchema.nullable() }).strict()
    },
    {
      path: "visits",
      name: "confirmReferralVisit",
      summary: "Confirm a referral-link landing once per signed receipt",
      input: ReferralVisitConfirmSchema,
      output: z.object({ recorded: z.boolean() }).strict()
    }
  ])
    operations.push({
      method: "post",
      path: `/v2/offers/${operation.path}`,
      operationId: operation.name,
      summary: operation.summary,
      tags: ["Referrals"],
      security: [],
      requestBody: component(`${operation.name}Input`, operation.input),
      responses: {
        "400": failures["400"],
        "403": { description: "Exact public site Origin is required.", schema: apiError },
        "413": { description: "The request exceeds 2 KiB.", schema: apiError },
        "429": failures["429"],
        "200": {
          description:
            "Anonymous first-party measurement. Exact public site Origin is required. No attribution or account authority.",
          schema: component(`${operation.name}Result`, operation.output)
        }
      }
    });
  for (const method of ["post", "delete"] as const)
    operations.push({
      method,
      path: "/v2/offers/pending",
      operationId: `${method}PendingOffer`,
      summary:
        method === "post"
          ? "Explicitly choose a pending public code without claiming an account benefit"
          : "Remove a pending public-code hint",
      tags: ["Referrals"],
      security: [],
      ...(method === "post"
        ? {
            requestBody: component(
              "PendingOfferInput",
              z
                .object({
                  code: PublicOfferCodeSchema,
                  explicit_correction: z.boolean().default(false)
                })
                .strict()
            )
          }
        : {}),
      responses: {
        ...failures,
        "200": {
          description:
            "Anonymous hint only. Exact configured public/app Origin is mandatory. Does not establish eligibility, save a claim or bypass purchase protection.",
          schema: component("PendingOfferResponse", publicResponse)
        }
      }
    });
  operations.push({
    method: "get",
    path: "/v2/offers/operator/access-status",
    operationId: "getOfferOperatorAccessStatus",
    summary: "Check the signed-in allowlisted operator's email-authentication readiness",
    tags: ["Referrals"],
    security: browserSessionAuth,
    responses: {
      ...failures,
      "200": {
        description: "Disallowed identities receive 404.",
        schema: component(
          "OfferOperatorAccessStatus",
          z.object({ status: z.enum(["ready", "email_auth_required"]) }).strict()
        )
      }
    }
  });
  operations.push({
    method: "post",
    path: "/v2/offers/operator/delegations",
    operationId: "issueOfferOperatorDelegation",
    summary:
      "Explicitly issue 15-minute programme-only authority from an email-code browser session",
    tags: ["Referrals"],
    security: browserSessionAuth,
    requestBody: component("OfferDelegationIssue", OfferDelegationIssueSchema),
    responses: {
      ...failures,
      "200": {
        description:
          "Proof shown once and stored only as a hash. Bound to this user, active verified email-code session, unrestricted member token and named actions. No automatic refresh; no Analytics or payout authority.",
        schema: component("OfferDelegation", OfferDelegationSchema)
      }
    }
  });
  operations.push({
    method: "post",
    path: "/v2/offers/operator/delegations/revoke",
    operationId: "revokeOfferOperatorDelegation",
    summary: "Revoke your temporary programme authorisation",
    tags: ["Referrals"],
    security: browserSessionAuth,
    requestBody: component(
      "OfferDelegationRevoke",
      z.object({ operator_authorization: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict()
    ),
    responses: {
      ...failures,
      "200": {
        description: "Revoked proof cannot authorise further actions.",
        schema: component("OfferOperationOk", z.object({ ok: z.literal(true) }).strict())
      }
    }
  });
  return operations;
}
