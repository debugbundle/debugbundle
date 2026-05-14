import { z } from "zod";

export const BillingUsageMetricSchema = z
  .object({
    used: z.number().int().nonnegative(),
    limit: z.number().int().nonnegative()
  })
  .strict();

export const BillingSummarySchema = z
  .object({
    plan: z.enum(["free", "solo", "team"]),
    stripe_customer_id: z.string().nullable(),
    active_projects: z.number().int().nonnegative(),
    capacity_units: z
      .object({
        total: z.number().int().nonnegative(),
        included: z.number().int().nonnegative(),
        additional_purchased: z.number().int().nonnegative(),
        pending_reduction: z
          .object({
            additional_purchased: z.number().int().nonnegative(),
            total: z.number().int().nonnegative(),
            effective_at: z.string()
          })
          .nullable()
      })
      .strict(),
    usage_window: z
      .object({
        starts_at: z.string(),
        ends_at: z.string()
      })
      .strict(),
    allowances: z
      .object({
        monthly_bundle_requests: BillingUsageMetricSchema,
        monthly_raw_ingested_events: BillingUsageMetricSchema,
        retained_bundle_cap: BillingUsageMetricSchema,
        monthly_remote_activations: BillingUsageMetricSchema,
        monthly_alert_deliveries: BillingUsageMetricSchema
      })
      .strict()
  })
  .strict();

export const BillingSummaryResponseSchema = z
  .object({
    billing: BillingSummarySchema
  })
  .strict();

export const ApiErrorResponseSchema = z
  .object({
    error: z.string()
  })
  .strict();

export interface HttpRequestInput {
  method: "GET" | "POST" | "DELETE";
  path: string;
  bearerToken: string;
  body?: unknown;
}

export interface HttpResponse {
  status: number;
  body: unknown;
}

export interface HttpClient {
  request(input: HttpRequestInput): Promise<HttpResponse>;
}

export class BillingApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(`billing_api_error: ${status}:${code}`);
    this.status = status;
    this.code = code;
  }
}

function parseApiError(status: number, body: unknown): never {
  const parsed = ApiErrorResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new BillingApiError(status, "unknown_error");
  }

  throw new BillingApiError(status, parsed.data.error);
}

async function expectBilling(responsePromise: Promise<HttpResponse>): Promise<z.infer<typeof BillingSummarySchema>> {
  const response = await responsePromise;
  if (response.status < 200 || response.status >= 300) {
    parseApiError(response.status, response.body);
  }

  const parsed = BillingSummaryResponseSchema.safeParse(response.body);
  if (!parsed.success) {
    throw new BillingApiError(response.status, "invalid_response_shape");
  }

  return parsed.data.billing;
}

export function createBillingApi(client: HttpClient): {
  getBillingSummary(input: { bearerToken: string }): Promise<z.infer<typeof BillingSummarySchema>>;
  increaseCapacity(input: { bearerToken: string; targetAdditionalCapacityUnits: number }): Promise<z.infer<typeof BillingSummarySchema>>;
  scheduleCapacityReduction(input: { bearerToken: string; targetAdditionalCapacityUnits: number }): Promise<z.infer<typeof BillingSummarySchema>>;
  cancelCapacityReduction(input: { bearerToken: string }): Promise<z.infer<typeof BillingSummarySchema>>;
} {
  return {
    async getBillingSummary(input) {
      return expectBilling(
        client.request({
          method: "GET",
          path: "/v1/billing",
          bearerToken: input.bearerToken
        })
      );
    },

    async increaseCapacity(input) {
      return expectBilling(
        client.request({
          method: "POST",
          path: "/v1/billing/capacity/increase",
          bearerToken: input.bearerToken,
          body: {
            target_additional_capacity_units: input.targetAdditionalCapacityUnits
          }
        })
      );
    },

    async scheduleCapacityReduction(input) {
      return expectBilling(
        client.request({
          method: "POST",
          path: "/v1/billing/capacity/scheduled-reduction",
          bearerToken: input.bearerToken,
          body: {
            target_additional_capacity_units: input.targetAdditionalCapacityUnits
          }
        })
      );
    },

    async cancelCapacityReduction(input) {
      return expectBilling(
        client.request({
          method: "DELETE",
          path: "/v1/billing/capacity/scheduled-reduction",
          bearerToken: input.bearerToken
        })
      );
    }
  };
}