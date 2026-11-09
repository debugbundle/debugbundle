import { z } from "zod";
import {
  ReferralAuthSchema,
  ReferralJoinInputSchema,
  ReferralClientsInputSchema,
  ReferralApplyInputSchema,
  ReferralPartnerResponseSchema,
  ReferralJoinResponseSchema,
  ReferralClientsResponseSchema,
  ReferralCustomerResponseSchema,
  ReferralAttributionResponseSchema,
  type ReferralPartnerResponse,
  type ReferralClient,
  type ReferralCustomerResponse,
  type CustomerReferral
} from "../../referrals/src/referral-contracts.js";
import {
  ReferralEarningsResponseSchema,
  ReferralPayoutSchema,
  ReferralPartnerEarningsSchema,
  ReferralPayoutReadInputSchema,
  ReferralOperatorPayoutReadInputSchema,
  ReferralPayoutClaimInputSchema,
  ReferralPayoutBatchInputSchema,
  ReferralPayoutRecordInputSchema,
  type ReferralEarningsResponse,
  type ReferralPayout,
  type ReferralPartnerEarnings
} from "../../referrals/src/referral-ledger-contracts.js";

export interface ReferralHttpClient {
  request(input: {
    method: "GET" | "POST";
    path: string;
    bearerToken: string;
    body?: unknown;
  }): Promise<{ status: number; body: unknown }>;
}
export class ReferralApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string
  ) {
    super(`referral_api_error:${status}:${code}`);
    this.name = "ReferralApiError";
  }
}
export interface ReferralApi {
  earnings(input: z.infer<typeof ReferralAuthSchema>): Promise<ReferralEarningsResponse>;
  payouts(input: z.input<typeof ReferralPayoutReadInputSchema>): Promise<ReferralPayout[]>;
  operatorBalances(
    input: z.input<typeof ReferralPayoutReadInputSchema>
  ): Promise<ReferralPartnerEarnings[]>;
  operatorPayouts(
    input: z.input<typeof ReferralOperatorPayoutReadInputSchema>
  ): Promise<ReferralPayout[]>;
  claimPayout(input: z.infer<typeof ReferralPayoutClaimInputSchema>): Promise<ReferralPayout>;
  markPayoutUncertain(
    input: z.infer<typeof ReferralPayoutBatchInputSchema>
  ): Promise<ReferralPayout>;
  recordPayout(input: z.infer<typeof ReferralPayoutRecordInputSchema>): Promise<ReferralPayout>;
  partner(input: z.infer<typeof ReferralAuthSchema>): Promise<ReferralPartnerResponse>;
  join(
    input: z.infer<typeof ReferralJoinInputSchema>
  ): Promise<z.infer<typeof ReferralJoinResponseSchema>>;
  clients(input: z.infer<typeof ReferralClientsInputSchema>): Promise<ReferralClient[]>;
  customer(input: z.infer<typeof ReferralAuthSchema>): Promise<ReferralCustomerResponse>;
  apply(input: z.infer<typeof ReferralApplyInputSchema>): Promise<CustomerReferral>;
}

