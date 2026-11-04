import { createHmac, randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { bootstrapStorageSchema } from "../../packages/storage/src/migrations.js";
import { migrateStorageSchema } from "../../packages/storage/src/schema-migrations.js";
import { createProjectMergeStore } from "../../packages/storage/src/project-merge-store.js";
import { createMetadataProbes } from "../../packages/storage/src/metadata-probes.js";
import { createServiceDefinitionStore } from "../../packages/storage/src/service-definition-store.js";
import { deriveProbeTriggerTokenKey } from "../../packages/auth/src/index.js";
import { seedExternalProjectCollaborator } from "../helpers/shared-project-collaborator.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration,
  seedOwnedProject
} from "../helpers/integration-setup.js";

runIntegration("probe activation origin and SDK signing scopes", () => {
  const pool = createIntegrationPool(),
    db = createQueryable(pool);
  const probes = createMetadataProbes(db);
  const previousSecret = process.env["DEBUGBUNDLE_PROBE_TRIGGER_SECRET"];
  beforeAll(async () => {
    process.env["DEBUGBUNDLE_PROBE_TRIGGER_SECRET"] = "isolated-probe-fixture-secret";
    await bootstrapStorageSchema(db);
    await migrateStorageSchema(db);
  });
  afterAll(async () => {
    if (previousSecret === undefined) delete process.env["DEBUGBUNDLE_PROBE_TRIGGER_SECRET"];
    else process.env["DEBUGBUNDLE_PROBE_TRIGGER_SECRET"] = previousSecret;
    await pool.end();
  });
  async function fixture() {
    const organizationId = randomUUID(),
      userId = randomUUID(),
      target = randomUUID(),
      source = randomUUID();
    await seedOwnedProject({
      pool,
      organizationId,
      projectId: target,
      organizationName: "Probes",
      organizationSlug: organizationId,
      projectName: "System",
      projectSlug: target,
      ownerUserId: userId,
      organizationPlan: "team"
    });
    await pool.query(
      "INSERT INTO projects(id,organization_id,owner_user_id,name,slug) VALUES($1::uuid,$2,$3,'Site',$1::text)",
      [source, organizationId, userId]
    );
    const definitions = createServiceDefinitionStore(db);
    await definitions.create({ project_id: target, user_id: userId, name: "api" });
    const web = await definitions.create({ project_id: source, user_id: userId, name: "web" });
    const activate = (projectId: string, service: string) => ({
      organization_id: organizationId,
      project_id: projectId,
      created_by_member_id: userId,
      label_pattern: "checkout.*",
      service,
      environment: "production",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      trigger_expires_at: new Date(Date.now() + 60_000).toISOString()
    });
    const request = {
      target_project_id: target,
      source_project_ids: [source],
      service_mappings: [
        {
          source_project_id: source,
          service_definition_id: web.service_definition_id,
          name: "Site"
        }
      ]
    };
    const consolidate = async () => {
      const store = createProjectMergeStore(db, { enabled: true });
      const plan = await store.preview({ user_id: userId, request });
      expect(plan.blockers).toEqual([]);
      return store.apply({
        user_id: userId,
        request,
        plan_digest: plan.plan_digest,
        idempotency_key: randomUUID()
      });
    };
    return {
      organizationId,
      userId,
      target,
      source,
      activate,
      consolidate,
      request,
      definitions,
      web
    };
  }
  function decoded(token: string) {
    const [payload, signature] = token.replace(/^dbundle_probe_/, "").split(".");
    if (!payload || !signature) throw new Error("invalid_trigger_fixture");
    return {
      payload,
      signature,
      body: JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<
        string,
        unknown
      >
    };
  }
  function signature(token: string, issuer: string, origins?: string[]) {
    return createHmac("sha256", deriveProbeTriggerTokenKey(issuer, origins))
      .update(decoded(token).payload)
      .digest("base64url");
  }
  it("merges immediately while isolating old wildcard signatures from broader credentials", async () => {
    const f = await fixture();
    const old = await probes.createProbeActivationForProjectInOrganization(
      f.activate(f.target, "*")
    );
    await f.consolidate();
    expect(signature(old!.trigger_token, f.target)).toBe(decoded(old!.trigger_token).signature);
    expect(signature(old!.trigger_token, f.target, [f.target, f.source])).not.toBe(
      decoded(old!.trigger_token).signature
    );
    expect(
      (
        await probes.listActiveProbesForProject({
          project_id: f.target,
          scope_origin_ids: [f.target, f.source],
          now: new Date().toISOString()
        })
      ).map((p) => p.service)
    ).toEqual(["api"]);
  });
  it("enforces one combined activation cap and checks current canonical membership", async () => {
    const f = await fixture();
    await f.consolidate();
    for (let i = 0; i < 5; i++)
      expect(
        await probes.createProbeActivationForProjectInOrganization(
          f.activate(i % 2 ? f.source : f.target, i % 2 ? "web" : "api")
        )
      ).not.toBeNull();
    const full = await probes.createProbeActivationForProjectInOrganization(
      f.activate(f.target, "unknown-rejected-service")
    );
    expect(full?.concurrent_limit_exceeded).toBe(true);
    expect(
      (
        await pool.query(
          "SELECT id FROM service_definitions WHERE project_id=$1 AND name='unknown-rejected-service'",
          [f.target]
        )
      ).rows
    ).toEqual([]);
    const stranger = randomUUID();
    await pool.query("INSERT INTO users(id,email) VALUES($1,$2)", [
      stranger,
      `${stranger}@example.test`
    ]);
    expect(
      await probes.createProbeActivationForProjectInOrganization({
        ...f.activate(f.source, "web"),
        created_by_member_id: stranger
      })
    ).toBeNull();
  });
  it("projects an old wildcard onto only its services for a multi-origin SDK credential", async () => {
    const f = await fixture();
    const old = await probes.createProbeActivationForProjectInOrganization(
      f.activate(f.source, "*")
    );
    await f.consolidate();
    const list = (issuer: string, origins: string[]) =>
      probes.listActiveProbesForProject({
        project_id: issuer,
        scope_origin_ids: origins,
        now: new Date().toISOString()
      });
    expect((await list(f.source, [f.source])).map((a) => a.service)).toEqual(["*"]);
    expect(await list(f.target, [f.target])).toEqual([]);
    expect(
      (await list(f.target, [f.target, f.source])).map((a) => [a.activation_id, a.service])
    ).toEqual([[old!.activation.activation_id, "Site"]]);
    expect(
      (
        await probes.listActiveProbesForProjectInOrganization({
          organization_id: f.organizationId,
          project_id: f.target,
          now: new Date().toISOString()
        })
      )?.activations
    ).toHaveLength(1);
    expect(signature(old!.trigger_token, f.source)).toBe(decoded(old!.trigger_token).signature);
    expect(signature(old!.trigger_token, f.target)).not.toBe(decoded(old!.trigger_token).signature);
  });
  it("defaults to the preserved deployed SDK identity and supports an explicit new SDK issuer", async () => {
    const f = await fixture();
    await f.consolidate();
    const preserved = await probes.createProbeActivationForProjectInOrganization(
      f.activate(f.target, "Site")
    );
    expect(decoded(preserved!.trigger_token).body["service"]).toBe("web");
    expect(signature(preserved!.trigger_token, f.source)).toBe(
      decoded(preserved!.trigger_token).signature
    );
    const adopted = await probes.createProbeActivationForProjectInOrganization({
      ...f.activate(f.target, "Site"),
      sdk_project_id: f.target
    });
    expect(decoded(adopted!.trigger_token).body["service"]).toBe("Site");
    expect(signature(adopted!.trigger_token, f.target, [f.target, f.source])).toBe(
      decoded(adopted!.trigger_token).signature
    );
    const rows = (
      await pool.query(
        "SELECT project_id,service FROM probe_activations WHERE id=ANY($1::uuid[]) ORDER BY created_at",
        [[preserved!.activation.activation_id, adopted!.activation.activation_id]]
      )
    ).rows;
    expect(rows).toEqual([
      { project_id: f.source, service: "web" },
      { project_id: f.source, service: "web" }
    ]);
  });
  it("retains probe access for a collaborator with a separate Free account", async () => {
    const f = await fixture();
    const member = await seedExternalProjectCollaborator(pool, [f.source, f.target]);
    await f.consolidate();
    const activation = await probes.createProbeActivationForProjectInOrganization({
      ...f.activate(f.target, "Site"),
      created_by_member_id: member
    });
    expect(activation).not.toBeNull();
    expect(activation?.organization_plan).toBe("team");
  });
  it("uses the exact adopted token snapshot and deployed name after a rename and another merge", async () => {
    const f = await fixture();
    await f.consolidate();
    const tokenId = randomUUID();
    await pool.query(
      "INSERT INTO project_tokens(id,project_id,token_hash,label) VALUES($1,$2,$3,'Adopted')",
      [tokenId, f.target, randomUUID()]
    );
    await f.definitions.update({
      project_id: f.target,
      user_id: f.userId,
      service_definition_id: f.web.service_definition_id,
      name: "Website"
    });
    const later = randomUUID();
    await pool.query(
      "INSERT INTO projects(id,organization_id,owner_user_id,name,slug) VALUES($1::uuid,$2,$3,'Later',$1::text)",
      [later, f.organizationId, f.userId]
    );
    const other = await f.definitions.create({
      project_id: later,
      user_id: f.userId,
      name: "worker"
    });
    const store = createProjectMergeStore(db, { enabled: true });
    const request = {
      target_project_id: f.target,
      source_project_ids: [later],
      service_mappings: [
        {
          source_project_id: later,
          service_definition_id: other.service_definition_id,
          name: "Worker"
        }
      ]
    };
    const plan = await store.preview({ user_id: f.userId, request });
    expect(plan.blockers).toEqual([]);
    await store.apply({
      user_id: f.userId,
      request,
      plan_digest: plan.plan_digest,
      idempotency_key: randomUUID()
    });
    const selected = await probes.createProbeActivationForProjectInOrganization({
      ...f.activate(f.target, "Website"),
      sdk_token_id: tokenId,
      sdk_service: "Site"
    });
    expect(decoded(selected!.trigger_token).body["service"]).toBe("Site");
    expect(signature(selected!.trigger_token, f.target, [f.target, f.source])).toBe(
      decoded(selected!.trigger_token).signature
    );
    expect(signature(selected!.trigger_token, f.target, [f.target, f.source, later])).not.toBe(
      decoded(selected!.trigger_token).signature
    );
    await expect(
      probes.createProbeActivationForProjectInOrganization({
        ...f.activate(f.target, "Website"),
        sdk_token_id: tokenId,
        sdk_service: "api"
      })
    ).rejects.toThrow("probe_sdk_context_invalid");
    await expect(
      probes.createProbeActivationForProjectInOrganization({
        ...f.activate(f.target, "Website"),
        sdk_token_id: tokenId,
        sdk_service: "*"
      })
    ).rejects.toThrow("probe_sdk_context_invalid");
    await pool.query("UPDATE project_tokens SET revoked_at=now() WHERE id=$1", [tokenId]);
    await expect(
      probes.createProbeActivationForProjectInOrganization({
        ...f.activate(f.target, "Website"),
        sdk_token_id: tokenId
      })
    ).rejects.toThrow("probe_sdk_context_invalid");
  });
});
