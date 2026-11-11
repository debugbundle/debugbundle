import { REQUIRED_API_TABLES } from "../../../packages/storage/src/migrations.js";
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
  createStripeConfigMock,
  createPostgresGitHubMarketplaceStoreMock
} = vi.hoisted(() => ({
  listenMock: vi.fn().mockResolvedValue(undefined),
  queryMock: vi.fn(),
  endMock: vi.fn().mockResolvedValue(undefined),
  pingMock: vi.fn().mockResolvedValue("PONG"),
  quitMock: vi.fn().mockResolvedValue("OK"),
  s3SendMock: vi.fn().mockResolvedValue({}),
  createApiDependenciesFromEnvMock: vi.fn(),
  createApiServerMock: vi.fn(),
  createStripeConfigMock: vi.fn().mockReturnValue(null),
  createPostgresGitHubMarketplaceStoreMock: vi.fn().mockReturnValue({
    isEventProcessed: vi.fn(),
    markEventProcessed: vi.fn(),
    upsertMarketplaceAccount: vi.fn(),
    linkOrganizationToMarketplaceAccountByInstallationId: vi.fn()
  })
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
      send: s3SendMock,
      destroy: vi.fn()
    };
  }),
  HeadBucketCommand: class {
    input: unknown;

    constructor(input: unknown) {
      this.input = input;
    }
  }
}));

vi.mock("../../../apps/api/src/default-dependencies-env.js", () => ({
  createApiDependenciesFromEnv: createApiDependenciesFromEnvMock
}));

vi.mock("../../../apps/api/src/server.js", () => ({
  createApiServer: createApiServerMock
}));

vi.mock("../../../apps/api/src/stripe-config.js", () => ({
  createStripeConfig: createStripeConfigMock
}));

vi.mock("../../../packages/storage/src/index.js", async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    "../../../packages/storage/src/index.js"
  );
  return {
    ...actual,
    createPostgresGitHubMarketplaceStore: createPostgresGitHubMarketplaceStoreMock
  };
});

import {
  createDrainingReadinessState,
  startApiServerFromEnv
} from "../../../apps/api/src/runtime.js";

function buildMigratedRuntimeSchemaRows(sql: string): { rows: Record<string, unknown>[] } {
  if (sql.includes("information_schema.tables")) {
    return { rows: REQUIRED_API_TABLES.map((table_name) => ({ table_name })) };
  }
  if (sql.includes("AS available")) return { rows: [{ available: true }] };

  if (sql.includes("AS project_service_schema_available")) {
    return { rows: [{ project_service_schema_available: true }] };
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
    createPostgresGitHubMarketplaceStoreMock.mockClear();
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
      ANALYTICS_HASH_SECRET: "test-analytics-secret",
      API_HOST: "0.0.0.0",
      API_PORT: "3010"
    });

    // The current runtime validates additive access, financial and report
    // structures as well as the installed table/ledger and project-scope guards.
    expect(queryMock).toHaveBeenCalledTimes(23);
    for (const guard of [
      "report_identity_snapshots",
      "report_runs_factual_no_ai",
      "project_analytics_review_privacy_guard"
    ])
      expect(queryMock).toHaveBeenCalledWith(expect.stringContaining(guard), []);
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("report_model_attempts_diagnostic_code_check"),
      []
    );
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("organizations_trial_plan_check"),
      expect.any(Array)
    );
    for (const table of [
      "referral_reconciliation_events",
      "referral_invoice_benefits",
      "report_email_deliveries",
      "report_collection_progress",
      "report_health_recoveries"
    ]) {
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining(`public.${table}`),
        expect.any(Array)
      );
    }
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("AS project_service_schema_available"),
      expect.any(Array)
    );
    expect(pingMock).toHaveBeenCalledOnce();
    expect(s3SendMock).toHaveBeenCalledOnce();
    expect(endMock).toHaveBeenCalledOnce();
    expect(listenMock).toHaveBeenCalledWith({ host: "0.0.0.0", port: 3010 });
  });

  it("refuses to listen when model diagnostic storage is missing despite a complete ledger", async () => {
    queryMock.mockImplementation(async (sql: string) =>
      sql.includes("report_model_attempts_diagnostic_code_check")
        ? { rows: [{ available: false }] }
        : buildMigratedRuntimeSchemaRows(sql)
    );
    await expect(
      startApiServerFromEnv({
        DEBUGBUNDLE_PROBE_TRIGGER_SECRET: "test-probe-secret",
        ANALYTICS_HASH_SECRET: "test-analytics-secret"
      })
    ).rejects.toThrow("report_model_diagnostic_schema_incomplete");
    expect(listenMock).not.toHaveBeenCalled();
  });

  it("should report not-ready after draining starts", async (): Promise<void> => {
    const readiness = vi.fn().mockResolvedValue(undefined);
    const state = createDrainingReadinessState(readiness);

    await expect(state.readinessCheck()).resolves.toBeUndefined();

    state.markDraining();

    await expect(state.readinessCheck()).rejects.toThrow("api_draining");
    expect(readiness).toHaveBeenCalledOnce();
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

    await expect(
      startApiServerFromEnv({
        DEBUGBUNDLE_PROBE_TRIGGER_SECRET: "test-probe-secret",
        ANALYTICS_HASH_SECRET: "test-analytics-secret"
      })
    ).rejects.toThrow("db_schema_missing_tables");
    expect(listenMock).not.toHaveBeenCalled();
  });

  it.each([
    "evidence_context_events",
    "evidence_ingestion_receipts",
    "service_input_aliases",
    "service_project_aliases",
    "project_merge_operations",
    "project_merge_participants",
    "project_legacy_bindings",
    "service_definitions"
  ])(
    "refuses startup when the required migration table %s is missing",
    async (missingTable): Promise<void> => {
      queryMock.mockImplementation(async (sql: string) => {
        const result = buildMigratedRuntimeSchemaRows(sql);
        return sql.includes("information_schema.tables")
          ? { rows: result.rows.filter((row) => row["table_name"] !== missingTable) }
          : result;
      });
      await expect(
        startApiServerFromEnv({
          DEBUGBUNDLE_PROBE_TRIGGER_SECRET: "test-probe-secret",
          ANALYTICS_HASH_SECRET: "test-analytics-secret"
        })
      ).rejects.toThrow(`db_schema_missing_tables: ${missingTable}`);
      expect(listenMock).not.toHaveBeenCalled();
    }
  );

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
      ANALYTICS_HASH_SECRET: "test-analytics-secret",
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
          captureReferralEvent: expect.any(Function),
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
      ANALYTICS_HASH_SECRET: "test-analytics-secret",
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
