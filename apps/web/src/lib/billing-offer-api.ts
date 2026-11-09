import { z } from "zod";
import {
  BillingOfferSelectionSchema,
  BillingOfferQuoteSchema,
  BillingOfferStatusSchema,
  BillingOfferChangeStateSchema,
  type BillingOfferSelection,
  type BillingOfferQuote,
  type BillingOfferStatus,
  type BillingOfferChangeState
} from "../../../../packages/shared-types/src/index.js";
import { buildApiUrl, buildBrowserSessionHeaders, readJson } from "./api-client.js";

/** Browser transport uses the HttpOnly session and CSRF; no bearer credential. */
async function request<S extends z.ZodType>(
  path: string,
  method: "GET" | "POST" | "DELETE",
  body: unknown,
  schema: S
): Promise<z.output<S>> {
  const response = await fetch(buildApiUrl(path), {
    method,
    credentials: "include",
    cache: "no-store",
    headers: buildBrowserSessionHeaders(body !== undefined),
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  return schema.parse(await readJson<unknown>(response));
}
export function getBillingOfferStatus(): Promise<BillingOfferStatus> {
  return request("/v1/billing/offers/change", "GET", undefined, BillingOfferStatusSchema);
}
export function previewBillingOfferChange(
  selection: BillingOfferSelection
): Promise<{ quote: BillingOfferQuote }> {
  return request(
    "/v1/billing/offers/change/preview",
    "POST",
    BillingOfferSelectionSchema.parse(selection),
    z.object({ quote: BillingOfferQuoteSchema }).strict()
  );
}
export function scheduleBillingOfferChange(
  confirmationToken: string
): Promise<BillingOfferChangeState> {
  return request(
    "/v1/billing/offers/change",
    "POST",
    { confirmation_token: confirmationToken },
    BillingOfferChangeStateSchema
  );
}
export function cancelBillingOfferChange(scheduleId: string): Promise<BillingOfferChangeState> {
  return request(
    "/v1/billing/offers/change",
    "DELETE",
    { schedule_id: scheduleId },
    BillingOfferChangeStateSchema
  );
}
export function previewBillingOfferUpgrade(
  selection: BillingOfferSelection
): Promise<{ quote: BillingOfferQuote } | { payment_url: string }> {
  return request(
    "/v1/billing/offers/upgrade-preview",
    "POST",
    BillingOfferSelectionSchema.parse(selection),
    z.union([
      z.object({ quote: BillingOfferQuoteSchema }).strict(),
      z.object({ payment_url: z.string().url() }).strict()
    ])
  );
}
export async function startBillingOfferCheckout(
  selection: BillingOfferSelection,
  confirmationToken?: string
): Promise<string> {
  const result = await request(
    "/v1/billing/checkout",
    "POST",
    {
      ...BillingOfferSelectionSchema.parse(selection),
      ...(confirmationToken ? { confirmation_token: confirmationToken } : {})
    },
    z.object({ url: z.string().url() }).strict()
  );
  return result.url;
}
