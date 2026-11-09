import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it } from "vitest";
import { bootstrapStorageSchema } from "../../packages/storage/src/migrations.js";
import { createPostgresAnalyticsBundleGenerationStore } from "../../packages/storage/src/analytics-bundle-generation-store.js";
import { buildAnalyticsBundleObjectKey } from "../../packages/storage/src/helpers.js";
import {
  isProjectJobInitiatorAuthorized,
  captureProjectJobAuthority
} from "../../packages/storage/src/project-job-authorization.js";
import { createWorkerJobStore } from "../../packages/storage/src/worker-job-store.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration
} from "../helpers/integration-setup.js";

runIntegration("queued project authority", () => {
  const pool = createIntegrationPool(),
    db = createQueryable(pool);
  const store = createPostgresAnalyticsBundleGenerationStore(db);
  let user: string, org: string, project: string, token: string;
  const policy = () => ({
    version: 1,
    mode: "organization",
    organization_id: org,
    permissions: ["project:write"]
  });
  const initiator = () => ({
    version: 1 as const,
    kind: "member_token" as const,
    user_id: user,
    token_id: token
  });
  beforeEach(async () => {
    await pool.query("DROP SCHEMA public CASCADE");
    await pool.query("CREATE SCHEMA public");
    await bootstrapStorageSchema(db);
    [user, org, project, token] = Array.from({ length: 4 }, () => randomUUID()) as [
      string,
      string,
      string,
      string
    ];
    await pool.query("INSERT INTO users(id,email,email_verified_at) VALUES($1,$2,now())", [
      user,
      `${user}@example.test`
    ]);
    const owner = randomUUID();
    await pool.query("INSERT INTO users(id,email,email_verified_at) VALUES($1,$2,now())", [
      owner,
      `${owner}@example.test`
    ]);
    await pool.query(
      "INSERT INTO organizations(id,name,slug,plan) VALUES($1::uuid,'Queued',$1::text,'business')",
      [org]
    );
    await pool.query(
      "INSERT INTO organization_members(id,organization_id,user_id,role,project_access) VALUES($1,$2,$3,'member','all')",
      [randomUUID(), org, user]
    );
    await pool.query(
      "INSERT INTO organization_members(id,organization_id,user_id,role) VALUES($1,$2,$3,'owner')",
      [randomUUID(), org, owner]
    );
    await pool.query(
      "INSERT INTO projects(id,organization_id,owner_user_id,name,slug) VALUES($1::uuid,$2,$3,'Queued',$1::text)",
      [project, org, owner]
    );
    await pool.query(
      "INSERT INTO member_tokens(id,user_id,organization_id,token_hash,label,scope_policy) VALUES($1::uuid,$2,$3,$1::text,'Queued',$4::jsonb)",
      [token, user, org, JSON.stringify(policy())]
    );
  });
  afterAll(async () => {
    await pool.end();
  });

  it("captures report administration only when both the live role and credential allow project settings", async () => {
    const input = {
      project_id: project,
      initiator: initiator(),
      action: "manage_settings" as const
    };
    expect(await captureProjectJobAuthority(db, input)).toBeNull();
    await pool.query(
      "INSERT INTO project_members(id,project_id,user_id,role) VALUES($1,$2,$3,'admin')",
      [randomUUID(), project, user]
    );
    expect(await captureProjectJobAuthority(db, input)).toBeNull();
    await pool.query("UPDATE member_tokens SET scope_policy=$2::jsonb WHERE id=$1", [
      token,
      JSON.stringify({ ...policy(), permissions: ["project:admin"] })
    ]);
    expect(await captureProjectJobAuthority(db, input)).toMatchObject({
      initiating_authority: initiator(),
      scope_origin_ids: [project]
    });
  });
  it("persists the credential identity and refuses publication after revocation", async () => {
    const generation = await store.reserveAnalyticsBundleGeneration({
      project_id: project,
      requested_by_user_id: user,
      initiating_authority: initiator(),
      analysis_kind: "usage_summary"
    });
    expect(generation.initiating_authority).toEqual(initiator());
    const input = { project_id: project, generation_id: generation.generation_id };
    expect(await store.isAnalyticsBundleGenerationAuthorized!(input)).toBe(true);
    await pool.query("UPDATE member_tokens SET revoked_at=now() WHERE id=$1", [token]);
    expect(await store.isAnalyticsBundleGenerationAuthorized!(input)).toBe(false);
    expect(
      await store.markAnalyticsBundleGenerationCompleted({
        ...input,
        completed_at: new Date().toISOString()
      })
    ).toBeNull();
    const failed = await store.markAnalyticsBundleGenerationFailed({
      ...input,
      failed_at: new Date().toISOString(),
      reason: "initiator_access_revoked",
      object_write_attempted: true
    });
    expect(failed).toMatchObject({
      status: "failed",
      object_key: buildAnalyticsBundleObjectKey(project, generation.generation_id)
    });
    await expect(
      store.reserveAnalyticsBundleGeneration({
        project_id: project,
        requested_by_user_id: org,
        initiating_authority: initiator(),
        analysis_kind: "usage_summary"
      })
    ).rejects.toThrow("analytics_job_initiator_mismatch");
  });

  it("intersects live expiry, permissions, membership, paused grants and the current plan", async () => {
    const allowed = () =>
      isProjectJobInitiatorAuthorized(db, {
        project_id: project,
        origin_project_ids: [project],
        initiator: initiator()
      });
    expect(await allowed()).toBe(true);
    await pool.query("UPDATE member_tokens SET expires_at=now()-interval '1 minute' WHERE id=$1", [
      token
    ]);
    expect(await allowed()).toBe(false);
    await pool.query(
      "UPDATE member_tokens SET expires_at=NULL,scope_policy=$2::jsonb WHERE id=$1",
      [token, JSON.stringify({ ...policy(), permissions: ["project:read"] })]
    );
    expect(await allowed()).toBe(false);
    await pool.query("UPDATE member_tokens SET scope_policy=$2::jsonb WHERE id=$1", [
      token,
      JSON.stringify(policy())
    ]);
    await pool.query(
      "UPDATE organization_members SET suspended_at=now() WHERE organization_id=$1",
      [org]
    );
    expect(await allowed()).toBe(false);
    await pool.query(
      "UPDATE organization_members SET suspended_at=NULL,grants_paused_at=now() WHERE organization_id=$1",
      [org]
    );
    expect(await allowed()).toBe(false);
    await pool.query(
      "UPDATE organization_members SET grants_paused_at=NULL,default_project_role='viewer' WHERE organization_id=$1",
      [org]
    );
    expect(await allowed()).toBe(false);
    await pool.query(
      "UPDATE organization_members SET default_project_role='member' WHERE organization_id=$1",
      [org]
    );
    await pool.query("UPDATE organizations SET plan='team' WHERE id=$1", [org]);
    expect(await allowed()).toBe(false);
    await pool.query("UPDATE organizations SET plan='business' WHERE id=$1", [org]);
    expect(await allowed()).toBe(true);
    await pool.query("UPDATE member_tokens SET scope_policy='{}'::jsonb WHERE id=$1", [token]);
    expect(await allowed()).toBe(false);
  });

  it("keeps existing legacy jobs compatible without manufacturing new inherited authority", async () => {
    const generation = await store.reserveAnalyticsBundleGeneration({
      project_id: project,
      analysis_kind: "usage_summary"
    });
    expect(generation.initiating_authority).toBeUndefined();
    expect(
      await store.isAnalyticsBundleGenerationAuthorized!({
        project_id: project,
        generation_id: generation.generation_id
      })
    ).toBe(true);
    await pool.query("UPDATE member_tokens SET scope_policy=NULL WHERE id=$1", [token]);
    expect(
      await isProjectJobInitiatorAuthorized(db, {
        project_id: project,
        origin_project_ids: [project],
        initiator: initiator()
      })
    ).toBe(false);
  });

  it("fences workers that cannot enforce a saved initiator while keeping legacy jobs runnable", async () => {
    const jobs = createWorkerJobStore(db);
    const legacy = await jobs.enqueue("build-bundle", {
      project_id: project,
      incident_id: randomUUID(),
      event_id: randomUUID(),
      occurred_at: new Date().toISOString(),
      occurrence_count: 1,
      trigger: "regeneration"
    });
    await pool.query(
      "UPDATE worker_jobs SET status='running',lease_token=$2,lease_expires_at=now()+interval '1 minute' WHERE id=$1",
      [legacy, randomUUID()]
    );
    const id = await jobs.enqueue("build-bundle", {
      project_id: project,
      initiating_authority: initiator(),
      scope_origin_ids: [project],
      incident_id: randomUUID(),
      event_id: randomUUID(),
      occurred_at: new Date().toISOString(),
      occurrence_count: 1,
      trigger: "regeneration"
    });
    await expect(
      pool.query(
        "UPDATE worker_jobs SET status='running',lease_token=$2,lease_expires_at=now()+interval '1 minute' WHERE id=$1",
        [id, randomUUID()]
      )
    ).rejects.toThrow("worker_job_authority_protocol_required");
    const claimed = await jobs.claim("build-bundle");
    expect(claimed?.id).toBe(id);
    if (claimed === null) throw new Error("claim_missing");
    await expect(jobs.renew(claimed)).resolves.toBeUndefined();
    const setting = await pool.query(
      "SELECT current_setting('debugbundle.worker_job_authority',true) AS value"
    );
    expect([null, ""]).toContain(setting.rows[0].value);

    const generation = await store.reserveAnalyticsBundleGeneration({
      project_id: project,
      requested_by_user_id: user,
      initiating_authority: initiator(),
      analysis_kind: "usage_summary"
    });
    const analytics = await jobs.enqueue("build-analytics-bundle", {
      project_id: project,
      generation_id: generation.generation_id,
      requested_at: generation.created_at,
      trigger: "manual"
    });
    await expect(
      pool.query(
        "UPDATE worker_jobs SET status='running',lease_token=$2,lease_expires_at=now()+interval '1 minute' WHERE id=$1",
        [analytics, randomUUID()]
      )
    ).rejects.toThrow("worker_job_authority_protocol_required");
    expect((await jobs.claim("build-analytics-bundle"))?.id).toBe(analytics);
  });
});
