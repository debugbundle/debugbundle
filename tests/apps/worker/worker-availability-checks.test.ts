import { beforeEach, describe, expect, it, vi } from "vitest";
import { gunzipSync } from "node:zlib";

const { captureCapacityWarningMock, executeAvailabilityCheckMock } = vi.hoisted(() => ({
  captureCapacityWarningMock: vi.fn(),
  executeAvailabilityCheckMock: vi.fn()
}));

vi.mock("../../../packages/storage/src/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../packages/storage/src/index.js")>();

  return {
    ...actual,
    executeAvailabilityCheck: executeAvailabilityCheckMock
  };
});

vi.mock("../../../apps/worker/src/dogfooding.js", () => ({
  captureWorkerDogfoodingCapacityWarning: captureCapacityWarningMock
}));

import {
  processAvailabilityCheckBatch,
  processNextAvailabilityCheck
} from "../../../apps/worker/src/availability-checks.js";
import type {
  ClaimedAvailabilityCheck,
  RecordedAvailabilityCheckExecution
} from "../../../packages/storage/src/index.js";
import type { AvailabilityCheckExecutionResult } from "../../../packages/storage/src/availability-check-executor.js";

function createClaimedCheck(overrides: Partial<ClaimedAvailabilityCheck> = {}): ClaimedAvailabilityCheck {
  return {
    check_id: "11111111-1111-4111-8111-111111111111",
    project_id: "22222222-2222-4222-8222-222222222222",
    organization_id: "33333333-3333-4333-8333-333333333333",
    owner_user_id: "44444444-4444-4444-8444-444444444444",
    organization_plan: "solo",
    name: "Checkout homepage",
    url: "https://example.com/health",
    method: "GET",
    expected_status_min: 200,
    expected_status_max: 399,
    timeout_ms: 5000,
    interval_seconds: 60,
    environment: "production",
    service_name: "frontend",
    due_at: "2026-06-15T10:00:00.000Z",
    claimed_at: "2026-06-15T10:00:00.000Z",
    linked_incident_id: null,
    prior_status: "unknown",
    consecutive_failures: 0,
    consecutive_successes: 0,
    failure_threshold: 3,
    recovery_threshold: 2,
    ...overrides
  };
}

function createExecutionResult(
  overrides: Partial<AvailabilityCheckExecutionResult> = {}
): AvailabilityCheckExecutionResult {
  return {
    status: "success",
    http_status: 200,
    duration_ms: 184,
    error_kind: null,
    error_message: null,
    checked_url_host: "example.com",
    checked_url_path: "/health",
    checked_url_query: {},
    final_url: "https://example.com/health",
    redirect_count: 0,
    ...overrides
  };
}

function createRecordedExecution(
  check: ClaimedAvailabilityCheck,
  overrides: Omit<Partial<RecordedAvailabilityCheckExecution>, "result"> & {
    result?: Partial<RecordedAvailabilityCheckExecution["result"]>;
  } = {}
): RecordedAvailabilityCheckExecution {
  const { result: resultOverrides, ...executionOverrides } = overrides;
  const result = createExecutionResult(resultOverrides ?? {});

  return {
    check,
    result: {
      ...result,
      result_id: "55555555-5555-4555-8555-555555555555",
      started_at: "2026-06-15T10:00:01.000Z",
      completed_at: "2026-06-15T10:00:02.000Z"
    },
    next_status: "passing",
    emit_failure_event: false,
    resolve_incident_id: null,
    ...executionOverrides
  };
}

