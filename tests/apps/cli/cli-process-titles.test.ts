import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { processCommand } from "../../../apps/cli/src/process-command.js";
import { readLocalState } from "../../../apps/cli/src/local-retrieval-store.js";
import { fingerprint, normalizeEvent } from "../../../packages/event-normalizer/src/index.js";
import {
  BundleV1Schema,
  createEventEnvelope,
  type EventEnvelope
} from "../../../packages/shared-types/src/index.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function processEvent(event: EventEnvelope) {
  const root = await mkdtemp(join(tmpdir(), "debugbundle-title-"));
  roots.push(root);
  const eventsPath = join(root, ".debugbundle", "local", "events");
  await mkdir(eventsPath, { recursive: true });
  await writeFile(join(eventsPath, "1700000000000-1-api.events.json"), JSON.stringify([event]));
  const result = await processCommand({ json: true, preset: "balanced" }, { cwd: () => root });
  expect(result.exitCode).toBe(0);
  const incidents = Object.values((await readLocalState({ cwd: () => root })).incidents);
  expect(incidents).toHaveLength(1);
  const incident = incidents[0]!;
  const bundle = BundleV1Schema.parse(
    JSON.parse(await readFile(join(root, incident.bundle_path), "utf8"))
  );
  return { incident, bundle };
}

const service = { name: "api", environment: "staging", runtime: "java", framework: null };
const projectId = "00000000-0000-4000-8000-000000000001";

it("uses a concise local title while preserving the fingerprint and full bundle error evidence", async () => {
  const message =
    "IllegalStateException: patients unavailable\n\tat io.example.Filter.doFilter(Filter.java:44)";
  const event = createEventEnvelope({
    project_id: projectId,
    event_type: "backend_exception",
    service,
    payload: {
      name: "IllegalStateException",
      message,
      stack: message,
      handled: false,
      request: { method: "GET", path: "/patients", query: {}, headers: {} },
      response: { status_code: 500 },
      runtime: { version: "21" }
    }
  });
  const { incident, bundle } = await processEvent(event);
  expect(incident.title).toBe("IllegalStateException: patients unavailable");
  expect(incident.fingerprint).toBe(fingerprint(normalizeEvent(event)));
  expect(bundle.summary.title).toBe(incident.title);
  expect(bundle.context.error).toMatchObject({ message, stack: message });
});

it("bounds long request titles while preserving the complete request route", async () => {
  const path = "/reports".repeat(50);
  const event = createEventEnvelope({
    project_id: projectId,
    event_type: "request_event",
    service,
    payload: { method: "GET", path, query: {}, headers: {}, response_status: 500, duration_ms: 42 }
  });
  const { incident, bundle } = await processEvent(event);
  expect(incident.title.length).toBeLessThanOrEqual(180);
  expect(incident.title).toMatch(/…$/);
  expect(incident.fingerprint).toBe(fingerprint(normalizeEvent(event)));
  expect(bundle.context.request?.path).toBe(path);
});
