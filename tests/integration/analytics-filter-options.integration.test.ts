import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createDefaultAnalyticsDependencies } from "../../apps/api/src/default-analytics-dependencies.js";
import { AnalyticsFilterOptionsResponseSchema } from "../../packages/shared-types/src/analytics-filter-options.js";
import { createDependencies, createProjectAccess } from "../helpers/analytics-route-fixtures.js";
import { createPostgresAnalyticsFilterOptionsStore } from "../../packages/storage/src/analytics-filter-options-store.js";
import { createPostgresAnalyticsSettingsStore } from "../../packages/storage/src/analytics-settings-store.js";
import { bootstrapStorageSchema } from "../../packages/storage/src/migrations.js";
import { migrateStorageSchema } from "../../packages/storage/src/schema-migrations.js";
import { seedConsolidationProjects } from "../helpers/consolidation-projects.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration,
  seedOwnedProject
} from "../helpers/integration-setup.js";

runIntegration("observed analytics filter options", () => {
  const pool = createIntegrationPool();
  const db = createQueryable(pool);
  const options = createPostgresAnalyticsFilterOptionsStore(db);
  const window = {
    from: "2026-11-01T00:00:00.000Z",
    to: "2026-11-03T00:00:00.000Z",
    granularity: "day" as const
  };
  beforeAll(async () => {
    // Own the disposable schema: earlier readiness tests deliberately leave
    // invalid constraints/ledger entries that bootstrap must never repair.
    await pool.query("DROP SCHEMA public CASCADE");
    await pool.query("CREATE SCHEMA public");
    await bootstrapStorageSchema(db);
    await migrateStorageSchema(db);
  });
  afterAll(async () => {
    await pool.end();
  });
  async function project(): Promise<string> {
    const projectId = randomUUID(),
      organizationId = randomUUID();
    await seedOwnedProject({
      pool,
      organizationId,
      projectId,
      organizationName: "Options",
      organizationSlug: `options-${organizationId}`,
      projectName: "Options",
      projectSlug: `options-${projectId}`,
      organizationPlan: "team"
    });
    return projectId;
  }
  async function session(
    projectId: string,
    input: {
      device?: string;
      country?: string;
      service?: string;
      environment?: string;
      at?: string;
      dimensions?: Record<string, unknown>;
    } = {}
  ): Promise<void> {
    await pool.query(
      `INSERT INTO analytics_session_rollups
      (project_id,service,environment,bucket_start,bucket_granularity,dimension_hash,device_type,browser_family,os_family,language,country_code,auth_state,dimensions,sessions,total_pageviews)
      VALUES($1,$2,$3,$4,'day',$5,$6,'Chrome','Linux','sl',$7,'authenticated',$8,3,6)`,
      [
        projectId,
        input.service ?? "web",
        input.environment ?? "production",
        input.at ?? window.from,
        randomUUID(),
        input.device ?? "mobile",
        input.country ?? "SI",
        JSON.stringify(input.dimensions ?? {})
      ]
    );
  }
  async function route(projectId: string, value: string): Promise<void> {
    await pool.query(
      `INSERT INTO analytics_route_rollups
      (project_id,service,environment,bucket_start,bucket_granularity,route_key,dimension_hash,pageviews,unique_sessions)
      VALUES($1,'web','production',$2,'day',$3,$4,1,1)`,
      [projectId, window.from, value, randomUUID()]
    );
  }

  it("returns only observed scoped values, including countries and approved custom values", async () => {
    const id = await project(),
      other = await project();
    await createPostgresAnalyticsSettingsStore(db).updateAnalyticsSettings({
      project_id: id,
      update: { approved_custom_dimensions: ["plan"] }
    });
    await session(id, {
      dimensions: {
        utm_source: "newsletter",
        custom_dimensions: { plan: "team", private_key: "unapproved" }
      }
    });
    await session(id, { service: "api", device: "desktop", country: "US" });
    await session(id, { environment: "staging", device: "tablet" });
    await session(id, { at: "2026-10-01T00:00:00.000Z", device: "old-device" });
    await session(other, { device: "private-device" });
    await route(id, "/checkout");
    const result = await options.getFilterOptions({
      ...window,
      project_id: id,
      service: "web",
      environment: "production"
    });
    expect(result.options.device_type).toEqual({ values: ["mobile"], truncated: false });
    expect(result.options.country.values).toEqual(["SI"]);
    expect(result.options.route.values).toEqual(["/checkout"]);
    expect(result.options.utm_source.values).toEqual(["newsletter"]);
    expect(result.options.utm_campaign.values).toEqual([]);
    expect(result.options.referrer.values).toEqual([]);
    expect(result.custom_dimensions).toEqual([{ key: "plan", values: ["team"], truncated: false }]);
    expect(JSON.stringify(result)).not.toContain("private-device");
    const wider = await options.getFilterOptions({
      ...window,
      project_id: id,
      environment: "production"
    });
    expect(wider.options.country.values).toEqual(["SI", "US"]);
  });

  it("reports bounded truncation and preserves valid empty custom values", async () => {
    const id = await project();
    await createPostgresAnalyticsSettingsStore(db).updateAnalyticsSettings({
      project_id: id,
      update: { approved_custom_dimensions: ["plan"] }
    });
    await session(id, { device: "a", dimensions: { custom_dimensions: { plan: "" } } });
    await session(id, { device: "b" });
    await session(id, { device: "c" });
    const result = await options.getFilterOptions({ ...window, project_id: id, limit: 2 });
    expect(result.options.device_type).toEqual({ values: ["a", "b"], truncated: true });
    expect(result.custom_dimensions[0]?.values).toEqual([""]);
    expect(
      JSON.stringify(await options.getFilterOptions({ ...window, project_id: await project() }))
    ).not.toContain('"unknown"');
  });

  it("serves scoped choices through the default API adapter without queueing work", async () => {
    const id = await project();
    await session(id, { service: "web", device: "mobile" });
    await session(id, { service: "api", device: "desktop" });
    const queue = { enqueue: vi.fn() };
    const dependencies = createDefaultAnalyticsDependencies({ db, queue });
    const app = createDependencies({
      analyticsFilterOptions: dependencies.analyticsFilterOptions,
      projectAccess: { ...createProjectAccess(), project_id: id }
    });
    try {
      const query = new URLSearchParams({
        project_id: id,
        ...window,
        service: "web",
        environment: "production"
      });
      const response = await app.inject({
        method: "GET",
        url: `/v1/analytics/filter-options?${query}`,
        headers: { authorization: "Bearer dbundle_mem_test_token" }
      });
      expect(response.statusCode).toBe(200);
      const result = AnalyticsFilterOptionsResponseSchema.parse(response.json());
      expect(result.options.device_type.values).toEqual(["mobile"]);
      expect(result.window).toMatchObject({ project_id: id, service: "web" });
      expect(response.headers["x-debugbundle-privacy-policy"]).toBe("telemetry-privacy-v1");
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(queue.enqueue).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it("omits unsafe legacy choices instead of offering changed values", async () => {
    const id = await project();
    await session(id, {
      dimensions: { utm_source: "Authorization: Bearer SYNTHETIC_FILTER_SECRET" }
    });
    const result = await options.getFilterOptions({ ...window, project_id: id });
    expect(result.options.utm_source).toEqual({ values: [], truncated: true });
    expect(JSON.stringify(result)).not.toContain("SYNTHETIC_FILTER_SECRET");
  });

  it("keeps multilingual option payloads bounded without shortening selectable values", async () => {
    const id = await project();
    const keys = Array.from({ length: 8 }, (_, index) => `choice${index}`);
    await createPostgresAnalyticsSettingsStore(db).updateAnalyticsSettings({
      project_id: id,
      update: { approved_custom_dimensions: keys }
    });
    const captured = new Set<string>();
    for (let index = 0; index < 100; index++) {
      const value = `${"山".repeat(100)}${index}`;
      captured.add(value);
      await session(id, {
        dimensions: { custom_dimensions: Object.fromEntries(keys.map((key) => [key, value])) }
      });
      const path = `/${"道".repeat(500)}/${index}`;
      captured.add(path);
      await route(id, path);
    }
    const result = await options.getFilterOptions({ ...window, project_id: id });
    expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(256 * 1024);
    expect(
      [...Object.values(result.options), ...result.custom_dimensions].some((set) => set.truncated)
    ).toBe(true);
    for (const value of [
      ...result.options.route.values,
      ...result.custom_dimensions.flatMap((set) => set.values)
    ])
      expect(captured.has(value)).toBe(true);
  });

  it("intersects consolidated origins with the accepted principal scope", async () => {
    const f = await seedConsolidationProjects(pool, db);
    await session(f.source, { device: "source-device" });
    await session(f.target, { device: "target-device" });
    await f.consolidate();
    const combined = await options.getFilterOptions({ ...window, project_id: f.target });
    expect(combined.options.device_type.values).toEqual(["source-device", "target-device"]);
    const retained = await options.getFilterOptions({
      ...window,
      project_id: f.target,
      origin_project_ids: [f.source]
    });
    expect(retained.options.device_type.values).toEqual(["source-device"]);
  });
});
