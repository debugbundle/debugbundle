import { describe, expect, it, vi } from "vitest";

import {
  captureWorkerDogfoodingCapacityWarning,
  captureWorkerDogfoodingStepFailure,
  createHostedDogfoodingTransport,
  registerWorkerDogfooding,
  resolveWorkerDogfoodingConfig
} from "../../../apps/worker/src/dogfooding.ts";
import { createEventEnvelope } from "../../../packages/shared-types/src/index.js";

describe("worker dogfooding", () => {
  it("stays disabled when no project token is configured", () => {
    expect(resolveWorkerDogfoodingConfig({ DEBUGBUNDLE_API_URL: "http://127.0.0.1:3000" })).toBeNull();
  });

  it("derives the hosted ingestion endpoint and worker service defaults from env", () => {
    expect(
      resolveWorkerDogfoodingConfig({
        NODE_ENV: "production",
        DEBUGBUNDLE_API_URL: "https://api.debugbundle.com",
        DEBUGBUNDLE_WORKER_DOGFOOD_PROJECT_TOKEN: "dbundle_proj_worker"
      })
    ).toEqual({
      deliveryMode: "connected",
      projectToken: "dbundle_proj_worker",
      endpoint: "https://api.debugbundle.com/v1/events",
      environment: "production",
      service: "debugbundle-worker",
      enabled: true,
      captureConsole: false
    });
  });

  it("can enable local-only worker dogfooding without a project token", () => {
    expect(
      resolveWorkerDogfoodingConfig({
        DEBUGBUNDLE_WORKER_DOGFOOD_ENABLED: "true"
      })
    ).toEqual({
      deliveryMode: "local-only",
      projectToken: null,
      endpoint: null,
      environment: "development",
      service: "debugbundle-worker",
      enabled: true,
      captureConsole: false
    });
  });

  it("registers the sdk and captures worker step failures when dogfooding is enabled", () => {
    const dogfoodingSdk = {
      init: vi.fn(),
      captureError: vi.fn()
    };

    const config = registerWorkerDogfooding(
      {
        NODE_ENV: "production",
        DEBUGBUNDLE_API_URL: "https://api.debugbundle.com",
        DEBUGBUNDLE_WORKER_DOGFOOD_PROJECT_TOKEN: "dbundle_proj_worker"
      },
      dogfoodingSdk
    );

    captureWorkerDogfoodingStepFailure("schedule-weekly-reports", new Error("weekly_conflict"), dogfoodingSdk);

    expect(config).toEqual(expect.objectContaining({
      service: "debugbundle-worker",
      endpoint: "https://api.debugbundle.com/v1/events"
    }));
    expect(dogfoodingSdk.init).toHaveBeenCalledWith(expect.objectContaining({
      projectToken: "dbundle_proj_worker",
      endpoint: "https://api.debugbundle.com/v1/events",
      environment: "production",
      service: "debugbundle-worker",
      framework: "worker",
      captureConsole: false,
      projectMode: "connected",
      transport: expect.any(Function)
    }));
    expect(dogfoodingSdk.captureError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "worker_step_failed:schedule-weekly-reports:weekly_conflict" }),
      { handled: true }
    );
  });

  it("captures capacity warnings through dogfooding with local rate limiting", () => {
    const dogfoodingSdk = {
      init: vi.fn(),
      captureError: vi.fn()
    };

    registerWorkerDogfooding(
      {
        NODE_ENV: "production",
        DEBUGBUNDLE_API_URL: "https://api.debugbundle.com",
        DEBUGBUNDLE_WORKER_DOGFOOD_PROJECT_TOKEN: "dbundle_proj_worker"
      },
      dogfoodingSdk
    );

    const warning = {
      severity: "critical" as const,
      oldest_due_lag_ms: 120_000,
      claimed_count: 20,
      concurrency: 8,
      batch_size: 20,
      timeout_count: 3,
      avg_duration_ms: 950,
      saturated: true
    };

    captureWorkerDogfoodingCapacityWarning(warning, dogfoodingSdk, new Date("2026-06-15T10:00:00.000Z"));
    captureWorkerDogfoodingCapacityWarning(warning, dogfoodingSdk, new Date("2026-06-15T10:05:00.000Z"));

    expect(dogfoodingSdk.captureError).toHaveBeenCalledTimes(1);
    expect(dogfoodingSdk.captureError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("availability_check_capacity_warning severity=critical")
      }),
      { handled: true }
    );
  });

  it("posts worker dogfooding events through the hosted ingestion transport", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({ status: 202 } as Response);
    const transport = createHostedDogfoodingTransport("dbundle_proj_worker", fetchMock);
    const event = createEventEnvelope({
      event_type: "backend_exception",
      project_token: "dbundle_proj_worker",
      service: {
        name: "debugbundle-worker",
        environment: "production",
        runtime: "node",
        framework: "worker"
      },
      payload: {
        name: "Error",
        message: "worker_step_failed:schedule-weekly-reports:weekly_conflict",
        stack: "Error: worker_step_failed:schedule-weekly-reports:weekly_conflict",
        handled: true,
        request: {
          method: "POST",
          path: "/worker-step",
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
      endpoint: "https://api.debugbundle.com/v1/events",
      headers: {
        "x-debugbundle-sdk": "@debugbundle/sdk-node"
      },
      events: [event],
      timeout_ms: 1000
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.debugbundle.com/v1/events",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer dbundle_proj_worker",
          "Content-Type": "application/json"
        })
      })
    );
  });
});
