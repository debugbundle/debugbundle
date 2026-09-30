import { z } from "zod";
import {
  AnalyticsMoneySchema,
  AnalyticsReceiptOperationSchema,
  AnalyticsSafeHashSchema,
  AnalyticsScopeSchema
} from "../../shared-types/src/index.js";
import { RetainedAnalyticsMoneySchema, type ExactMinorAmount } from "./financial-arithmetic.js";

const Hash = z.string().regex(/^[a-f0-9]{64}$/);
const Timestamp = z.string().datetime({ precision: 3 });
const Uuid = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
const Scope = AnalyticsScopeSchema.transform((scope) =>
  scope.kind === "project"
    ? { kind: scope.kind, project_id: scope.project_id.toLowerCase() }
    : { kind: scope.kind, space_id: scope.space_id.toLowerCase() }
);
const Snapshot = {
  scope: Scope,
  scope_revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER)
};

/** Compiled authorized evidence, never a public ingress or proof of server credentials. */
export const RevenueReceiptFactSchema = z
  .object({
    ...Snapshot,
    authority: z.literal("server_authoritative"),
    origin_project_id: Uuid,
    source_namespace: Hash,
    event_id: Uuid,
    operation_id: AnalyticsSafeHashSchema.transform((value) => value.toLowerCase()),
    content_hash: Hash,
    occurred_at: Timestamp,
    received_at: Timestamp,
    account_key: Hash.nullable(),
    money: AnalyticsMoneySchema,
    currency_table_version: z.string().min(1).max(64),
    financial: AnalyticsReceiptOperationSchema.transform((operation) =>
      operation.kind === "payment"
        ? {
            ...operation,
            payment_id: operation.payment_id.toLowerCase(),
            subscription_id: operation.subscription_id?.toLowerCase() ?? null
          }
        : {
            ...operation,
            payment_id: operation.payment_id.toLowerCase(),
            refund_id: operation.refund_id.toLowerCase()
          }
    )
  })
  .strict()
  .refine(
    ({ money, currency_table_version }) =>
      RetainedAnalyticsMoneySchema.safeParse({ money, currency_table_version }).success
  );
export type RevenueReceiptFact = z.infer<typeof RevenueReceiptFactSchema>;

export const RevenueReceiptQuerySchema = z
  .object({
    ...Snapshot,
    from: Timestamp,
    to: Timestamp,
    watermark: Timestamp,
    available_from: Timestamp,
    incomplete: z.boolean(),
    sample_rate: z.number().finite().gt(0).max(1)
  })
  .strict()
  .refine(
    (q) =>
      Date.parse(q.from) < Date.parse(q.to) &&
      Date.parse(q.to) - Date.parse(q.from) <= 90 * 86400000 &&
      Date.parse(q.to) <= Date.parse(q.watermark)
  );
export type RevenueReceiptQuery = z.infer<typeof RevenueReceiptQuerySchema>;

export type RevenueReceiptUnavailable =
  | "invalid_input"
  | "capacity_exceeded"
  | "insufficient_history"
  | "sampled_financial_evidence"
  | "stale_evidence"
  | "conflicting_evidence"
  | "missing_payment"
  | "refund_exceeds_payment"
  | "aggregate_overflow";
export interface RevenueReceiptCurrency {
  currency: string;
  exponent: number;
  currency_table_version: string;
  payments: number;
  refunds: number;
  gross_minor: string;
  refunded_minor: string;
  net_minor: string;
  average_order_minor: ExactMinorAmount | null;
  paying_accounts: number;
  payments_without_account: number;
}
export type RevenueReceiptResult =
  | { status: "unavailable"; reason: RevenueReceiptUnavailable }
  | {
      status: "available";
      calculation_version: "revenue-receipts-1";
      quality: "observed" | "partial";
      scope: RevenueReceiptQuery["scope"];
      scope_revision: number;
      from: string;
      to: string;
      watermark: string;
      currencies: RevenueReceiptCurrency[];
    };
