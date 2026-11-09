import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { resetReportRunFixture } from "../helpers/report-runs.js";
import { processNextSmartReportJob } from "../../apps/worker/src/smart-report-processor.js";
import { createReportContentStore } from "../../packages/storage/src/report-content-store.js";
import { createReportRunManagementStore } from "../../packages/storage/src/report-run-management.js";
import { createReportDefinitionStore } from "../../packages/storage/src/report-definition-store.js";
import { createReportRunAdmissionStore } from "../../packages/storage/src/report-run-admission.js";
import { createReportRunExecutionStore } from "../../packages/storage/src/report-run-execution.js";
import { createReportArtifactStore } from "../../packages/storage/src/report-artifact-store.js";
import { maximumReportDocumentFixture } from "../helpers/report-document.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration
} from "../helpers/integration-setup.js";
runIntegration("authenticated canonical report content", () => {
  const pool = createIntegrationPool(),
    db = createQueryable(pool);
  let fixture: Awaited<ReturnType<typeof resetReportRunFixture>>;
  const saved = new Map<string, Buffer>();
  const objects = {
    putObject: vi.fn(async (input: { key: string; body: Buffer }) => {
      saved.set(input.key, Buffer.from(input.body));
    }),
    getObject: vi.fn(async (input: { key: string; maxBytes?: number; timeoutMs?: number }) => {
      const body = saved.get(input.key);
      if (!body) throw new Error("s3_object_not_found");
      return body;
    })
  };
  beforeEach(async () => {
    fixture = await resetReportRunFixture(pool, db);
    saved.clear();
    vi.clearAllMocks();
  });
  afterAll(async () => {
    await pool.end();
  });
  const read = (id: string, user = fixture.owner) =>
    createReportContentStore(db, objects).read({
      organization_id: fixture.org,
      id,
      initiator: { version: 1, kind: "browser_session", user_id: user }
    });
  async function oauthReader(user = fixture.owner, scopes = ["debugbundle:reports:read"]) {
    const grant = randomUUID();
    await pool.query(
      `INSERT INTO oauth_authorization_grants(id,user_id,organization_id,client_id,resource,scopes,provider_grant_id_hash,consented_at,expires_at)
      VALUES($1,$2,$3,'https://chatgpt.com/oauth/client.json','https://mcp.debugbundle.com',$4,$5,now(),now()+interval '1 day')`,
      [grant, user, fixture.org, scopes, `fixture-${grant}`]
    );
    return {
      version: 1 as const,
      kind: "openai_oauth" as const,
      user_id: user,
      grant_id: grant,
      organization_id: fixture.org
    };
  }
  it("reads retained reports only with explicit live OAuth consent, preserving the canonical content after downgrade", async () => {
    const run = await fixture.admit();
    await processNextSmartReportJob({ db, objects, model: null });
    const expected = await read(run.id),
      initiator = await oauthReader();
    const input = { organization_id: fixture.org, id: run.id, initiator };
    expect(await createReportContentStore(db, objects).read(input)).toEqual(expected);
    await pool.query("UPDATE organizations SET plan='team' WHERE id=$1", [fixture.org]);
    expect(await createReportContentStore(db, objects).read(input)).toEqual(expected);
    expect(
      (
        await createReportRunManagementStore(db).list({ organization_id: fixture.org, initiator })
      ).items.map((item) => item.id)
    ).toContain(run.id);
    await pool.query(
      "UPDATE oauth_authorization_grants SET scopes=ARRAY['debugbundle:incidents:read'] WHERE id=$1",
      [initiator.grant_id]
    );
    objects.getObject.mockClear();
    await expect(createReportContentStore(db, objects).read(input)).rejects.toThrow(
      "report_not_found"
    );
    expect(objects.getObject).not.toHaveBeenCalled();
    expect(
      (await pool.query("SELECT spent_nano_usd FROM report_allowance_windows")).rows[0]
        ?.spent_nano_usd
    ).toBe("0");
  });
  it("rechecks actual OAuth grant revocation after object IO and rejects a foreign workspace without reading content", async () => {
    const run = await fixture.admit();
    await processNextSmartReportJob({ db, objects, model: null });
    const initiator = await oauthReader(),
      content = createReportContentStore(db, objects),
      input = { organization_id: fixture.org, id: run.id, initiator };
    const get = objects.getObject.getMockImplementation()!;
    objects.getObject.mockClear();
    await expect(
      content.read({ ...input, initiator: { ...initiator, organization_id: randomUUID() } })
    ).rejects.toThrow("report_not_found");
    expect(objects.getObject).not.toHaveBeenCalled();
    objects.getObject.mockImplementationOnce(async (request) => {
      const body = await get(request);
      await pool.query("UPDATE oauth_authorization_grants SET revoked_at=now() WHERE id=$1", [
        initiator.grant_id
      ]);
      return body;
    });
    await expect(content.read(input)).rejects.toThrow("report_not_found");
  });
  it("withholds a mixed-scope report and its list entry from an OAuth user missing a selected project", async () => {
    const second = randomUUID(),
      user = randomUUID();
    await pool.query(
      "INSERT INTO projects(id,organization_id,owner_user_id,name,slug) VALUES($1::uuid,$2,$3,'Second',$1::text)",
      [second, fixture.org, fixture.owner]
    );
    await createReportDefinitionStore(db).replace({
      organization_id: fixture.org,
      id: fixture.definition,
      initiator: { version: 1, kind: "browser_session", user_id: fixture.owner },
      definition: {
        name: "Monthly review",
        cadence: "monthly",
        project_ids: [fixture.project, second],
        recipient_user_ids: [],
        privacy_mode: "full",
        source_collection_consent: true,
        schedule: null,
        enabled: false,
        expected_version: 1
      }
    });
    const run = await createReportRunAdmissionStore(db, { profile: null }).admit({
      organization_id: fixture.org,
      initiator: { version: 1, kind: "browser_session", user_id: fixture.owner },
      request_id: randomUUID(),
      definition_id: fixture.definition,
      expected_version: 2,
      period: {
        kind: "monthly",
        starts_at: "2026-10-01T00:00:00.000Z",
        ends_at: "2026-11-01T00:00:00.000Z",
        duration_days: 31
      },
      kind: "manual"
    });
    await processNextSmartReportJob({ db, objects, model: null });
    await pool.query("INSERT INTO users(id,email,email_verified_at) VALUES($1,$2,now())", [
      user,
      `${user}@example.test`
    ]);
    await pool.query(
      "INSERT INTO organization_members(id,organization_id,user_id,role) VALUES($1,$2,$3,'member')",
      [randomUUID(), fixture.org, user]
    );
    await pool.query(
      "INSERT INTO project_members(id,project_id,user_id,role) VALUES($1,$2,$3,'viewer')",
      [randomUUID(), fixture.project, user]
    );
    const initiator = await oauthReader(user),
      input = { organization_id: fixture.org, id: run.id, initiator };
    objects.getObject.mockClear();
    await expect(createReportContentStore(db, objects).read(input)).rejects.toThrow(
      "report_not_found"
    );
    expect(
      (await createReportRunManagementStore(db).list({ organization_id: fixture.org, initiator }))
        .items
    ).toEqual([]);
    expect(objects.getObject).not.toHaveBeenCalled();
    await pool.query(
      "INSERT INTO project_members(id,project_id,user_id,role) VALUES($1,$2,$3,'viewer')",
      [randomUUID(), second, user]
    );
    expect((await createReportContentStore(db, objects).read(input)).run_id).toBe(run.id);
    await pool.query(
      "UPDATE organization_members SET suspended_at=now() WHERE organization_id=$1 AND user_id=$2",
      [fixture.org, user]
    );
    await expect(createReportContentStore(db, objects).read(input)).rejects.toThrow(
      "report_not_found"
    );
  });
  it("reads every metric and source in a ten-project report and uses current retained source links", async () => {
    const document = maximumReportDocumentFixture();
    for (const view of document.report.scope)
      await pool.query(
        "INSERT INTO projects(id,organization_id,owner_user_id,name,slug) VALUES($1::uuid,$2,$3,'Maximum',$1::text)",
        [view.project_id, fixture.org, fixture.owner]
      );
    const initiator = {
      version: 1 as const,
      kind: "browser_session" as const,
      user_id: fixture.owner
    };
    await createReportDefinitionStore(db).replace({
      organization_id: fixture.org,
      id: fixture.definition,
      initiator,
      definition: {
        name: document.name,
        cadence: "monthly",
        project_ids: document.report.scope.map((view) => view.project_id),
        recipient_user_ids: [],
        privacy_mode: "full",
        source_collection_consent: true,
        schedule: null,
        enabled: false,
        expected_version: 1
      }
    });
    const run = await createReportRunAdmissionStore(db, { profile: null }).admit({
      organization_id: fixture.org,
      initiator,
      definition_id: fixture.definition,
      request_id: randomUUID(),
      expected_version: 2,
      period: document.report.facts.period,
      kind: "manual"
    });
    document.run_id = run.id;
    document.report.organization_id = fixture.org;
    document.report.definition_id = fixture.definition;
    document.report.facts.cutoff_at = new Date().toISOString();
    document.report.expires_at = new Date(Date.now() + 90 * 86400000).toISOString();
    for (const source of document.report.sources)
      if (source.text_available) source.text_expires_at = document.report.expires_at;
    const execution = createReportRunExecutionStore(db),
      claim = await execution.claimNext();
    await execution.bind(claim!);
    const artifacts = createReportArtifactStore(db);
    await artifacts.persist(
      claim!,
      {
        kind: "facts",
        body: Buffer.from(JSON.stringify(document.report)),
        expires_at: document.report.expires_at
      },
      objects
    );
    await artifacts.persist(
      claim!,
      {
        kind: "ready",
        body: Buffer.from(JSON.stringify(document)),
        expires_at: document.report.expires_at
      },
      objects
    );
    await createReportRunManagementStore(db).complete(claim!);
    const result = await read(run.id);
    expect(result.report.facts.metrics).toHaveLength(140);
    expect(result.report.sources).toHaveLength(100);
    const source = document.report.sources.find((source) => source.source_type === "incident")!,
      content = createReportContentStore(db, objects),
      input = { organization_id: fixture.org, id: run.id, initiator };
    await pool.query(
      "INSERT INTO incidents(id,project_id,fingerprint,title,severity,status,first_seen_at,last_seen_at,bundle_created_at) VALUES($1,$2,'retained','Retained incident','high','open',now(),now(),now())",
      [source.source_id, source.origin_project_id]
    );
    expect((await content.view(input)).available_source_refs).toEqual([source.ref]);
    expect(await content.source({ ...input, reference: source.ref })).toBe(
      `/projects/${source.origin_project_id}/incidents/${source.source_id}`
    );
    await pool.query(
      "UPDATE incidents SET bundle_created_at=now()-interval '100 days' WHERE id=$1",
      [source.source_id]
    );
    expect((await content.view(input)).available_source_refs).toEqual([]);
    expect(await content.source({ ...input, reference: source.ref })).toBeNull();
  });
  it("reads the same immutable canonical document after downgrade without buying AI or renewing source retention", async () => {
    const run = await fixture.admit();
    await processNextSmartReportJob({ db, objects, model: null });
    const first = await read(run.id);
    await pool.query("UPDATE organizations SET plan='team' WHERE id=$1", [fixture.org]);
    expect(await read(run.id)).toEqual(first);
    expect(first.analysis).toMatchObject({ status: "unavailable", reason: "model_unavailable" });
    expect(objects.getObject).toHaveBeenLastCalledWith(
      expect.objectContaining({ maxBytes: 1024 * 1024, timeoutMs: 15000 })
    );
    expect(
      (await pool.query("SELECT generations,spent_nano_usd FROM report_allowance_windows")).rows[0]
    ).toMatchObject({ generations: 1, spent_nano_usd: "0" });
  });
  it("uses current whole-scope reader access rather than the original creator's membership", async () => {
    const run = await fixture.admit();
    await processNextSmartReportJob({ db, objects, model: null });
    const reader = randomUUID();
    await pool.query("INSERT INTO users(id,email,email_verified_at) VALUES($1,$2,now())", [
      reader,
      `${reader}@example.test`
    ]);
    await pool.query(
      "INSERT INTO project_members(id,project_id,user_id,role) VALUES($1,$2,$3,'viewer')",
      [randomUUID(), fixture.project, reader]
    );
    await pool.query("DELETE FROM organization_members WHERE user_id=$1", [fixture.owner]);
    await pool.query("UPDATE projects SET owner_user_id=$1 WHERE id=$2", [reader, fixture.project]);
    expect((await read(run.id, reader)).run_id).toBe(run.id);
    await expect(read(run.id)).rejects.toThrow("report_not_found");
  });
  it("rechecks revocation after bounded private object IO and refuses tampered or expired content", async () => {
    const run = await fixture.admit();
    await processNextSmartReportJob({ db, objects, model: null });
    const get = objects.getObject.getMockImplementation()!;
    objects.getObject.mockImplementationOnce(async (input) => {
      const body = await get(input);
      await pool.query("UPDATE organizations SET suspended_at=now() WHERE id=$1", [fixture.org]);
      return body;
    });
    await expect(read(run.id)).rejects.toThrow("report_not_found");
    await pool.query("UPDATE organizations SET suspended_at=NULL WHERE id=$1", [fixture.org]);
    objects.getObject.mockResolvedValueOnce(Buffer.from("{}"));
    await expect(read(run.id)).rejects.toThrow("report_artifact_integrity_failed");
    await pool.query("UPDATE report_runs SET expires_at=now()-interval '1 second' WHERE id=$1", [
      run.id
    ]);
    objects.getObject.mockClear();
    await expect(read(run.id)).rejects.toThrow("report_not_found");
    expect(objects.getObject).not.toHaveBeenCalled();
  });
  it("withholds a privacy-invalidated report and deletes archives without reading their objects", async () => {
    await pool.query(
      "INSERT INTO project_analytics_settings(project_id,enabled,privacy_mode) VALUES($1,true,'standard')",
      [fixture.project]
    );
    const run = await fixture.admit();
    await processNextSmartReportJob({ db, objects, model: null });
    await pool.query(
      "UPDATE project_analytics_settings SET privacy_mode='strict' WHERE project_id=$1",
      [fixture.project]
    );
    objects.getObject.mockClear();
    await expect(read(run.id)).rejects.toThrow("report_not_found");
    expect(objects.getObject).not.toHaveBeenCalled();
    await createReportRunManagementStore(db).remove({
      organization_id: fixture.org,
      id: run.id,
      initiator: { version: 1, kind: "browser_session", user_id: fixture.owner }
    });
    await expect(read(run.id)).rejects.toThrow("report_not_found");
  });
});
