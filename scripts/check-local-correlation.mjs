import assert from "node:assert/strict";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

// Called only inside disposable installed-client fixtures; no network or host auth.
export async function checkLocalCorrelation(root, processLocally) {
  const profile = join(root, ".debugbundle/profile.json");
  await mkdir(join(root, ".debugbundle/local/events"), { recursive: true });
  try {
    await access(profile);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await writeFile(
      profile,
      JSON.stringify({
        profile_version: "v1",
        project: {
          name: "scope-fixture",
          repo_url: "",
          primary_languages: [],
          package_managers: [],
          deployment_targets: []
        },
        services: [],
        infrastructure: { databases: [], queues: [], object_storage: [], external_services: [] },
        critical_paths: [],
        repo: { root_paths: [], generated_paths: [], do_not_edit_paths: [] },
        developer_workflows: { install: "", build: "", test: "", lint: "" },
        debugbundle: {
          profile_owner: "fixture",
          last_reviewed_at: "2026-11-04T00:00:00Z",
          validation_status: "static-analysis-only",
          skill_path: ".agents/skills/debugbundle/SKILL.md",
          notes: ""
        }
      })
    );
  }
  const projectA = "00000000-0000-4000-8000-000000000001";
  const projectB = "00000000-0000-4000-8000-000000000002";
  const events = [
    [projectA, "production", "frontend_exception"],
    [projectA, "production", "backend_exception"],
    [projectB, "staging", "frontend_exception"],
    [projectB, "staging", "backend_exception"],
    [projectA, "staging", "backend_exception"],
    [projectB, "production", "frontend_exception"]
  ].map(([project_id, environment, event_type], index) => ({
    schema_version: "2026-03-01",
    event_id: `00000000-0000-4000-8000-00000000010${index}`,
    event_type,
    project_id,
    occurred_at: "2026-11-04T00:00:00Z",
    sdk_name: "scope-runtime-fixture",
    sdk_version: "1.0.0",
    service: { name: event_type === "frontend_exception" ? "scope-web" : "scope-api", environment },
    correlation: { trace_id: "scope-fixture-reused-trace" },
    payload: {
      name: "TypeError",
      message: "scope fixture failure",
      stack: "TypeError: scope fixture failure\n    at fixture (/application/scope.js:1:1)",
      ...(event_type === "backend_exception"
        ? {
            handled: true,
            request: { method: "GET", path: "/scope-fixture", query: {}, headers: {} },
            response: { status_code: 500 },
            runtime: { version: process.version }
          }
        : { browser: { name: "Chrome", version: "150" } })
    }
  }));
  await writeFile(
    join(root, ".debugbundle/local/events/000-scope.events.json"),
    JSON.stringify(events)
  );
  await processLocally();
  const state = JSON.parse(await readFile(join(root, ".debugbundle/local/state.json"), "utf8"));
  const ids = new Set(events.map((event) => event.event_id));
  const incidents = Object.values(state.incidents).filter((incident) =>
    incident.source_events.some((event) => ids.has(event.event_id))
  );
  assert.equal(
    incidents.length,
    4,
    "installed processing must separate project/environment scopes"
  );
  assert.equal(incidents.flatMap((incident) => incident.source_events).length, events.length);
  for (const incident of incidents) {
    assert(
      incident.source_events.every(
        (event) =>
          event.project_id === incident.project_id &&
          event.service.environment === incident.environment
      ),
      "installed processing must not retain foreign source events"
    );
  }
  console.log(
    "Installed local correlation preserves project/environment scopes and same-scope full-stack grouping."
  );
}