export function createReferralApi(client: ReferralHttpClient): ReferralApi {
  const payoutsSchema = z.object({ payouts: z.array(ReferralPayoutSchema).max(100) }).strict();
  const payoutSchema = z.object({ payout: ReferralPayoutSchema }).strict();
  function pagePath(
    resource: string,
    input: { limit: number; before?: string | undefined; partnerId?: string | undefined }
  ): string {
    const query = new URLSearchParams({ limit: String(input.limit) });
    if (input.before !== undefined) query.set("before", input.before);
    if (input.partnerId !== undefined) query.set("partner_id", input.partnerId);
    return `${resource}?${query}`;
  }
  async function request<T>(
    bearerToken: string,
    method: "GET" | "POST",
    resource: string,
    schema: z.ZodType<T>,
    body?: unknown
  ): Promise<T> {
    const response = await client.request({
      bearerToken,
      method,
      path: `/v1/referrals/${resource}`,
      ...(body === undefined ? {} : { body })
    });
    if (response.status < 200 || response.status >= 300) {
      const error = z
        .object({ error: z.string().regex(/^[a-z_]{1,100}$/) })
        .safeParse(response.body);
      throw new ReferralApiError(
        response.status,
        error.success ? error.data.error : "unknown_error"
      );
    }
    const parsed = schema.safeParse(response.body);
    if (!parsed.success) throw new ReferralApiError(502, "invalid_response");
    return parsed.data;
  }
  return {
    async earnings(raw) {
      const input = ReferralAuthSchema.parse(raw);
      return request(input.bearerToken, "GET", "earnings", ReferralEarningsResponseSchema);
    },
    async payouts(raw) {
      const input = ReferralPayoutReadInputSchema.parse(raw);
      return (await request(input.bearerToken, "GET", pagePath("payouts", input), payoutsSchema))
        .payouts;
    },
    async operatorBalances(raw) {
      const input = ReferralPayoutReadInputSchema.parse(raw);
      return (
        await request(
          input.bearerToken,
          "GET",
          pagePath("operator/balances", input),
          z.object({ partners: z.array(ReferralPartnerEarningsSchema).max(100) }).strict()
        )
      ).partners;
    },
    async operatorPayouts(raw) {
      const input = ReferralOperatorPayoutReadInputSchema.parse(raw);
      return (
        await request(input.bearerToken, "GET", pagePath("operator/payouts", input), payoutsSchema)
      ).payouts;
    },
    async claimPayout(raw) {
      const input = ReferralPayoutClaimInputSchema.parse(raw);
      const result = (
        await request(input.bearerToken, "POST", "operator/payouts/claim", payoutSchema, {
          partner_id: input.partnerId,
          claim_id: input.claimId
        })
      ).payout;
      if (result.batch_id !== input.claimId || result.partner_id !== input.partnerId)
        throw new ReferralApiError(502, "invalid_response");
      return result;
    },
    async markPayoutUncertain(raw) {
      const input = ReferralPayoutBatchInputSchema.parse(raw);
      const result = (
        await request(
          input.bearerToken,
          "POST",
          `operator/payouts/${input.batchId}/uncertain`,
          payoutSchema,
          {}
        )
      ).payout;
      if (result.batch_id !== input.batchId || result.status !== "uncertain")
        throw new ReferralApiError(502, "invalid_response");
      return result;
    },
    async recordPayout(raw) {
      const input = ReferralPayoutRecordInputSchema.parse(raw);
      const result = (
        await request(
          input.bearerToken,
          "POST",
          `operator/payouts/${input.batchId}/paid`,
          payoutSchema,
          { external_reference: input.externalReference, confirmed_external_payment: true }
        )
      ).payout;
      if (
        result.batch_id !== input.batchId ||
        result.status !== "paid" ||
        result.external_reference !== input.externalReference ||
        result.paid_at === null
      )
        throw new ReferralApiError(502, "invalid_response");
      return result;
    },
    async partner(raw) {
      const input = ReferralAuthSchema.parse(raw);
      return request(input.bearerToken, "GET", "partner", ReferralPartnerResponseSchema);
    },
    async join(raw) {
      const input = ReferralJoinInputSchema.parse(raw);
      return request(input.bearerToken, "POST", "partner", ReferralJoinResponseSchema, {
        terms_version: input.termsVersion
      });
    },
    async clients(raw) {
      const input = ReferralClientsInputSchema.parse(raw);
      const query = new URLSearchParams();
      if (input.limit !== undefined) query.set("limit", String(input.limit));
      if (input.before !== undefined) query.set("before", input.before);
      return (
        await request(
          input.bearerToken,
          "GET",
          `clients${query.size ? `?${query}` : ""}`,
          ReferralClientsResponseSchema
        )
      ).clients;
    },
    async customer(raw) {
      const input = ReferralAuthSchema.parse(raw);
      return request(input.bearerToken, "GET", "attribution", ReferralCustomerResponseSchema);
    },
    async apply(raw) {
      const input = ReferralApplyInputSchema.parse(raw);
      return (
        await request(input.bearerToken, "POST", "attribution", ReferralAttributionResponseSchema, {
          code: input.code,
          explicit_correction: input.explicitCorrection ?? false,
          ...(input.expectedOrganizationId === undefined
            ? {}
            : { expected_organization_id: input.expectedOrganizationId })
        })
      ).attribution;
    }
  };
}
