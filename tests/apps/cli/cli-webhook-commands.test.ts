import { z } from "zod";
import { describe, expect, it, vi } from "vitest";

import { CliAuthStateError } from "../../../apps/cli/src/auth-state.js";
import {
  createWebhookCommand,
  createWebhookWithAuthCommand,
  deleteWebhookCommand,
  deleteWebhookWithAuthCommand,
  listWebhookDeliveriesCommand,
  listWebhookDeliveriesWithAuthCommand,
  listWebhooksCommand,
  listWebhooksWithAuthCommand,
  retryWebhookDeliveryCommand,
  retryWebhookDeliveryWithAuthCommand,
  testWebhookCommand,
  testWebhookWithAuthCommand,
  updateWebhookCommand,
  updateWebhookWithAuthCommand
} from "../../../apps/cli/src/webhook-commands.js";
import { WebhookApiError } from "../../../packages/webhook-client/src/index.js";

const WebhookCreateOutputSchema = z
  .object({
    webhook: z.object({ webhook_id: z.string() }).passthrough()
  })
  .strict();

const WebhookTestOutputSchema = z
  .object({
    delivery: z.object({ event_type: z.string() }).passthrough()
  })
  .strict();

const WebhookUpdateOutputSchema = z
  .object({
    webhook: z.object({ webhook_id: z.string() }).passthrough()
  })
  .strict();

