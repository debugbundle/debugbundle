import {
  OfferPerformanceQuerySchema,
  OfferPerformanceReportSchema
} from "../../referrals/src/offer-performance.js";
import {
  OfferCodeInventoryQuerySchema,
  OfferClaimInventoryQuerySchema,
  OfferGrantInventoryQuerySchema,
  OfferCodeInventoryRecordSchema,
  OfferClaimInventoryRecordSchema,
  OfferGrantInventoryRecordSchema
} from "../../referrals/src/offer-inventory-contracts.js";
import { z } from "zod";
import { PublicOfferContextQuerySchema } from "../../referrals/src/offer-choice.js";
import { PAYOUT_OPERATIONS } from "./payout-operations.js";
import {
  CreatorCodeSchema,
  PromotionCodeSchema,
  CreatorProgrammeSchema,
  OfferClaimSchema,
  OfferDefinitionSchema,
  ProgrammeDraftSchema,
  ProgrammeStateSchema,
  ProgrammeVersionSchema,
  PublicOfferCodeSchema,
  PublicOfferPreviewSchema
} from "../../referrals/src/programme-policy.js";
import {
  ReferralHttpUrlSchema,
  CustomerReferralSchema
} from "../../referrals/src/referral-contracts.js";
import {
  OfferPurchaseQuoteSchema,
  OfferQuoteRequestSchema
} from "../../referrals/src/offer-quote-contracts.js";

const empty = z.object({}).strict(),
  ok = z.object({ ok: z.literal(true) }).strict();
const page = z
  .object({ limit: z.number().int().min(1).max(100).default(25), before: z.uuid().optional() })
  .strict();
const creator = z
  .object({
    creator: CreatorProgrammeSchema.nullable(),
    share_url: ReferralHttpUrlSchema.nullable()
  })
  .strict();
const claim = z
  .object({
    claim: OfferClaimSchema.nullable(),
    legacy_attribution: CustomerReferralSchema.optional()
  })
  .strict()
  .refine((value) => value.claim !== null || value.legacy_attribution !== undefined);
const intent = z
  .object({
    intent: z
      .object({
        code: PublicOfferCodeSchema,
        status: z.enum(["pending", "completed", "rejected", "expired"])
      })
      .strict()
      .nullable()
  })
  .strict();
/** Explicit new interface: strict legacy referral schemas stay unchanged. This
 * registry supplies client validation and ordinary CLI/MCP operation parity. */
