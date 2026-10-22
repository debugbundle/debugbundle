import { vi } from "vitest";
import type { FastifyInstance } from "fastify";

import { createApiServer } from "../../apps/api/src/server.js";
import type { StripeWebhookDependencies } from "../../apps/api/src/routes/stripe-webhook.js";
import type { StripeConfig } from "../../apps/api/src/stripe-config.js";
import type { BillingSyncStore } from "../../packages/storage/src/index.js";
import { mockedObject, type MockedMethods } from "./vitest.ts";

type ApiServerDependencies = Parameters<typeof createApiServer>[0];
type BillingEmailService = NonNullable<StripeWebhookDependencies["billingEmails"]>;
type BillingEmailMessage = Parameters<BillingEmailService["send"]>[0];
type StripeConfigWithMocks = StripeConfig & {
  client: {
    webhooks: MockedMethods<StripeConfig["client"]["webhooks"]>;
    subscriptions: MockedMethods<StripeConfig["client"]["subscriptions"]>;
  };
};
type BillingSyncStoreWithMocks = BillingSyncStore & MockedMethods<BillingSyncStore>;
type BillingEmailServiceWithMocks = BillingEmailService & MockedMethods<BillingEmailService>;
type BillingSummaryReaderWithMocks = MockedMethods<
  NonNullable<StripeWebhookDependencies["billingSummaryReader"]>
>;

/**
 * Build a minimal Fastify app with only the stripe webhook route registered
 * and all other dependencies stubbed.
 */
export function createMinimalServer(overrides: Partial<StripeWebhookDependencies> = {}): {
  app: FastifyInstance;
  stripeConfig: StripeConfigWithMocks;
  billingSyncStore: BillingSyncStoreWithMocks;
  billingEmails: BillingEmailServiceWithMocks;
  billingSummaryReader: BillingSummaryReaderWithMocks;
  auditLogging: NonNullable<StripeWebhookDependencies["auditLogging"]>;
} {
  const stripeConfig =
    overrides.stripeConfig === undefined
      ? createMockStripeConfig()
      : (overrides.stripeConfig as StripeConfigWithMocks);
  const billingSyncStore =
    overrides.billingSyncStore === undefined
      ? createMockBillingSyncStore()
      : (overrides.billingSyncStore as BillingSyncStoreWithMocks);
  const billingEmails =
    overrides.billingEmails === undefined
      ? createMockBillingEmailService()
      : (overrides.billingEmails as BillingEmailServiceWithMocks);
  const billingSummaryReader =
    overrides.billingSummaryReader === undefined
      ? createMockBillingSummaryReader()
      : (overrides.billingSummaryReader as BillingSummaryReaderWithMocks);
  const auditLogging: NonNullable<StripeWebhookDependencies["auditLogging"]> =
    overrides.auditLogging === undefined
      ? { createAuditLog: vi.fn().mockResolvedValue(undefined) }
      : overrides.auditLogging;

  const app = createApiServer(
    {
      ingestionPersistence: { persistAndEnqueue: vi.fn() },
      ingestionMetadata: { resolveProjectByTokenHash: vi.fn() },
      memberAuth: { resolveMemberByTokenHash: vi.fn().mockResolvedValue(null) },
      webAuth: {
        requestEmailCode: vi.fn(),
        verifyEmailCode: vi.fn(),
        beginGithubAuth: vi.fn(),
        completeGithubAuth: vi.fn(),
        acceptInviteForSession: vi.fn(),
        revokeSessionByToken: vi.fn(),
        resolveSessionByToken: vi.fn().mockResolvedValue(null)
      },
      tokenManagement: mockedObject<ApiServerDependencies["tokenManagement"]>({
        listProjectTokensForOrganization: vi.fn().mockResolvedValue([]),
        createProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
        revokeProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
        listMemberTokensForOrganization: vi.fn().mockResolvedValue([]),
        createMemberTokenForOrganization: vi.fn().mockResolvedValue(null),
        revokeMemberTokenForOrganization: vi.fn().mockResolvedValue(null)
      }),
      incidentRetrieval: {
        listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
        getIncidentForOrganization: vi.fn().mockResolvedValue(null),
        listIncidentLogsForOrganization: vi.fn().mockResolvedValue([]),
        listServicesForOrganization: vi.fn().mockResolvedValue([])
      },
      objectStoreReader: { getObject: vi.fn() },
      webhookDelivery: {
        listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue({ deliveries: [] }),
        retryDeliveryForOrganization: vi.fn().mockResolvedValue(null)
      },
      auditLogging
    },
    {
      stripeWebhook: {
        ...overrides,
        stripeConfig,
        billingSyncStore,
        billingEmails,
        billingSummaryReader,
        auditLogging
      }
    }
  );

  return { app, stripeConfig, billingSyncStore, billingEmails, billingSummaryReader, auditLogging };
}

