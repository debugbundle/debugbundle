import { configurationFixtureDb } from "../../helpers/project-configuration-fixture.js";
import { describe, expect, it, vi } from "vitest";
import { createPostgresWebhookDeliveryStore as createRawWebhookStore } from "../../../packages/storage/src/index.js";

const createPostgresWebhookDeliveryStore = (db: Parameters<typeof createRawWebhookStore>[0]) =>
  createRawWebhookStore(configurationFixtureDb(db.query));
describe("postgres metadata webhooks", () => {
  it("should persist webhook delivery intent", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const store = createPostgresWebhookDeliveryStore({ query });

    const result = await store.createDeliveryIntent({
      webhook_id: "wh_123",
      project_id: "proj_123",
      incident_id: "inc_123",
      event_type: "bundle.reopened",
      occurred_at: "2026-03-11T00:00:00.000Z",
      target_url: "https://hooks.example.test/debugbundle",
      signing_secret: "secret_123",
      payload: { incident_id: "inc_123" }
    });

    expect(result.delivery_id).toBeDefined();
    expect(query).toHaveBeenCalledOnce();
  });

  it("should transition webhook delivery to retrying then failed across attempts", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ webhook_id: "wh_123" }] })
      .mockResolvedValueOnce({ rows: [{ status: "failed" }] });
    const store = createPostgresWebhookDeliveryStore({ query });

    const first = await store.markDeliveryAttempt({
      delivery_id: "del_123",
      attempt: 1,
      delivered: false,
      error_message: "timeout",
      response_code: null
    });

    const final = await store.markDeliveryAttempt({
      delivery_id: "del_123",
      attempt: 6,
      delivered: false,
      error_message: "still down",
      response_code: 503
    });

    expect(first).toEqual({ status: "retrying", next_attempt: 2 });
    expect(final).toEqual({ status: "failed", next_attempt: null });
    expect(query).toHaveBeenCalledTimes(3);
  });

  it("should disable a webhook after 50 consecutive final delivery failures", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ webhook_id: "wh_123" }] })
      .mockResolvedValueOnce({
        rows: Array.from({ length: 50 }, () => ({ status: "failed" }))
      })
      .mockResolvedValueOnce({ rows: [] });
    const store = createPostgresWebhookDeliveryStore({ query });

    const result = await store.markDeliveryAttempt({
      delivery_id: "del_123",
      attempt: 6,
      delivered: false,
      error_message: "still down",
      response_code: 503
    });

    expect(result).toEqual({
      status: "failed",
      next_attempt: null,
      webhook_disabled: true,
      webhook_id: "wh_123"
    });
    expect(query).toHaveBeenNthCalledWith(3, expect.stringContaining("UPDATE agent_webhooks"), [
      "wh_123"
    ]);
  });

  it("should claim due webhook deliveries with incremented attempts", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({ rows: [{ delivery_id: "del_1", attempt: 2 }] });
    const store = createPostgresWebhookDeliveryStore({ query });

    const jobs = await store.claimDueDeliveries(20);

    expect(jobs).toEqual([{ delivery_id: "del_1", attempt: 2 }]);
    expect(query).toHaveBeenCalledOnce();
  });

  it("should list matching enabled webhooks by event and filters", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          webhook_id: "wh_1",
          target_url: "https://hooks.example.test/one",
          signing_secret: "secret_one",
          filters: {
            environment: ["production"],
            service: ["checkout-api"],
            severity_min: "medium"
          }
        },
        {
          webhook_id: "wh_2",
          target_url: "https://hooks.example.test/two",
          signing_secret: "secret_two",
          filters: {
            environment: ["staging"]
          }
        }
      ]
    });
    const store = createPostgresWebhookDeliveryStore({ query });

    const matches = await store.listMatchingWebhooks({
      project_id: "proj_123",
      event_type: "bundle.reopened",
      environment: "production",
      service_name: "checkout-api",
      severity: "high"
    });

    expect(matches).toEqual([
      {
        webhook_id: "wh_1",
        target_url: "https://hooks.example.test/one",
        signing_secret: "secret_one",
        filters: {
          environment: ["production"],
          service: ["checkout-api"],
          severity_min: "medium"
        }
      }
    ]);
  });

  it("should list recent deliveries for a webhook", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          delivery_id: "del_123",
          event_type: "bundle.reopened",
          status: "delivered",
          attempt_count: 1,
          next_attempt_at: null,
          last_response_code: 200,
          last_attempted_at: "2026-03-11T00:00:01.000Z",
          last_error: null
        }
      ]
    });
    const store = createPostgresWebhookDeliveryStore({ query });

    const deliveries = await store.listDeliveriesForWebhook("wh_123", 10);

    expect(deliveries).toEqual([
      {
        delivery_id: "del_123",
        event_type: "bundle.reopened",
        status: "delivered",
        attempt_count: 1,
        next_attempt_at: null,
        last_response_code: 200,
        last_attempted_at: "2026-03-11T00:00:01.000Z",
        last_error: null
      }
    ]);
    expect(query).toHaveBeenCalledOnce();
  });

  it("should return scoped deliveries for webhook inside organization", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ webhook_id: "wh_123" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            delivery_id: "del_123",
            event_type: "bundle.reopened",
            status: "delivered",
            attempt_count: 1,
            next_attempt_at: null,
            last_response_code: 200,
            last_attempted_at: "2026-03-11T00:00:01.000Z",
            last_error: null
          }
        ]
      });
    const store = createPostgresWebhookDeliveryStore({ query });

    const scoped = await store.listDeliveriesForWebhookInOrganization({
      webhookId: "wh_123",
      organizationId: "org_123",
      limit: 10
    });

    expect(scoped).toEqual({
      deliveries: [
        {
          delivery_id: "del_123",
          event_type: "bundle.reopened",
          status: "delivered",
          attempt_count: 1,
          next_attempt_at: null,
          last_response_code: 200,
          last_attempted_at: "2026-03-11T00:00:01.000Z",
          last_error: null
        }
      ]
    });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("should return null scoped deliveries when webhook is outside organization", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [] });
    const store = createPostgresWebhookDeliveryStore({ query });

    const scoped = await store.listDeliveriesForWebhookInOrganization({
      webhookId: "wh_123",
      organizationId: "org_999",
      limit: 10
    });

    expect(scoped).toBeNull();
    expect(query).toHaveBeenCalledOnce();
  });

  it("should list webhooks for an in-scope project", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "proj_123" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            webhook_id: "wh_123",
            project_id: "proj_123",
            created_by_user_id: "usr_123",
            url: "https://hooks.example.test/debugbundle",
            events: ["bundle.created", "bundle.updated"],
            filters: { environment: ["production"] },
            is_enabled: true,
            created_at: "2026-03-15T00:00:00.000Z",
            updated_at: "2026-03-15T00:00:00.000Z"
          }
        ]
      });
    const store = createPostgresWebhookDeliveryStore({ query });

    const webhooks = await store.listWebhooksForOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      limit: 10
    });

    expect(webhooks).toEqual([
      {
        webhook_id: "wh_123",
        project_id: "proj_123",
        created_by_user_id: "usr_123",
        url: "https://hooks.example.test/debugbundle",
        events: ["bundle.created", "bundle.updated"],
        filters: { environment: ["production"] },
        is_enabled: true,
        created_at: "2026-03-15T00:00:00.000Z",
        updated_at: "2026-03-15T00:00:00.000Z"
      }
    ]);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("should return null when listing webhooks for an out-of-scope project", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [] });
    const store = createPostgresWebhookDeliveryStore({ query });

    const webhooks = await store.listWebhooksForOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      limit: 10
    });

    expect(webhooks).toBeNull();
    expect(query).toHaveBeenCalledOnce();
  });

  it("should create, fetch, update, and delete a scoped webhook", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "proj_123" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            webhook_id: "wh_123",
            project_id: "proj_123",
            created_by_user_id: "usr_123",
            url: "https://hooks.example.test/debugbundle",
            events: ["bundle.created"],
            filters: { environment: ["production"] },
            is_enabled: true,
            created_at: "2026-03-15T00:00:00.000Z",
            updated_at: "2026-03-15T00:00:00.000Z"
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          {
            webhook_id: "wh_123",
            project_id: "proj_123",
            created_by_user_id: "usr_123",
            url: "https://hooks.example.test/debugbundle",
            events: ["bundle.created"],
            filters: { environment: ["production"] },
            is_enabled: true,
            created_at: "2026-03-15T00:00:00.000Z",
            updated_at: "2026-03-15T00:00:00.000Z"
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          {
            webhook_id: "wh_123",
            project_id: "proj_123",
            created_by_user_id: "usr_123",
            url: "https://hooks.example.test/updated",
            events: ["bundle.updated"],
            filters: { environment: ["staging"] },
            is_enabled: false,
            created_at: "2026-03-15T00:00:00.000Z",
            updated_at: "2026-03-15T00:05:00.000Z"
          }
        ]
      })
      .mockResolvedValueOnce({ rows: [{ webhook_id: "wh_123" }] });
    const store = createPostgresWebhookDeliveryStore({ query });

    const created = await store.createWebhookForOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      created_by_user_id: "usr_123",
      url: "https://hooks.example.test/debugbundle",
      signing_secret: "dbundle_whsec_test",
      events: ["bundle.created"],
      filters: { environment: ["production"] },
      is_enabled: true
    });
    const fetched = await store.getWebhookForOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      webhook_id: "wh_123"
    });
    const updated = await store.updateWebhookForOrganization({
      organization_id: "org_123",
      webhook_id: "wh_123",
      url: "https://hooks.example.test/updated",
      events: ["bundle.updated"],
      filters: { environment: ["staging"] },
      is_enabled: false
    });
    const deleted = await store.deleteWebhookForOrganization({
      organization_id: "org_123",
      webhook_id: "wh_123"
    });

    expect(created).toEqual({
      webhook_id: "wh_123",
      project_id: "proj_123",
      created_by_user_id: "usr_123",
      url: "https://hooks.example.test/debugbundle",
      events: ["bundle.created"],
      filters: { environment: ["production"] },
      is_enabled: true,
      created_at: "2026-03-15T00:00:00.000Z",
      updated_at: "2026-03-15T00:00:00.000Z"
    });
    expect(fetched).toEqual(created);
    expect(updated).toEqual({
      webhook_id: "wh_123",
      project_id: "proj_123",
      created_by_user_id: "usr_123",
      url: "https://hooks.example.test/updated",
      events: ["bundle.updated"],
      filters: { environment: ["staging"] },
      is_enabled: false,
      created_at: "2026-03-15T00:00:00.000Z",
      updated_at: "2026-03-15T00:05:00.000Z"
    });
    expect(deleted).toEqual({ webhook_id: "wh_123" });
  });

  it("should read webhook delivery intents and create scoped test deliveries", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            delivery_id: "del_123",
            webhook_id: "wh_123",
            project_id: "proj_123",
            incident_id: "inc_123",
            event_type: "bundle.created",
            status: "pending",
            attempt_count: 0,
            occurred_at: "2026-03-11T00:00:00.000Z",
            target_url: "https://hooks.example.test/debugbundle",
            next_attempt_at: null,
            last_response_code: null,
            last_attempted_at: null,
            last_error: null,
            payload: { ok: true },
            signing_secret: "secret_123"
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          {
            webhook_id: "wh_123",
            project_id: "proj_123",
            target_url: "https://hooks.example.test/debugbundle",
            signing_secret: "secret_123"
          }
        ]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const store = createPostgresWebhookDeliveryStore({ query });

    await expect(store.getDeliveryIntent("del_123")).resolves.toMatchObject({
      delivery_id: "del_123"
    });
    await expect(
      store.createTestDeliveryForOrganization({
        organization_id: "org_123",
        webhook_id: "wh_123",
        event_type: "verification.failed"
      })
    ).resolves.toMatchObject({ event_type: "verification.failed" });
    expect(query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("INSERT INTO webhook_deliveries"),
      expect.arrayContaining([
        "wh_123",
        "proj_123",
        null,
        "verification.failed",
        "https://hooks.example.test/debugbundle",
        "secret_123"
      ])
    );
    await expect(
      store.createTestDeliveryForOrganization({
        organization_id: "org_123",
        webhook_id: "wh_missing",
        event_type: "verification.failed"
      })
    ).resolves.toBeNull();
  });

  it("should retry deliveries only for enabled scoped webhooks", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ webhook_id: "wh_123" }] })
      .mockResolvedValueOnce({
        rows: [{ delivery_id: "del_retry", event_type: "verification.failed" }]
      })
      .mockResolvedValueOnce({ rows: [] });
    const store = createPostgresWebhookDeliveryStore({ query });

    await expect(
      store.retryDeliveryForOrganization({
        organization_id: "org_123",
        webhook_id: "wh_123",
        delivery_id: "del_retry"
      })
    ).resolves.toEqual({ delivery_id: "del_retry", event_type: "verification.failed" });
    await expect(
      store.retryDeliveryForOrganization({
        organization_id: "org_123",
        webhook_id: "wh_missing",
        delivery_id: "del_retry"
      })
    ).resolves.toBeNull();
  });

  it("should filter matching webhooks by bundle type and verification flags", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          webhook_id: "wh_1",
          target_url: "https://hooks.example.test/one",
          signing_secret: "secret_one",
          filters: {
            bundle_type: ["failure"],
            verification: true
          }
        },
        {
          webhook_id: "wh_2",
          target_url: "https://hooks.example.test/two",
          signing_secret: "secret_two",
          filters: {
            bundle_type: ["improvement"],
            verification: false
          }
        }
      ]
    });
    const store = createPostgresWebhookDeliveryStore({ query });

    const matches = await store.listMatchingWebhooks({
      project_id: "proj_123",
      event_type: "verification.passed",
      environment: "production",
      service_name: "checkout-api",
      severity: "high",
      bundle_type: "failure",
      is_verification: true
    });

    expect(matches).toEqual([
      {
        webhook_id: "wh_1",
        target_url: "https://hooks.example.test/one",
        signing_secret: "secret_one",
        filters: {
          bundle_type: ["failure"],
          verification: true
        }
      }
    ]);
  });

  it("should mark webhook deliveries delivered and keep failed webhooks enabled below the disable threshold", async (): Promise<void> => {
    const deliveredQuery = vi.fn().mockResolvedValue({ rows: [] });
    const deliveredStore = createPostgresWebhookDeliveryStore({ query: deliveredQuery });

    await expect(
      deliveredStore.markDeliveryAttempt({
        delivery_id: "del_200",
        attempt: 1,
        delivered: true,
        response_code: 200,
        error_message: null
      })
    ).resolves.toEqual({ status: "delivered", next_attempt: null });

    const failedQuery = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ webhook_id: "wh_123" }] })
      .mockResolvedValueOnce({ rows: [{ status: "failed" }, { status: "retrying" }] });
    const failedStore = createPostgresWebhookDeliveryStore({ query: failedQuery });

    await expect(
      failedStore.markDeliveryAttempt({
        delivery_id: "del_500",
        attempt: 6,
        delivered: false,
        error_message: "upstream_failed",
        response_code: 500
      })
    ).resolves.toEqual({ status: "failed", next_attempt: null });
  });

  it("should exclude mismatched webhook filters for severity, bundle type, and verification", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          webhook_id: "wh_1",
          target_url: "https://hooks.example.test/one",
          signing_secret: "secret_one",
          filters: {
            severity_min: "critical",
            bundle_type: ["improvement"],
            verification: false,
            service: ["checkout-api"]
          }
        }
      ]
    });
    const store = createPostgresWebhookDeliveryStore({ query });

    const matches = await store.listMatchingWebhooks({
      project_id: "proj_123",
      event_type: "verification.passed",
      environment: "production",
      service_name: "checkout-api",
      severity: "high",
      bundle_type: "failure",
      is_verification: true
    });

    expect(matches).toEqual([]);
  });
});
