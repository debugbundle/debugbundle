import { beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_SCHEMA_MIGRATIONS } from "../../../packages/storage/src/schema-migrations.js";

const {
  listenMock,
  queryMock,
  endMock,
  pingMock,
  quitMock,
  s3SendMock,
  createApiDependenciesFromEnvMock,
  createApiServerMock,
  createStripeConfigMock
} = vi.hoisted(() => ({
  listenMock: vi.fn().mockResolvedValue(undefined),
  queryMock: vi.fn(),
  endMock: vi.fn().mockResolvedValue(undefined),
  pingMock: vi.fn().mockResolvedValue("PONG"),
  quitMock: vi.fn().mockResolvedValue("OK"),
  s3SendMock: vi.fn().mockResolvedValue({}),
  createApiDependenciesFromEnvMock: vi.fn(),
  createApiServerMock: vi.fn(),
  createStripeConfigMock: vi.fn().mockReturnValue(null)
}));

vi.mock("pg", () => ({
  Pool: vi.fn(function MockPool() {
    return {
      query: queryMock,
      end: endMock
    };
  })
}));

vi.mock("ioredis", () => ({
  Redis: vi.fn(function MockRedis() {
    return {
      ping: pingMock,
      quit: quitMock
    };
  })
}));

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn(function MockS3Client() {
    return {
      send: s3SendMock
    };
  }),
  HeadBucketCommand: class {
    input: unknown;

    constructor(input: unknown) {
      this.input = input;
    }
  }
}));

vi.mock("../../../apps/api/src/default-dependencies.ts", () => ({
  createApiDependenciesFromEnv: createApiDependenciesFromEnvMock
}));

vi.mock("../../../apps/api/src/server.js", () => ({
  createApiServer: createApiServerMock
}));

vi.mock("../../../apps/api/src/stripe-config.js", () => ({
  createStripeConfig: createStripeConfigMock
}));

import { startApiServerFromEnv } from "../../../apps/api/src/runtime.js";

function buildMigratedRuntimeSchemaRows(sql: string): { rows: Record<string, unknown>[] } {
  if (sql.includes("information_schema.tables")) {
    return {
      rows: [
        { table_name: "users" },
        { table_name: "password_credentials" },
        { table_name: "oauth_identities" },
        { table_name: "sessions" },
        { table_name: "email_auth_challenges" },
        { table_name: "email_verification_tokens" },
        { table_name: "password_reset_tokens" },
        { table_name: "organizations" },
        { table_name: "organization_members" },
        { table_name: "projects" },
        { table_name: "project_members" },
        { table_name: "project_invites" },
        { table_name: "project_tokens" },
        { table_name: "member_tokens" },
        { table_name: "github_device_authorizations" },
        { table_name: "probe_activations" },
        { table_name: "services" },
        { table_name: "deployments" },
        { table_name: "bundle_generations" },
        { table_name: "improvement_opportunities" },
        { table_name: "improvement_opportunity_events" },
        { table_name: "weekly_report_channels" },
        { table_name: "incidents" },
        { table_name: "incident_events" },
        { table_name: "alert_rules" },
        { table_name: "agent_webhooks" },
        { table_name: "webhook_deliveries" },
        { table_name: "slack_destinations" },
        { table_name: "capture_policies" },
        { table_name: "audit_logs" },
        { table_name: "processed_billing_events" },
        { table_name: "github_installations" },
        { table_name: "project_github_repos" },
        { table_name: "github_dispatch_rules" },
        { table_name: "github_dispatch_deliveries" }
      ]
    };
  }

  if (sql.includes("to_regclass")) {
    return { rows: [{ relation_name: "storage_migration_ledger" }] };
  }

  if (sql.includes("storage_migration_ledger")) {
    return {
      rows: STORAGE_SCHEMA_MIGRATIONS.map((migration) => ({
        id: migration.id,
        checksum: migration.checksum
      }))
    };
  }

  return { rows: [] };
}

