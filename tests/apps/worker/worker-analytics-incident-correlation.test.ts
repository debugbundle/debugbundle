import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  buildAnalyticsIncidentCorrelationJobFields,
  recordAnalyticsIncidentCorrelationBestEffort
} from "../../../apps/worker/src/analytics-incident-correlation.js";

const GROUP_JOB = {
  project_id: "11111111-1111-4111-8111-111111111111",
  event_id: "22222222-2222-4222-8222-222222222222",
  event_type: "frontend_exception" as const,
  event_class: "incident_signal" as const,
  service_name: "web",
  environment: "production",
  fingerprint: "fingerprint",
  normalized_message: "TypeError",
  occurred_at: "2026-07-10T10:05:00.000Z",
  severity: "high" as const,
  session_id_hash: "session-hash",
  trace_id_hash: "trace-hash"
};

describe("worker analytics incident correlation", () => {
  it("builds project-scoped session and trace hashes for group jobs", (): void => {
    expect(
      buildAnalyticsIncidentCorrelationJobFields(GROUP_JOB.project_id, {
        request_id: null,
        session_id: "session-123",
        trace_id: "trace-123",
        user_id_hash: null
      })
    ).toEqual({
      session_id_hash: createHash("sha256")
        .update(
          '{"project_id":"11111111-1111-4111-8111-111111111111","session_id":"session-123"}',
          "utf8"
        )
        .digest("hex"),
      trace_id_hash: createHash("sha256").update("trace-123", "utf8").digest("hex")
    });
  });

  it("records correlation without exposing raw identifiers", async (): Promise<void> => {
    const recordIncidentCorrelation = vi.fn().mockResolvedValue({
      recorded: true,
      linked_sessions: 1
    });

    await recordAnalyticsIncidentCorrelationBestEffort({
      recorder: { recordIncidentCorrelation },
      logger: undefined,
      job: GROUP_JOB,
      incidentId: "33333333-3333-4333-8333-333333333333"
    });

    expect(recordIncidentCorrelation).toHaveBeenCalledWith({
      project_id: GROUP_JOB.project_id,
      incident_id: "33333333-3333-4333-8333-333333333333",
      event_id: GROUP_JOB.event_id,
      service: "web",
      environment: "production",
      occurred_at: GROUP_JOB.occurred_at,
      session_id_hash: "session-hash",
      trace_id_hash: "trace-hash"
    });
  });

  it("keeps debug incident processing fail-open when correlation storage fails", async (): Promise<void> => {
    const logger = { warn: vi.fn() };

    await expect(
      recordAnalyticsIncidentCorrelationBestEffort({
        recorder: {
          recordIncidentCorrelation: vi.fn().mockRejectedValue(new Error("analytics unavailable"))
        },
        logger,
        job: GROUP_JOB,
        incidentId: "33333333-3333-4333-8333-333333333333"
      })
    ).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        error_message: "analytics unavailable",
        incident_id: "33333333-3333-4333-8333-333333333333"
      }),
      "worker_analytics_incident_correlation_failed"
    );
  });
});
