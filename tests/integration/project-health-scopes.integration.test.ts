import { afterAll, beforeAll, expect, it } from "vitest";
import { bootstrapStorageSchema } from "../../packages/storage/src/migrations.js";
import { migrateStorageSchema } from "../../packages/storage/src/schema-migrations.js";
import { createPostgresAvailabilityCheckStore } from "../../packages/storage/src/availability-check-store.js";
import { createPublicStatusPageStore } from "../../packages/storage/src/public-status-store.js";
import { seedExternalProjectCollaborator } from "../helpers/shared-project-collaborator.js";
import { seedConsolidationProjects } from "../helpers/consolidation-projects.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration
} from "../helpers/integration-setup.js";

runIntegration("health check ownership and original runtime namespaces", () => {
  const pool = createIntegrationPool(),
    db = createQueryable(pool),
    health = createPostgresAvailabilityCheckStore(db);
  const now = "2026-11-04T12:00:00.000Z";
  beforeAll(async () => {
    await bootstrapStorageSchema(db);
    await migrateStorageSchema(db);
  });
  afterAll(async () => {
    await pool.end();
  });
  async function fixture() {
    const f = await seedConsolidationProjects(pool, db);
    await f.definitions.create({ project_id: f.target, user_id: f.userId, name: "api" });
    const create = (projectId: string, serviceName: string | null) =>
      health.createCheckForProjectInOrganization({
        organization_id: f.organizationId,
        project_id: projectId,
        created_by_user_id: f.userId,
        name: "Endpoint",
        url: "https://example.test/health",
        method: "GET",
        expected_status_min: 200,
        expected_status_max: 399,
        timeout_ms: 1000,
        interval_seconds: 60,
        failure_threshold: 2,
        recovery_threshold: 2,
        environment: "production",
        service_name: serviceName,
        enabled: true,
        now
      });
    return { ...f, create };
  }
  it("registers a previously unseen service before creating its first check", async () => {
    const f = await fixture();
    const check = await f.create(f.target, "new-worker");
    expect(check).toMatchObject({ project_id: f.target, service_name: "new-worker" });
    const definitions = await f.definitions.list({
      project_id: f.target,
      user_id: f.userId,
      limit: 100
    });
    const registered = definitions.services.filter((d) => d.input_name === "new-worker");
    expect(registered).toHaveLength(1);
    expect(
      (
        await pool.query("SELECT service_definition_id FROM availability_checks WHERE id=$1", [
          (check as { check_id: string }).check_id
        ])
      ).rows
    ).toEqual([{ service_definition_id: registered[0]!.service_definition_id }]);
  });
  it("preserves a check claimed before cutover and projects its current service name", async () => {
    const f = await fixture();
    const source = await f.create(f.source, "web"),
      target = await f.create(f.target, "api");
    if (typeof source === "string" || typeof target === "string")
      throw new Error("health_fixture_failed");
    await pool.query("UPDATE availability_checks SET consecutive_failures=1 WHERE id=$1", [
      source.check_id
    ]);
    const claim = (
      await health.claimDueChecks({
        now,
        claim_timeout_before: "2026-11-04T11:59:00.000Z",
        limit: 1000
      })
    ).find((c) => c.check_id === source.check_id)!;
    expect(claim).toMatchObject({
      project_id: f.source,
      service_name: "web",
      consecutive_failures: 1
    });
    await f.consolidate();
    const rootRead = await health.getCheckForProjectInOrganization({
      organization_id: f.organizationId,
      project_id: f.target,
      check_id: source.check_id
    });
    expect(rootRead).toMatchObject({
      check_id: source.check_id,
      service_name: "Site",
      consecutive_failures: 1,
      url: "https://example.test/health"
    });
    const recorded = await health.recordCheckExecution({
      check_id: source.check_id,
      claimed_at: claim.claimed_at,
      scheduled_for: claim.due_at,
      started_at: now,
      completed_at: "2026-11-04T12:00:00.010Z",
      result: {
        status: "http_status_mismatch",
        http_status: 500,
        duration_ms: 10,
        error_kind: "http_status_mismatch",
        error_message: "Fixture failure",
        checked_url_host: "example.test",
        checked_url_path: "/health",
        checked_url_query: {},
        final_url: "https://example.test/health",
        redirect_count: 0
      }
    });
    expect(recorded).toMatchObject({
      check: { project_id: f.source, service_name: "web" },
      next_status: "failing",
      emit_failure_event: true
    });
    expect(
      (
        await health.listResultsForCheckInOrganization({
          organization_id: f.organizationId,
          project_id: f.target,
          check_id: source.check_id,
          limit: 100
        })
      )?.[0]
    ).toMatchObject({
      project_id: f.source,
      check_id: source.check_id,
      status: "http_status_mismatch"
    });
    const updated = await health.updateCheckForProjectInOrganization({
      organization_id: f.organizationId,
      project_id: f.target,
      check_id: source.check_id,
      actor_user_id: f.userId,
      name: "Renamed endpoint",
      service_name: "Site",
      now
    });
    expect(updated).toMatchObject({
      check_id: source.check_id,
      service_name: "Site",
      consecutive_failures: 2,
      status: "failing"
    });
    expect(
      await health.updateCheckForProjectInOrganization({
        organization_id: f.organizationId,
        project_id: f.target,
        check_id: source.check_id,
        actor_user_id: f.userId,
        service_name: "api",
        now
      })
    ).toBe("service_scope_conflict");
    const adopted = await f.create(f.target, "Site");
    if (typeof adopted === "string") throw new Error("adopted_health_fixture_failed");
    expect(
      (
        await pool.query(
          "SELECT project_id,service_name,service_definition_id FROM availability_checks WHERE id=$1",
          [adopted.check_id]
        )
      ).rows[0]
    ).toMatchObject({
      project_id: f.source,
      service_name: "web",
      service_definition_id: f.request.service_mappings[0]!.service_definition_id
    });
  });
  it.each([
    { plan: "team", limit: 5 },
    { plan: "business", limit: 10 }
  ])(
    "enforces $plan combined saved-check admission without silently pausing preserved checks",
    async ({ plan, limit }) => {
      const f = await fixture();
      await pool.query("UPDATE organizations SET plan=$2 WHERE id=$1", [f.organizationId, plan]);
      for (let index = 0; index < limit; index++)
        expect(typeof (await f.create(index % 2 ? f.target : f.source, null))).toBe("object");
      await f.consolidate();
      const list = await health.listChecksForProjectInOrganization({
        organization_id: f.organizationId,
        project_id: f.target,
        limit: 100
      });
      expect(list).toHaveLength(limit);
      expect(list?.every((c) => c.paused_reason === null)).toBe(true);
      expect(await f.create(f.target, "Site")).toBe("limit_reached");
      expect(
        (
          await pool.query(
            "SELECT count(*)::int AS count FROM availability_checks WHERE project_id=ANY($1::uuid[])",
            [[f.target, f.source]]
          )
        ).rows[0]?.count
      ).toBe(limit);
    }
  );
  it("rechecks a collaborator's canonical role and revocation across retained health reads and writes", async () => {
    const f = await fixture(),
      member = await seedExternalProjectCollaborator(pool, [f.target, f.source]);
    const check = await f.create(f.source, "web");
    if (typeof check === "string") throw new Error("health_fixture_failed");
    await f.consolidate();
    const scope = {
      organization_id: f.organizationId,
      project_id: f.target,
      check_id: check.check_id,
      actor_user_id: member
    };
    expect(
      await health.updateCheckForProjectInOrganization({ ...scope, name: "Edited by admin", now })
    ).toMatchObject({ name: "Edited by admin" });
    await pool.query(
      "UPDATE project_members SET role='member' WHERE project_id=$1 AND user_id=$2",
      [f.target, member]
    );
    expect(
      await health.updateCheckForProjectInOrganization({ ...scope, name: "Denied", now })
    ).toBe("check_not_found");
    expect(await health.getCheckForProjectInOrganization(scope)).not.toBeNull();
    await pool.query("DELETE FROM project_members WHERE project_id=$1 AND user_id=$2", [
      f.target,
      member
    ]);
    expect(await health.getCheckForProjectInOrganization(scope)).toBeNull();
    expect(
      await health.getCheckForProjectInOrganization({ ...scope, project_id: f.source })
    ).toBeNull();
    expect(await health.listResultsForCheckInOrganization({ ...scope, limit: 100 })).toBeNull();
    expect(await health.deleteCheckForProjectInOrganization({ ...scope, deleted_at: now })).toBe(
      false
    );
  });
  it("keeps published status selections and URLs exact after importing private checks", async () => {
    const f = await fixture();
    const published = await f.create(f.source, "web"),
      privateCheck = await f.create(f.target, "api");
    if (typeof published === "string" || typeof privateCheck === "string")
      throw new Error("health_fixture_failed");
    const pages = createPublicStatusPageStore(db),
      scope = { project_id: f.source, organization_id: f.organizationId, owner_user_id: f.userId };
    const selection = {
      title: "Published endpoint",
      enabled: true,
      projects: [{ project_id: f.source, check_ids: [published.check_id] }]
    };
    const settings = await pages.saveSettings(scope, selection);
    const before = await pages.getPublicPage(settings.public_id!);
    await f.consolidate();
    await f.create(f.target, "Site");
    expect(await pages.getPublicPage(settings.public_id!)).toEqual(before);
    expect(await pages.getSettings(scope)).toEqual(settings);
    await pages.saveSettings(scope, { ...selection, enabled: false });
    expect(await pages.getPublicPage(settings.public_id!)).toBeNull();
  });
  it("retries a canonical configuration write before reserving names behind a locked legacy origin", async () => {
    const f = await fixture();
    const check = await f.create(f.source, "web");
    if (typeof check === "string") throw new Error("health_fixture_failed");
    await f.consolidate();
    const writer = await pool.connect();
    try {
      await writer.query("BEGIN");
      await writer.query("SELECT id FROM projects WHERE id=$1 FOR UPDATE", [f.source]);
      const bounded = createPostgresAvailabilityCheckStore({
        query: db.query,
        transaction: (callback) =>
          db.transaction!(async (tx) => {
            await tx.query("SET LOCAL lock_timeout='250ms'", []);
            return callback(tx);
          })
      });
      await expect(
        bounded.updateCheckForProjectInOrganization({
          organization_id: f.organizationId,
          project_id: f.target,
          check_id: check.check_id,
          actor_user_id: f.userId,
          service_name: "new-worker",
          now
        })
      ).rejects.toMatchObject({ message: "project_configuration_busy", code: "40001" });
    } finally {
      await writer.query("ROLLBACK");
      writer.release();
    }
    expect(
      (
        await pool.query(
          "SELECT id FROM service_definitions WHERE origin_project_id=$1 AND input_name='new-worker'",
          [f.source]
        )
      ).rows
    ).toEqual([]);
  });
  it("requires a canonical anchor when creating a publication after consolidation", async () => {
    const f = await fixture();
    const check = await f.create(f.source, "web");
    if (typeof check === "string") throw new Error("health_fixture_failed");
    await f.consolidate();
    const pages = createPublicStatusPageStore(db),
      scope = { project_id: f.source, organization_id: f.organizationId, owner_user_id: f.userId };
    await expect(
      pages.saveSettings(scope, {
        title: "New publication",
        enabled: true,
        projects: [{ project_id: f.source, check_ids: [check.check_id] }]
      })
    ).rejects.toMatchObject({ message: "project_consolidated" });
    expect(
      (
        await pool.query("SELECT id FROM public_status_pages WHERE anchor_project_id=$1", [
          f.source
        ])
      ).rows
    ).toEqual([]);
  });
});