describe("cli webhook commands", () => {
  it("renders webhook list output in human mode", async () => {
    const result = await listWebhooksCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1"
      },
      {
        listWebhooks: vi.fn().mockResolvedValue([
          {
            webhook_id: "wh_1",
            project_id: "proj_1",
            url: "https://hooks.example.test/debugbundle",
            events: ["bundle.created", "bundle.updated"],
            filters: {},
            is_enabled: true,
            created_at: "2026-03-15T00:00:00.000Z",
            updated_at: "2026-03-15T00:00:00.000Z"
          }
        ])
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("wh_1 | enabled | bundle.created,bundle.updated | https://hooks.example.test/debugbundle");
  });

  it("loads stored auth state and forwards it into webhook creation", async () => {
    const readAuthState = vi.fn().mockResolvedValue({
      bearer_token: "dbundle_mem_saved",
      base_url: "https://selfhost.debugbundle.test"
    });
    const httpClient = { request: vi.fn() };
    const createHttpClient = vi.fn().mockReturnValue(httpClient);
    const createWebhook = vi.fn().mockResolvedValue({
      webhook_id: "wh_1",
      project_id: "proj_1",
      url: "https://hooks.example.test/debugbundle",
      events: ["bundle.created"],
      filters: {
        environment: ["production"]
      },
      is_enabled: true,
      created_at: "2026-03-15T00:00:00.000Z",
      updated_at: "2026-03-15T00:00:00.000Z",
      signing_secret: "dbundle_whsec_secret"
    });
    const createApi = vi.fn().mockReturnValue({
      listWebhooks: vi.fn(),
      createWebhook,
      getWebhook: vi.fn(),
      updateWebhook: vi.fn(),
      deleteWebhook: vi.fn(),
      listWebhookDeliveries: vi.fn()
    });

    const result = await createWebhookWithAuthCommand(
      {
        authFilePath: "/tmp/auth.json",
        projectId: "proj_1",
        url: "https://hooks.example.test/debugbundle",
        events: ["bundle.created"],
        filters: {
          environment: ["production"]
        },
        json: true
      },
      {
        readAuthState,
        createHttpClient,
        createApi
      }
    );

    expect(createHttpClient).toHaveBeenCalledWith({
      baseUrl: "https://selfhost.debugbundle.test"
    });
    expect(createWebhook).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_saved",
      projectId: "proj_1",
      url: "https://hooks.example.test/debugbundle",
      events: ["bundle.created"],
      filters: {
        environment: ["production"]
      }
    });
    expect(JSON.parse(result.output)).toEqual({
      webhook: {
        webhook_id: "wh_1",
        project_id: "proj_1",
        url: "https://hooks.example.test/debugbundle",
        events: ["bundle.created"],
        filters: {
          environment: ["production"]
        },
        is_enabled: true,
        created_at: "2026-03-15T00:00:00.000Z",
        updated_at: "2026-03-15T00:00:00.000Z",
        signing_secret: "dbundle_whsec_secret"
      }
    });
  });

  it("maps missing stored auth state to auth/config exit code for webhook commands", async () => {
    const result = await listWebhooksWithAuthCommand(
      {
        projectId: "proj_1"
      },
      {
        readAuthState: vi.fn().mockRejectedValue(new CliAuthStateError("auth_state_missing", "Not logged in."))
      }
    );

    expect(result.exitCode).toBe(2);
    expect(result.output).toBe("Not logged in.");
  });

  it("formats remaining webhook command outputs and json branches", async () => {
    const createResult = await createWebhookCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        url: "https://hooks.example.test/debugbundle",
        events: ["bundle.created"]
      },
      {
        createWebhook: vi.fn().mockResolvedValue({
          webhook_id: "wh_1",
          project_id: "proj_1",
          url: "https://hooks.example.test/debugbundle",
          events: ["bundle.created"],
          filters: {},
          is_enabled: true,
          created_at: "2026-03-15T00:00:00.000Z",
          updated_at: "2026-03-15T00:00:00.000Z",
          signing_secret: "dbundle_whsec_secret"
        })
      }
    );

    const updateResult = await updateWebhookCommand(
      {
        bearerToken: "dbundle_mem_x",
        webhookId: "wh_1",
        isEnabled: false,
        json: true
      },
      {
        updateWebhook: vi.fn().mockResolvedValue({
          webhook_id: "wh_1",
          project_id: "proj_1",
          url: "https://hooks.example.test/debugbundle",
          events: ["bundle.created"],
          filters: {},
          is_enabled: false,
          created_at: "2026-03-15T00:00:00.000Z",
          updated_at: "2026-03-15T00:05:00.000Z"
        })
      }
    );

    const deleteResult = await deleteWebhookCommand(
      {
        bearerToken: "dbundle_mem_x",
        webhookId: "wh_1"
      },
      {
        deleteWebhook: vi.fn().mockResolvedValue({ webhook_id: "wh_1" })
      }
    );

    const deliveriesResult = await listWebhookDeliveriesCommand(
      {
        bearerToken: "dbundle_mem_x",
        webhookId: "wh_1",
        json: true
      },
      {
        listWebhookDeliveries: vi.fn().mockResolvedValue([
          {
            delivery_id: "del_1",
            event_type: "bundle.created",
            status: "delivered",
            attempt_count: 1,
            next_attempt_at: null,
            last_response_code: 200,
            last_attempted_at: "2026-03-15T00:00:01.000Z",
            last_error: null
          }
        ])
      }
    );

    const testResult = await testWebhookCommand(
      {
        bearerToken: "dbundle_mem_x",
        webhookId: "wh_1",
        eventType: "verification.failed",
        json: true
      },
      {
        testWebhook: vi.fn().mockResolvedValue({
          delivery_id: "del_test",
          event_type: "verification.failed",
          status: "pending",
          attempt_count: 1,
          next_attempt_at: null,
          last_response_code: null,
          last_attempted_at: null,
          last_error: null
        })
      }
    );

    expect(createResult.output).toContain("Webhook created: wh_1");
    expect(createResult.output).toContain("Signing secret: dbundle_whsec_secret");
    expect(JSON.parse(updateResult.output)).toEqual({
      webhook: {
        webhook_id: "wh_1",
        project_id: "proj_1",
        url: "https://hooks.example.test/debugbundle",
        events: ["bundle.created"],
        filters: {},
        is_enabled: false,
        created_at: "2026-03-15T00:00:00.000Z",
        updated_at: "2026-03-15T00:05:00.000Z"
      }
    });
    expect(deleteResult.output).toContain("Webhook deleted: wh_1");
    expect(JSON.parse(deliveriesResult.output)).toEqual({
      deliveries: [
        {
          delivery_id: "del_1",
          event_type: "bundle.created",
          status: "delivered",
          attempt_count: 1,
          next_attempt_at: null,
          last_response_code: 200,
          last_attempted_at: "2026-03-15T00:00:01.000Z",
          last_error: null
        }
      ]
    });
    expect(JSON.parse(testResult.output)).toEqual({
      delivery: {
        delivery_id: "del_test",
        event_type: "verification.failed",
        status: "pending",
        attempt_count: 1,
        next_attempt_at: null,
        last_response_code: null,
        last_attempted_at: null,
        last_error: null
      }
    });
  });

  it("maps auth, not-found, validation, and unknown webhook errors", async () => {
    const authResult = await deleteWebhookCommand(
      {
        bearerToken: "dbundle_mem_x",
        webhookId: "wh_1"
      },
      {
        deleteWebhook: vi.fn().mockRejectedValue(new WebhookApiError(401, "invalid_member_token"))
      }
    );

    const notFoundResult = await listWebhookDeliveriesCommand(
      {
        bearerToken: "dbundle_mem_x",
        webhookId: "wh_missing"
      },
      {
        listWebhookDeliveries: vi.fn().mockRejectedValue(new WebhookApiError(404, "webhook_not_found"))
      }
    );

    const validationResult = await updateWebhookCommand(
      {
        bearerToken: "dbundle_mem_x",
        webhookId: "wh_1",
        isEnabled: false
      },
      {
        updateWebhook: vi.fn().mockRejectedValue(new WebhookApiError(400, "invalid_payload"))
      }
    );

    const unknownResult = await deleteWebhookCommand(
      {
        bearerToken: "dbundle_mem_x",
        webhookId: "wh_1"
      },
      {
        deleteWebhook: vi.fn().mockRejectedValue("boom")
      }
    );

    expect(authResult.exitCode).toBe(2);
    expect(notFoundResult.exitCode).toBe(3);
    expect(validationResult.exitCode).toBe(4);
    expect(unknownResult).toEqual({
      exitCode: 1,
      output: "boom"
    });
  });

  it("loads stored auth state for update, delete, and deliveries wrappers", async () => {
    const readAuthState = vi.fn().mockResolvedValue({
      bearer_token: "dbundle_mem_saved",
      base_url: "https://selfhost.debugbundle.test"
    });
    const createApi = vi.fn().mockReturnValue({
      listWebhooks: vi.fn(),
      createWebhook: vi.fn(),
      getWebhook: vi.fn(),
      updateWebhook: vi.fn().mockResolvedValue({
        webhook_id: "wh_1",
        project_id: "proj_1",
        url: "https://hooks.example.test/updated",
        events: ["bundle.updated"],
        filters: {},
        is_enabled: false,
        created_at: "2026-03-15T00:00:00.000Z",
        updated_at: "2026-03-15T00:05:00.000Z"
      }),
      deleteWebhook: vi.fn().mockResolvedValue({ webhook_id: "wh_1" }),
      listWebhookDeliveries: vi.fn().mockResolvedValue([]),
      testWebhook: vi.fn().mockResolvedValue({
        delivery_id: "del_test",
        event_type: "verification.passed",
        status: "pending",
        attempt_count: 1,
        next_attempt_at: null,
        last_response_code: null,
        last_attempted_at: null,
        last_error: null
      })
    });

    const updateResult = await updateWebhookWithAuthCommand(
      {
        webhookId: "wh_1",
        url: "https://hooks.example.test/updated"
      },
      {
        readAuthState,
        createApi
      }
    );
    const deleteResult = await deleteWebhookWithAuthCommand(
      {
        webhookId: "wh_1"
      },
      {
        readAuthState,
        createApi
      }
    );
    const deliveriesResult = await listWebhookDeliveriesWithAuthCommand(
      {
        webhookId: "wh_1",
        limit: 5
      },
      {
        readAuthState,
        createApi
      }
    );
    const testResult = await testWebhookWithAuthCommand(
      {
        webhookId: "wh_1"
      },
      {
        readAuthState,
        createApi
      }
    );

    expect(updateResult.exitCode).toBe(0);
    expect(deleteResult.exitCode).toBe(0);
    expect(deliveriesResult.exitCode).toBe(0);
    expect(testResult.exitCode).toBe(0);
  });

  it("covers empty human output, json branches, retry command, and remaining wrapper flows", async () => {
    const emptyList = await listWebhooksCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1"
      },
      {
        listWebhooks: vi.fn().mockResolvedValue([])
      }
    );
    const createJson = await createWebhookCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "proj_1",
        url: "https://hooks.example.test/debugbundle",
        events: ["bundle.created"],
        filters: { service: ["checkout-api"] },
        isEnabled: false,
        json: true
      },
      {
        createWebhook: vi.fn().mockResolvedValue({
          webhook_id: "wh_2",
          project_id: "proj_1",
          url: "https://hooks.example.test/debugbundle",
          events: ["bundle.created"],
          filters: { service: ["checkout-api"] },
          is_enabled: false,
          created_at: "2026-03-15T00:00:00.000Z",
          updated_at: "2026-03-15T00:00:00.000Z",
          signing_secret: "dbundle_whsec_secret"
        })
      }
    );
    const updateHuman = await updateWebhookCommand(
      {
        bearerToken: "dbundle_mem_x",
        webhookId: "wh_2",
        url: "https://hooks.example.test/updated",
        events: ["bundle.updated"],
        filters: { verification: true }
      },
      {
        updateWebhook: vi.fn().mockResolvedValue({
          webhook_id: "wh_2",
          project_id: "proj_1",
          url: "https://hooks.example.test/updated",
          events: ["bundle.updated"],
          filters: { verification: true },
          is_enabled: true,
          created_at: "2026-03-15T00:00:00.000Z",
          updated_at: "2026-03-15T00:10:00.000Z"
        })
      }
    );
    const emptyDeliveries = await listWebhookDeliveriesCommand(
      {
        bearerToken: "dbundle_mem_x",
        webhookId: "wh_2"
      },
      {
        listWebhookDeliveries: vi.fn().mockResolvedValue([])
      }
    );
    const retryResult = await retryWebhookDeliveryCommand(
      {
        bearerToken: "dbundle_mem_x",
        webhookId: "wh_2",
        deliveryId: "del_2",
        json: true
      },
      {
        retryWebhookDelivery: vi.fn().mockResolvedValue({ delivery_id: "del_2", event_type: "bundle.created" })
      }
    );
    const readAuthState = vi.fn().mockResolvedValue({
      bearer_token: "dbundle_mem_saved",
      base_url: "https://selfhost.debugbundle.test"
    });
    const createApi = vi.fn().mockReturnValue({
      listWebhooks: vi.fn().mockResolvedValue([]),
      createWebhook: vi.fn(),
      getWebhook: vi.fn(),
      updateWebhook: vi.fn(),
      deleteWebhook: vi.fn(),
      testWebhook: vi.fn(),
      listWebhookDeliveries: vi.fn(),
      retryWebhookDelivery: vi.fn().mockResolvedValue({ delivery_id: "del_3", event_type: "verification.failed" })
    });
    const listWrapper = await listWebhooksWithAuthCommand(
      {
        projectId: "proj_1",
        json: true
      },
      {
        readAuthState,
        createApi
      }
    );
    const retryWrapper = await retryWebhookDeliveryWithAuthCommand(
      {
        webhookId: "wh_2",
        deliveryId: "del_3"
      },
      {
        readAuthState,
        createApi
      }
    );

    expect(emptyList.output).toBe("No webhooks found.");
    expect(WebhookCreateOutputSchema.parse(JSON.parse(createJson.output)).webhook.webhook_id).toBe("wh_2");
    expect(updateHuman.output).toContain("Webhook updated: wh_2");
    expect(emptyDeliveries.output).toBe("No deliveries found.");
    expect(JSON.parse(retryResult.output)).toEqual({ delivery_id: "del_2", event_type: "bundle.created" });
    expect(JSON.parse(listWrapper.output)).toEqual({ webhooks: [] });
    expect(retryWrapper.output).toContain("Delivery retried: del_3 | verification.failed");
  });

  it("maps retry validation errors and covers wrapper test/list defaults", async () => {
    const validation = await retryWebhookDeliveryCommand(
      {
        bearerToken: "dbundle_mem_x",
        webhookId: "wh_9",
        deliveryId: "del_9"
      },
      {
        retryWebhookDelivery: vi.fn().mockRejectedValue(new WebhookApiError(400, "invalid_params"))
      }
    );
    const readAuthState = vi.fn().mockResolvedValue({
      bearer_token: "dbundle_mem_saved",
      base_url: "https://selfhost.debugbundle.test"
    });
    const createApi = vi.fn().mockReturnValue({
      listWebhooks: vi.fn(),
      createWebhook: vi.fn(),
      getWebhook: vi.fn(),
      updateWebhook: vi.fn(),
      deleteWebhook: vi.fn(),
      testWebhook: vi.fn().mockResolvedValue({
        delivery_id: "del_default",
        event_type: "verification.passed",
        status: "pending",
        attempt_count: 1,
        next_attempt_at: null,
        last_response_code: null,
        last_attempted_at: null,
        last_error: null
      }),
      listWebhookDeliveries: vi.fn().mockResolvedValue([]),
      retryWebhookDelivery: vi.fn()
    });

    const testResult = await testWebhookWithAuthCommand(
      {
        webhookId: "wh_9",
        json: true
      },
      {
        readAuthState,
        createApi
      }
    );
    const deliveriesResult = await listWebhookDeliveriesWithAuthCommand(
      {
        webhookId: "wh_9",
        json: true
      },
      {
        readAuthState,
        createApi
      }
    );

    expect(validation.exitCode).toBe(4);
    expect(WebhookTestOutputSchema.parse(JSON.parse(testResult.output)).delivery.event_type).toBe("verification.passed");
    expect(JSON.parse(deliveriesResult.output)).toEqual({ deliveries: [] });
  });

  it("maps not-found retry errors and renders human test output", async () => {
    const retryNotFound = await retryWebhookDeliveryCommand(
      {
        bearerToken: "dbundle_mem_x",
        webhookId: "wh_10",
        deliveryId: "del_missing"
      },
      {
        retryWebhookDelivery: vi.fn().mockRejectedValue(new WebhookApiError(404, "delivery_not_found"))
      }
    );
    const testHuman = await testWebhookCommand(
      {
        bearerToken: "dbundle_mem_x",
        webhookId: "wh_10"
      },
      {
        testWebhook: vi.fn().mockResolvedValue({
          delivery_id: "del_human",
          event_type: "verification.passed",
          status: "pending",
          attempt_count: 1,
          next_attempt_at: null,
          last_response_code: null,
          last_attempted_at: null,
          last_error: null
        })
      }
    );

    expect(retryNotFound.exitCode).toBe(3);
    expect(testHuman.output).toContain("Webhook test queued: del_human | verification.passed | attempts=1");
  });

  it("forwards optional fields through create/update auth wrappers", async () => {
    const readAuthState = vi.fn().mockResolvedValue({
      bearer_token: "dbundle_mem_saved",
      base_url: "https://selfhost.debugbundle.test"
    });
    const createWebhook = vi.fn().mockResolvedValue({
      webhook_id: "wh_wrap",
      project_id: "proj_1",
      url: "https://hooks.example.test/debugbundle",
      events: ["bundle.created"],
      filters: { environment: ["production"] },
      is_enabled: false,
      created_at: "2026-03-15T00:00:00.000Z",
      updated_at: "2026-03-15T00:00:00.000Z",
      signing_secret: "dbundle_whsec_secret"
    });
    const updateWebhook = vi.fn().mockResolvedValue({
      webhook_id: "wh_wrap",
      project_id: "proj_1",
      url: "https://hooks.example.test/updated",
      events: ["bundle.updated"],
      filters: { verification: true },
      is_enabled: true,
      created_at: "2026-03-15T00:00:00.000Z",
      updated_at: "2026-03-15T00:10:00.000Z"
    });
    const createApi = vi.fn().mockReturnValue({
      listWebhooks: vi.fn(),
      createWebhook,
      getWebhook: vi.fn(),
      updateWebhook,
      deleteWebhook: vi.fn(),
      testWebhook: vi.fn(),
      listWebhookDeliveries: vi.fn(),
      retryWebhookDelivery: vi.fn()
    });

    const createResult = await createWebhookWithAuthCommand(
      {
        projectId: "proj_1",
        url: "https://hooks.example.test/debugbundle",
        events: ["bundle.created"],
        filters: { environment: ["production"] },
        isEnabled: false
      },
      {
        readAuthState,
        createApi
      }
    );
    const updateResult = await updateWebhookWithAuthCommand(
      {
        webhookId: "wh_wrap",
        events: ["bundle.updated"],
        filters: { verification: true },
        isEnabled: true,
        json: true
      },
      {
        readAuthState,
        createApi
      }
    );

    expect(createResult.output).toContain("Webhook created: wh_wrap");
    expect(WebhookUpdateOutputSchema.parse(JSON.parse(updateResult.output)).webhook.webhook_id).toBe("wh_wrap");
  });
});