import { describe, expect, it } from "vitest";
import {
  poolQueryMock,
  poolConfigSpy,
  createRedisIncidentFrequencyCounterMock,
  createRedisAuthRateLimiterMock,
  createRedisIngestionRateLimiterMock,
  createRedisQueueClientMock,
  createS3ObjectStoreClientMock,
  createWebSessionAuthServiceMock,
  createPostgresMetadataStoreMock
} from "../../helpers/api-default-dependency-mocks.js";
import {
  getBooleanField,
  getStringField,
  normalizeEmailForConfig,
  normalizeBillingPlan,
  readCsvEnv,
  readSubscriptionInvoiceLinePeriod,
  readUnixTimestampField,
  resolveStripeSubscriptionBillingPeriod
} from "../../../apps/api/src/default-dependencies.ts";
import { createApiDependenciesFromEnv } from "../../../apps/api/src/default-dependencies-env.js";

describe("api-default-dependency-mocks configuration", () => {
  it("normalizes env csv values and billing plans", () => {
    expect(readCsvEnv({ CORS_ORIGINS: undefined }, "CORS_ORIGINS")).toBeUndefined();
    expect(
      readCsvEnv({ CORS_ORIGINS: " , https://app.test ,, https://admin.test " }, "CORS_ORIGINS")
    ).toEqual(["https://app.test", "https://admin.test"]);
    expect(readCsvEnv({ CORS_ORIGINS: " , , " }, "CORS_ORIGINS")).toBeUndefined();

    expect(normalizeEmailForConfig(" Owen@Example.COM ")).toBe("owen@example.com");
    expect(normalizeBillingPlan("solo")).toBe("solo");
    expect(normalizeBillingPlan("team")).toBe("team");
    expect(normalizeBillingPlan("anything-else")).toBe("free");
    expect(normalizeBillingPlan(null)).toBe("free");
  });

  it("reads string, boolean, and unix timestamp fields safely", () => {
    expect(getStringField({ customer_id: "cus_123" }, "customer_id")).toBe("cus_123");
    expect(getStringField({ customer_id: 42 }, "customer_id")).toBeNull();
    expect(
      getBooleanField({ email_verification_required: true }, "email_verification_required")
    ).toBe(true);
    expect(
      getBooleanField({ email_verification_required: "true" }, "email_verification_required")
    ).toBe(false);

    expect(readUnixTimestampField(null, "start")).toBeNull();
    expect(readUnixTimestampField({ start: "123" }, "start")).toBeNull();
    expect(readUnixTimestampField({ start: 123 }, "start")).toBe(123);
  });

  it("reads invoice line periods and resolves stripe billing windows from fallback fields", () => {
    expect(readSubscriptionInvoiceLinePeriod(null)).toEqual({ start: null, end: null });
    expect(readSubscriptionInvoiceLinePeriod({ lines: null })).toEqual({ start: null, end: null });
    expect(readSubscriptionInvoiceLinePeriod({ lines: { data: null } })).toEqual({
      start: null,
      end: null
    });
    expect(readSubscriptionInvoiceLinePeriod({ lines: { data: [{ period: null }] } })).toEqual({
      start: null,
      end: null
    });
    expect(
      readSubscriptionInvoiceLinePeriod({ lines: { data: [{ period: { start: 100, end: 200 } }] } })
    ).toEqual({
      start: 100,
      end: 200
    });

    expect(
      resolveStripeSubscriptionBillingPeriod({
        current_period_start: null,
        current_period_end: null,
        latest_invoice: {
          lines: {
            data: [
              {
                period: {
                  start: 1710000000,
                  end: 1712592000
                }
              }
            ]
          },
          period_start: null,
          period_end: null
        }
      } as never)
    ).toEqual({
      starts_at: new Date(1710000000 * 1000).toISOString(),
      ends_at: new Date(1712592000 * 1000).toISOString()
    });

    expect(
      resolveStripeSubscriptionBillingPeriod({
        current_period_start: null,
        current_period_end: null,
        latest_invoice: {
          lines: {
            data: [
              {
                period: {
                  start: null,
                  end: null
                }
              }
            ]
          },
          period_start: 1710000000,
          period_end: 1712592000
        }
      } as never)
    ).toEqual({
      starts_at: new Date(1710000000 * 1000).toISOString(),
      ends_at: new Date(1712592000 * 1000).toISOString()
    });

    expect(
      resolveStripeSubscriptionBillingPeriod({
        current_period_start: 1712592000,
        current_period_end: 1710000000,
        latest_invoice: "in_123"
      } as never)
    ).toEqual({ starts_at: null, ends_at: null });
  });

  it("should create dependencies from default env values", async (): Promise<void> => {
    poolQueryMock.mockResolvedValueOnce({ rows: [{ id: "ok" }] });

    createApiDependenciesFromEnv({});

    expect(poolConfigSpy).toHaveBeenCalledWith({
      host: "localhost",
      port: 5432,
      user: "debugbundle",
      password: "debugbundle",
      database: "debugbundle",
      max: 10
    });
    expect(createRedisQueueClientMock).toHaveBeenCalledWith({ redisUrl: "redis://localhost:6379" });
    const frequencyArgs = createRedisIncidentFrequencyCounterMock.mock.calls[0]?.[0] as {
      redisUrl: string;
      snapshotStore?: { query: unknown };
    };
    expect(frequencyArgs.redisUrl).toBe("redis://localhost:6379");
    expect(frequencyArgs.snapshotStore).toBeDefined();
    expect(typeof frequencyArgs.snapshotStore?.query).toBe("function");
    expect(createRedisAuthRateLimiterMock).toHaveBeenCalledWith({
      redisUrl: "redis://localhost:6379"
    });
    expect(createRedisIngestionRateLimiterMock).toHaveBeenCalledWith({
      redisUrl: "redis://localhost:6379"
    });
    expect(createS3ObjectStoreClientMock).toHaveBeenCalledWith({
      endpoint: "http://localhost:4566",
      region: "us-east-1",
      bucket: "debugbundle-raw-events",
      accessKeyId: "test",
      secretAccessKey: "test",
      forcePathStyle: true
    });

    const dbArg = createPostgresMetadataStoreMock.mock.calls[0]?.[0] as {
      query: <T>(sql: string, params: unknown[]) => Promise<T>;
    };
    await dbArg.query("SELECT 1", ["x"]);
    expect(poolQueryMock).toHaveBeenCalledWith("SELECT 1", ["x"]);
  });

  it("should honor explicit env overrides", (): void => {
    createApiDependenciesFromEnv({
      DB_HOST: "db.internal",
      DB_PORT: "5440",
      DB_USER: "svc",
      DB_PASSWORD: "secret",
      DB_NAME: "debugbundle_ci",
      REDIS_URL: "redis://cache:6380",
      S3_ENDPOINT: "http://s3:9000",
      S3_REGION: "eu-west-1",
      S3_BUCKET: "bucket-a",
      AWS_ACCESS_KEY_ID: "k",
      AWS_SECRET_ACCESS_KEY: "s"
    });

    expect(poolConfigSpy).toHaveBeenCalledWith({
      host: "db.internal",
      port: 5440,
      user: "svc",
      password: "secret",
      database: "debugbundle_ci",
      max: 10
    });
    expect(createRedisQueueClientMock).toHaveBeenCalledWith({ redisUrl: "redis://cache:6380" });
    const frequencyArgs = createRedisIncidentFrequencyCounterMock.mock.calls[0]?.[0] as {
      redisUrl: string;
      snapshotStore?: { query: unknown };
    };
    expect(frequencyArgs.redisUrl).toBe("redis://cache:6380");
    expect(frequencyArgs.snapshotStore).toBeDefined();
    expect(typeof frequencyArgs.snapshotStore?.query).toBe("function");
    expect(createRedisAuthRateLimiterMock).toHaveBeenCalledWith({ redisUrl: "redis://cache:6380" });
    expect(createRedisIngestionRateLimiterMock).toHaveBeenCalledWith({
      redisUrl: "redis://cache:6380"
    });
    expect(createS3ObjectStoreClientMock).toHaveBeenCalledWith({
      endpoint: "http://s3:9000",
      region: "eu-west-1",
      bucket: "bucket-a",
      accessKeyId: "k",
      secretAccessKey: "s",
      forcePathStyle: true
    });
  });

  it("should ignore the removed signup allowlist runtime env", (): void => {
    createApiDependenciesFromEnv({
      AUTH_SIGNUP_ALLOWED_EMAILS: "owen@example.com, jason@example.com"
    });

    const serviceOptions = (createWebSessionAuthServiceMock.mock.calls.at(-1)?.[1] ?? {}) as Record<
      string,
      unknown
    >;

    expect(serviceOptions).not.toHaveProperty("signupEmailAllowlist");
  });

  it("should configure billing admin override emails from runtime env", (): void => {
    const dependencies = createApiDependenciesFromEnv({
      BILLING_ADMIN_OVERRIDE_EMAILS: " Owen@Example.com, admin@example.com ,owen@example.com"
    });
    const billingAdmin = dependencies.billingAdmin;

    expect(billingAdmin).toBeDefined();
    expect(billingAdmin?.isOperatorAllowed({ email: "owen@example.com" })).toBe(true);
    expect(billingAdmin?.isOperatorAllowed({ email: "ADMIN@example.com" })).toBe(true);
    expect(billingAdmin?.isOperatorAllowed({ email: "regular@example.com" })).toBe(false);
  });

  it("should configure admin analytics access emails from runtime env", (): void => {
    const dependencies = createApiDependenciesFromEnv({
      ANALYTICS_HASH_SECRET: "analytics-hash-secret",
      ADMIN_ANALYTICS_ACCESS_EMAILS: " Owen@Example.com, admin@example.com ,owen@example.com"
    });
    const adminAnalytics = dependencies.adminAnalytics;

    expect(adminAnalytics).toBeDefined();
    expect(adminAnalytics?.isOperatorAllowed({ email: "owen@example.com" })).toBe(true);
    expect(adminAnalytics?.isOperatorAllowed({ email: "ADMIN@example.com" })).toBe(true);
    expect(adminAnalytics?.isOperatorAllowed({ email: "regular@example.com" })).toBe(false);
  });

  it("should keep admin analytics unavailable when access emails are empty", (): void => {
    const dependencies = createApiDependenciesFromEnv({
      ANALYTICS_HASH_SECRET: "analytics-hash-secret",
      ADMIN_ANALYTICS_ACCESS_EMAILS: " , "
    });

    expect(dependencies.accountAnalytics).toBeDefined();
    expect(dependencies.adminAnalytics).toBeUndefined();
  });

  it("should compose billing admin override support for review access without operator emails", (): void => {
    const dependencies = createApiDependenciesFromEnv({
      REVIEW_ACCESS_SECRET: "review-secret"
    });
    const billingAdmin = dependencies.billingAdmin;

    expect(billingAdmin).toBeDefined();
    expect(billingAdmin?.isOperatorAllowed({ email: "regular@example.com" })).toBe(false);
  });
});
