import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { readLocalState } from "../../../apps/cli/src/local-retrieval-store.js";
import { processCommand } from "../../../apps/cli/src/process-command.js";
import { BundleV1Schema, createEventEnvelope, type EventEnvelope } from "../../../packages/shared-types/src/index.js";

async function createProcessFixtureRepository(): Promise<string> {
  const rootDirectory = await mkdtemp(join(tmpdir(), "debugbundle-process-"));
  await mkdir(join(rootDirectory, ".debugbundle", "local", "events"), { recursive: true });
  return rootDirectory;
}

async function writeEventBatch(rootDirectory: string, filename: string, events: EventEnvelope[]): Promise<void> {
  await writeFile(
    join(rootDirectory, ".debugbundle", "local", "events", filename),
    `${JSON.stringify(events, null, 2)}\n`,
    "utf8"
  );
}

function createBackendExceptionEvent(input: {
  eventId: string;
  occurredAt: string;
  serviceName: string;
  environment?: string;
  message?: string;
  path?: string;
  traceId?: string;
}): EventEnvelope {
  return createEventEnvelope({
    event_id: input.eventId,
    occurred_at: input.occurredAt,
    project_id: "00000000-0000-4000-8000-000000000001",
    event_type: "backend_exception",
    service: {
      name: input.serviceName,
      environment: input.environment ?? "development",
      runtime: "node",
      framework: "fastify"
    },
    correlation: {
      request_id: null,
      trace_id: input.traceId ?? null,
      session_id: null,
      user_id_hash: null
    },
    payload: {
      name: "TypeError",
      message: input.message ?? "Order 123 failed during checkout",
      stack: "TypeError: boom\\n    at handleCheckout (src/checkout.ts:10:2)",
      handled: false,
      request: {
        method: "GET",
        path: input.path ?? "/orders/123",
        query: {
          expand: "summary"
        },
        headers: {
          host: "checkout.local",
          "content-type": "application/json"
        },
        body: {
          attempt: 1
        }
      },
      response: {
        status_code: 500
      },
      runtime: {
        version: "24.0.0"
      }
    }
  });
}

function createFrontendExceptionEvent(input: {
  eventId: string;
  occurredAt: string;
  serviceName: string;
  environment?: string;
  message?: string;
  route?: string;
  traceId?: string;
}): EventEnvelope {
  return createEventEnvelope({
    event_id: input.eventId,
    occurred_at: input.occurredAt,
    project_id: "00000000-0000-4000-8000-000000000001",
    event_type: "frontend_exception",
    sdk_name: "@debugbundle/sdk-browser",
    sdk_version: "0.1.0",
    service: {
      name: input.serviceName,
      environment: input.environment ?? "development",
      runtime: "browser",
      framework: "react"
    },
    correlation: {
      request_id: null,
      trace_id: input.traceId ?? null,
      session_id: "sess_123",
      user_id_hash: null
    },
    payload: {
      name: "TypeError",
      message: input.message ?? "Checkout button failed",
      stack: "TypeError: checkout failed\n    at handleCheckout (src/checkout.tsx:42:11)",
      route: input.route ?? "/checkout",
      browser: {
        name: "Chrome",
        version: "135"
      },
      breadcrumbs: [
        {
          breadcrumb_type: "click",
          route: input.route ?? "/checkout",
          data: {
            selector: "button[data-testid=submit-order]",
            label: "Submit order"
          },
          ts: input.occurredAt
        }
      ],
      device: {
        user_agent: "Mozilla/5.0",
        os: {
          name: "macOS",
          version: "15.0"
        },
        device_type: "desktop",
        screen: {
          width: 1512,
          height: 982
        },
        viewport: {
          width: 1280,
          height: 720
        },
        device_pixel_ratio: 2,
        touch_capable: false,
        language: "en-US",
        connection_type: "wifi",
        color_scheme_preference: "light"
      },
      dom_context: {
        mode: "lightweight",
        html_excerpt: "<button data-testid=submit-order>Submit order</button>"
      }
    }
  });
}

