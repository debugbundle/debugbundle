import { randomUUID } from "node:crypto";
import { createOpenAiHostedOperations } from "../../apps/api/src/openai-mcp-operations.js";
import { afterAll, beforeAll, expect, it } from "vitest";
import { bootstrapStorageSchema } from "../../packages/storage/src/migrations.js";
import { migrateStorageSchema } from "../../packages/storage/src/schema-migrations.js";
import { createProjectMergeStore } from "../../packages/storage/src/project-merge-store.js";
import { createMetadataIncidentRead } from "../../packages/storage/src/metadata-incident-read.js";
import { createMetadataProjectList } from "../../packages/storage/src/metadata-project-list.js";
import { createMetadataAccess } from "../../packages/storage/src/metadata-access.js";
import { createServiceDefinitionStore } from "../../packages/storage/src/service-definition-store.js";
import { getOrCreateServiceId } from "../../packages/storage/src/metadata-incident-shared.js";
import { countIncidentsForOrganization } from "../../packages/storage/src/incident-improvement-counts.js";
import { createAgentTokenStore } from "../../packages/storage/src/agent-token-store.js";
import { resolveProjectTokenAndRecordUsage } from "../../packages/storage/src/token-usage-store.js";
import { resolveCredentialServiceScopes } from "../../packages/storage/src/project-ingestion-scope.js";
import { projectEvidenceView } from "../../packages/storage/src/project-evidence-projection.js";
import { createPostgresImprovementOpportunityStore } from "../../packages/storage/src/improvement-opportunity-store.js";
import { countImprovementsForOrganization } from "../../packages/storage/src/incident-improvement-counts.js";
import { buildWarningHotspotFingerprint } from "../../packages/storage/src/improvement-opportunity-recording.js";
import { createEvidenceContextStore } from "../../packages/storage/src/evidence-context-store.js";
import { createEvidenceContextReader } from "../../packages/storage/src/evidence-context-reader.js";
import { createBrowserRecoveryStore } from "../../packages/storage/src/browser-recovery-store.js";
import { createMetadataBundles } from "../../packages/storage/src/metadata-bundles.js";
import { createEventEnvelope } from "../../packages/shared-types/src/index.js";
import { browserResourceEvent } from "../helpers/browser-resource-fixtures.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration,
  seedOwnedProject
} from "../helpers/integration-setup.js";