describe("api runtime start", () => {
  beforeEach(() => {
    listenMock.mockClear();
    endMock.mockClear();
    pingMock.mockClear();
    quitMock.mockClear();
    s3SendMock.mockClear();
    createStripeConfigMock.mockReset();
    createStripeConfigMock.mockReturnValue(null);
    createApiDependenciesFromEnvMock.mockReset();
    createApiDependenciesFromEnvMock.mockReturnValue({
      ingestionPersistence: { persistAndEnqueue: vi.fn() },
      ingestionMetadata: { resolveProjectByTokenHash: vi.fn(), persistEventMetadata: vi.fn() },
      memberAuth: { resolveMemberByTokenHash: vi.fn() },
      tokenManagement: {
        listProjectTokensForOrganization: vi.fn(),
        createProjectTokenForOrganization: vi.fn(),
        revokeProjectTokenForOrganization: vi.fn(),
        listMemberTokensForOrganization: vi.fn(),
        createMemberTokenForOrganization: vi.fn(),
        revokeMemberTokenForOrganization: vi.fn()
      },
      incidentRetrieval: {
        listIncidentsForOrganization: vi.fn(),
        getIncidentForOrganization: vi.fn(),
        listIncidentLogsForOrganization: vi.fn()
      },
      objectStoreReader: { getObject: vi.fn() },
      webhookDelivery: { listDeliveriesForWebhookInOrganization: vi.fn() }
    });
    createApiServerMock.mockReset();
    createApiServerMock.mockReturnValue({ listen: listenMock });
    queryMock.mockReset();
    queryMock.mockImplementation(async (sql: string) => buildMigratedRuntimeSchemaRows(sql));
  });

  it("should run startup guards and listen with parsed host/port", async (): Promise<void> => {
    await startApiServerFromEnv({
      DEBUGBUNDLE_PROBE_TRIGGER_SECRET: "test-probe-secret",
      API_HOST: "0.0.0.0",
      API_PORT: "3010"
    });

    expect(queryMock).toHaveBeenCalledTimes(3);
    expect(pingMock).toHaveBeenCalledOnce();
    expect(s3SendMock).toHaveBeenCalledOnce();
    expect(endMock).toHaveBeenCalledOnce();
    expect(listenMock).toHaveBeenCalledWith({ host: "0.0.0.0", port: 3010 });
  });

  it("should fail startup before dependency checks when the probe trigger secret is missing", async (): Promise<void> => {
    await expect(startApiServerFromEnv({})).rejects.toThrow("DEBUGBUNDLE_PROBE_TRIGGER_SECRET");
    expect(queryMock).not.toHaveBeenCalled();
    expect(pingMock).not.toHaveBeenCalled();
    expect(s3SendMock).not.toHaveBeenCalled();
    expect(listenMock).not.toHaveBeenCalled();
  });

  it("should fail startup when db schema guard reports missing tables", async (): Promise<void> => {
    queryMock.mockResolvedValue({ rows: [{ table_name: "projects" }] });

    await expect(startApiServerFromEnv({ DEBUGBUNDLE_PROBE_TRIGGER_SECRET: "test-probe-secret" })).rejects.toThrow(
      "db_schema_missing_tables"
    );
    expect(listenMock).not.toHaveBeenCalled();
  });

  it("should wire stripe webhook dependencies including optional billing and audit services", async (): Promise<void> => {
    const billingSummaryReader = {
      getBillingSummaryForOrganization: vi.fn(),
      createCheckoutLink: vi.fn(),
      createPortalLink: vi.fn(),
      increaseProjectSlots: vi.fn(),
      scheduleProjectSlotReduction: vi.fn(),
      cancelProjectSlotReduction: vi.fn()
    };
    const billingEmails = {
      getBillingContactForOrganization: vi.fn(),
      send: vi.fn()
    };
    const auditLogging = { createAuditLog: vi.fn() };

    createStripeConfigMock.mockReturnValue({
      client: {},
      webhookSecret: "whsec_test"
    });
    createApiDependenciesFromEnvMock.mockReturnValue({
      ingestionPersistence: { persistAndEnqueue: vi.fn() },
      ingestionMetadata: { resolveProjectByTokenHash: vi.fn(), persistEventMetadata: vi.fn() },
      memberAuth: { resolveMemberByTokenHash: vi.fn() },
      tokenManagement: {
        listProjectTokensForOrganization: vi.fn(),
        createProjectTokenForOrganization: vi.fn(),
        revokeProjectTokenForOrganization: vi.fn(),
        listMemberTokensForOrganization: vi.fn(),
        createMemberTokenForOrganization: vi.fn(),
        revokeMemberTokenForOrganization: vi.fn()
      },
      incidentRetrieval: {
        listIncidentsForOrganization: vi.fn(),
        getIncidentForOrganization: vi.fn(),
        listIncidentLogsForOrganization: vi.fn()
      },
      objectStoreReader: { getObject: vi.fn() },
      webhookDelivery: { listDeliveriesForWebhookInOrganization: vi.fn() },
      billingManagement: billingSummaryReader,
      billingEmails,
      auditLogging
    });

    await startApiServerFromEnv({
      DEBUGBUNDLE_PROBE_TRIGGER_SECRET: "test-probe-secret",
      STRIPE_SECRET_KEY: "sk_test",
      STRIPE_WEBHOOK_SECRET: "whsec_test",
      STRIPE_SOLO_PRICE_ID: "price_solo",
      STRIPE_TEAM_PRICE_ID: "price_team",
      STRIPE_SOLO_EXTRA_CAPACITY_PRICE_ID: "price_solo_capacity",
      STRIPE_TEAM_EXTRA_CAPACITY_PRICE_ID: "price_team_capacity"
    });

    expect(createApiServerMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        stripeWebhook: expect.objectContaining({
          stripeConfig: expect.objectContaining({ webhookSecret: "whsec_test" }),
          billingSummaryReader,
          billingEmails,
          auditLogging
        }),
        readinessCheck: expect.any(Function)
      })
    );
  });

  it("should omit optional stripe webhook helpers when the api dependencies do not expose them", async (): Promise<void> => {
    createStripeConfigMock.mockReturnValue({
      client: {},
      webhookSecret: "whsec_test"
    });

    await startApiServerFromEnv({
      DEBUGBUNDLE_PROBE_TRIGGER_SECRET: "test-probe-secret",
      STRIPE_SECRET_KEY: "sk_test",
      STRIPE_WEBHOOK_SECRET: "whsec_test",
      STRIPE_SOLO_PRICE_ID: "price_solo",
      STRIPE_TEAM_PRICE_ID: "price_team",
      STRIPE_SOLO_EXTRA_CAPACITY_PRICE_ID: "price_solo_capacity",
      STRIPE_TEAM_EXTRA_CAPACITY_PRICE_ID: "price_team_capacity"
    });

    expect(createApiServerMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        stripeWebhook: expect.objectContaining({
          stripeConfig: expect.objectContaining({ webhookSecret: "whsec_test" })
        })
      })
    );
    expect(createApiServerMock.mock.calls[0]?.[1]).toEqual(
      expect.not.objectContaining({
        stripeWebhook: expect.objectContaining({
          auditLogging: expect.anything(),
          billingSummaryReader: expect.anything(),
          billingEmails: expect.anything()
        })
      })
    );
  });
});
