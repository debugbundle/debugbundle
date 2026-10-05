import { createPostgresRetentionStore } from "../../packages/storage/src/retention-store.js";
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createPostgresAnalyticsFlowStore } from "../../packages/storage/src/analytics-flow-store.js";
import {
  bootstrapStorageAndCreateBucket,
  createIntegrationPool,
  createQueryable,
  createS3AdminClient,
  runIntegration,
  seedOwnedProject
} from "../helpers/integration-setup.js";

const secret = () => randomBytes(32).toString("base64url");
runIntegration("public customer flows", () => {
  const pool = createIntegrationPool();
  const s3 = createS3AdminClient();
  const store = createPostgresAnalyticsFlowStore(createQueryable(pool));
  const project = randomUUID();
  const other = randomUUID();
  const organization = randomUUID();
  const now = "2026-09-01T10:00:00.000Z";
  const later = "2026-09-01T10:05:00.000Z";
  const source = "https://www.customer.test";
  const auth = "https://auth.customer.test";
  const app = "https://app.customer.test";
  beforeAll(async () => {
    await bootstrapStorageAndCreateBucket(pool, s3);
    await seedOwnedProject({
      pool,
      projectId: project,
      organizationId: organization,
      projectName: "Customer product",
      projectSlug: `product-${project}`,
      organizationSlug: `flows-${organization}`,
      organizationName: "Customer",
      organizationPlan: "team"
    });
    await seedOwnedProject({
      pool,
      projectId: other,
      organizationId: randomUUID(),
      projectName: "Other product",
      projectSlug: `other-${other}`,
      organizationSlug: `other-${other}`,
      organizationName: "Other"
    });
    await store.save({
      project_id: project,
      definition: {
        flow_key: "onboarding",
        display_name: "Onboarding",
        kind: "acquisition",
        timeout_minutes: 60,
        steps: [
          { step_key: "visit", display_name: "Visit", origin: source },
          { step_key: "auth", display_name: "Auth page", origin: auth },
          { step_key: "login", display_name: "Login completed", origin: auth },
          { step_key: "app", display_name: "App opened", origin: app }
        ]
      },
      now
    });
  });
  afterAll(async () => {
    await pool.end();
    s3.destroy();
  });

  it("measures site/auth/login/app with retries, unlinked coverage and project isolation", async () => {
    const context = secret();
    const scope = { project_id: project, flow_key: "onboarding" };
    await store.start({
      ...scope,
      context,
      step_key: "visit",
      origin: source,
      source: "newsletter",
      campaign: "launch",
      now
    });
    await store.start({
      ...scope,
      context,
      step_key: "visit",
      origin: source,
      source: "newsletter",
      campaign: "launch",
      now
    });
    await expect(
      store.step({ ...scope, context, step_key: "login", origin: auth, now })
    ).rejects.toThrow();
    const first = secret();
    await store.handoff({ ...scope, context, token: first, step_key: "auth", origin: source, now });
    const authContext = secret();
    await expect(
      store.arrive({ ...scope, token: first, context: authContext, origin: app, now })
    ).rejects.toThrow();
    await store.arrive({ ...scope, token: first, context: authContext, origin: auth, now: later });
    await store.arrive({ ...scope, token: first, context: authContext, origin: auth, now: later });
    await expect(
      store.arrive({ ...scope, token: first, context: secret(), origin: auth, now: later })
    ).rejects.toThrow();
    await expect(
      store.handoff({
        ...scope,
        context: authContext,
        token: secret(),
        step_key: "app",
        origin: auth,
        now: later
      })
    ).rejects.toThrow("out_of_order");
    await Promise.all(
      Array.from({ length: 8 }, () =>
        store.step({ ...scope, context: authContext, step_key: "login", origin: auth, now: later })
      )
    );
    const second = secret();
    await store.handoff({
      ...scope,
      context: authContext,
      token: second,
      step_key: "app",
      origin: auth,
      now: later
    });
    await store.arrive({ ...scope, token: second, context: secret(), origin: app, now: later });
    await store.start({ ...scope, context: secret(), step_key: "app", origin: app, now: later });
    await expect(
      store.step({
        ...scope,
        project_id: other,
        context: authContext,
        step_key: "login",
        origin: auth,
        now: later
      })
    ).rejects.toThrow();
    const report = await store.report({
      ...scope,
      from: "2026-09-01T00:00:00.000Z",
      to: "2026-09-02T00:00:00.000Z",
      previous_from: "2026-08-31T00:00:00.000Z"
    });
    expect(report.steps.map((step) => step.reached)).toEqual([1, 1, 1, 1]);
    expect(report.steps.map((step) => step.unlinked)).toEqual([0, 0, 0, 1]);
    expect(report.steps[1]?.average_seconds).toBe(300);
    expect(report.sources[0]).toMatchObject({
      source: "newsletter",
      campaign: "launch",
      starts: 1,
      completions: 1
    });
    expect(report.previous_starts).toBe(0);
    expect(await store.list({ project_id: other })).toEqual([]);
  });

  it("supports a second project's site-to-blog flow without signup or operator configuration", async () => {
    await store.save({
      project_id: other,
      definition: {
        flow_key: "reading",
        display_name: "Read blog",
        kind: "activation",
        timeout_minutes: 10,
        steps: [
          { step_key: "home", display_name: "Home", origin: source },
          { step_key: "blog", display_name: "Blog", origin: "https://blog.customer.test" }
        ]
      },
      now
    });
    const scope = { project_id: other, flow_key: "reading" };
    const context = secret();
    await store.start({ ...scope, context, step_key: "home", origin: source, now });
    const successToken = secret();
    await store.handoff({
      ...scope,
      context,
      token: successToken,
      step_key: "blog",
      origin: source,
      now
    });
    await store.arrive({
      ...scope,
      token: successToken,
      context: secret(),
      origin: "https://blog.customer.test",
      now: later
    });
    const report = await store.report({
      ...scope,
      from: "2026-09-01T00:00:00.000Z",
      to: "2026-09-02T00:00:00.000Z",
      previous_from: "2026-08-31T00:00:00.000Z"
    });
    expect(report.steps.map((step) => step.reached)).toEqual([1, 1]);
    const expiring = secret();
    await store.start({ ...scope, context: expiring, step_key: "home", origin: source, now });
    const token = secret();
    await store.handoff({
      ...scope,
      context: expiring,
      token,
      step_key: "blog",
      origin: source,
      now
    });
    await expect(
      store.arrive({
        ...scope,
        token,
        context: secret(),
        origin: "https://blog.customer.test",
        now: "2026-09-01T10:11:00.000Z"
      })
    ).rejects.toThrow();
    await store.withdraw({ ...scope, context: expiring, origin: source });
    await expect(
      store.step({ ...scope, context: expiring, origin: source, step_key: "home", now: later })
    ).rejects.toThrow();
  });
  it("serializes definition admission at the Free project limit", async () => {
    const limited = randomUUID();
    await seedOwnedProject({
      pool,
      projectId: limited,
      organizationId: randomUUID(),
      organizationName: "Limited customer",
      organizationSlug: `limited-${limited}`,
      projectName: "Limited",
      projectSlug: `limited-${limited}`
    });
    const results = await Promise.allSettled(
      ["one", "two"].map((flow_key) =>
        store.save({
          project_id: limited,
          now,
          definition: {
            flow_key,
            display_name: flow_key,
            kind: "acquisition",
            timeout_minutes: 60,
            steps: [
              { step_key: "start", display_name: "Start", origin: source },
              { step_key: "done", display_name: "Done", origin: source }
            ]
          }
        })
      )
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(await store.list({ project_id: limited })).toHaveLength(1);
  });

  it("versions edits, keeps equal previous cohorts, prunes bounded state and cascades project deletion", async () => {
    const definition = {
      flow_key: "custom",
      display_name: "Custom action",
      kind: "activation" as const,
      timeout_minutes: 60,
      steps: [
        { step_key: "open", display_name: "Open", origin: source },
        { step_key: "done", display_name: "Done", origin: source }
      ]
    };
    const scope = { project_id: project, flow_key: "custom" };
    const first = await store.save({ project_id: project, definition, now });
    expect((await store.save({ project_id: project, definition, now })).version).toBe(
      first.version
    );
    const previous = secret();
    await store.start({
      ...scope,
      context: previous,
      step_key: "open",
      origin: source,
      now: "2026-08-31T23:59:00.000Z"
    });
    await store.step({
      ...scope,
      context: previous,
      step_key: "done",
      origin: source,
      now: "2026-09-01T00:01:00.000Z"
    });
    const current = secret();
    await store.start({ ...scope, context: current, step_key: "open", origin: source, now });
    const window = {
      from: "2026-09-01T00:00:00.000Z",
      to: "2026-09-02T00:00:00.000Z",
      previous_from: "2026-08-31T00:00:00.000Z"
    };
    const before = await store.report({ ...scope, ...window });
    expect(before.steps.map((step) => [step.reached, step.previous_reached, step.dropoff])).toEqual(
      [
        [1, 1, 1],
        [0, 1, 0]
      ]
    );
    const edited = await store.save({
      project_id: project,
      definition: { ...definition, display_name: "Renamed action" },
      now: later
    });
    expect(edited.version).toBe(2);
    await expect(
      store.step({ ...scope, context: current, step_key: "done", origin: source, now: later })
    ).rejects.toThrow("expired_context");
    expect((await store.report({ ...scope, ...window })).starts).toBe(0);
    await store.archive({ ...scope, now: later });
    await expect(
      store.start({ ...scope, context: secret(), step_key: "open", origin: source, now: later })
    ).rejects.toThrow("not_found");
    expect((await store.report({ ...scope, ...window })).flow.archived_at).toBe(later);
    const retention = createPostgresRetentionStore(createQueryable(pool));
    let drained = false;
    for (let i = 0; i < 30; i++) {
      const result = await retention.pruneExpiredAnalyticsRollups({
        now: "2026-09-03T00:00:00.000Z",
        limit: 1
      });
      if (!result.reached_batch_limit) {
        drained = true;
        break;
      }
    }
    expect(drained).toBe(true);
    expect(
      Number((await pool.query("SELECT COUNT(*) FROM analytics_flow_runs")).rows[0].count)
    ).toBe(0);
    expect(
      Number((await pool.query("SELECT COUNT(*) FROM analytics_flow_rollups")).rows[0].count)
    ).toBeGreaterThan(0);
    // Retention expires aggregates too, while preserving their reusable definitions.
    for (let i = 0; i < 30; i++) {
      const result = await retention.pruneExpiredAnalyticsRollups({
        now: "2028-09-03T00:00:00.000Z",
        limit: 1
      });
      if (!result.reached_batch_limit) break;
    }
    expect(
      Number((await pool.query("SELECT COUNT(*) FROM analytics_flow_rollups")).rows[0].count)
    ).toBe(0);
    const otherFlow = await store.get({ project_id: other, flow_key: "reading" });
    await store.start({
      project_id: other,
      flow_key: "reading",
      context: secret(),
      origin: source,
      step_key: "home",
      now
    });
    await pool.query("DELETE FROM projects WHERE id=$1", [other]);
    expect(await store.list({ project_id: other })).toEqual([]);
    expect(
      (await pool.query("SELECT id FROM analytics_flow_runs WHERE flow_id=$1", [otherFlow.id])).rows
    ).toEqual([]);
    expect(
      (
        await pool.query("SELECT flow_id FROM analytics_flow_rollups WHERE flow_id=$1", [
          otherFlow.id
        ])
      ).rows
    ).toEqual([]);
  });
});
