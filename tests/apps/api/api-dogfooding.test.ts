import { describe, expect, it, vi } from "vitest";

import { createHostedDogfoodingTransport, resolveApiDogfoodingConfig } from "../../../apps/api/src/dogfooding.ts";
import { createApiServer } from "../../../apps/api/src/server.ts";
import { SESSION_COOKIE_NAME, generateMemberToken } from "../../../packages/auth/src/index.js";
import { createEventEnvelope } from "../../../packages/shared-types/src/index.js";

function createDependencies() {
  return {
    ingestionPersistence: {
      persistAndEnqueue: vi.fn()
    },
    ingestionMetadata: {
      resolveProjectByTokenHash: vi.fn()
    },
    memberAuth: {
      resolveMemberByTokenHash: vi.fn()
    },
    tokenManagement: {
      listProjectTokensForOrganization: vi.fn().mockResolvedValue([]),
      createProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
      revokeProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
      listMemberTokensForOrganization: vi.fn().mockResolvedValue([]),
      createMemberTokenForOrganization: vi.fn().mockResolvedValue(null),
      revokeMemberTokenForOrganization: vi.fn().mockResolvedValue(null)
    },
    incidentRetrieval: {
      listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
      getIncidentForOrganization: vi.fn().mockResolvedValue(null),
      listServicesForOrganization: vi.fn().mockResolvedValue([]),
      listIncidentLogsForOrganization: vi.fn().mockResolvedValue([])
    },
    objectStoreReader: {
      getObject: vi.fn()
    },
    webhookDelivery: {
      listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue({ deliveries: [] })
    }
  };
}

