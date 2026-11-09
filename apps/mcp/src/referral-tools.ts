import { z } from "zod";
import {
  ReferralAuthSchema,
  ReferralJoinInputSchema,
  ReferralClientsInputSchema,
  ReferralApplyInputSchema
} from "../../../packages/referrals/src/referral-contracts.js";
import { ReferralApiError, type ReferralApi } from "../../../packages/referral-client/src/index.js";
import {
  ReferralPayoutReadInputSchema,
  ReferralOperatorPayoutReadInputSchema,
  ReferralPayoutClaimInputSchema,
  ReferralPayoutBatchInputSchema,
  ReferralPayoutRecordInputSchema
} from "../../../packages/referrals/src/referral-ledger-contracts.js";

export const REFERRAL_MCP_TOOL_NAMES = [
  "get_referral_partner",
  "join_referral_program",
  "list_referral_clients",
  "get_customer_referral",
  "apply_customer_referral",
  "get_referral_earnings",
  "list_referral_payouts",
  "list_referral_operator_balances",
  "list_referral_operator_payouts",
  "claim_referral_payout",
  "mark_referral_payout_uncertain",
  "record_referral_payout"
] as const;
export const REFERRAL_MCP_TOOL_CATALOG = [
  {
    name: REFERRAL_MCP_TOOL_NAMES[0],
    inputSchema: ReferralAuthSchema,
    read: true,
    description:
      "Read your referral partner status, share link and current terms. Personal identity, independent of your workspace tier."
  },
  {
    name: REFERRAL_MCP_TOOL_NAMES[1],
    inputSchema: ReferralJoinInputSchema,
    read: false,
    description:
      "Join the Business referral programme only after the human explicitly accepts the supplied terms version. Free users may join; commissions cover eligible new Business base subscriptions only."
  },
  {
    name: REFERRAL_MCP_TOOL_NAMES[2],
    inputSchema: ReferralClientsInputSchema,
    read: true,
    description:
      "List your own referred clients as opaque identifiers and status. Never returns private customer identities, projects or invoices."
  },
  {
    name: REFERRAL_MCP_TOOL_NAMES[3],
    inputSchema: ReferralAuthSchema,
    read: true,
    description: "Read the active workspace's customer referral. Current verified Owner only."
  },
  {
    name: REFERRAL_MCP_TOOL_NAMES[4],
    inputSchema: ReferralApplyInputSchema,
    read: false,
    description:
      "Apply a partner code as the verified current Owner. New first-paid Business customers only; previously paid Solo/Team customers are ineligible. Replacing an existing code requires explicitCorrection after human confirmation; checkout freezes attribution."
  },
  {
    name: REFERRAL_MCP_TOOL_NAMES[5],
    inputSchema: ReferralAuthSchema,
    read: true,
    description:
      "Read only your own partner earnings and operator availability. Workspace ownership does not grant partner or payout access."
  },
  {
    name: REFERRAL_MCP_TOOL_NAMES[6],
    inputSchema: ReferralPayoutReadInputSchema,
    read: true,
    description:
      "List only your own manual payout records and statuses. No referred customer's private data is returned."
  },
  {
    name: REFERRAL_MCP_TOOL_NAMES[7],
    inputSchema: ReferralPayoutReadInputSchema,
    read: true,
    description:
      "List bounded partner balances as an explicitly configured verified DebugBundle billing operator. Ordinary workspace Owner/Admin authority is insufficient."
  },
  {
    name: REFERRAL_MCP_TOOL_NAMES[8],
    inputSchema: ReferralOperatorPayoutReadInputSchema,
    read: true,
    description:
      "List bounded manual payout batches as a verified configured DebugBundle operator. Optional partnerId filters one partner."
  },
  {
    name: REFERRAL_MCP_TOOL_NAMES[9],
    inputSchema: ReferralPayoutClaimInputSchema,
    read: false,
    description:
      "Reserve the currently available USD partner balance as a configured DebugBundle operator. Supply and retain a stable claimId UUID for retries. Does not transfer funds. Review the returned batch and amount before any separately authorised external payment."
  },
  {
    name: REFERRAL_MCP_TOOL_NAMES[10],
    inputSchema: ReferralPayoutBatchInputSchema,
    read: false,
    description:
      "Mark a claimed manual payment uncertain as a configured DebugBundle operator. Funds remain claimed for reconciliation; this never releases or retries an external transfer."
  },
  {
    name: REFERRAL_MCP_TOOL_NAMES[11],
    inputSchema: ReferralPayoutRecordInputSchema,
    read: false,
    description:
      "Record an already completed external payment using its stable reference, only after explicit human confirmation. Configured DebugBundle operator only. confirmedExternalPayment must be true; this tool neither authorises nor initiates a money transfer."
  }
].map(({ read, ...entry }) => ({
  ...entry,
  group: "referrals" as const,
  annotations: {
    readOnlyHint: read,
    destructiveHint: entry.name === "record_referral_payout",
    idempotentHint: true,
    openWorldHint: false
  }
}));
function forward<S extends z.ZodType>(
  schema: S,
  run: (input: z.output<S>) => Promise<unknown>
): (input: Record<string, unknown>) => Promise<unknown> {
  return async (input) => {
    try {
      return await run(schema.parse(input));
    } catch (error) {
      throw new Error(
        `mcp_tool_error:${error instanceof ReferralApiError ? error.code : "invalid_referral_input"}`
      );
    }
  };
}
export function createReferralMcpTools(
  api: ReferralApi
): Record<
  (typeof REFERRAL_MCP_TOOL_NAMES)[number],
  (input: Record<string, unknown>) => Promise<unknown>
> {
  return {
    get_referral_partner: forward(ReferralAuthSchema, (input) => api.partner(input)),
    join_referral_program: forward(ReferralJoinInputSchema, (input) => api.join(input)),
    list_referral_clients: forward(ReferralClientsInputSchema, async (input) => ({
      clients: await api.clients(input)
    })),
    get_customer_referral: forward(ReferralAuthSchema, (input) => api.customer(input)),
    apply_customer_referral: forward(ReferralApplyInputSchema, async (input) => ({
      attribution: await api.apply(input)
    })),
    get_referral_earnings: forward(ReferralAuthSchema, (input) => api.earnings(input)),
    list_referral_payouts: forward(ReferralPayoutReadInputSchema, async (input) => ({
      payouts: await api.payouts(input)
    })),
    list_referral_operator_balances: forward(ReferralPayoutReadInputSchema, async (input) => ({
      partners: await api.operatorBalances(input)
    })),
    list_referral_operator_payouts: forward(
      ReferralOperatorPayoutReadInputSchema,
      async (input) => ({ payouts: await api.operatorPayouts(input) })
    ),
    claim_referral_payout: forward(ReferralPayoutClaimInputSchema, async (input) => ({
      payout: await api.claimPayout(input)
    })),
    mark_referral_payout_uncertain: forward(ReferralPayoutBatchInputSchema, async (input) => ({
      payout: await api.markPayoutUncertain(input)
    })),
    record_referral_payout: forward(ReferralPayoutRecordInputSchema, async (input) => ({
      payout: await api.recordPayout(input)
    }))
  };
}
