import { mkdtemp, mkdir, readFile, readdir, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { cleanCommand } from "../../../apps/cli/src/clean-command.js";

async function createCleanFixtureRepository(): Promise<string> {
  const rootDirectory = await mkdtemp(join(tmpdir(), "debugbundle-clean-"));

  await mkdir(join(rootDirectory, ".debugbundle", "local", "events"), { recursive: true });
  await mkdir(join(rootDirectory, ".debugbundle", "local", "browser-relay-spool"), { recursive: true });
  await mkdir(join(rootDirectory, ".debugbundle", "bundles", "local", "reproductions"), { recursive: true });
  await mkdir(join(rootDirectory, ".debugbundle", "bundles", "cloud", "reproductions"), { recursive: true });
  await writeFile(join(rootDirectory, ".debugbundle", "profile.json"), "{\"debugbundle\":{\"validation_status\":\"agent-validated\"}}\n", "utf8");
  await writeFile(join(rootDirectory, ".debugbundle", "local", "connection.json"), "{\"mode\":\"connected\"}\n", "utf8");
  await writeFile(
    join(rootDirectory, ".debugbundle", "local", "state.json"),
    `${JSON.stringify({ version: 1, last_processed_event_file: "20260301-2.events.json", incidents: {} }, null, 2)}\n`,
    "utf8"
  );

  await writeFile(join(rootDirectory, ".debugbundle", "local", "events", "20260301-1.events.json"), "{}\n", "utf8");
  await writeFile(join(rootDirectory, ".debugbundle", "local", "events", "20260301-2.events.json"), "{}\n", "utf8");
  await writeFile(join(rootDirectory, ".debugbundle", "local", "events", "20260320-3.events.json"), "{}\n", "utf8");

  await writeFile(join(rootDirectory, ".debugbundle", "local", "browser-relay-spool", "20260301-1-checkout-web.events.json"), "[]\n", "utf8");
  await writeFile(join(rootDirectory, ".debugbundle", "local", "browser-relay-spool", "20260301-1-checkout-web.events.json.delivered"), "\n", "utf8");
  await writeFile(join(rootDirectory, ".debugbundle", "local", "browser-relay-spool", "20260302-2-checkout-web.events.json"), "[]\n", "utf8");
  await writeFile(join(rootDirectory, ".debugbundle", "local", "browser-relay-spool", "20260320-3-checkout-web.events.json"), "[]\n", "utf8");
  await writeFile(join(rootDirectory, ".debugbundle", "local", "browser-relay-spool", "20260320-3-checkout-web.events.json.delivered"), "\n", "utf8");
  await writeFile(join(rootDirectory, ".debugbundle", "local", "browser-relay-spool", "20260321-4-checkout-web.events.json"), "[]\n", "utf8");

  await writeFile(join(rootDirectory, ".debugbundle", "bundles", "cloud", "inc_stale.bundle.json"), "{}\n", "utf8");
  await writeFile(join(rootDirectory, ".debugbundle", "bundles", "cloud", "inc_recent.bundle.json"), "{}\n", "utf8");
  await writeFile(
    join(rootDirectory, ".debugbundle", "bundles", "cloud", "reproductions", "inc_stale.reproduction.json"),
    "{}\n",
    "utf8"
  );
  await writeFile(
    join(rootDirectory, ".debugbundle", "bundles", "cloud", "reproductions", "inc_recent.reproduction.json"),
    "{}\n",
    "utf8"
  );

  return rootDirectory;
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

async function seedLocalIncidents(rootDirectory: string, incidents: Array<{ incidentId: string; status: "open" | "resolved"; lastSeenAt: string }>): Promise<void> {
  const statePath = join(rootDirectory, ".debugbundle", "local", "state.json");
  const nextState = {
    version: 1,
    last_processed_event_file: "20260301-2.events.json",
    incidents: Object.fromEntries(
      incidents.map((incident, index) => [
        incident.incidentId,
        {
          incident_id: incident.incidentId,
          source: "local",
          project_id: "proj_local",
          service_id: "svc_local",
          service_name: "checkout-api",
          service_runtime: null,
          service_framework: null,
          environment: "development",
          fingerprint: `fp_${incident.incidentId}`,
          fingerprint_version: "1",
          title: `Incident ${incident.incidentId}`,
          severity: "high",
          status: incident.status,
          resolved_at: incident.status === "resolved" ? incident.lastSeenAt : null,
          first_seen_at: incident.lastSeenAt,
          last_seen_at: incident.lastSeenAt,
          occurrence_count: 1,
          source_event_id: `evt_${incident.incidentId}`,
          source_occurred_at: incident.lastSeenAt,
          source_event_types: ["backend_exception"],
          matched_fields: ["message"],
          bundle_path: `.debugbundle/bundles/local/${incident.incidentId}.bundle.json`,
          reproduction_path: `.debugbundle/bundles/local/reproductions/${incident.incidentId}.reproduction.json`,
          generation_number: index + 1
        }
      ])
    )
  };

  await writeFile(statePath, `${JSON.stringify(nextState, null, 2)}\n`, "utf8");

  for (const incident of incidents) {
    await writeFile(
      join(rootDirectory, ".debugbundle", "bundles", "local", `${incident.incidentId}.bundle.json`),
      `${JSON.stringify({ incident_id: incident.incidentId, source: "local", status: incident.status }, null, 2)}\n`,
      "utf8"
    );
    await writeFile(
      join(rootDirectory, ".debugbundle", "bundles", "local", "reproductions", `${incident.incidentId}.reproduction.json`),
      `${JSON.stringify({ incident_id: incident.incidentId, source: "local", status: incident.status }, null, 2)}\n`,
      "utf8"
    );
  }
}

describe("cli clean command", () => {
  it("applies the default retention policy to processed events and cloud cache", async () => {
    const rootDirectory = await createCleanFixtureRepository();

    await utimes(join(rootDirectory, ".debugbundle", "local", "events", "20260301-1.events.json"), daysAgo(9), daysAgo(9));
    await utimes(join(rootDirectory, ".debugbundle", "local", "events", "20260301-2.events.json"), daysAgo(2), daysAgo(2));
    await utimes(join(rootDirectory, ".debugbundle", "local", "browser-relay-spool", "20260301-1-checkout-web.events.json"), daysAgo(9), daysAgo(9));
    await utimes(join(rootDirectory, ".debugbundle", "local", "browser-relay-spool", "20260301-1-checkout-web.events.json.delivered"), daysAgo(2), daysAgo(2));
    await utimes(join(rootDirectory, ".debugbundle", "local", "browser-relay-spool", "20260302-2-checkout-web.events.json"), daysAgo(8), daysAgo(8));
    await utimes(join(rootDirectory, ".debugbundle", "local", "browser-relay-spool", "20260320-3-checkout-web.events.json"), daysAgo(2), daysAgo(2));
    await utimes(join(rootDirectory, ".debugbundle", "local", "browser-relay-spool", "20260320-3-checkout-web.events.json.delivered"), daysAgo(0.5), daysAgo(0.5));
    await utimes(join(rootDirectory, ".debugbundle", "local", "browser-relay-spool", "20260321-4-checkout-web.events.json"), daysAgo(1), daysAgo(1));
    await utimes(join(rootDirectory, ".debugbundle", "bundles", "cloud", "inc_stale.bundle.json"), daysAgo(31), daysAgo(31));
    await utimes(
      join(rootDirectory, ".debugbundle", "bundles", "cloud", "reproductions", "inc_stale.reproduction.json"),
      daysAgo(31),
      daysAgo(31)
    );

    const result = await cleanCommand({ json: true }, { cwd: () => rootDirectory, now: () => new Date() });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.output)).toEqual({
      status: "ok",
      processed_event_files_removed: 1,
      processed_event_files_retained: 2,
      relay_spool_files_removed: 2,
      relay_spool_files_retained: 2,
      cloud_cache_files_removed: 2,
      cloud_cache_files_retained: 2,
      local_incidents_removed: 0,
      local_incidents_retained: 0
    });
    expect((await readdir(join(rootDirectory, ".debugbundle", "local", "events"))).sort()).toEqual([
      "20260301-2.events.json",
      "20260320-3.events.json"
    ]);
    expect((await readdir(join(rootDirectory, ".debugbundle", "bundles", "cloud"))).sort()).toEqual([
      "inc_recent.bundle.json",
      "reproductions"
    ]);
    expect((await readdir(join(rootDirectory, ".debugbundle", "bundles", "cloud", "reproductions"))).sort()).toEqual([
      "inc_recent.reproduction.json"
    ]);
    expect((await readdir(join(rootDirectory, ".debugbundle", "local", "browser-relay-spool"))).sort()).toEqual([
      "20260320-3-checkout-web.events.json",
      "20260320-3-checkout-web.events.json.delivered",
      "20260321-4-checkout-web.events.json"
    ]);
  });

  it("removes all processed event files with --events while keeping unprocessed files", async () => {
    const rootDirectory = await createCleanFixtureRepository();

    const result = await cleanCommand({ events: true, json: true }, { cwd: () => rootDirectory, now: () => new Date() });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.output)).toEqual({
      status: "ok",
      processed_event_files_removed: 2,
      processed_event_files_retained: 1,
      relay_spool_files_removed: 0,
      relay_spool_files_retained: 4,
      cloud_cache_files_removed: 0,
      cloud_cache_files_retained: 4,
      local_incidents_removed: 0,
      local_incidents_retained: 0
    });
    expect((await readdir(join(rootDirectory, ".debugbundle", "local", "events"))).sort()).toEqual([
      "20260320-3.events.json"
    ]);
  });

  it("prunes cloud cache artifacts older than the requested threshold", async () => {
    const rootDirectory = await createCleanFixtureRepository();

    await utimes(join(rootDirectory, ".debugbundle", "bundles", "cloud", "inc_stale.bundle.json"), daysAgo(12), daysAgo(12));
    await utimes(
      join(rootDirectory, ".debugbundle", "bundles", "cloud", "reproductions", "inc_stale.reproduction.json"),
      daysAgo(12),
      daysAgo(12)
    );

    const result = await cleanCommand(
      { bundles: true, olderThan: "10d", json: true },
      { cwd: () => rootDirectory, now: () => new Date() }
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.output)).toEqual({
      status: "ok",
      processed_event_files_removed: 0,
      processed_event_files_retained: 3,
      relay_spool_files_removed: 0,
      relay_spool_files_retained: 4,
      cloud_cache_files_removed: 2,
      cloud_cache_files_retained: 2,
      local_incidents_removed: 0,
      local_incidents_retained: 0
    });
  });

  it("rejects --older-than without --bundles", async () => {
    const rootDirectory = await createCleanFixtureRepository();

    const result = await cleanCommand(
      { olderThan: "10d" },
      { cwd: () => rootDirectory, now: () => new Date() }
    );

    expect(result).toEqual({
      exitCode: 4,
      output: "--older-than requires --bundles."
    });
  });

  it("applies local incident retention by removing resolved incidents first when the local store exceeds 50 incidents", async () => {
    const rootDirectory = await createCleanFixtureRepository();
    const incidents = [
      { incidentId: "inc_open_oldest", status: "open" as const, lastSeenAt: "2026-03-01T00:00:00.000Z" },
      { incidentId: "inc_resolved_keep_out_1", status: "resolved" as const, lastSeenAt: "2026-03-20T00:00:00.000Z" },
      { incidentId: "inc_resolved_keep_out_2", status: "resolved" as const, lastSeenAt: "2026-03-19T00:00:00.000Z" },
      ...Array.from({ length: 49 }, (_, index) => ({
        incidentId: `inc_open_${String(index + 1).padStart(2, "0")}`,
        status: "open" as const,
        lastSeenAt: `2026-03-${String((index % 18) + 2).padStart(2, "0")}T12:00:00.000Z`
      }))
    ];
    await seedLocalIncidents(rootDirectory, incidents);

    const result = await cleanCommand({ json: true }, { cwd: () => rootDirectory, now: () => new Date("2026-03-20T12:00:00.000Z") });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.output)).toEqual({
      status: "ok",
      processed_event_files_removed: 0,
      processed_event_files_retained: 3,
      relay_spool_files_removed: 0,
      relay_spool_files_retained: 4,
      cloud_cache_files_removed: 0,
      cloud_cache_files_retained: 4,
      local_incidents_removed: 2,
      local_incidents_retained: 50
    });

    const nextState = JSON.parse(await readFile(join(rootDirectory, ".debugbundle", "local", "state.json"), "utf8")) as {
      incidents: Record<string, { status: string }>;
    };
    expect(Object.keys(nextState.incidents)).toHaveLength(50);
    expect(nextState.incidents["inc_open_oldest"]?.status).toBe("open");
    expect(nextState.incidents["inc_resolved_keep_out_1"]).toBeUndefined();
    expect(nextState.incidents["inc_resolved_keep_out_2"]).toBeUndefined();
    expect((await readdir(join(rootDirectory, ".debugbundle", "bundles", "local"))).filter((name) => name.endsWith(".bundle.json"))).toHaveLength(50);
    expect((await readdir(join(rootDirectory, ".debugbundle", "bundles", "local", "reproductions"))).filter((name) => name.endsWith(".reproduction.json"))).toHaveLength(50);
  });

  it("resets runtime data with --all while preserving generated config files", async () => {
    const rootDirectory = await createCleanFixtureRepository();
    await seedLocalIncidents(rootDirectory, [
      { incidentId: "inc_local_1", status: "open", lastSeenAt: "2026-03-20T00:00:00.000Z" }
    ]);

    const result = await cleanCommand({ all: true, json: true }, { cwd: () => rootDirectory, now: () => new Date("2026-03-20T12:00:00.000Z") });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.output)).toEqual({
      status: "ok",
      processed_event_files_removed: 3,
      processed_event_files_retained: 0,
      relay_spool_files_removed: 4,
      relay_spool_files_retained: 0,
      cloud_cache_files_removed: 4,
      cloud_cache_files_retained: 0,
      local_incidents_removed: 1,
      local_incidents_retained: 0,
      reset_applied: true
    });

    expect(await readFile(join(rootDirectory, ".debugbundle", "profile.json"), "utf8")).toContain("validation_status");
    expect(await readFile(join(rootDirectory, ".debugbundle", "local", "connection.json"), "utf8")).toContain("connected");
    expect(JSON.parse(await readFile(join(rootDirectory, ".debugbundle", "local", "state.json"), "utf8"))).toEqual({
      version: 1,
      last_processed_event_file: null,
      incidents: {}
    });
    expect(await readdir(join(rootDirectory, ".debugbundle", "local", "events"))).toEqual([]);
    expect(await readdir(join(rootDirectory, ".debugbundle", "local", "browser-relay-spool"))).toEqual([]);
    expect((await readdir(join(rootDirectory, ".debugbundle", "bundles", "local"))).sort()).toEqual(["reproductions"]);
    expect(await readdir(join(rootDirectory, ".debugbundle", "bundles", "local", "reproductions"))).toEqual([]);
    expect((await readdir(join(rootDirectory, ".debugbundle", "bundles", "cloud"))).sort()).toEqual(["reproductions"]);
    expect(await readdir(join(rootDirectory, ".debugbundle", "bundles", "cloud", "reproductions"))).toEqual([]);
  });
});