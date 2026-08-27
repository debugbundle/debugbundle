import { describe, expect, it, vi } from "vitest";

import { createApiServer } from "../../../apps/api/src/server.ts";
import {
  createIncidentRetrievalDependency,
  createMemberAuthDependency,
  createObjectStoreReaderDependency,
  createTokenManagementDependency,
  createWebhookDeliveryDependency
} from "../../helpers/api-ingestion-dependencies.ts";
import {
  createLegacyAndroidFrontendException,
  createLegacySwiftFrontendException
} from "../../helpers/mobile-sdk-event-fixtures.ts";
import { createLegacyJavaBackendException } from "../../helpers/java-sdk-event-fixtures.ts";

function createCompatibilityApi() {
  const persistAndEnqueue = vi.fn().mockResolvedValue({
    object_key: "raw-events/project/mobile.json.gz"
  });
  const app = createApiServer({
    ingestionPersistence: {
      persistAndEnqueue
    },
    ingestionMetadata: {
      resolveProjectByTokenHash: vi.fn().mockResolvedValue({
        project_id: "00000000-0000-4000-8000-000000000123",
        organization_id: "org_123",
        organization_plan: "team"
      })
    },
    memberAuth: createMemberAuthDependency(),
    tokenManagement: createTokenManagementDependency(),
    incidentRetrieval: createIncidentRetrievalDependency(),
    objectStoreReader: createObjectStoreReaderDependency(),
    webhookDelivery: createWebhookDeliveryDependency()
  });
  return { app, persistAndEnqueue };
}

describe("API installed SDK compatibility", () => {
  it("accepts and persists the shipped Java runtime-memory shape as a canonical event", async (): Promise<void> => {
    const { app, persistAndEnqueue } = createCompatibilityApi();

    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: {
        authorization: "Bearer dbundle_proj_java"
      },
      payload: {
        events: [createLegacyJavaBackendException()]
      }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({
      accepted: 1,
      rejected: 0,
      errors: []
    });
    expect(persistAndEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        sdk_name: "@debugbundle/sdk-java",
        payload: expect.objectContaining({
          runtime: expect.objectContaining({
            memory: {
              rss: null,
              heap_total: 536_870_912,
              heap_used: 402_653_184,
              external: null,
              peak: null
            },
            framework_extras: expect.objectContaining({
              jvm_name: "OpenJDK 64-Bit Server VM",
              jvm_max_bytes: 1_073_741_824
            })
          })
        })
      }),
      "00000000-0000-4000-8000-000000000123",
      expect.objectContaining({
        capturePreset: "balanced"
      })
    );
  });

  it("accepts and persists a shipped Android event through the canonical events wrapper", async (): Promise<void> => {
    const { app, persistAndEnqueue } = createCompatibilityApi();

    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: {
        authorization: "Bearer dbundle_proj_mobile"
      },
      payload: {
        events: [createLegacyAndroidFrontendException()]
      }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({
      accepted: 1,
      rejected: 0,
      errors: []
    });
    expect(persistAndEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        sdk_name: "@debugbundle/sdk-android",
        payload: expect.objectContaining({
          device: expect.objectContaining({
            os: expect.objectContaining({
              name: "Android"
            })
          })
        })
      }),
      "00000000-0000-4000-8000-000000000123",
      expect.objectContaining({
        capturePreset: "balanced"
      })
    );
  });

  it("accepts the exact shipped Swift batch wrapper after project-token authentication", async (): Promise<void> => {
    const { app, persistAndEnqueue } = createCompatibilityApi();

    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: {
        authorization: "Bearer dbundle_proj_mobile"
      },
      payload: {
        batch: [createLegacySwiftFrontendException()]
      }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({
      accepted: 1,
      rejected: 0,
      errors: []
    });
    expect(persistAndEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        sdk_name: "@debugbundle/sdk-swift",
        event_id: expect.any(String)
      }),
      "00000000-0000-4000-8000-000000000123",
      expect.objectContaining({
        capturePreset: "balanced"
      })
    );
  });

  it("does not turn the legacy batch wrapper into a permissive ingestion path", async (): Promise<void> => {
    const { app, persistAndEnqueue } = createCompatibilityApi();
    const candidate = createLegacySwiftFrontendException();
    candidate["sdk_name"] = "@debugbundle/sdk-browser";

    const response = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: {
        authorization: "Bearer dbundle_proj_mobile"
      },
      payload: {
        batch: [candidate]
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      accepted: 0,
      rejected: 0,
      errors: [
        {
          index: -1,
          reason: "malformed_payload"
        }
      ]
    });
    expect(persistAndEnqueue).not.toHaveBeenCalled();
  });
});