runIntegration("consolidated investigation and original credential scopes", () => {
  const pool = createIntegrationPool();
  const db = createQueryable(pool);
  const reads = createMetadataIncidentRead(db);
  const access = createMetadataAccess(db);
  const projects = createMetadataProjectList(db);
  const definitions = createServiceDefinitionStore(db);
  beforeAll(async () => {
    await bootstrapStorageSchema(db);
    await migrateStorageSchema(db);
  });
  afterAll(async () => {
    await pool.end();
  });

  async function fixture(withMember = false) {
    const organizationId = randomUUID(),
      userId = randomUUID(),
      target = randomUUID(),
      source = randomUUID();
    await seedOwnedProject({
      pool,
      organizationId,
      projectId: target,
      organizationName: "Reads",
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
    const memberId = randomUUID();
    if (withMember) {
      await pool.query("INSERT INTO users(id,email) VALUES($1,$2)", [
        memberId,
        `${memberId}@example.test`
      ]);
      await pool.query(
        "INSERT INTO project_members(id,project_id,user_id,role) VALUES($4,$1,$3,'member'),($5,$2,$3,'member')",
        [source, target, memberId, randomUUID(), randomUUID()]
      );
    }
    const instanceIds = await Promise.all([
      getOrCreateServiceId(db, target, "api", "production"),
      getOrCreateServiceId(db, source, "web", "production")
    ]);
    const incidents = [randomUUID(), randomUUID()];
    for (const [index, id] of incidents.entries())
      await pool.query(
        "INSERT INTO incidents(id,project_id,service_id,fingerprint,title,severity,first_seen_at,last_seen_at) VALUES($1,$2,$3,'same-fingerprint','Failure','high',now(),now())",
        [id, [target, source][index], instanceIds[index]]
      );
    const sourceDefinition = (
      await pool.query<{ service_definition_id: string }>(
        "SELECT service_definition_id FROM services WHERE id=$1",
        [instanceIds[1]]
      )
    ).rows[0]!.service_definition_id;
    const oldProjectHashes = [randomUUID(), randomUUID()];
    const oldAgentHashes = [randomUUID(), randomUUID()];
    for (const [index, project] of [target, source].entries()) {
      await pool.query(
        "INSERT INTO project_tokens(id,project_id,token_hash,label) VALUES($1,$2,$3,'Existing')",
        [randomUUID(), project, oldProjectHashes[index]]
      );
      await pool.query(
        "INSERT INTO agent_tokens(id,token_hash,issuer_user_id,organization_id,project_id,label,scope,policy_version,expires_at) VALUES($1,$2,$3,$4,$5,'Existing','incident:read-minimized','telemetry-privacy-v1',now()+interval '1 day')",
        [randomUUID(), oldAgentHashes[index], userId, organizationId, project]
      );
    }
    const request = {
      target_project_id: target,
      source_project_ids: [source],
      service_mappings: [
        { source_project_id: source, service_definition_id: sourceDefinition, name: "Site" }
      ]
    };
    const merge = createProjectMergeStore(db, { enabled: true });
    const preview = await merge.preview({ user_id: userId, request });
    await merge.apply({
      user_id: userId,
      request,
      plan_digest: preview.plan_digest,
      idempotency_key: randomUUID()
    });
    return {
      memberId,
      organizationId,
      userId,
      target,
      source,
      incidents,
      instanceIds,
      sourceDefinition,
      oldProjectHashes,
      oldAgentHashes
    };
  }

  it("enumerates service environments beyond the old first-thousand boundary after cutover", async () => {
    const f = await fixture();
    await pool.query(
      `INSERT INTO services(id,project_id,name,environment)
      SELECT gen_random_uuid(),$1,'web','environment-' || n FROM generate_series(1,1105) n`,
      [f.source]
    );
    const operations = createOpenAiHostedOperations({
      dashboardBaseUrl: "https://app.example.test",
      dependencies: { projectManagement: access, incidentRetrieval: projects } as never
    });
    const principal = {
      userId: f.userId,
      organizationId: f.organizationId,
      grantId: randomUUID(),
      scopes: ["debugbundle:projects:read"]
    } as const;
    const ids: string[] = [];
    let cursor: string | undefined;
    do {
      const result = (await operations.list_services!({
        principal: { ...principal, scopes: [...principal.scopes] },
        input: { projectId: f.target, limit: 50, ...(cursor === undefined ? {} : { cursor }) }
      })) as { services: { service_id: string; name: string }[]; next_cursor: string | null };
      ids.push(...result.services.map((service) => service.service_id));
      cursor = result.next_cursor ?? undefined;
    } while (cursor !== undefined);
    expect(ids).toHaveLength(1107);
    expect(new Set(ids).size).toBe(1107);
    const tail = await projects.listServicesForOrganization!({
      organization_id: f.organizationId,
      user_id: f.userId,
      project_id: f.target,
      limit: 100,
      offset: 1100
    });
    expect(tail).toHaveLength(7);
  });

  it("resolves an explicit retained project view using current canonical membership", async () => {
    const f = await fixture(true);
    const input = { user_id: f.memberId, now: new Date().toISOString(), limit: 20 };
    expect(
      (await projects.listProjectsForUser!(input)).map((project) => project.project_id)
    ).toEqual([f.target]);
    const retained = await projects.listProjectsForUser!({ ...input, project_id: f.source });
    expect(retained).toHaveLength(1);
    expect(retained[0]).toMatchObject({
      project_id: f.source,
      canonical_project_id: f.target,
      metrics: { open_incidents: 1 }
    });
    await pool.query("DELETE FROM project_members WHERE project_id=$1 AND user_id=$2", [
      f.target,
      f.memberId
    ]);
    expect(await projects.listProjectsForUser!({ ...input, project_id: f.source })).toEqual([]);
  });

  it("combines root reads and counts while aliases and explicit credential snapshots stay narrow", async () => {
    const f = await fixture();
    const base = { organization_id: f.organizationId, user_id: f.userId, limit: 100 };
    expect(
      (await reads.listIncidentsForOrganization({ ...base, project_id: f.target }))
        .map((i) => i.incident_id)
        .sort()
    ).toEqual([...f.incidents].sort());
    expect(await countIncidentsForOrganization(db, { ...base, project_id: f.target })).toBe(2);
    expect(
      (await reads.listIncidentsForOrganization({ ...base, project_id: f.source })).map(
        (i) => i.incident_id
      )
    ).toEqual([f.incidents[1]]);
    const restricted = { ...base, project_id: f.target, origin_project_ids: [f.target] };
    expect(
      (await reads.listIncidentsForOrganization(restricted)).map((i) => i.incident_id)
    ).toEqual([f.incidents[0]]);
    const detail = {
      organization_id: f.organizationId,
      user_id: f.userId,
      incident_id: f.incidents[1]!,
      project_id: f.target,
      origin_project_ids: [f.target]
    };
    expect(await reads.getIncidentForOrganization(detail)).toBeNull();
    const allowed = await reads.getIncidentForOrganization({
      ...detail,
      origin_project_ids: [f.source]
    });
    expect(allowed?.project_id).toBe(f.source);
    expect(allowed?.canonical_project_id).toBe(f.target);
    expect(allowed?.service_definition_id).toBe(f.sourceDefinition);
    expect(
      (
        await reads.listIncidentsForOrganization({ ...base, project_id: f.target, service: "Site" })
      ).map((i) => i.incident_id)
    ).toEqual([f.incidents[1]]);
    expect(
      (
        await reads.listIncidentsForOrganization({ ...base, project_id: f.source, service: "web" })
      ).map((i) => i.incident_id)
    ).toEqual([f.incidents[1]]);
    const noOrigins = { ...base, project_id: f.target, origin_project_ids: [] };
    expect(await reads.listIncidentsForOrganization(noOrigins)).toEqual([]);
  });

  it("joins renamed evidence only within its original service, environment and correlation proof", async () => {
    const f = await fixture();
    const start = Date.now() - 3000;
    const reference = {
      version: 1 as const,
      failure_ref: randomUUID(),
      scope: { kind: "page" as const, page_id: randomUUID() }
    };
    const failure = createEventEnvelope({
      event_type: "log_event",
      occurred_at: new Date(start).toISOString(),
      service: { name: "web", environment: "production" },
      correlation: { session_id: "same-proof" },
      context: { evidence_reference: reference },
      payload: { level: "error", message: "failed", attributes: {} }
    });
    const recovery = createEventEnvelope({
      event_type: "diagnostic_context",
      occurred_at: new Date(start + 1000).toISOString(),
      service: { name: "Site", environment: "production" },
      correlation: { session_id: "same-proof" },
      payload: {
        ...reference,
        kind: "recovery",
        attempt_id: randomUUID(),
        state: "attempt_completed"
      }
    });
    const originalBytes = JSON.stringify([failure, recovery]);
    const writer = createEvidenceContextStore(db);
    await writer.record(f.source, failure, new Date().toISOString(), "incident_signal");
    await writer.record(f.source, recovery, new Date().toISOString(), "context_signal");
    for (const [project, event] of [
      [f.target, { ...recovery, event_id: randomUUID() }],
      [
        f.source,
        { ...recovery, event_id: randomUUID(), service: { ...recovery.service, name: "other" } }
      ],
      [
        f.source,
        {
          ...recovery,
          event_id: randomUUID(),
          correlation: { ...recovery.correlation!, session_id: "other" }
        }
      ]
    ] as const)
      await writer.record(project, event, new Date().toISOString(), "context_signal");
    const reader = createEvidenceContextReader(db);
    const request = {
      project_id: f.source,
      service_name: "Site",
      environment: "production",
      failure_event_ids: [failure.event_id]
    };
    expect(
      (await reader.listEvidenceContextCandidates(request)).map((row) => row.event_id)
    ).toEqual([recovery.event_id]);
    expect(JSON.stringify([failure, recovery])).toBe(originalBytes);
    await writer.record(
      f.source,
      { ...failure, event_id: randomUUID(), service: recovery.service },
      new Date().toISOString(),
      "incident_signal"
    );
    expect(await reader.listEvidenceContextCandidates(request)).toEqual([]);
  });

  it("retains browser recovery across service aliases without borrowing another origin's request", async () => {
    const f = await fixture();
    const start = Date.now() - 3000;
    const resource = browserResourceEvent();
    resource.occurred_at = new Date(start).toISOString();
    resource.correlation = {
      session_id: "same-proof",
      request_id: null,
      trace_id: null,
      user_id_hash: null
    };
    const recovery = createEventEnvelope({
      event_type: "request_event",
      occurred_at: new Date(start + 1000).toISOString(),
      service: { name: "Site", environment: "production" },
      correlation: resource.correlation,
      payload: {
        method: "GET",
        path: "/api/recover",
        query: {},
        headers: {},
        response_status: 503,
        duration_ms: 1
      }
    });
    const writer = createBrowserRecoveryStore(db);
    await writer.record(f.source, resource);
    await writer.record(f.source, recovery);
    await writer.record(f.target, { ...recovery, event_id: randomUUID() });
    expect(
      (
        await createMetadataBundles(db).listRequestEventCandidatesForServiceWindow({
          project_id: f.source,
          service_name: "Site",
          environment: "production",
          window_start: new Date(start).toISOString(),
          window_end: new Date(start + 2000).toISOString(),
          resource_event_ids: [resource.event_id]
        })
      ).map((row) => row.event_id)
    ).toEqual([recovery.event_id]);
  });

  it("uses current canonical membership for legacy IDs and never exposes a second active project", async () => {
    const f = await fixture(true);
    const combined = await projects.listProjectsForUser!({
      user_id: f.userId,
      now: new Date().toISOString(),
      limit: 100
    });
    expect(combined.find((p) => p.project_id === f.target)?.metrics.open_incidents).toBe(2);
    expect(
      (
        await projects.listProjectsForUser!({
          user_id: f.userId,
          now: new Date().toISOString(),
          limit: 100
        })
      )
        .filter((p) => p.project_id === f.source || p.project_id === f.target)
        .map((p) => p.project_id)
    ).toEqual([f.target]);
    expect(
      (await definitions.list({ project_id: f.target, user_id: f.userId, limit: 100 })).services
    ).toHaveLength(2);
    expect(
      (
        await definitions.list({ project_id: f.source, user_id: f.userId, limit: 100 })
      ).services.map((d) => d.service_definition_id)
    ).toEqual([f.sourceDefinition]);
    await expect(
      definitions.update({
        project_id: f.source,
        user_id: f.userId,
        service_definition_id: f.sourceDefinition,
        name: "Unsafe"
      })
    ).rejects.toThrow("project_consolidated");
    const member = f.memberId;
    expect(
      (await access.resolveProjectAccessForUser!({ project_id: f.source, user_id: member }))
        ?.canonical_project_id
    ).toBe(f.target);
    await pool.query("DELETE FROM project_members WHERE project_id=$1 AND user_id=$2", [
      f.target,
      member
    ]);
    expect(
      await access.resolveProjectAccessForUser!({ project_id: f.source, user_id: member })
    ).toBeNull();
    expect(
      await reads.getIncidentForOrganization({
        organization_id: f.organizationId,
        user_id: member,
        incident_id: f.incidents[1]!
      })
    ).toBeNull();
  });

  it("combines improvement histories without coalescing equal fingerprints or widening a restricted view", async () => {
    const f = await fixture(true),
      store = createPostgresImprovementOpportunityStore(db),
      ids = [randomUUID(), randomUUID()];
    for (const [index, id] of ids.entries())
      await pool.query(
        "INSERT INTO improvement_opportunities(id,project_id,service_id,service_name,kind,severity,confidence,fingerprint,title,summary,evidence,first_detected_at,last_detected_at,bundle_generation_number) VALUES($1,$2,$3,$4,'warning_hotspot','medium',0.8,'same-fingerprint','Warning','Summary','{}',now(),now(),1)",
        [id, [f.target, f.source][index], f.instanceIds[index], ["api", "web"][index]]
      );
    const base = {
      organization_id: f.organizationId,
      user_id: f.userId,
      project_id: f.target,
      limit: 100
    };
    expect(
      (await store.listImprovementsForOrganization(base)).map((i) => i.improvement_id).sort()
    ).toEqual([...ids].sort());
    expect(await countImprovementsForOrganization(db, base)).toBe(2);
    expect(
      (await store.listImprovementsForOrganization({ ...base, service: "Site" })).map(
        (i) => i.improvement_id
      )
    ).toEqual([ids[1]]);
    expect(
      (
        await store.listImprovementsForOrganization({
          ...base,
          project_id: f.source,
          service: "web"
        })
      ).map((i) => i.improvement_id)
    ).toEqual([ids[1]]);
    const restricted = { ...base, origin_project_ids: [f.target] };
    expect(
      (await store.listImprovementsForOrganization(restricted)).map((i) => i.improvement_id)
    ).toEqual([ids[0]]);
    const detail = {
      organization_id: f.organizationId,
      user_id: f.userId,
      project_id: f.target,
      improvement_id: ids[1]!,
      origin_project_ids: [f.target]
    };
    expect(await store.getImprovementForOrganization(detail)).toBeNull();
    const row = await store.getImprovementForOrganization({
      ...detail,
      origin_project_ids: [f.source]
    });
    expect(row).toMatchObject({
      project_id: f.source,
      canonical_project_id: f.target,
      service_definition_id: f.sourceDefinition,
      canonical_service_name: "Site"
    });
    await pool.query("DELETE FROM project_members WHERE project_id=$1 AND user_id=$2", [
      f.target,
      f.memberId
    ]);
    expect(
      await store.getImprovementForOrganization({
        organization_id: f.organizationId,
        user_id: f.memberId,
        improvement_id: ids[1]!
      })
    ).toBeNull();
    expect(
      await store.resolveImprovementForOrganization({
        organization_id: f.organizationId,
        user_id: f.memberId,
        improvement_id: ids[1]!,
        resolved_by_member_id: f.memberId,
        resolved_at: new Date().toISOString()
      })
    ).toBeNull();
  });

  it("keeps warning and request fingerprints stable when instrumentation adopts a mapped service name", async () => {
    const f = await fixture(),
      store = createPostgresImprovementOpportunityStore(db);
    const base = {
      project_id: f.source,
      environment: "production",
      occurred_at: new Date().toISOString(),
      severity: "medium" as const,
      confidence: 0.8,
      threshold: 10
    };
    const original = await store.recordWarningHotspot({
      ...base,
      service_name: "web",
      normalized_message: "same warning",
      source_event_id: randomUUID()
    });
    const adopted = await store.recordWarningHotspot({
      ...base,
      service_name: "Site",
      normalized_message: "same warning",
      source_event_id: randomUUID()
    });
    expect(adopted?.opportunity_id).toBe(original?.opportunity_id);
    expect(adopted?.occurrence_count).toBe(2);
    const request = {
      ...base,
      kind: "request_failure_pattern" as const,
      route_template: "/orders/:id",
      http_method: "GET",
      response_status: 500,
      duration_ms: 800
    };
    const previous = await store.recordRequestPattern({
      ...request,
      service_name: "web",
      source_event_id: randomUUID()
    });
    const next = await store.recordRequestPattern({
      ...request,
      service_name: "Site",
      source_event_id: randomUUID()
    });
    expect(next?.opportunity_id).toBe(previous?.opportunity_id);
    expect(next?.occurrence_count).toBe(2);
    expect(
      (
        await pool.query(
          "SELECT service_id,service_name FROM improvement_opportunities WHERE id=ANY($1::uuid[])",
          [[adopted!.opportunity_id, next!.opportunity_id]]
        )
      ).rows
    ).toEqual([
      { service_id: f.instanceIds[1], service_name: "web" },
      { service_id: f.instanceIds[1], service_name: "web" }
    ]);
  });

  it.each(["web", "Site"])(
    "retains unattributed %s history and old event dedupe across service adoption",
    async (name) => {
      const f = await fixture(),
        store = createPostgresImprovementOpportunityStore(db),
        id = randomUUID(),
        oldEvent = randomUUID();
      const fingerprint = buildWarningHotspotFingerprint({
        service_name: name,
        environment: "production",
        normalized_message: "legacy warning"
      });
      await pool.query(
        "INSERT INTO improvement_opportunities(id,project_id,service_name,kind,severity,confidence,fingerprint,title,summary,evidence,first_detected_at,last_detected_at) VALUES($1,$2,$3,'warning_hotspot','medium',0.8,$4,'Warning','Summary','{}',now(),now())",
        [id, f.source, name, fingerprint]
      );
      await pool.query(
        "INSERT INTO improvement_opportunity_events(improvement_opportunity_id,event_id,event_type,occurred_at) VALUES($1,$2,'log_event',now())",
        [id, oldEvent]
      );
      const result = await store.recordWarningHotspot({
        project_id: f.source,
        service_name: "Site",
        environment: "production",
        occurred_at: new Date().toISOString(),
        source_event_id: name === "Site" ? oldEvent : randomUUID(),
        normalized_message: "legacy warning",
        severity: "medium",
        confidence: 0.8,
        threshold: 10
      });
      expect(result?.opportunity_id).toBe(id);
      expect(result?.occurrence_count).toBe(name === "Site" ? 1 : 2);
      expect(
        (
          await pool.query(
            "SELECT id,service_id FROM improvement_opportunities WHERE project_id=$1",
            [f.source]
          )
        ).rows
      ).toEqual([{ id, service_id: null }]);
    }
  );

  it("freezes SDK and agent authority at creation for source and destination credentials", async () => {
    const f = await fixture();
    const agents = createAgentTokenStore(db);
    for (const [index, project] of [f.target, f.source].entries()) {
      expect(
        (await resolveProjectTokenAndRecordUsage(db, f.oldProjectHashes[index]!))
          ?.capture_rules_require_server
      ).toBe(true);
      expect(
        (await resolveProjectTokenAndRecordUsage(db, f.oldProjectHashes[index]!))?.scope_origin_ids
      ).toEqual([project]);
      expect((await agents.resolveByTokenHash(f.oldAgentHashes[index]!))?.scope_origin_ids).toEqual(
        [project]
      );
    }
    const nextHash = randomUUID();
    await pool.query(
      "INSERT INTO project_tokens(id,project_id,token_hash,label) VALUES($1,$2,$3,'Canonical')",
      [randomUUID(), f.target, nextHash]
    );
    expect((await resolveProjectTokenAndRecordUsage(db, nextHash))?.scope_origin_ids).toEqual(
      [f.target, f.source].sort()
    );
    const nextAgent = await agents.create({
      projectId: f.target,
      actorUserId: f.userId,
      label: "Canonical",
      expiresAt: new Date(Date.now() + 86400000).toISOString()
    });
    const { hashToken } = await import("../../packages/auth/src/index.js");
    expect(
      (await agents.resolveByTokenHash(hashToken(nextAgent!.plaintext)))?.scope_origin_ids
    ).toEqual([f.target, f.source].sort());
    await expect(
      pool.query(
        "INSERT INTO project_tokens(id,project_id,token_hash,label) VALUES($1,$2,$3,'Unsafe')",
        [randomUUID(), f.source, randomUUID()]
      )
    ).rejects.toThrow("project_consolidated");
    await expect(
      pool.query("UPDATE project_tokens SET scope_origin_ids=$1 WHERE token_hash=$2", [
        [f.source, f.target],
        f.oldProjectHashes[0]
      ])
    ).rejects.toThrow("credential_scope_immutable");
  });

  it("routes adopted service names to the same history while retaining each issuing view", async () => {
    const f = await fixture();
    const scopes = await resolveCredentialServiceScopes(db, {
      project_id: f.target,
      scope_origin_ids: [f.target, f.source],
      service_names: ["api", "Site", "new-worker"]
    });
    expect(scopes.map(({ name, origin_project_id }) => ({ name, origin_project_id }))).toEqual([
      { name: "api", origin_project_id: f.target },
      { name: "Site", origin_project_id: f.source },
      { name: "new-worker", origin_project_id: f.target }
    ]);
    expect(scopes.find((s) => s.name === "Site")?.service_aliases).toEqual(["Site", "web"]);
    expect(
      (
        await resolveCredentialServiceScopes(db, {
          project_id: f.target,
          scope_origin_ids: [f.target],
          service_names: ["Site"]
        })
      )[0]?.origin_project_id
    ).toBe(f.target);
    await definitions.update({
      project_id: f.target,
      user_id: f.userId,
      service_definition_id: f.sourceDefinition,
      name: "Website"
    });
    expect(
      (
        await resolveCredentialServiceScopes(db, {
          project_id: f.target,
          scope_origin_ids: [f.target, f.source],
          service_names: ["Site", "Website"]
        })
      ).map((s) => s.origin_project_id)
    ).toEqual([f.source, f.source]);
    await expect(
      definitions.create({ project_id: f.target, user_id: f.userId, name: "Site" })
    ).rejects.toThrow("service_name_conflict");
    const later = randomUUID();
    await pool.query(
      "INSERT INTO projects(id,organization_id,owner_user_id,name,slug) VALUES($1::uuid,$2,$3,'Next system',$1::text)",
      [later, f.organizationId, f.userId]
    );
    const before = (await definitions.list({ project_id: f.target, user_id: f.userId, limit: 100 }))
      .services;
    const request = {
      target_project_id: later,
      source_project_ids: [f.target],
      service_mappings: before.map((d) => ({
        source_project_id: f.target,
        service_definition_id: d.service_definition_id,
        name: d.service_definition_id === f.sourceDefinition ? "Frontend" : "Backend"
      }))
    };
    const merge = createProjectMergeStore(db, { enabled: true });
    const preview = await merge.preview({ user_id: f.userId, request });
    const operation = await merge.apply({
      user_id: f.userId,
      request,
      plan_digest: preview.plan_digest,
      idempotency_key: randomUUID()
    });
    const oldView = await reads.getIncidentForOrganization({
      organization_id: f.organizationId,
      user_id: f.userId,
      project_id: f.target,
      incident_id: f.incidents[1]!
    });
    expect(projectEvidenceView(oldView!, f.target)).toMatchObject({
      project_id: f.target,
      origin_project_id: f.source,
      service_name: "Website",
      canonical_project_id: later
    });
    expect(projectEvidenceView(oldView!)).toMatchObject({
      project_id: later,
      origin_project_id: f.source,
      service_name: "Frontend"
    });
    expect(
      (
        await resolveCredentialServiceScopes(db, {
          project_id: f.target,
          scope_origin_ids: [f.target, f.source],
          service_names: ["Site", "Website"]
        })
      ).map((s) => s.origin_project_id)
    ).toEqual([f.source, f.source]);
    await definitions.update({
      project_id: later,
      user_id: f.userId,
      service_definition_id: f.sourceDefinition,
      name: "Web"
    });
    expect(
      (await merge.verify({ user_id: f.userId, operation_id: operation.operation_id })).verified
    ).toBe(true);
  });
});