describe("worker availability checks", () => {
  beforeEach(() => {
    executeAvailabilityCheckMock.mockReset();
    captureCapacityWarningMock.mockReset();
  });

  it("purges retained availability data when no checks are due", async () => {
    const availabilityCheckStore = {
      claimNextDueCheck: vi.fn().mockResolvedValue(null),
      purgeExpiredResults: vi.fn().mockResolvedValue(0),
      purgeExpiredDailyRollups: vi.fn().mockResolvedValue(0)
    };

    const result = await processNextAvailabilityCheck({
      availabilityCheckStore: availabilityCheckStore as never,
      incidentStore: {} as never,
      incidentLifecycle: {} as never,
      queue: { enqueue: vi.fn() } as never,
      objectStore: { putObject: vi.fn() } as never,
      lifecycleWebhookPublisher: { publish: vi.fn() } as never,
      now: new Date("2026-06-15T10:00:00.000Z")
    });

    expect(result).toEqual({ processed: false, reason: "no_checks_due" });
    expect(availabilityCheckStore.purgeExpiredResults).toHaveBeenCalledWith({
      now: "2026-06-15T10:00:00.000Z"
    });
    expect(availabilityCheckStore.purgeExpiredDailyRollups).toHaveBeenCalledWith({
      now: "2026-06-15T10:00:00.000Z"
    });
  });

  it("claims and executes due checks in a bounded batch", async () => {
    const checks = [
      createClaimedCheck({ check_id: "11111111-1111-4111-8111-111111111111" }),
      createClaimedCheck({ check_id: "11111111-1111-4111-8111-111111111112" }),
      createClaimedCheck({ check_id: "11111111-1111-4111-8111-111111111113" })
    ];
    let active = 0;
    let maxActive = 0;
    executeAvailabilityCheckMock.mockImplementation(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active -= 1;
      return createExecutionResult();
    });
    const availabilityCheckStore = {
      claimDueChecks: vi.fn().mockResolvedValue(checks),
      recordCheckExecution: vi.fn().mockImplementation(async ({ check_id }: { check_id: string }) =>
        createRecordedExecution(checks.find((check) => check.check_id === check_id) ?? checks[0]!)
      ),
      purgeExpiredResults: vi.fn(),
      purgeExpiredDailyRollups: vi.fn()
    };

    const result = await processAvailabilityCheckBatch({
      availabilityCheckStore: availabilityCheckStore as never,
      incidentStore: {} as never,
      incidentLifecycle: {
        resolveIncidentForOrganization: vi.fn()
      },
      queue: {
        enqueue: vi.fn()
      } as never,
      objectStore: {
        putObject: vi.fn()
      } as never,
      lifecycleWebhookPublisher: {
        publish: vi.fn()
      } as never,
      batchSize: 3,
      concurrency: 2,
      now: new Date("2026-06-15T10:00:30.000Z")
    });

    expect(result).toEqual(
      expect.objectContaining({
        processed: true,
        claimed_count: 3,
        completed_count: 3,
        failed_count: 0
      })
    );
    expect(maxActive).toBe(2);
    expect(availabilityCheckStore.claimDueChecks).toHaveBeenCalledWith({
      now: "2026-06-15T10:00:30.000Z",
      claim_timeout_before: "2026-06-15T09:55:30.000Z",
      limit: 3
    });
    expect(availabilityCheckStore.recordCheckExecution).toHaveBeenCalledTimes(3);
  });

  it("emits a rate-limited dogfood capacity warning when due checks are late", async () => {
    const checks = [
      createClaimedCheck({
        check_id: "11111111-1111-4111-8111-111111111111",
        due_at: "2026-06-15T09:57:00.000Z",
        interval_seconds: 60
      }),
      createClaimedCheck({
        check_id: "11111111-1111-4111-8111-111111111112",
        due_at: "2026-06-15T09:57:30.000Z",
        interval_seconds: 60
      })
    ];
    executeAvailabilityCheckMock.mockResolvedValue(createExecutionResult({ status: "timeout" }));
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    await processAvailabilityCheckBatch({
      availabilityCheckStore: {
        claimDueChecks: vi.fn().mockResolvedValue(checks),
        recordCheckExecution: vi.fn().mockImplementation(async ({ check_id }: { check_id: string }) =>
          createRecordedExecution(checks.find((check) => check.check_id === check_id) ?? checks[0]!, {
            result: { status: "timeout", duration_ms: 2500 }
          })
        ),
        purgeExpiredResults: vi.fn(),
        purgeExpiredDailyRollups: vi.fn()
      } as never,
      incidentStore: {} as never,
      incidentLifecycle: {
        resolveIncidentForOrganization: vi.fn()
      },
      queue: {
        enqueue: vi.fn()
      } as never,
      objectStore: {
        putObject: vi.fn()
      } as never,
      lifecycleWebhookPublisher: {
        publish: vi.fn()
      } as never,
      logger,
      batchSize: 2,
      concurrency: 2,
      now: new Date("2026-06-15T10:00:00.000Z")
    });

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "critical",
        claimed_count: 2,
        saturated: true
      }),
      "availability_check_capacity_warning"
    );
    expect(captureCapacityWarningMock).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "critical",
        claimed_count: 2,
        concurrency: 2,
        batch_size: 2,
        timeout_count: 2,
        saturated: true
      })
    );
  });

  it("opens and links an availability incident when a threshold-qualified failure is recorded", async () => {
    const claimedCheck = createClaimedCheck({
      url: "https://example.com/health?token=secret#debug"
    });
    const recordedExecution = createRecordedExecution(claimedCheck, {
      result: createExecutionResult({
        status: "timeout",
        http_status: null,
        error_kind: "timeout",
        error_message: "The availability check timed out.",
        checked_url_query: { token: "[redacted]" },
        final_url: "https://example.com/health?token=%5Bredacted%5D"
      }),
      next_status: "failing",
      emit_failure_event: true
    });
    const queueEnqueue = vi.fn().mockResolvedValue(undefined);
    const webhookPublish = vi.fn().mockResolvedValue(undefined);

    executeAvailabilityCheckMock.mockResolvedValue(recordedExecution.result);

    const availabilityCheckStore = {
      claimNextDueCheck: vi.fn().mockResolvedValue(claimedCheck),
      recordCheckExecution: vi.fn().mockResolvedValue(recordedExecution),
      linkIncidentToCheck: vi.fn().mockResolvedValue(undefined),
      appendIncidentToDailyRollup: vi.fn().mockResolvedValue(undefined),
      purgeExpiredResults: vi.fn(),
      purgeExpiredDailyRollups: vi.fn()
    };
    const incidentStore = {
      upsertIncident: vi.fn().mockResolvedValue({
        incident_id: "66666666-6666-4666-8666-666666666666",
        duplicate_event: false,
        occurrence_count: 1,
        regressed_now: false,
        regression_deploy: null
      }),
      insertIncidentEvent: vi.fn().mockResolvedValue(undefined),
      recordIncidentEventRetention: vi.fn().mockResolvedValue({
        demoted_event_references: []
      })
    };
    const objectStore = {
      putObject: vi.fn().mockResolvedValue(undefined)
    };

    const result = await processNextAvailabilityCheck({
      availabilityCheckStore: availabilityCheckStore as never,
      incidentStore: incidentStore as never,
      incidentLifecycle: {
        resolveIncidentForOrganization: vi.fn()
      },
      queue: {
        enqueue: queueEnqueue
      },
      objectStore,
      lifecycleWebhookPublisher: {
        publish: webhookPublish
      },
      now: new Date("2026-06-15T10:00:00.000Z")
    });

    expect(result).toEqual({ processed: true });
    expect(objectStore.putObject).toHaveBeenCalledOnce();
    expect(availabilityCheckStore.recordCheckExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        check_id: claimedCheck.check_id,
        claimed_at: claimedCheck.claimed_at,
        scheduled_for: claimedCheck.due_at
      })
    );
    const persistedBody = objectStore.putObject.mock.calls[0]?.[0].body;
    expect(Buffer.isBuffer(persistedBody)).toBe(true);
    const persistedEvent = JSON.parse(gunzipSync(persistedBody as Buffer).toString("utf8"));
    expect(persistedEvent.payload.query).toEqual({ token: "[redacted]" });
    expect(persistedEvent.payload.headers["x-debugbundle-check-url"]).toBe(
      "https://example.com/health?token=%5Bredacted%5D"
    );
    expect(JSON.stringify(persistedEvent)).not.toContain("secret");
    expect(availabilityCheckStore.linkIncidentToCheck).toHaveBeenCalledWith({
      check_id: claimedCheck.check_id,
      incident_id: "66666666-6666-4666-8666-666666666666",
      linked_at: recordedExecution.result.completed_at
    });
    expect(availabilityCheckStore.appendIncidentToDailyRollup).toHaveBeenCalledWith({
      check_id: claimedCheck.check_id,
      project_id: claimedCheck.project_id,
      day: "2026-06-15",
      incident_id: "66666666-6666-4666-8666-666666666666"
    });
    expect(queueEnqueue).toHaveBeenCalledWith(
      "build-bundle",
      expect.objectContaining({
        incident_id: "66666666-6666-4666-8666-666666666666",
        project_id: claimedCheck.project_id
      })
    );
    expect(webhookPublish).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: "bundle.created",
        incident_id: "66666666-6666-4666-8666-666666666666",
        project_id: claimedCheck.project_id
      })
    );
  });

  it("auto-resolves the linked incident after sustained recovery", async () => {
    const claimedCheck = createClaimedCheck({
      linked_incident_id: "66666666-6666-4666-8666-666666666666",
      prior_status: "failing",
      consecutive_failures: 3
    });
    const recordedExecution = createRecordedExecution(claimedCheck, {
      next_status: "passing",
      resolve_incident_id: "66666666-6666-4666-8666-666666666666"
    });
    const resolveIncidentForOrganization = vi.fn().mockResolvedValue({
      incident_id: "66666666-6666-4666-8666-666666666666"
    });

    executeAvailabilityCheckMock.mockResolvedValue(recordedExecution.result);

    const result = await processNextAvailabilityCheck({
      availabilityCheckStore: {
        claimNextDueCheck: vi.fn().mockResolvedValue(claimedCheck),
        recordCheckExecution: vi.fn().mockResolvedValue(recordedExecution),
        purgeExpiredResults: vi.fn(),
        purgeExpiredDailyRollups: vi.fn()
      } as never,
      incidentStore: {} as never,
      incidentLifecycle: {
        resolveIncidentForOrganization
      },
      queue: {
        enqueue: vi.fn()
      } as never,
      objectStore: {
        putObject: vi.fn()
      } as never,
      lifecycleWebhookPublisher: {
        publish: vi.fn()
      } as never,
      now: new Date("2026-06-15T10:00:00.000Z")
    });

    expect(result).toEqual({ processed: true });
    expect(resolveIncidentForOrganization).toHaveBeenCalledWith({
      organization_id: claimedCheck.organization_id,
      incident_id: "66666666-6666-4666-8666-666666666666",
      resolved_by_member_id: claimedCheck.owner_user_id,
      resolved_at: recordedExecution.result.completed_at
    });
  });
});
