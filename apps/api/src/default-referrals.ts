import { z } from "zod";
import { createReferralStore } from "../../../packages/storage/src/referral-store.js";
import type { Queryable } from "../../../packages/storage/src/types.js";
import {
  createReferralManagement,
  type ReferralManagement
} from "../../../packages/referrals/src/referral-management.js";
import { createReferralLinkCodec } from "../../../packages/referrals/src/referral-link.js";
import {
  ReferralError,
  ReferralHttpUrlSchema
} from "../../../packages/referrals/src/referral-contracts.js";
import { readStripeCustomerPaymentHistory } from "../../../packages/referrals/src/stripe-customer-eligibility.js";
import type { StripeConfig } from "./stripe-config.js";
import { createReferralFinance } from "../../../packages/referrals/src/referral-finance.js";
import { createReferralLedgerStore } from "../../../packages/storage/src/referral-ledger-store.js";

const ConfigSchema = z
  .object({
    secret: z.string().min(32).max(4096),
    enrollmentEnabled: z.boolean(),
    publicApiUrl: ReferralHttpUrlSchema.optional(),
    publicLandingUrl: ReferralHttpUrlSchema.optional()
  })
  .strict();
export type ReferralConfig = z.infer<typeof ConfigSchema>;
export function referralConfigFromEnv(
  env: Record<string, string | undefined>
): ReferralConfig | undefined {
  const configured = ConfigSchema.safeParse({
    secret: env["REFERRAL_SECRET"],
    enrollmentEnabled: env["REFERRAL_ENROLLMENT_ENABLED"] === "true",
    ...(env["REFERRAL_API_BASE_URL"]?.trim()
      ? { publicApiUrl: env["REFERRAL_API_BASE_URL"].trim() }
      : {}),
    ...(env["REFERRAL_LANDING_URL"]?.trim()
      ? { publicLandingUrl: env["REFERRAL_LANDING_URL"].trim() }
      : {})
  });
  return configured.success ? configured.data : undefined;
}
export function createDefaultReferrals(input: {
  db: Queryable;
  config?: ReferralConfig;
  stripeConfig?: StripeConfig;
  operatorEmails?: string[];
}): ReferralManagement | undefined {
  if (!input.config) return undefined;
  const config = ConfigSchema.parse(input.config);
  const store = createReferralStore(input.db, { identityHashSecret: config.secret });
  const operators = new Set(input.operatorEmails?.map((email) => email.trim().toLowerCase()) ?? []);
  const finance = createReferralFinance({
    partners: store,
    ledger: createReferralLedgerStore(input.db),
    async isOperator(userId) {
      if (!operators.size) return false;
      const row = (
        await input.db.query<{ email: string }>(
          "SELECT email FROM users WHERE id=$1::uuid AND email_verified_at IS NOT NULL",
          [userId]
        )
      ).rows[0];
      return row !== undefined && operators.has(row.email.trim().toLowerCase());
    }
  });
  return createReferralManagement({
    store,
    finance,
    links: createReferralLinkCodec(config.secret, {
      secure: !config.publicApiUrl?.startsWith("http://")
    }),
    enrollmentEnabled: config.enrollmentEnabled,
    ...(config.publicApiUrl === undefined ? {} : { publicApiUrl: config.publicApiUrl }),
    ...(config.publicLandingUrl === undefined ? {} : { publicLandingUrl: config.publicLandingUrl }),
    async readEligibility(actor) {
      const row = (
        await input.db.query<{ stripe_customer_id: string | null; email: string }>(
          `SELECT o.stripe_customer_id,u.email FROM organizations o
        JOIN organization_members m ON m.organization_id=o.id AND m.role='owner' AND m.user_id=$2::uuid
        JOIN users u ON u.id=m.user_id AND u.email_verified_at IS NOT NULL
        WHERE o.id=$1::uuid AND o.suspended_at IS NULL`,
          [actor.organization_id, actor.actor_user_id]
        )
      ).rows[0];
      if (!row) throw new ReferralError("forbidden");
      if (row.stripe_customer_id && !input.stripeConfig)
        throw new ReferralError("program_unavailable");
      return {
        provider_customer_id_checked: row.stripe_customer_id,
        provider_previously_paid:
          input.stripeConfig !== undefined
            ? await readStripeCustomerPaymentHistory(input.stripeConfig.client, {
                customer_id: row.stripe_customer_id,
                verified_email: row.email
              })
            : false
      };
    }
  });
}