export function createMockStripeConfig(): StripeConfigWithMocks {
  const priceMap = new Map([
    ["price_solo", { plan: "solo" as const, type: "plan" as const }],
    ["price_team", { plan: "team" as const, type: "plan" as const }],
    ["price_solo_capacity", { plan: "solo" as const, type: "extra_capacity" as const }],
    ["price_team_capacity", { plan: "team" as const, type: "extra_capacity" as const }]
  ]);

  const constructEvent = vi.fn<(...args: unknown[]) => { data: { object: unknown } }>();
  return mockedObject<StripeConfigWithMocks>({
    client: {
      webhooks: {
        constructEvent
      },
      subscriptions: {
        // Default fixtures model an unchanged live subscription; ordering tests
        // override this reader with a distinct current provider snapshot.
        retrieve: vi.fn(async (): Promise<unknown> => {
          const result = constructEvent.mock.results.at(-1);
          return result?.type === "return" ? result.value.data.object : undefined;
        })
      },
      checkout: {
        sessions: { create: vi.fn() }
      },
      billingPortal: {
        sessions: { create: vi.fn() }
      }
    },
    webhookSecret: "whsec_test_secret",
    priceMap,
    soloPriceId: "price_solo",
    teamPriceId: "price_team",
    soloExtraCapacityPriceId: "price_solo_capacity",
    teamExtraCapacityPriceId: "price_team_capacity"
  });
}

export function createMockBillingSyncStore(): BillingSyncStoreWithMocks {
  return mockedObject<BillingSyncStoreWithMocks>({
    isEventProcessed: vi.fn().mockResolvedValue(false),
    markEventProcessed: vi.fn().mockResolvedValue(undefined),
    updateEntitlements: vi.fn().mockResolvedValue(undefined),
    resolveOrganizationByStripeCustomerId: vi.fn().mockResolvedValue(null),
    linkStripeCustomer: vi.fn().mockResolvedValue(undefined),
    revokeEntitlements: vi.fn().mockResolvedValue(undefined),
    updateBillingState: vi.fn().mockResolvedValue(undefined)
  });
}

export function createMockBillingEmailService(): BillingEmailServiceWithMocks {
  return mockedObject<BillingEmailServiceWithMocks>({
    managementUrl: "https://app.debugbundle.test/billing",
    getBillingContactForOrganization: vi.fn().mockResolvedValue({
      organizationName: "Acme Corp",
      recipientEmail: "owner@example.com"
    }),
    send: vi.fn().mockResolvedValue(undefined)
  });
}

export function createMockBillingSummaryReader(): BillingSummaryReaderWithMocks {
  return mockedObject<NonNullable<StripeWebhookDependencies["billingSummaryReader"]>>({
    getBillingSummaryForOrganization: vi.fn().mockResolvedValue({
      plan: "team",
      active_projects: 3,
      capacity_units: {
        total: 5,
        additional_purchased: 2
      }
    })
  });
}

export function getSentBillingEmail(
  billingEmails: BillingEmailServiceWithMocks,
  index = 0
): BillingEmailMessage {
  return billingEmails.send.mock.calls[index]?.[0] as BillingEmailMessage;
}

export function buildStripeEvent(
  type: string,
  data: Record<string, unknown>
): { id: string; type: string; data: { object: Record<string, unknown> } } {
  return {
    id: `evt_${Date.now()}`,
    type,
    data: { object: data }
  };
}