function createRequestEvent(input: {
  eventId: string;
  occurredAt: string;
  serviceName: string;
  responseStatus: number;
  environment?: string;
  method?: string;
  path?: string;
}): EventEnvelope {
  return createEventEnvelope({
    event_id: input.eventId,
    occurred_at: input.occurredAt,
    project_id: "00000000-0000-4000-8000-000000000001",
    event_type: "request_event",
    service: {
      name: input.serviceName,
      environment: input.environment ?? "development",
      runtime: "node",
      framework: "fastify"
    },
    correlation: {
      request_id: null,
      trace_id: null,
      session_id: null,
      user_id_hash: null
    },
    payload: {
      method: input.method ?? "GET",
      path: input.path ?? "/orders/123",
      query: {},
      headers: {
        host: "checkout.local"
      },
      response_status: input.responseStatus,
      duration_ms: 42
    }
  });
}

function createLogEvent(input: {
  eventId: string;
  occurredAt: string;
  serviceName: string;
  message: string;
  level?: string;
}): EventEnvelope {
  return createEventEnvelope({
    event_id: input.eventId,
    occurred_at: input.occurredAt,
    project_id: "00000000-0000-4000-8000-000000000001",
    event_type: "log_event",
    service: {
      name: input.serviceName,
      environment: "development",
      runtime: "node",
      framework: "fastify"
    },
    payload: {
      level: input.level ?? "error",
      message: input.message,
      attributes: {
        component: "checkout"
      }
    }
  });
}