export const OFFER_OPERATIONS = {
  ...PAYOUT_OPERATIONS,
  capabilities: {
    method: "GET",
    path: "/v2/offers/capabilities",
    input: empty,
    response: z.object({ enabled: z.boolean() }).strict(),
    read: true,
    operator: false
  },
  programmes: {
    method: "GET",
    path: "/v2/offers/programmes",
    input: page,
    response: z.object({ programmes: z.array(OfferDefinitionSchema).max(100) }).strict(),
    read: true,
    operator: false
  },
  context: {
    method: "GET",
    path: "/v2/offers/context",
    input: PublicOfferContextQuerySchema,
    response: z.object({ offer: PublicOfferPreviewSchema.nullable() }).strict(),
    read: true,
    operator: false
  },
  creator: {
    method: "GET",
    path: "/v2/offers/creator",
    input: empty,
    response: creator,
    read: true,
    operator: false
  },
  join: {
    method: "POST",
    path: "/v2/offers/creator",
    input: z.object({ version_id: z.uuid(), terms_version: z.string().min(1).max(100) }).strict(),
    response: creator,
    read: false,
    operator: false
  },
  code: {
    method: "POST",
    path: "/v2/offers/creator/code",
    input: z.object({ code: CreatorCodeSchema }).strict(),
    response: creator,
    read: false,
    operator: false
  },
  customer: {
    method: "GET",
    path: "/v2/offers/customer",
    input: empty,
    response: z
      .object({
        claim: OfferClaimSchema.nullable(),
        legacy_attribution: CustomerReferralSchema.nullable().optional(),
        legacy_discount_eligible: z.boolean().optional(),
        pending: PublicOfferPreviewSchema.nullable(),
        early_purchase_allowed: z.boolean()
      })
      .strict(),
    read: true,
    operator: false
  },
  quote: {
    method: "POST",
    path: "/v2/offers/quote",
    input: OfferQuoteRequestSchema,
    response: z.object({ quote: OfferPurchaseQuoteSchema }).strict(),
    read: true,
    operator: false
  },
  checkout: {
    method: "POST",
    path: "/v2/offers/checkout",
    input: z.object({ confirmation_token: z.string().min(1).max(8192) }).strict(),
    response: z.object({ url: ReferralHttpUrlSchema }).strict(),
    read: false,
    operator: false
  },
  apply: {
    method: "POST",
    path: "/v2/offers/customer",
    input: z
      .object({
        code: PublicOfferCodeSchema,
        expected_organization_id: z.uuid(),
        explicit_correction: z.boolean().default(false)
      })
      .strict(),
    response: claim,
    read: false,
    operator: false
  },
  remove: {
    method: "POST",
    path: "/v2/offers/customer/remove",
    input: z.object({ expected_organization_id: z.uuid(), confirmed: z.literal(true) }).strict(),
    response: ok,
    read: false,
    operator: false
  },
  retry_signup: {
    method: "POST",
    path: "/v2/offers/signup-intent/retry",
    input: empty,
    response: intent,
    read: false,
    operator: false
  },
  operator_performance: {
    method: "GET",
    path: "/v2/offers/operator/performance",
    input: OfferPerformanceQuerySchema,
    response: z.object({ performance: OfferPerformanceReportSchema }).strict(),
    read: true,
    operator: true
  },
  operator_programmes: {
    method: "GET",
    path: "/v2/offers/operator/programmes",
    input: page,
    response: z.object({ programmes: z.array(ProgrammeVersionSchema).max(100) }).strict(),
    read: true,
    operator: true
  },
  operator_codes: {
    method: "GET",
    path: "/v2/offers/operator/codes",
    input: OfferCodeInventoryQuerySchema,
    response: z.object({ codes: z.array(OfferCodeInventoryRecordSchema).max(100) }).strict(),
    read: true,
    operator: true
  },
  operator_claims: {
    method: "GET",
    path: "/v2/offers/operator/claims",
    input: OfferClaimInventoryQuerySchema,
    response: z.object({ claims: z.array(OfferClaimInventoryRecordSchema).max(100) }).strict(),
    read: true,
    operator: true
  },
  operator_grants: {
    method: "GET",
    path: "/v2/offers/operator/early-grants",
    input: OfferGrantInventoryQuerySchema,
    response: z.object({ grants: z.array(OfferGrantInventoryRecordSchema).max(100) }).strict(),
    read: true,
    operator: true
  },
  draft: {
    method: "POST",
    path: "/v2/offers/operator/programmes",
    input: ProgrammeDraftSchema.safeExtend({ programme_id: z.uuid().optional() }),
    response: z.object({ programme: ProgrammeVersionSchema }).strict(),
    read: false,
    operator: true
  },
  provider: {
    method: "POST",
    path: "/v2/offers/operator/programmes/:version_id/provider",
    input: z
      .object({
        version_id: z.uuid(),
        coupon_id: z.string().min(1).max(255),
        livemode: z.boolean()
      })
      .strict(),
    response: ok,
    read: false,
    operator: true
  },
  state: {
    method: "POST",
    path: "/v2/offers/operator/programmes/:version_id/state",
    input: z
      .object({
        version_id: z.uuid(),
        state: ProgrammeStateSchema,
        expected_state: ProgrammeStateSchema,
        acknowledge_unlimited: z.boolean()
      })
      .strict(),
    response: z.object({ programme: ProgrammeVersionSchema }).strict(),
    read: false,
    operator: true
  },
  promotion_code: {
    method: "POST",
    path: "/v2/offers/operator/promotion-codes",
    input: z.object({ version_id: z.uuid(), code: PromotionCodeSchema }).strict(),
    response: ok,
    read: false,
    operator: true
  },
  correct_code: {
    method: "POST",
    path: "/v2/offers/operator/creator-codes",
    input: z
      .object({
        partner_id: z.uuid(),
        code: CreatorCodeSchema,
        reason: z.string().trim().min(1).max(300)
      })
      .strict(),
    response: z.object({ code: PublicOfferCodeSchema }).strict(),
    read: false,
    operator: true
  },
  block_code: {
    method: "POST",
    path: "/v2/offers/operator/codes/block",
    input: z
      .object({
        code: PublicOfferCodeSchema,
        blocked: z.boolean(),
        reason: z.string().trim().min(1).max(300)
      })
      .strict(),
    response: ok,
    read: false,
    operator: true
  },
  early_grant: {
    method: "POST",
    path: "/v2/offers/operator/early-grants",
    input: z
      .object({
        claim_id: z.uuid(),
        expires_at: z.string().datetime(),
        reason: z.string().trim().min(1).max(300)
      })
      .strict(),
    response: z.object({ grant_id: z.uuid(), expires_at: z.string().datetime() }).strict(),
    read: false,
    operator: true
  },
  revoke_grant: {
    method: "POST",
    path: "/v2/offers/operator/early-grants/:grant_id/revoke",
    input: z.object({ grant_id: z.uuid() }).strict(),
    response: ok,
    read: false,
    operator: true
  },
  revoke_claim: {
    method: "POST",
    path: "/v2/offers/operator/claims/:claim_id/revoke",
    input: z.object({ claim_id: z.uuid(), reason: z.string().trim().min(1).max(300) }).strict(),
    response: ok,
    read: false,
    operator: true
  }
} as const;
export type OfferOperation = keyof typeof OFFER_OPERATIONS;
export interface OfferHttpClient {
  request(input: {
    method: "GET" | "POST";
    path: string;
    bearerToken: string;
    operatorProof?: string;
    body?: unknown;
  }): Promise<{ status: number; body: unknown }>;
}
export class OfferApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string
  ) {
    super(`offer_api_error:${status}:${code}`);
    this.name = "OfferApiError";
  }
}
export function createOfferApi(client: OfferHttpClient): OfferApi {
  return {
    async execute<K extends OfferOperation>(
      name: K,
      raw: unknown,
      auth: { bearerToken: string; operatorProof?: string } = { bearerToken: "" }
    ): Promise<z.output<(typeof OFFER_OPERATIONS)[K]["response"]>> {
      const operation = OFFER_OPERATIONS[name],
        input = operation.input.parse(raw) as Record<string, unknown>;
      let path: string = operation.path;
      const body = { ...input };
      for (const [key, value] of Object.entries(input))
        if (path.includes(`:${key}`)) {
          path = path.replace(`:${key}`, encodeURIComponent(String(value)));
          delete body[key];
        }
      if (operation.method === "GET" && Object.keys(body).length)
        path += `?${new URLSearchParams(
          Object.entries(body)
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => [k, String(v)])
        )}`;
      const response = await client.request({
        method: operation.method,
        path,
        bearerToken: auth.bearerToken,
        ...(auth.operatorProof ? { operatorProof: auth.operatorProof } : {}),
        ...(operation.method === "POST" ? { body } : {})
      });
      if (response.status < 200 || response.status >= 300) {
        const error = z
          .object({
            error: z
              .string()
              .regex(/^[a-z_]+$/)
              .max(100)
          })
          .safeParse(response.body);
        throw new OfferApiError(
          response.status,
          error.success ? error.data.error : "offer_request_failed"
        );
      }
      const parsed = operation.response.safeParse(response.body);
      if (!parsed.success) throw new OfferApiError(502, "invalid_offer_response");
      return parsed.data as z.output<(typeof OFFER_OPERATIONS)[K]["response"]>;
    }
  };
}
export interface OfferApi {
  execute<K extends OfferOperation>(
    name: K,
    raw: unknown,
    auth?: { bearerToken: string; operatorProof?: string }
  ): Promise<z.output<(typeof OFFER_OPERATIONS)[K]["response"]>>;
}