describe("api dogfooding", () => {
  it("stays disabled when no project token is configured", () => {
    expect(resolveApiDogfoodingConfig({ API_PORT: "3001" })).toBeNull();
  });

  it("derives the local ingestion endpoint and service defaults from env", () => {
    expect(
      resolveApiDogfoodingConfig({
        API_PORT: "3010",
        APP_BASE_URL: "http://localhost:5291",
        NODE_ENV: "development",
        DEBUGBUNDLE_DOGFOOD_PROJECT_TOKEN: "dbundle_proj_dogfood",
        DEBUGBUNDLE_DOGFOOD_EXPOSE_TRIGGERS: "true"
      })
    ).toEqual({
      deliveryMode: "connected",
      projectToken: "dbundle_proj_dogfood",
      endpoint: "http://127.0.0.1:3010/v1/events",
      environment: "development",
      service: "debugbundle-api",
      enabled: true,
      exposeTriggers: true,
      exposeOwnerTrigger: false,
      captureConsole: false
    });
  });

  it("can enable the local relay without a server-side project token", () => {
    expect(
      resolveApiDogfoodingConfig({
        APP_BASE_URL: "http://localhost:5291",
        DEBUGBUNDLE_DOGFOOD_ENABLED: "true"
      })
    ).toEqual({
      deliveryMode: "local-only",
      projectToken: null,
      endpoint: null,
      environment: "development",
      service: "debugbundle-api",
      enabled: true,
      exposeTriggers: false,
      exposeOwnerTrigger: false,
      captureConsole: false
    });
  });

  it("can enable the owner-authenticated backend verification trigger", () => {
    expect(
      resolveApiDogfoodingConfig({
        DEBUGBUNDLE_DOGFOOD_PROJECT_TOKEN: "dbundle_proj_dogfood",
        DEBUGBUNDLE_DOGFOOD_EXPOSE_OWNER_TRIGGER: "true"
      })
    ).toEqual({
      deliveryMode: "connected",
      projectToken: "dbundle_proj_dogfood",
      endpoint: "http://127.0.0.1:3000/v1/events",
      environment: "development",
      service: "debugbundle-api",
      enabled: true,
      exposeTriggers: false,
      exposeOwnerTrigger: true,
      captureConsole: false
    });
  });

  it("registers the sdk and the backend trigger route when dogfooding is enabled", async () => {
    const sdkPlugin = vi.fn((_fastify, _options, done: () => void) => done());
    const dogfoodingSdk = {
      init: vi.fn(),
      fastify: vi.fn(() => sdkPlugin)
    };

    const app = createApiServer(createDependencies(), {
      dogfoodingEnv: {
        API_PORT: "3001",
        APP_BASE_URL: "http://localhost:5291",
        NODE_ENV: "development",
        DEBUGBUNDLE_DOGFOOD_PROJECT_TOKEN: "dbundle_proj_dogfood",
        DEBUGBUNDLE_DOGFOOD_EXPOSE_TRIGGERS: "true"
      },
      dogfoodingSdk
    });

    const response = await app.inject({
      method: "GET",
      url: "/__dogfood/backend-error"
    });

    expect(dogfoodingSdk.init).toHaveBeenCalledWith(expect.objectContaining({
      projectToken: "dbundle_proj_dogfood",
      endpoint: "http://127.0.0.1:3001/v1/events",
      environment: "development",
      service: "debugbundle-api",
      framework: "fastify",
      captureConsole: false,
      projectMode: "connected",
      transport: expect.any(Function)
    }));
    expect(dogfoodingSdk.fastify).toHaveBeenCalledOnce();
    expect(sdkPlugin).toHaveBeenCalledOnce();
    expect(response.statusCode).toBe(500);
    expect(response.json<{ message: string }>().message).toContain("debugbundle_dogfood_backend_exception");
  });

  it("requires owner auth for the hosted backend verification trigger", async () => {
    const app = createApiServer(createDependencies(), {
      dogfoodingEnv: {
        DEBUGBUNDLE_DOGFOOD_PROJECT_TOKEN: "dbundle_proj_dogfood",
        DEBUGBUNDLE_DOGFOOD_EXPOSE_OWNER_TRIGGER: "true"
      }
    });

    const unauthenticated = await app.inject({
      method: "POST",
      url: "/v1/internal/dogfooding/backend-error"
    });

    expect(unauthenticated.statusCode).toBe(401);
    expect(unauthenticated.json()).toEqual({ error: "invalid_member_token" });
  });

  it("rejects non-owner callers for the hosted backend verification trigger", async () => {
    const dependencies = createDependencies();
    const memberToken = generateMemberToken("member-1");
    dependencies.memberAuth.resolveMemberByTokenHash.mockResolvedValue({
      member_id: "member-1",
      organization_id: "org-1",
      role: "member"
    });

    const app = createApiServer(dependencies, {
      dogfoodingEnv: {
        DEBUGBUNDLE_DOGFOOD_PROJECT_TOKEN: "dbundle_proj_dogfood",
        DEBUGBUNDLE_DOGFOOD_EXPOSE_OWNER_TRIGGER: "true"
      }
    });

    const forbidden = await app.inject({
      method: "POST",
      url: "/v1/internal/dogfooding/backend-error",
      headers: {
        authorization: `Bearer ${memberToken.plaintext}`
      }
    });

    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.json()).toEqual({ error: "forbidden" });
  });

  it("throws the backend verification error for owner-authenticated callers", async () => {
    const dependencies = createDependencies();
    const ownerToken = generateMemberToken("owner-1");
    dependencies.memberAuth.resolveMemberByTokenHash.mockResolvedValue({
      member_id: "owner-1",
      organization_id: "org-1",
      role: "owner"
    });

    const app = createApiServer(dependencies, {
      dogfoodingEnv: {
        DEBUGBUNDLE_DOGFOOD_PROJECT_TOKEN: "dbundle_proj_dogfood",
        DEBUGBUNDLE_DOGFOOD_EXPOSE_OWNER_TRIGGER: "true"
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/internal/dogfooding/backend-error",
      headers: {
        authorization: `Bearer ${ownerToken.plaintext}`
      }
    });

    expect(response.statusCode).toBe(500);
    expect(response.json<{ message: string }>().message).toContain("debugbundle_dogfood_backend_exception");
  });

  it("posts backend dogfooding events through the hosted ingestion transport", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
      status: 202
    } as Response);
    const transport = createHostedDogfoodingTransport("dbundle_proj_dogfood", fetchMock);
    const event = createEventEnvelope({
      event_type: "backend_exception",
      project_token: "dbundle_proj_dogfood",
      service: {
        name: "debugbundle-api",
        environment: "development",
        runtime: "node",
        framework: "fastify"
      },
      payload: {
        name: "Error",
        message: "boom",
        stack: "Error: boom",
        handled: false,
        request: {
          method: "GET",
          path: "/dogfood",
          query: {},
          headers: {},
          body: null
        },
        response: {
          status_code: 500
        },
        runtime: {
          version: "24.0.0"
        }
      }
    });

    await transport({
      endpoint: "http://127.0.0.1:3001/v1/events",
      headers: {
        "x-debugbundle-sdk": "@debugbundle/sdk-node"
      },
      events: [event],
      timeout_ms: 1_000
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:3001/v1/events",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer dbundle_proj_dogfood",
          "Content-Type": "application/json",
          "x-debugbundle-sdk": "@debugbundle/sdk-node"
        })
      })
    );
  });

  it("mounts the browser relay route even without dogfooding config", async () => {
    const app = createApiServer(createDependencies(), {
      dogfoodingEnv: {
        APP_BASE_URL: "http://localhost:5291"
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/debugbundle/browser",
      headers: {
        origin: "http://localhost:5291",
        "content-type": "application/json"
      },
      payload: {
        batch: []
      }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ accepted: 0, rejected: 0, errors: [] });
  });

  it("accepts browser relay batches when a browser session cookie is present", async () => {
    const app = createApiServer(createDependencies(), {
      dogfoodingEnv: {
        APP_BASE_URL: "http://localhost:5291"
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/debugbundle/browser",
      headers: {
        origin: "http://localhost:5291",
        cookie: `${SESSION_COOKIE_NAME}=session-secret`,
        "content-type": "application/json"
      },
      payload: {
        batch: []
      }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ accepted: 0, rejected: 0, errors: [] });
  });

  it("forwards browser relay batches to hosted ingestion when a dogfooding project token is configured", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
      status: 202,
      headers: {
        get: vi.fn().mockReturnValue(null)
      }
    } as unknown as Response);

    const app = createApiServer(createDependencies(), {
      dogfoodingEnv: {
        API_PORT: "3001",
        APP_BASE_URL: "http://localhost:5291",
        NODE_ENV: "development",
        DEBUGBUNDLE_DOGFOOD_PROJECT_TOKEN: "dbundle_proj_dogfood"
      },
      relayFetchImpl: fetchMock
    });

    const response = await app.inject({
      method: "POST",
      url: "/debugbundle/browser",
      headers: {
        origin: "http://localhost:5291",
        "content-type": "application/json"
      },
      payload: {
        batch: [
          {
            schema_version: "2026-03-01",
            event_id: "00000000-0000-4000-8000-000000000001",
            event_type: "frontend_exception",
            sdk_name: "@debugbundle/sdk-browser",
            sdk_version: "0.1.0",
            service: {
              name: "debugbundle-web",
              environment: "development",
              runtime: "browser",
              framework: "react"
            },
            occurred_at: "2026-03-22T22:00:00.000Z",
            correlation: {
              request_id: null,
              trace_id: null,
              session_id: null,
              user_id_hash: null
            },
            payload: {
              name: "Error",
              message: "browser boom",
              stack: "Error: browser boom",
              browser: {
                name: "Chrome",
                version: "123"
              }
            }
          }
        ]
      }
    });

    expect(response.statusCode).toBe(202);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://127.0.0.1:3001/v1/events");
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({
        Authorization: "Bearer dbundle_proj_dogfood",
        "Content-Type": "application/json"
      })
    }));
  });

  it("does not expose the backend trigger route when dogfooding is disabled", async () => {
    const app = createApiServer(createDependencies(), {
      dogfoodingEnv: {
        API_PORT: "3001"
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/__dogfood/backend-error"
    });

    expect(response.statusCode).toBe(404);
  });
});