describe("cli process command", () => {
  it("processes local event files into deterministic bundles, reproductions, and state", async () => {
    const rootDirectory = await createProcessFixtureRepository();

    await writeEventBatch(rootDirectory, "1700000000000-1-checkout-api.events.json", [
      createBackendExceptionEvent({
        eventId: "00000000-0000-4000-8000-000000000101",
        occurredAt: "2026-03-20T00:00:00.000Z",
        serviceName: "checkout-api",
        path: "/orders/123"
      }),
      createBackendExceptionEvent({
        eventId: "00000000-0000-4000-8000-000000000102",
        occurredAt: "2026-03-20T00:01:00.000Z",
        serviceName: "checkout-api",
        path: "/orders/456"
      })
    ]);

    await writeEventBatch(rootDirectory, "1700000000100-1-worker.events.json", [
      createBackendExceptionEvent({
        eventId: "00000000-0000-4000-8000-000000000103",
        occurredAt: "2026-03-20T00:02:00.000Z",
        serviceName: "worker",
        path: "/orders/789"
      })
    ]);

    const result = await processCommand(
      { json: true },
      {
        cwd: () => rootDirectory
      }
    );

    expect(result.exitCode).toBe(0);

    const parsedOutput = JSON.parse(result.output) as {
      status: string;
      processed: boolean;
      files_processed: number;
      events_processed: number;
      incidents_processed: number;
      services: Array<{ service: string; incidents: number }>;
      last_processed_event_file: string;
    };

    expect(parsedOutput).toEqual({
      status: "ok",
      processed: true,
      files_processed: 2,
      events_processed: 3,
      incidents_processed: 2,
      services: [
        { service: "checkout-api", incidents: 1 },
        { service: "worker", incidents: 1 }
      ],
      last_processed_event_file: "1700000000100-1-worker.events.json"
    });

    const state = JSON.parse(
      await readFile(join(rootDirectory, ".debugbundle", "local", "state.json"), "utf8")
    ) as {
      last_processed_event_file: string;
      incidents: Record<string, { service_name: string; occurrence_count: number; status: string }>;
    };

    expect(state.last_processed_event_file).toBe("1700000000100-1-worker.events.json");
    expect(Object.values(state.incidents)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          service_name: "checkout-api",
          occurrence_count: 2,
          status: "open"
        }),
        expect.objectContaining({
          service_name: "worker",
          occurrence_count: 1,
          status: "open"
        })
      ])
    );

    const bundleFiles = (await readdir(join(rootDirectory, ".debugbundle", "bundles", "local")))
      .filter((fileName) => fileName.endsWith(".bundle.json"))
      .sort();
    const reproductionFiles = (await readdir(join(rootDirectory, ".debugbundle", "bundles", "local", "reproductions")))
      .filter((fileName) => fileName.endsWith(".reproduction.json"))
      .sort();

    expect(bundleFiles).toHaveLength(2);
    expect(reproductionFiles).toHaveLength(2);

    const parsedBundles = await Promise.all(
      bundleFiles.map(async (fileName) =>
        BundleV1Schema.parse(
          JSON.parse(await readFile(join(rootDirectory, ".debugbundle", "bundles", "local", fileName), "utf8"))
        )
      )
    );
    const checkoutBundle = parsedBundles.find((bundle) => bundle.service.name === "checkout-api");
    const workerBundle = parsedBundles.find((bundle) => bundle.service.name === "worker");

    expect(checkoutBundle).toBeDefined();
    expect(workerBundle).toBeDefined();
    expect(checkoutBundle?.sdk).toEqual({
      name: "debugbundle-cli",
      version: "0.1.0"
    });
    expect(checkoutBundle?.signal.occurrence_count).toBe(2);
    expect(checkoutBundle?.metadata.generation_number).toBe(2);
    expect(checkoutBundle?.metadata.generator_version).toBe("cli-process-local-v1");
    expect(checkoutBundle?.links.self).toContain(".debugbundle/bundles/local/");
    expect(checkoutBundle?.links.reproduction).toContain(".debugbundle/bundles/local/reproductions/");
    expect(checkoutBundle?.reproduction.possible).toBe(true);
    expect(checkoutBundle?.reproduction.artifacts?.curl).toContain("curl -X GET");
    expect(workerBundle?.signal.occurrence_count).toBe(1);
  });

  it("returns no new events when the watermark is current", async () => {
    const rootDirectory = await createProcessFixtureRepository();

    await writeEventBatch(rootDirectory, "1700000000000-1-checkout-api.events.json", [
      createBackendExceptionEvent({
        eventId: "00000000-0000-4000-8000-000000000111",
        occurredAt: "2026-03-20T00:00:00.000Z",
        serviceName: "checkout-api"
      })
    ]);

    await processCommand({ json: true }, { cwd: () => rootDirectory });

    const result = await processCommand(
      { json: true },
      {
        cwd: () => rootDirectory
      }
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.output)).toEqual({
      status: "ok",
      processed: false,
      files_processed: 0,
      events_processed: 0,
      incidents_processed: 0,
      services: [],
      last_processed_event_file: "1700000000000-1-checkout-api.events.json",
      message: "No new events to process."
    });
  });

  it("processes browser-originated local event files into local incidents and bundles", async () => {
    const rootDirectory = await createProcessFixtureRepository();

    await writeEventBatch(rootDirectory, "1700000000000-1-checkout-web.events.json", [
      createFrontendExceptionEvent({
        eventId: "00000000-0000-4000-8000-000000000141",
        occurredAt: "2026-03-20T00:00:00.000Z",
        serviceName: "checkout-web",
        route: "/checkout"
      })
    ]);

    const result = await processCommand(
      { json: true },
      {
        cwd: () => rootDirectory
      }
    );

    expect(result.exitCode).toBe(0);

    const parsedOutput = JSON.parse(result.output) as {
      processed: boolean;
      files_processed: number;
      events_processed: number;
      incidents_processed: number;
      services: Array<{ service: string; incidents: number }>;
    };

    expect(parsedOutput).toEqual(expect.objectContaining({
      processed: true,
      files_processed: 1,
      events_processed: 1,
      incidents_processed: 1,
      services: [{ service: "checkout-web", incidents: 1 }]
    }));

    const bundleFiles = (await readdir(join(rootDirectory, ".debugbundle", "bundles", "local")))
      .filter((fileName) => fileName.endsWith(".bundle.json"));

    expect(bundleFiles).toHaveLength(1);

    const bundle = BundleV1Schema.parse(
      JSON.parse(await readFile(join(rootDirectory, ".debugbundle", "bundles", "local", bundleFiles[0] ?? ""), "utf8"))
    );

    expect(bundle.service.name).toBe("checkout-web");
    expect(bundle.context.frontend).toEqual(expect.objectContaining({
      version: 1,
      exceptions: [
        expect.objectContaining({
          name: "TypeError",
          message: "Checkout button failed",
          route: "/checkout"
        })
      ]
    }));
    expect(bundle.context.request).toBeNull();
  });

  it("groups browser and backend exceptions with the same trace_id into one full-stack incident bundle", async () => {
    const rootDirectory = await createProcessFixtureRepository();
    const traceId = "550e8400-e29b-41d4-a716-446655440000";

    await writeEventBatch(rootDirectory, "1700000000000-1-checkout-web.events.json", [
      createFrontendExceptionEvent({
        eventId: "00000000-0000-4000-8000-000000000151",
        occurredAt: "2026-03-20T00:00:00.000Z",
        serviceName: "checkout-web",
        route: "/checkout",
        traceId
      })
    ]);

    await writeEventBatch(rootDirectory, "1700000000100-1-checkout-api.events.json", [
      createBackendExceptionEvent({
        eventId: "00000000-0000-4000-8000-000000000152",
        occurredAt: "2026-03-20T00:00:01.000Z",
        serviceName: "checkout-api",
        path: "/api/checkout",
        traceId
      })
    ]);

    const result = await processCommand(
      { json: true },
      {
        cwd: () => rootDirectory
      }
    );

    expect(result.exitCode).toBe(0);

    const parsedOutput = JSON.parse(result.output) as {
      processed: boolean;
      files_processed: number;
      events_processed: number;
      incidents_processed: number;
      services: Array<{ service: string; incidents: number }>;
    };

    expect(parsedOutput).toEqual(expect.objectContaining({
      processed: true,
      files_processed: 2,
      events_processed: 2,
      incidents_processed: 1
    }));

    const state = JSON.parse(
      await readFile(join(rootDirectory, ".debugbundle", "local", "state.json"), "utf8")
    ) as {
      incidents: Record<string, { source_event_types: string[] }>;
    };

    expect(Object.keys(state.incidents)).toHaveLength(1);
    expect(Object.values(state.incidents)[0]).toEqual(expect.objectContaining({
      source_event_types: ["backend_exception", "frontend_exception"]
    }));

    const bundleFiles = (await readdir(join(rootDirectory, ".debugbundle", "bundles", "local")))
      .filter((fileName) => fileName.endsWith(".bundle.json"));

    expect(bundleFiles).toHaveLength(1);

    const bundle = BundleV1Schema.parse(
      JSON.parse(await readFile(join(rootDirectory, ".debugbundle", "bundles", "local", bundleFiles[0] ?? ""), "utf8"))
    );

    expect(bundle.context.frontend).toEqual(expect.objectContaining({
      version: 1,
      exceptions: [
        expect.objectContaining({
          route: "/checkout"
        })
      ]
    }));
    expect(bundle.context.request).toEqual(expect.objectContaining({
      version: 1,
      method: "GET",
      path: "/api/checkout"
    }));
    expect(bundle.context.response).toEqual(expect.objectContaining({
      version: 1,
      status_code: 500
    }));
  });

  it("reprocesses all events deterministically when state is corrupted", async () => {
    const rootDirectory = await createProcessFixtureRepository();

    await writeEventBatch(rootDirectory, "1700000000000-1-checkout-api.events.json", [
      createBackendExceptionEvent({
        eventId: "00000000-0000-4000-8000-000000000121",
        occurredAt: "2026-03-20T00:00:00.000Z",
        serviceName: "checkout-api"
      })
    ]);

    await processCommand({ json: true }, { cwd: () => rootDirectory });

    const bundleDirectory = join(rootDirectory, ".debugbundle", "bundles", "local");
    const originalBundleFiles = (await readdir(bundleDirectory)).filter((fileName) => fileName.endsWith(".bundle.json")).sort();
    const originalBundles = await Promise.all(
      originalBundleFiles.map(async (fileName) => readFile(join(bundleDirectory, fileName), "utf8"))
    );

    await writeFile(join(rootDirectory, ".debugbundle", "local", "state.json"), "{not-valid-json", "utf8");

    const result = await processCommand(
      { json: true },
      {
        cwd: () => rootDirectory
      }
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.output)).toEqual(expect.objectContaining({
      status: "ok",
      processed: true,
      files_processed: 1,
      events_processed: 1,
      incidents_processed: 1,
      last_processed_event_file: "1700000000000-1-checkout-api.events.json"
    }));

    const reparsedBundleFiles = (await readdir(bundleDirectory)).filter((fileName) => fileName.endsWith(".bundle.json")).sort();
    const reparsedBundles = await Promise.all(
      reparsedBundleFiles.map(async (fileName) => readFile(join(bundleDirectory, fileName), "utf8"))
    );

    expect(reparsedBundleFiles).toEqual(originalBundleFiles);
    expect(reparsedBundles).toEqual(originalBundles);
  });

  it("treats balanced request failures as high-severity local incidents when a preset is provided", async () => {
    const rootDirectory = await createProcessFixtureRepository();

    await writeEventBatch(rootDirectory, "1700000000000-1-checkout-api.events.json", [
      createRequestEvent({
        eventId: "00000000-0000-4000-8000-000000000201",
        occurredAt: "2026-03-20T00:00:00.000Z",
        serviceName: "checkout-api",
        responseStatus: 429,
        path: "/checkout"
      })
    ]);

    const result = await processCommand(
      { json: true, preset: "balanced" },
      {
        cwd: () => rootDirectory
      }
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.output)).toEqual(expect.objectContaining({
      processed: true,
      incidents_processed: 1
    }));

    const state = JSON.parse(
      await readFile(join(rootDirectory, ".debugbundle", "local", "state.json"), "utf8")
    ) as {
      incidents: Record<string, { title: string; severity: string; source_event_types: string[] }>;
    };

    expect(Object.values(state.incidents)).toEqual([
      expect.objectContaining({
        title: "request GET /checkout",
        severity: "high",
        source_event_types: ["request_event"]
      })
    ]);
  });

  it("creates a local request anomaly incident for repeated 404s under the balanced preset", async () => {
    const rootDirectory = await createProcessFixtureRepository();
    const requestEvents = Array.from({ length: 20 }, (_, index) =>
      createRequestEvent({
        eventId: `00000000-0000-4000-8000-0000000003${String(index).padStart(2, "0")}`,
        occurredAt: `2026-03-20T00:0${Math.floor(index / 6)}:${String((index % 6) * 10).padStart(2, "0")}.000Z`,
        serviceName: "checkout-api",
        responseStatus: 404,
        path: "/checkout"
      })
    );

    await writeEventBatch(rootDirectory, "1700000000000-1-checkout-api.events.json", requestEvents);

    const result = await processCommand(
      { json: true, preset: "balanced" },
      {
        cwd: () => rootDirectory
      }
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.output)).toEqual(expect.objectContaining({
      processed: true,
      incidents_processed: 1
    }));

    const state = JSON.parse(
      await readFile(join(rootDirectory, ".debugbundle", "local", "state.json"), "utf8")
    ) as {
      incidents: Record<string, { title: string; severity: string; matched_fields: string[]; source_event_types: string[] }>;
    };
    const anomalyIncident = Object.values(state.incidents)[0];

    expect(anomalyIncident).toEqual(expect.objectContaining({
      title: "Request anomaly: GET /checkout returned 404 repeatedly",
      severity: "medium",
      matched_fields: expect.arrayContaining(["request_anomaly", "http_status", "http_method", "route_template"]),
      source_event_types: ["request_event"]
    }));

    const localState = await readLocalState({ cwd: () => rootDirectory });
    expect(Object.values(localState.incidents)[0]?.incident_reason).toEqual(expect.objectContaining({
      kind: "request_failure",
      description: "request_event crossed the repeated request anomaly threshold"
    }));
  });

  it("reopens a resolved local incident when matching failures reappear in a later batch", async () => {
    const rootDirectory = await createProcessFixtureRepository();

    await writeEventBatch(rootDirectory, "1700000000000-1-checkout-api.events.json", [
      createBackendExceptionEvent({
        eventId: "00000000-0000-4000-8000-000000000501",
        occurredAt: "2026-03-20T00:00:00.000Z",
        serviceName: "checkout-api"
      })
    ]);

    await processCommand({ json: true }, { cwd: () => rootDirectory });

    const statePath = join(rootDirectory, ".debugbundle", "local", "state.json");
    const initialState = JSON.parse(await readFile(statePath, "utf8")) as {
      version: number;
      last_processed_event_file: string;
      incidents: Record<string, Record<string, unknown>>;
    };
    const incidentId = Object.keys(initialState.incidents)[0];
    if (incidentId === undefined) {
      throw new Error("expected_initial_incident");
    }

    initialState.incidents[incidentId] = {
      ...initialState.incidents[incidentId],
      status: "resolved",
      resolved_at: "2026-03-20T00:02:00.000Z"
    };
    await writeFile(statePath, `${JSON.stringify(initialState, null, 2)}\n`, "utf8");

    await writeEventBatch(rootDirectory, "1700000000100-1-checkout-api.events.json", [
      createBackendExceptionEvent({
        eventId: "00000000-0000-4000-8000-000000000502",
        occurredAt: "2026-03-20T00:03:00.000Z",
        serviceName: "checkout-api"
      })
    ]);

    const result = await processCommand({ json: true }, { cwd: () => rootDirectory });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.output)).toEqual(expect.objectContaining({
      processed: true,
      files_processed: 1,
      incidents_processed: 1,
      last_processed_event_file: "1700000000100-1-checkout-api.events.json"
    }));

    const reopenedState = await readLocalState({ cwd: () => rootDirectory });
    expect(reopenedState.incidents[incidentId]).toEqual(expect.objectContaining({
      incident_id: incidentId,
      status: "open",
      occurrence_count: 2,
      generation_number: 2
    }));
  });

  it("returns a no-new-events summary when rerun without additional event files", async () => {
    const rootDirectory = await createProcessFixtureRepository();

    await writeEventBatch(rootDirectory, "1700000000000-1-checkout-api.events.json", [
      createBackendExceptionEvent({
        eventId: "00000000-0000-4000-8000-000000000601",
        occurredAt: "2026-03-20T00:00:00.000Z",
        serviceName: "checkout-api"
      })
    ]);

    await processCommand({ json: true }, { cwd: () => rootDirectory });
    const rerun = await processCommand({ json: true }, { cwd: () => rootDirectory });

    expect(rerun.exitCode).toBe(0);
    expect(JSON.parse(rerun.output)).toEqual({
      status: "ok",
      processed: false,
      files_processed: 0,
      events_processed: 0,
      incidents_processed: 0,
      services: [],
      last_processed_event_file: "1700000000000-1-checkout-api.events.json",
      message: "No new events to process."
    });
  });

  it("reprocesses existing local batches when a preset override is provided", async () => {
    const rootDirectory = await createProcessFixtureRepository();
    const requestEvents = Array.from({ length: 20 }, (_, index) =>
      createRequestEvent({
        eventId: `00000000-0000-4000-8000-0000000007${String(index).padStart(2, "0")}`,
        occurredAt: `2026-03-20T00:0${Math.floor(index / 6)}:${String((index % 6) * 10).padStart(2, "0")}.000Z`,
        serviceName: "checkout-api",
        responseStatus: 404,
        path: "/checkout"
      })
    );

    await writeEventBatch(rootDirectory, "1700000000000-1-checkout-api.events.json", requestEvents);

    const initial = await processCommand({ json: true }, { cwd: () => rootDirectory });
    expect(JSON.parse(initial.output)).toEqual(expect.objectContaining({
      processed: true,
      incidents_processed: 0
    }));

    const reprocessed = await processCommand({ json: true, preset: "balanced" }, { cwd: () => rootDirectory });

    expect(reprocessed.exitCode).toBe(0);
    expect(JSON.parse(reprocessed.output)).toEqual(expect.objectContaining({
      processed: true,
      files_processed: 0,
      incidents_processed: 1,
      last_processed_event_file: "1700000000000-1-checkout-api.events.json"
    }));

    const localState = await readLocalState({ cwd: () => rootDirectory });
    expect(Object.values(localState.incidents)).toEqual([
      expect.objectContaining({
        title: "Request anomaly: GET /checkout returned 404 repeatedly",
        severity: "medium",
        source_event_types: ["request_event"]
      })
    ]);
  });

  it("merges frontend and backend incidents that share a trace id into one local incident", async () => {
    const rootDirectory = await createProcessFixtureRepository();

    await writeEventBatch(rootDirectory, "1700000000000-1-checkout-api.events.json", [
      createFrontendExceptionEvent({
        eventId: "00000000-0000-4000-8000-000000000801",
        occurredAt: "2026-03-20T00:00:00.000Z",
        serviceName: "checkout-web",
        traceId: "trace_checkout_123"
      }),
      createBackendExceptionEvent({
        eventId: "00000000-0000-4000-8000-000000000802",
        occurredAt: "2026-03-20T00:00:01.000Z",
        serviceName: "checkout-api",
        traceId: "trace_checkout_123"
      })
    ]);

    const result = await processCommand({ json: true }, { cwd: () => rootDirectory });
    const localState = await readLocalState({ cwd: () => rootDirectory });
    const incidents = Object.values(localState.incidents);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.output)).toEqual(expect.objectContaining({
      processed: true,
      incidents_processed: 1
    }));
    expect(incidents).toHaveLength(1);
    expect(incidents[0]).toEqual(expect.objectContaining({
      service_name: "checkout-api",
      source_event_types: ["backend_exception", "frontend_exception"],
      occurrence_count: 2,
      title: "Order {dynamic} failed during checkout"
    }));
  });

  it("formats processed summaries in human mode with pluralized service counts", async () => {
    const rootDirectory = await createProcessFixtureRepository();

    await writeEventBatch(rootDirectory, "1700000000000-1-checkout-api.events.json", [
      createLogEvent({
        eventId: "00000000-0000-4000-8000-000000000901",
        occurredAt: "2026-03-20T00:00:00.000Z",
        serviceName: "checkout-api",
        message: "Checkout timeout"
      }),
      createLogEvent({
        eventId: "00000000-0000-4000-8000-000000000902",
        occurredAt: "2026-03-20T00:00:01.000Z",
        serviceName: "checkout-api",
        message: "Checkout database timeout"
      })
    ]);

    const result = await processCommand({}, { cwd: () => rootDirectory });

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("Processed 2 events from 1 files into 2 incidents.");
    expect(result.output).toContain("- 2 incidents in checkout-api");
    expect(result.output).toContain("Last processed event file: 1700000000000-1-checkout-api.events.json");

    const state = await readLocalState({ cwd: () => rootDirectory });
    expect(Object.values(state.incidents)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ severity: "low", source_event_types: ["log_event"] })
      ])
    );
  });

  it("returns the human-mode no-new-events message when there is nothing left to process", async () => {
    const rootDirectory = await createProcessFixtureRepository();

    await writeEventBatch(rootDirectory, "1700000000000-1-checkout-api.events.json", [
      createBackendExceptionEvent({
        eventId: "00000000-0000-4000-8000-000000001001",
        occurredAt: "2026-03-20T00:00:00.000Z",
        serviceName: "checkout-api"
      })
    ]);

    await processCommand({}, { cwd: () => rootDirectory });
    const rerun = await processCommand({}, { cwd: () => rootDirectory });

    expect(rerun.exitCode).toBe(0);
    expect(rerun.output).toBe("No new events to process.");
  });

  it("keeps repeated low-severity log incidents grouped into one local incident", async () => {
    const rootDirectory = await createProcessFixtureRepository();

    await writeEventBatch(rootDirectory, "1700000000000-1-checkout-api.events.json", [
      createLogEvent({
        eventId: "00000000-0000-4000-8000-000000001101",
        occurredAt: "2026-03-20T00:00:00.000Z",
        serviceName: "checkout-api",
        message: "Checkout warning"
      }),
      createLogEvent({
        eventId: "00000000-0000-4000-8000-000000001102",
        occurredAt: "2026-03-20T00:00:01.000Z",
        serviceName: "checkout-api",
        message: "Checkout warning"
      })
    ]);

    const result = await processCommand({ json: true }, { cwd: () => rootDirectory });
    const incidents = Object.values((await readLocalState({ cwd: () => rootDirectory })).incidents);
    const rawState = JSON.parse(
      await readFile(join(rootDirectory, ".debugbundle", "local", "state.json"), "utf8")
    ) as {
      incidents: Record<string, { source_events: EventEnvelope[] }>;
    };
    const rawIncident = Object.values(rawState.incidents)[0];

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.output)).toEqual(expect.objectContaining({
      processed: true,
      incidents_processed: 1
    }));
    expect(incidents).toEqual([
      expect.objectContaining({
        severity: "low",
        occurrence_count: 2,
        source_event_types: ["log_event"]
      })
    ]);
  });

  it("orders same-timestamp source events by event id to keep local incident state deterministic", async () => {
    const rootDirectory = await createProcessFixtureRepository();

    await writeEventBatch(rootDirectory, "1700000000000-1-checkout-api.events.json", [
      createBackendExceptionEvent({
        eventId: "00000000-0000-4000-8000-000000001202",
        occurredAt: "2026-03-20T00:00:00.000Z",
        serviceName: "checkout-api",
        message: "Checkout failed deterministically",
        path: "/checkout"
      }),
      createBackendExceptionEvent({
        eventId: "00000000-0000-4000-8000-000000001201",
        occurredAt: "2026-03-20T00:00:00.000Z",
        serviceName: "checkout-api",
        message: "Checkout failed deterministically",
        path: "/checkout"
      })
    ]);

    const result = await processCommand({ json: true }, { cwd: () => rootDirectory });
    const incidents = Object.values((await readLocalState({ cwd: () => rootDirectory })).incidents);
    const rawState = JSON.parse(
      await readFile(join(rootDirectory, ".debugbundle", "local", "state.json"), "utf8")
    ) as {
      incidents: Record<string, { source_events: EventEnvelope[] }>;
    };
    const rawIncident = Object.values(rawState.incidents)[0];

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.output)).toEqual(expect.objectContaining({
      processed: true,
      incidents_processed: 1
    }));
    expect(incidents).toHaveLength(1);
    expect(incidents[0]).toEqual(expect.objectContaining({
      occurrence_count: 2,
      source_event_id: "00000000-0000-4000-8000-000000001202"
    }));
    expect(rawIncident?.source_events).toEqual([
      expect.objectContaining({ event_id: "00000000-0000-4000-8000-000000001201" }),
      expect.objectContaining({ event_id: "00000000-0000-4000-8000-000000001202" })
    ]);
  });
});