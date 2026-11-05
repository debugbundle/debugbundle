import { BundleV1Schema } from "../../../packages/shared-types/src/index.js";
import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { processCommand } from "../../../apps/cli/src/process-command.js";
import { getLocalBundle, readLocalState } from "../../../apps/cli/src/local-retrieval-store.js";
import type { LocalProcessingState } from "../../../apps/cli/src/local-processing-state.js";
import {
  createBackendExceptionEvent,
  createFrontendExceptionEvent,
  createProcessFixtureRepository,
  writeEventBatch
} from "../../helpers/local-processing-fixture.js";

const projectA = "00000000-0000-4000-8000-000000000001";
const projectB = "00000000-0000-4000-8000-000000000002";
const traceId = "reused-trace";
const frontend = () =>
  createFrontendExceptionEvent({
    eventId: "00000000-0000-4000-8000-000000000003",
    occurredAt: "2026-11-04T00:00:00Z",
    serviceName: "web",
    environment: "production",
    traceId
  });
const backend = () =>
  createBackendExceptionEvent({
    eventId: "00000000-0000-4000-8000-000000000004",
    occurredAt: "2026-11-04T00:00:01Z",
    serviceName: "api",
    environment: "production",
    traceId
  });

describe("local trace correlation scope", () => {
  it.each(["bundle_path", "reproduction_path"])(
    "refuses unsafe retained %s without rewriting state",
    async (field) => {
      const root = await createProcessFixtureRepository();
      try {
        await writeEventBatch(root, "001.events.json", [backend()]);
        await processCommand({ json: true }, { cwd: () => root });
        const path = join(root, ".debugbundle/local/state.json");
        const state = JSON.parse(await readFile(path, "utf8"));
        Object.values(state.incidents as Record<string, Record<string, unknown>>)[0]![field] =
          "../unrelated.json";
        const bytes = JSON.stringify(state);
        await writeFile(path, bytes);
        await expect(processCommand({ json: true }, { cwd: () => root })).rejects.toMatchObject({
          code: "invalid_local_artifact_path"
        });
        expect(await readFile(path, "utf8")).toBe(bytes);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }
  );

  it.each([null, {}, [{}]])("refuses malformed retained evidence: %j", async (sourceEvents) => {
    const root = await createProcessFixtureRepository();
    try {
      await writeEventBatch(root, "001.events.json", [backend()]);
      await processCommand({ json: true }, { cwd: () => root });
      const path = join(root, ".debugbundle/local/state.json");
      const state = JSON.parse(await readFile(path, "utf8")) as {
        incidents: Record<string, { source_events: unknown }>;
      };
      Object.values(state.incidents)[0]!.source_events = sourceEvents;
      const bytes = JSON.stringify(state);
      await writeFile(path, bytes);
      await expect(readLocalState({ cwd: () => root })).rejects.toMatchObject({
        code: "local_incident_scope_mismatch"
      });
      expect(await readFile(path, "utf8")).toBe(bytes);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it.each([
    [projectA, "production", 1],
    [projectB, "production", 2],
    [projectA, "staging", 2],
    [projectB, "staging", 2]
  ] as const)(
    "keeps project %s and environment %s scoped",
    async (projectId, environment, count) => {
      const root = await createProcessFixtureRepository();
      try {
        const event = backend();
        event.project_id = projectId;
        event.service.environment = environment;
        await writeEventBatch(root, "001.events.json", [frontend(), event]);
        expect((await processCommand({ json: true }, { cwd: () => root })).exitCode).toBe(0);
        const state = JSON.parse(
          await readFile(join(root, ".debugbundle/local/state.json"), "utf8")
        ) as LocalProcessingState;
        expect(Object.values(state.incidents)).toHaveLength(count);
        for (const incident of Object.values(state.incidents)) {
          expect(
            incident.source_events.every(
              (e) =>
                e.project_id === incident.project_id &&
                e.service.environment === incident.environment
            )
          ).toBe(true);
          const bundle = await getLocalBundle(
            { incidentId: incident.incident_id },
            { cwd: () => root }
          );
          expect(bundle).toMatchObject({
            project: { id: incident.project_id, environment: incident.environment }
          });
        }
        const bytes = await readFile(join(root, ".debugbundle/local/state.json"), "utf8");
        expect((await processCommand({ json: true }, { cwd: () => root })).exitCode).toBe(0);
        expect(await readFile(join(root, ".debugbundle/local/state.json"), "utf8")).toBe(bytes);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }
  );

  it.each([
    [projectB, "production"],
    [projectA, "staging"]
  ] as const)(
    "rejects mixed cached evidence from %s/%s until an explicit rebuild",
    async (foreignProject, foreignEnvironment) => {
      const root = await createProcessFixtureRepository();
      try {
        await writeEventBatch(root, "001.events.json", [backend()]);
        await processCommand({ json: true }, { cwd: () => root });
        const path = join(root, ".debugbundle/local/state.json");
        const state = JSON.parse(await readFile(path, "utf8")) as LocalProcessingState;
        const foreign = frontend();
        foreign.project_id = foreignProject;
        foreign.service.environment = foreignEnvironment;
        Object.values(state.incidents)[0]!.source_events.push(foreign);
        const mixed = JSON.stringify(state);
        await writeFile(path, mixed);
        await writeEventBatch(root, "001.events.json", [backend(), foreign]);
        await expect(
          getLocalBundle({ incidentId: Object.keys(state.incidents)[0]! }, { cwd: () => root })
        ).rejects.toMatchObject({ code: "local_incident_scope_mismatch" });
        await expect(readLocalState({ cwd: () => root })).rejects.toMatchObject({
          code: "local_incident_scope_mismatch"
        });
        expect((await processCommand({ json: true }, { cwd: () => root })).exitCode).toBe(1);
        expect(await readFile(path, "utf8")).toBe(mixed);
        expect(
          (await processCommand({ json: true, preset: "minimal" }, { cwd: () => root })).exitCode
        ).toBe(0);
        expect(Object.values((await readLocalState({ cwd: () => root })).incidents)).toHaveLength(
          2
        );
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }
  );
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

    expect(parsedOutput).toEqual(
      expect.objectContaining({
        processed: true,
        files_processed: 2,
        events_processed: 2,
        incidents_processed: 1
      })
    );

    const state = JSON.parse(
      await readFile(join(rootDirectory, ".debugbundle", "local", "state.json"), "utf8")
    ) as {
      incidents: Record<string, { source_event_types: string[] }>;
    };

    expect(Object.keys(state.incidents)).toHaveLength(1);
    expect(Object.values(state.incidents)[0]).toEqual(
      expect.objectContaining({
        source_event_types: ["backend_exception", "frontend_exception"]
      })
    );

    const bundleFiles = (
      await readdir(join(rootDirectory, ".debugbundle", "bundles", "local"))
    ).filter((fileName) => fileName.endsWith(".bundle.json"));

    expect(bundleFiles).toHaveLength(1);

    const bundle = BundleV1Schema.parse(
      JSON.parse(
        await readFile(
          join(rootDirectory, ".debugbundle", "bundles", "local", bundleFiles[0] ?? ""),
          "utf8"
        )
      )
    );

    expect(bundle.context.frontend).toEqual(
      expect.objectContaining({
        version: 1,
        exceptions: [
          expect.objectContaining({
            route: "/checkout"
          })
        ]
      })
    );
    expect(bundle.context.request).toEqual(
      expect.objectContaining({
        version: 1,
        method: "GET",
        path: "/api/checkout"
      })
    );
    expect(bundle.context.response).toEqual(
      expect.objectContaining({
        version: 1,
        status_code: 500
      })
    );
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
    expect(JSON.parse(result.output)).toEqual(
      expect.objectContaining({
        processed: true,
        incidents_processed: 1
      })
    );
    expect(incidents).toHaveLength(1);
    expect(incidents[0]).toEqual(
      expect.objectContaining({
        service_name: "checkout-api",
        source_event_types: ["backend_exception", "frontend_exception"],
        occurrence_count: 2,
        title: "Order {dynamic} failed during checkout"
      })
    );
  });
});
