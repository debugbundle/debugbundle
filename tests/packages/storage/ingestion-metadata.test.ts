import { describe, expect, it, vi } from "vitest";

import {
  createIngestionMetadataService,
  hashToken,
  type IncidentFrequencyCounter,
  type MetadataStore,
  type UpsertIncidentInput
} from "../../../packages/storage/src/index.js";
import { createEventEnvelope } from "../../../packages/shared-types/src/index.js";
import { normalizeEvent } from "../../../packages/event-normalizer/src/index.js";

function createMetadataStore(overrides: Partial<MetadataStore>): MetadataStore {
  return {
    resolveProjectByTokenHash: vi.fn(),
    resolveMemberByTokenHash: vi.fn(),
    listIncidentsForOrganization: vi.fn(),
    getIncidentForOrganization: vi.fn(),
    resolveIncidentForOrganization: vi.fn(),
    listIncidentLogsForOrganization: vi.fn(),
    upsertIncident: vi.fn(),
    insertIncidentEvent: vi.fn(),
    markIncidentSpiking: vi.fn(),
    recordIncidentEventRetention: vi.fn(),
    reopenIncidentForOrganization: vi.fn(),
    ...overrides
  };
}

describe("ingestion metadata service", () => {
  it("should hash tokens deterministically with sha256", (): void => {
    const token = "dbundle_proj_test_token";

    const first = hashToken(token);
    const second = hashToken(token);

    expect(first).toBe(second);
    expect(first).toHaveLength(64);
  });

  it("should persist incident and event linkage", async (): Promise<void> => {
    const upsertIncident = vi
      .fn()
      .mockResolvedValue({
        incident_id: "inc_123",
        matched_fields: ["normalized_message"],
        status: "open",
        regressed_now: false,
        occurrence_count: 1
      });
    const insertIncidentEvent = vi.fn().mockResolvedValue(undefined);
    const markIncidentSpiking = vi.fn().mockResolvedValue(false);

    const store = createMetadataStore({
      resolveProjectByTokenHash: vi.fn().mockResolvedValue({ project_id: "proj_123" }),
      upsertIncident,
      insertIncidentEvent,
      markIncidentSpiking
    });

    const service = createIngestionMetadataService(store);

    const event = createEventEnvelope({
      event_type: "backend_exception",
      service: {
        name: "checkout-api",
        environment: "production",
        runtime: "node",
        framework: "fastify"
      },
      payload: {
        name: "TypeError",
        message: "boom",
        stack: "TypeError: boom",
        handled: false,
        request: {
          method: "GET",
          path: "/users/123",
          query: {},
          headers: {},
          body: null
        },
        response: {
          status_code: 500
        },
        runtime: {
          version: "22.0.0"
        }
      }
    });

    await service.persistEventMetadata({
      projectId: "proj_123",
      event,
      normalizedEvent: normalizeEvent(event),
      fingerprint: "fp_123"
    });

    expect(upsertIncident).toHaveBeenCalledOnce();
    expect(insertIncidentEvent).toHaveBeenCalledOnce();
  });

  it("should return null for unknown token", async (): Promise<void> => {
    const store = createMetadataStore({
      resolveProjectByTokenHash: vi.fn().mockResolvedValue(null),
      upsertIncident: vi.fn(),
      insertIncidentEvent: vi.fn(),
      markIncidentSpiking: vi.fn()
    });

    const service = createIngestionMetadataService(store);
    const resolved = await service.resolveProjectFromToken("dbundle_proj_missing");

    expect(resolved).toBeNull();
  });

  it("should map error_suppressed events to medium severity", async (): Promise<void> => {
    const upsertIncident = vi
      .fn()
      .mockResolvedValue({ incident_id: "inc_123", matched_fields: [], status: "open", regressed_now: false, occurrence_count: 1 });
    const store = createMetadataStore({
      resolveProjectByTokenHash: vi.fn().mockResolvedValue({ project_id: "proj_123" }),
      upsertIncident,
      insertIncidentEvent: vi.fn().mockResolvedValue(undefined),
      markIncidentSpiking: vi.fn().mockResolvedValue(false)
    });

    const service = createIngestionMetadataService(store);
    const event = createEventEnvelope({
      event_type: "error_suppressed",
      service: {
        name: "checkout-api",
        environment: "production",
        runtime: "node",
        framework: "fastify"
      },
      payload: {
        fingerprint: "fp_123",
        suppressed_count: 9,
        window_seconds: 30,
        first_seen: "2026-03-10T00:00:00.000Z",
        last_seen: "2026-03-10T00:00:30.000Z"
      }
    });

    await service.persistEventMetadata({
      projectId: "proj_123",
      event,
      normalizedEvent: normalizeEvent(event),
      fingerprint: "fp_123"
    });

    const firstCall = upsertIncident.mock.calls[0];
    const upsertInput = firstCall?.[0] as UpsertIncidentInput | undefined;
    expect(upsertInput?.severity).toBe("medium");
  });

  it("should persist log level for log_event incident linkage", async (): Promise<void> => {
    const insertIncidentEvent = vi.fn().mockResolvedValue(undefined);
    const store = createMetadataStore({
      resolveProjectByTokenHash: vi.fn().mockResolvedValue({ project_id: "proj_123" }),
      upsertIncident: vi.fn().mockResolvedValue({
        incident_id: "inc_123",
        matched_fields: [],
        status: "open",
        regressed_now: false,
        occurrence_count: 1
      }),
      insertIncidentEvent,
      markIncidentSpiking: vi.fn().mockResolvedValue(false)
    });

    const service = createIngestionMetadataService(store);
    const event = createEventEnvelope({
      event_type: "log_event",
      service: {
        name: "checkout-api",
        environment: "production",
        runtime: "node",
        framework: "fastify"
      },
      payload: {
        level: "error",
        message: "boom",
        attributes: {}
      }
    });

    await service.persistEventMetadata({
      projectId: "proj_123",
      event,
      normalizedEvent: normalizeEvent(event),
      fingerprint: "fp_123"
    });

    expect(insertIncidentEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "error"
      })
    );
  });

  it("should record rolling counters and mark incident as spiking when threshold is crossed", async (): Promise<void> => {
    const markIncidentSpiking = vi.fn().mockResolvedValue(true);
    const store = createMetadataStore({
      resolveProjectByTokenHash: vi.fn().mockResolvedValue({ project_id: "proj_123" }),
      upsertIncident: vi.fn().mockResolvedValue({
        incident_id: "inc_123",
        matched_fields: ["normalized_message"],
        status: "open",
        regressed_now: false,
        occurrence_count: 1
      }),
      insertIncidentEvent: vi.fn().mockResolvedValue(undefined),
      markIncidentSpiking
    });

    const recordOccurrence = vi.fn().mockResolvedValue({
      occurrences_1m: 7,
      occurrences_5m: 36,
      occurrences_1h: 60,
      occurrences_24h: 240,
      baseline_1h_per_5m: 5,
      spike_ratio_5m_to_1h: 7.2,
      has_sufficient_baseline: true,
      is_spiking: true
    });

    const frequencyCounter: IncidentFrequencyCounter = {
      recordOccurrence
    };

    const service = createIngestionMetadataService(store, {
      frequencyCounter
    });

    const event = createEventEnvelope({
      event_type: "backend_exception",
      service: {
        name: "checkout-api",
        environment: "production",
        runtime: "node",
        framework: "fastify"
      },
      payload: {
        name: "TypeError",
        message: "boom",
        stack: "TypeError: boom",
        handled: false,
        request: {
          method: "GET",
          path: "/users/123",
          query: {},
          headers: {},
          body: null
        },
        response: {
          status_code: 500
        },
        runtime: {
          version: "22.0.0"
        }
      }
    });

    await service.persistEventMetadata({
      projectId: "proj_123",
      event,
      normalizedEvent: normalizeEvent(event),
      fingerprint: "fp_123"
    });

    expect(recordOccurrence).toHaveBeenCalledOnce();
    expect(markIncidentSpiking).toHaveBeenCalledWith({
      incident_id: "inc_123",
      detected_at: event.occurred_at
    });
  });

  it("should skip frequency mutation for duplicate grouped events", async (): Promise<void> => {
    const markIncidentSpiking = vi.fn().mockResolvedValue(true);
    const store = createMetadataStore({
      resolveProjectByTokenHash: vi.fn().mockResolvedValue({ project_id: "proj_123" }),
      upsertIncident: vi.fn().mockResolvedValue({
        incident_id: "inc_123",
        matched_fields: ["normalized_message"],
        status: "open",
        regressed_now: false,
        occurrence_count: 1,
        duplicate_event: true
      }),
      insertIncidentEvent: vi.fn().mockResolvedValue(undefined),
      markIncidentSpiking
    });

    const recordOccurrence = vi.fn().mockResolvedValue({
      occurrences_1m: 7,
      occurrences_5m: 36,
      occurrences_1h: 60,
      occurrences_24h: 240,
      baseline_1h_per_5m: 5,
      spike_ratio_5m_to_1h: 7.2,
      has_sufficient_baseline: true,
      is_spiking: true
    });

    const frequencyCounter: IncidentFrequencyCounter = {
      recordOccurrence
    };

    const service = createIngestionMetadataService(store, {
      frequencyCounter
    });

    const event = createEventEnvelope({
      event_type: "backend_exception",
      service: {
        name: "checkout-api",
        environment: "production",
        runtime: "node",
        framework: "fastify"
      },
      payload: {
        name: "TypeError",
        message: "boom",
        stack: "TypeError: boom",
        handled: false,
        request: {
          method: "GET",
          path: "/users/123",
          query: {},
          headers: {},
          body: null
        },
        response: {
          status_code: 500
        },
        runtime: {
          version: "22.0.0"
        }
      }
    });

    await service.persistEventMetadata({
      projectId: "proj_123",
      event,
      normalizedEvent: normalizeEvent(event),
      fingerprint: "fp_123"
    });

    expect(recordOccurrence).not.toHaveBeenCalled();
    expect(markIncidentSpiking).not.toHaveBeenCalled();
  });

  it("should resolve project by pre-hashed token", async (): Promise<void> => {
    const resolveProjectByTokenHash = vi.fn().mockResolvedValue({ project_id: "proj_123", organization_id: "org_123", organization_plan: "free" });
    const store = createMetadataStore({
      resolveProjectByTokenHash,
      upsertIncident: vi.fn(),
      insertIncidentEvent: vi.fn(),
      markIncidentSpiking: vi.fn()
    });

    const service = createIngestionMetadataService(store);
    const resolved = await service.resolveProjectByTokenHash("hash_abc");

    expect(resolved).toEqual({ project_id: "proj_123", organization_id: "org_123", organization_plan: "free" });
    expect(resolveProjectByTokenHash).toHaveBeenCalledWith("hash_abc");
  });

  it("should avoid spike mutation when frequency counter reports non-spiking window", async (): Promise<void> => {
    const markIncidentSpiking = vi.fn().mockResolvedValue(true);
    const store = createMetadataStore({
      resolveProjectByTokenHash: vi.fn().mockResolvedValue({ project_id: "proj_123" }),
      upsertIncident: vi.fn().mockResolvedValue({
        incident_id: "inc_123",
        matched_fields: ["normalized_message"],
        status: "open",
        regressed_now: false,
        occurrence_count: 1
      }),
      insertIncidentEvent: vi.fn().mockResolvedValue(undefined),
      markIncidentSpiking
    });

    const frequencyCounter: IncidentFrequencyCounter = {
      recordOccurrence: vi.fn().mockResolvedValue({
        occurrences_1m: 1,
        occurrences_5m: 2,
        occurrences_1h: 12,
        occurrences_24h: 40,
        baseline_1h_per_5m: 1,
        spike_ratio_5m_to_1h: 2,
        has_sufficient_baseline: true,
        is_spiking: false
      })
    };

    const service = createIngestionMetadataService(store, {
      frequencyCounter
    });

    const event = createEventEnvelope({
      event_type: "backend_exception",
      service: {
        name: "checkout-api",
        environment: "production",
        runtime: "node",
        framework: "fastify"
      },
      payload: {
        name: "TypeError",
        message: "boom",
        stack: "TypeError: boom",
        handled: false,
        request: {
          method: "GET",
          path: "/users/123",
          query: {},
          headers: {},
          body: null
        },
        response: {
          status_code: 500
        },
        runtime: {
          version: "22.0.0"
        }
      }
    });

    await service.persistEventMetadata({
      projectId: "proj_123",
      event,
      normalizedEvent: normalizeEvent(event),
      fingerprint: "fp_123"
    });

    expect(markIncidentSpiking).not.toHaveBeenCalled();
  });
});
