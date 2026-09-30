import { randomUUID } from "node:crypto";
import { createApiServer } from "../../apps/api/src/server.js";
import { hashToken } from "../../packages/auth/src/index.js";
import { createAnalyticsWriterStore } from "../../packages/storage/src/analytics-writer-store.js";
import { createMetadataAccess } from "../../packages/storage/src/metadata-access.js";
import { gunzipSync } from "node:zlib";
import { CreateBucketCommand } from "@aws-sdk/client-s3";
import { afterAll, beforeEach, expect, it } from "vitest";
import { bootstrapStorageSchema } from "../../packages/storage/src/migrations.js";
import {
  loadCurrentProjectSemanticAnalyticsPolicy,
  recheckProjectSemanticAnalyticsAdmission
} from "../../packages/storage/src/semantic-analytics-policy.js";
import { resolveCurrentProjectSemanticAnalyticsCapability } from "../../packages/storage/src/semantic-analytics-capability.js";
import { persistCurrentProjectSemanticAnalyticsEvent } from "../../packages/storage/src/semantic-analytics-persistence.js";
import { createSemanticAnalyticsReceiptStore } from "../../packages/storage/src/semantic-analytics-receipt-store.js";
import {
  createIntegrationPool,
  createS3AdminClient,
  createQueryable,
  createTestObjectStore,
  runIntegration,
  seedOwnedProject,
  s3Bucket
} from "../helpers/integration-setup.js";
import { admitSemanticAnalyticsEvent } from "../../packages/event-normalizer/src/semantic-analytics-admission.js";
import { SemanticAnalyticsEventSchema } from "../../packages/shared-types/src/index.js";
import { readFileSync } from "node:fs";
import { createBaseDependencies } from "../helpers/api-capture-rule-ingestion.js";

runIntegration("semantic analytics current project policy", () => {
  const pool = createIntegrationPool();
  const db = createQueryable(pool);
  const s3Admin = createS3AdminClient();
  const objectStore = createTestObjectStore();
  let organizationId: string;
  let projectId: string;
  let ownerUserId: string;
  let writerHash: string;
  let writerId: string;

  const catalog = [
    {
      name: "account.created",
      revision: 1,
      description: "Committed account",
      producers: ["server"],
      purpose: "business_measurement",
      success_boundary: "committed",
      properties: { signup_method: { type: "enum", values: ["email", "oauth"], required: true } },
      measurements: {},
      expected_producers: []
    }
  ];
  const policyInput = () => ({
    projectId,
    principal: "server_writer" as const,
    credentialHash: writerHash,
    receivedAt: "2026-09-28T10:01:00.000Z"
  });

  const persistAt = (
    receipts: Parameters<typeof persistCurrentProjectSemanticAnalyticsEvent>[1],
    store: Parameters<typeof persistCurrentProjectSemanticAnalyticsEvent>[2],
    input: Parameters<typeof persistCurrentProjectSemanticAnalyticsEvent>[3],
    receivedAt = "2026-09-28T10:01:00.000Z"
  ) =>
    persistCurrentProjectSemanticAnalyticsEvent(
      db,
      receipts,
      store,
      input,
      () => new Date(receivedAt)
    );

  beforeEach(async () => {
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("CREATE SCHEMA public");
    await bootstrapStorageSchema(db);
    await s3Admin.send(new CreateBucketCommand({ Bucket: s3Bucket })).catch(() => undefined);
    organizationId = randomUUID();
    projectId = randomUUID();
    ({ ownerUserId } = await seedOwnedProject({
      pool,
      organizationId,
      projectId,
      organizationName: "Growth",
      organizationSlug: "growth",
      projectName: "App",
      projectSlug: "app",
      organizationPlan: "team"
    }));
    writerHash = "a".repeat(64);
    writerId = randomUUID();
    await pool.query(
      "INSERT INTO project_analytics_settings(project_id,enabled,privacy_mode,max_custom_dimensions) VALUES($1,true,'strict',2)",
      [projectId]
    );
    await pool.query("INSERT INTO analytics_writer_state(project_id,revision) VALUES($1,1)", [
      projectId
    ]);
    await pool.query(
      `INSERT INTO analytics_writers(id,project_id,organization_id,issuer_user_id,kind,display_name,token_hash,expires_at)
       VALUES($1,$2,$3,$4,'server','Billing worker',$5,now()+interval '30 days')`,
      [writerId, projectId, organizationId, ownerUserId, writerHash]
    );
    await pool.query(
      "INSERT INTO analytics_project_catalogs(project_id,revision,catalog_revision,content_hash,entries) VALUES($1,1,1,$2,$3::jsonb)",
      [projectId, "b".repeat(64), JSON.stringify(catalog)]
    );
    await pool.query(
      `INSERT INTO analytics_project_plans(project_id,revision,catalog_revision,business_measurement_enabled,content_hash,catalog,reports)
       VALUES($1,1,1,false,$2,$3::jsonb,'[]'::jsonb)`,
      [projectId, "c".repeat(64), JSON.stringify(catalog)]
    );
  });
  afterAll(async () => {
    await pool.end();
    s3Admin.destroy();
  });

  const serverEvent = () =>
    SemanticAnalyticsEventSchema.parse(
      JSON.parse(
        readFileSync(new URL("../fixtures/analytics-semantic-event.json", import.meta.url), "utf8")
      )
    );

  it("offers a server capability only while a live writer, current catalog and business grant agree", async () => {
    const input = {
      projectId,
      principal: "server_writer" as const,
      credentialHash: writerHash,
      receivedAt: new Date().toISOString()
    };
    expect(await resolveCurrentProjectSemanticAnalyticsCapability(db, input)).toBeNull();
    await pool.query(
      "UPDATE analytics_project_plans SET business_measurement_enabled=true WHERE project_id=$1",
      [projectId]
    );
    const enabled = await resolveCurrentProjectSemanticAnalyticsCapability(db, input);
    expect(enabled).toMatchObject({
      enabled: true,
      principal: "server_writer",
      project_id: projectId,
      allowed_producers: ["server"],
      allowed_purposes: ["business_measurement"],
      catalog_revision: 1,
      max_properties: 2,
      detailed_retention_days: 30,
      known_identity_allowed: false
    });
    await pool.query("UPDATE analytics_writers SET revoked_at=now() WHERE id=$1", [writerId]);
    expect(await resolveCurrentProjectSemanticAnalyticsCapability(db, input)).toBeNull();
  });

  it("grants a direct project token only current declared client product producers", async () => {
    const tokenHash = "d".repeat(64);
    const tokenId = randomUUID();
    const input = {
      projectId,
      principal: "project_token" as const,
      credentialHash: tokenHash,
      receivedAt: new Date().toISOString()
    };
    await pool.query(
      "INSERT INTO project_tokens(id,project_id,token_hash,label) VALUES($1,$2,$3,'Browser')",
      [tokenId, projectId, tokenHash]
    );
    await pool.query(
      "UPDATE analytics_project_plans SET business_measurement_enabled=true WHERE project_id=$1",
      [projectId]
    );
    expect(await resolveCurrentProjectSemanticAnalyticsCapability(db, input)).toBeNull();

    const productCatalog = [
      ...catalog,
      {
        name: "signup.started",
        revision: 1,
        description: "Signup entered",
        producers: ["browser"],
        purpose: "product_analytics",
        success_boundary: "observed",
        properties: {},
        measurements: {},
        expected_producers: []
      }
    ];
    await pool.query(
      "UPDATE analytics_project_catalogs SET catalog_revision=2,entries=$2::jsonb WHERE project_id=$1",
      [projectId, JSON.stringify(productCatalog)]
    );
    expect(await resolveCurrentProjectSemanticAnalyticsCapability(db, input)).toBeNull();
    await pool.query(
      `UPDATE analytics_project_plans
       SET revision=2,catalog_revision=2,catalog=$2::jsonb WHERE project_id=$1`,
      [projectId, JSON.stringify(productCatalog)]
    );
    await pool.query(
      `UPDATE project_analytics_settings
       SET privacy_mode='standard',consent_required=true,hourly_retention_days=14
       WHERE project_id=$1`,
      [projectId]
    );
    expect(await resolveCurrentProjectSemanticAnalyticsCapability(db, input)).toMatchObject({
      project_id: projectId,
      principal: "project_token",
      enabled: true,
      allowed_producers: ["browser"],
      allowed_purposes: ["product_analytics"],
      catalog_revision: 2,
      consent_required: true,
      privacy_mode: "standard",
      detailed_retention_days: 14,
      identity_scope: null,
      known_identity_allowed: false
    });
    await pool.query("UPDATE project_tokens SET revoked_at=now() WHERE id=$1", [tokenId]);
    expect(await resolveCurrentProjectSemanticAnalyticsCapability(db, input)).toBeNull();
  });

  it("writes protected bytes and a durable receipt only under the current business grant", async () => {
    const receipts = createSemanticAnalyticsReceiptStore(db);
    const event = serverEvent();
    const request = { policy: policyInput(), event };
    expect(await persistAt(receipts, objectStore, request)).toEqual({
      kind: "rejected",
      reason: "purpose_not_authorized"
    });
    await pool.query(
      "UPDATE analytics_project_plans SET business_measurement_enabled=true WHERE project_id=$1",
      [projectId]
    );
    const accepted = await persistAt(receipts, objectStore, request);
    expect(accepted.kind).toBe("accepted");
    const receipt = (
      await pool.query<{ raw_object_key: string }>(
        "SELECT raw_object_key FROM semantic_analytics_receipts WHERE project_id=$1",
        [projectId]
      )
    ).rows[0];
    expect(receipt).toBeDefined();
    const protectedBytes = gunzipSync(
      await objectStore.getObject({ key: receipt!.raw_object_key })
    );
    expect(JSON.parse(protectedBytes.toString("utf8"))).toMatchObject({
      event_id: event.event_id,
      payload: { name: "account.created" }
    });
    expect(
      (
        await pool.query<{ period_starts_at: Date }>(
          "SELECT period_starts_at FROM analytics_usage_counters WHERE organization_id=$1",
          [organizationId]
        )
      ).rows[0]?.period_starts_at.toISOString()
    ).toBe("2026-09-01T00:00:00.000Z");
  });

  it("binds the authenticated HTTP writer to one durable acceptance and one quota claim", async () => {
    const token = `dbundle_anl_${"A".repeat(43)}`;
    await pool.query("UPDATE analytics_writers SET token_hash=$2 WHERE id=$1", [
      writerId,
      hashToken(token)
    ]);
    await pool.query(
      "UPDATE analytics_project_plans SET business_measurement_enabled=true WHERE project_id=$1",
      [projectId]
    );
    const receipts = createSemanticAnalyticsReceiptStore(db);
    let rateClaims = 0;
    const app = createApiServer({
      ...createBaseDependencies(),
      ingestionRateLimiter: {
        claimEvents: async (input) => {
          expect(input).toMatchObject({
            token_hash: hashToken(token),
            project_id: projectId,
            event_count: 1,
            limit: 10_000
          });
          rateClaims += 1;
          return {
            allowed: true,
            limit: 10_000,
            remaining: 10_000 - rateClaims,
            retry_after_ms: 0
          };
        }
      },
      analyticsWriters: createAnalyticsWriterStore(db),
      semanticAnalyticsDelivery: {
        enabled: true,
        getRateLimitPerMinute: async () => 10_000,
        persist: ({ projectId: writerProjectId, credentialHash, event }) =>
          persistCurrentProjectSemanticAnalyticsEvent(db, receipts, objectStore, {
            policy: {
              projectId: writerProjectId,
              principal: "server_writer",
              credentialHash
            },
            event
          })
      }
    });
    try {
      const request = {
        method: "POST" as const,
        url: "/v1/analytics/deliver",
        headers: { authorization: `Bearer ${token}` },
        payload: { events: [serverEvent()] }
      };
      const first = await app.inject(request);
      expect(first.statusCode).toBe(200);
      expect(first.json()).toMatchObject({
        project_id: projectId,
        submitted: 1,
        accepted: 1,
        rejected: 0,
        accepted_events: [{ index: 0, duplicate: false }]
      });
      const retry = await app.inject(request);
      expect(retry.statusCode).toBe(200);
      expect(retry.json()).toMatchObject({
        project_id: projectId,
        submitted: 1,
        accepted: 1,
        rejected: 0,
        accepted_events: [{ index: 0, duplicate: true }]
      });
      expect(rateClaims).toBe(2);
      expect(
        (await pool.query("SELECT count(*)::int AS count FROM semantic_analytics_receipts")).rows[0]
          ?.count
      ).toBe(1);
      expect(
        (
          await pool.query<{ analytics_events: string }>(
            "SELECT analytics_events::text FROM analytics_usage_counters WHERE organization_id=$1",
            [organizationId]
          )
        ).rows[0]?.analytics_events
      ).toBe("1");
    } finally {
      await app.close();
    }
  });

  it("accepts a relay client event only with current relay-writer authority", async () => {
    const token = `dbundle_anr_${"A".repeat(43)}`;
    await pool.query("UPDATE analytics_writers SET kind='relay',token_hash=$2 WHERE id=$1", [
      writerId,
      hashToken(token)
    ]);
    const clientCatalog = [
      {
        ...catalog[0],
        producers: ["browser"],
        purpose: "product_analytics",
        success_boundary: "observed"
      }
    ];
    await pool.query(
      "UPDATE analytics_project_catalogs SET entries=$2::jsonb WHERE project_id=$1",
      [projectId, JSON.stringify(clientCatalog)]
    );
    await pool.query("UPDATE analytics_project_plans SET catalog=$2::jsonb WHERE project_id=$1", [
      projectId,
      JSON.stringify(clientCatalog)
    ]);
    const source = serverEvent();
    const client = SemanticAnalyticsEventSchema.parse({
      ...source,
      sdk_name: "@debugbundle/sdk-browser",
      service: { ...source.service, runtime: "browser" },
      producer: { kind: "browser", stream_id: null, sequence: null },
      operation_id: null,
      correlation: { ...source.correlation, session_id: randomUUID() },
      payload: {
        ...source.payload,
        purpose: "product_analytics",
        privacy: { mode: "strict", consent_granted: true }
      }
    });
    const receipts = createSemanticAnalyticsReceiptStore(db);
    const app = createApiServer({
      ...createBaseDependencies(),
      analyticsWriters: createAnalyticsWriterStore(db),
      ingestionRateLimiter: {
        claimEvents: async () => ({
          allowed: true,
          limit: 10_000,
          remaining: 9_999,
          retry_after_ms: 0
        })
      },
      semanticAnalyticsRelayDelivery: {
        enabled: true,
        getRateLimitPerMinute: async () => 10_000,
        persist: ({ projectId: authenticatedProjectId, credentialHash, event }) =>
          persistCurrentProjectSemanticAnalyticsEvent(db, receipts, objectStore, {
            policy: { projectId: authenticatedProjectId, principal: "relay", credentialHash },
            event
          })
      }
    });
    try {
      const send = (event: unknown) =>
        app.inject({
          method: "POST",
          url: "/v1/analytics/relay/events",
          headers: { authorization: `Bearer ${token}` },
          payload: { events: [event] }
        });
      const accepted = await send(client);
      expect(accepted.statusCode).toBe(200);
      expect(accepted.json()).toMatchObject({ accepted: 1, rejected: 0 });
      expect(
        (await pool.query("SELECT count(*) FROM semantic_analytics_receipts")).rows[0]?.count
      ).toBe("1");
      const spoofed = await send(source);
      expect(spoofed.statusCode).toBe(200);
      expect(spoofed.json()).toMatchObject({
        accepted: 0,
        rejected: 1,
        errors: [{ index: 0, reason: "source_not_authorized" }]
      });
      await pool.query("UPDATE analytics_writers SET revoked_at=now() WHERE id=$1", [writerId]);
      expect((await send(client)).statusCode).toBe(401);
      expect(
        (await pool.query("SELECT count(*) FROM semantic_analytics_receipts")).rows[0]?.count
      ).toBe("1");
    } finally {
      await app.close();
    }
  });

  it("binds an opted-in mixed-route client event to a live project token and durable receipt", async () => {
    const token = `dbundle_proj_${"A".repeat(43)}`;
    const tokenId = randomUUID();
    await pool.query(
      "INSERT INTO project_tokens(id,project_id,token_hash,label) VALUES($1,$2,$3,'Browser')",
      [tokenId, projectId, hashToken(token)]
    );
    const clientCatalog = [
      {
        ...catalog[0]!,
        producers: ["browser"],
        purpose: "product_analytics"
      }
    ];
    await pool.query(
      "UPDATE analytics_project_catalogs SET entries=$2::jsonb WHERE project_id=$1",
      [projectId, JSON.stringify(clientCatalog)]
    );
    await pool.query("UPDATE analytics_project_plans SET catalog=$2::jsonb WHERE project_id=$1", [
      projectId,
      JSON.stringify(clientCatalog)
    ]);
    const source = serverEvent();
    const client = SemanticAnalyticsEventSchema.parse({
      ...source,
      sdk_name: "@debugbundle/sdk-browser",
      service: { ...source.service, runtime: "browser" },
      producer: { kind: "browser", stream_id: null, sequence: null },
      operation_id: null,
      correlation: { ...source.correlation, session_id: randomUUID() },
      payload: {
        ...source.payload,
        purpose: "product_analytics",
        privacy: { mode: "strict", consent_granted: true }
      }
    });
    const receipts = createSemanticAnalyticsReceiptStore(db);
    const app = createApiServer({
      ...createBaseDependencies({
        resolveProjectByTokenHash: createMetadataAccess(db).resolveProjectByTokenHash
      }),
      semanticAnalyticsClientDelivery: {
        enabled: true,
        persist: ({ projectId: authenticatedProjectId, credentialHash, event }) =>
          persistCurrentProjectSemanticAnalyticsEvent(db, receipts, objectStore, {
            policy: {
              projectId: authenticatedProjectId,
              principal: "project_token",
              credentialHash
            },
            event
          })
      }
    });
    try {
      const request = {
        method: "POST" as const,
        url: "/v1/events",
        headers: { authorization: `Bearer ${token}` },
        payload: { events: [client] }
      };
      const first = await app.inject(request);
      expect(first.statusCode).toBe(202);
      expect(first.json()).toEqual({ accepted: 1, rejected: 0, errors: [] });
      const retry = await app.inject(request);
      expect(retry.statusCode).toBe(202);
      expect(retry.json()).toEqual({ accepted: 1, rejected: 0, errors: [] });
      expect(
        (await pool.query("SELECT count(*)::int AS count FROM semantic_analytics_receipts")).rows[0]
          ?.count
      ).toBe(1);
      expect(
        (
          await pool.query(
            "SELECT count(*)::int AS count FROM worker_jobs WHERE job_name='process-semantic-analytics-event'"
          )
        ).rows[0]?.count
      ).toBe(1);
      await pool.query("UPDATE project_tokens SET revoked_at=now() WHERE id=$1", [tokenId]);
      const revoked = await app.inject(request);
      expect(revoked.statusCode).toBe(401);
      expect(revoked.json()).toMatchObject({
        accepted: 0,
        errors: [{ index: -1, reason: "invalid_project_token" }]
      });
    } finally {
      await app.close();
    }
  });

  it("uses its own receipt clock even when an input object carries a forged timestamp", async () => {
    await pool.query(
      "UPDATE analytics_project_plans SET business_measurement_enabled=true WHERE project_id=$1",
      [projectId]
    );
    const forgedPolicy = { ...policyInput(), receivedAt: "2026-10-30T10:01:00.000Z" };
    expect(
      await persistCurrentProjectSemanticAnalyticsEvent(
        db,
        createSemanticAnalyticsReceiptStore(db),
        objectStore,
        { policy: forgedPolicy, event: serverEvent() },
        () => new Date(Number.NaN)
      )
    ).toEqual({ kind: "authority_changed" });
    expect(
      (await pool.query("SELECT count(*) FROM semantic_analytics_pending_objects")).rows[0]?.count
    ).toBe("0");
    const result = await persistAt(createSemanticAnalyticsReceiptStore(db), objectStore, {
      policy: forgedPolicy,
      event: serverEvent()
    });
    expect(result.kind).toBe("accepted");
    expect(
      (
        await pool.query<{ period_starts_at: Date }>(
          "SELECT period_starts_at FROM analytics_usage_counters WHERE organization_id=$1",
          [organizationId]
        )
      ).rows[0]?.period_starts_at.toISOString()
    ).toBe("2026-09-01T00:00:00.000Z");
  });

  it("does not ACK if the reviewed grant is revoked during the protected write", async () => {
    await pool.query(
      "UPDATE analytics_project_plans SET business_measurement_enabled=true WHERE project_id=$1",
      [projectId]
    );
    const receipts = createSemanticAnalyticsReceiptStore(db);
    const result = await persistAt(
      receipts,
      {
        putObject: async (request) => {
          await objectStore.putObject(request);
          await pool.query(
            "UPDATE analytics_project_plans SET business_measurement_enabled=false WHERE project_id=$1",
            [projectId]
          );
        }
      },
      {
        policy: policyInput(),
        event: serverEvent()
      }
    );
    expect(result).toEqual({ kind: "authority_changed" });
    expect(
      (await pool.query("SELECT count(*) FROM semantic_analytics_receipts")).rows[0]?.count
    ).toBe("0");
    expect((await pool.query("SELECT count(*) FROM analytics_usage_claims")).rows[0]?.count).toBe(
      "0"
    );
    expect(
      (await pool.query("SELECT count(*) FROM semantic_analytics_pending_objects")).rows[0]?.count
    ).toBe("1");
  });

  it("requires the explicit reviewed grant and rechecks its revocation", async () => {
    const denied = await loadCurrentProjectSemanticAnalyticsPolicy(db, policyInput());
    expect(denied?.context.businessMeasurementAllowed).toBe(false);
    await pool.query(
      "UPDATE analytics_project_plans SET business_measurement_enabled=true WHERE project_id=$1",
      [projectId]
    );
    const policy = await loadCurrentProjectSemanticAnalyticsPolicy(db, policyInput());
    expect(policy?.context).toMatchObject({
      enabled: true,
      principal: "server_writer",
      businessMeasurementAllowed: true,
      catalogRevision: 1,
      maxProperties: 2,
      minimumPrivacy: "strict"
    });
    expect(policy?.limits.monthly_analytics_events).toBe(3_750_000);
    const event = JSON.parse(
      readFileSync(new URL("../fixtures/analytics-semantic-event.json", import.meta.url), "utf8")
    );
    const admitted = admitSemanticAnalyticsEvent(event, policy!.context);
    expect(admitted.accepted).toBe(true);
    if (!admitted.accepted) return;
    expect(
      await recheckProjectSemanticAnalyticsAdmission(db, policyInput(), admitted, policy!)
    ).toBe(true);
    await pool.query(
      "UPDATE analytics_project_plans SET business_measurement_enabled=false WHERE project_id=$1",
      [projectId]
    );
    expect(
      await recheckProjectSemanticAnalyticsAdmission(db, policyInput(), admitted, policy!)
    ).toBe(false);
  });

  it("derives the maximum event age instead of accepting a caller-selected correction horizon", async () => {
    await pool.query(
      "UPDATE analytics_project_plans SET business_measurement_enabled=true WHERE project_id=$1",
      [projectId]
    );
    const policy = await loadCurrentProjectSemanticAnalyticsPolicy(db, policyInput());
    expect(policy?.context.earliestOccurredAt).toBe("2026-09-21T10:01:00.000Z");
    const forgedInput = {
      ...policyInput(),
      earliestOccurredAt: "2026-08-28T10:01:00.000Z"
    };
    expect(await loadCurrentProjectSemanticAnalyticsPolicy(db, forgedInput)).toBeNull();
    const boundary = { ...serverEvent(), occurred_at: "2026-09-21T10:01:00.000Z" };
    expect(admitSemanticAnalyticsEvent(boundary, policy!.context).accepted).toBe(true);
    expect(
      admitSemanticAnalyticsEvent(
        { ...boundary, occurred_at: "2026-09-21T10:00:59.999Z" },
        policy!.context
      )
    ).toEqual({ accepted: false, reason: "outside_correction_window" });
  });

  it("acknowledges an unchanged old retry only while its durable receipt still exists", async () => {
    await pool.query(
      "UPDATE analytics_project_plans SET business_measurement_enabled=true WHERE project_id=$1",
      [projectId]
    );
    const receipts = createSemanticAnalyticsReceiptStore(db);
    const event = serverEvent();
    const first = await persistAt(receipts, objectStore, {
      policy: policyInput(),
      event
    });
    expect(first.kind).toBe("accepted");
    const laterPolicy = { ...policyInput(), receivedAt: "2026-10-06T10:01:00.000Z" };
    const replayAt = (candidate: unknown) =>
      persistAt(
        receipts,
        objectStore,
        { policy: laterPolicy, event: candidate },
        laterPolicy.receivedAt
      );
    const replay = await replayAt(event);
    expect(replay).toEqual({ ...first, duplicate: true });
    expect(await replayAt({ ...event, operation_id: `sha256:${"e".repeat(64)}` })).toEqual({
      kind: "event_id_conflict"
    });
    expect(
      await replayAt({ ...event, event_id: randomUUID(), operation_id: `sha256:${"e".repeat(64)}` })
    ).toEqual({ kind: "rejected", reason: "outside_correction_window" });
    await pool.query(
      "UPDATE analytics_project_plans SET business_measurement_enabled=false WHERE project_id=$1",
      [projectId]
    );
    expect(await replayAt(event)).toEqual({
      kind: "rejected",
      reason: "purpose_not_authorized"
    });
    await pool.query(
      "UPDATE analytics_project_plans SET business_measurement_enabled=true WHERE project_id=$1",
      [projectId]
    );
    await pool.query("DELETE FROM semantic_analytics_receipts WHERE project_id=$1", [projectId]);
    expect(await replayAt(event)).toEqual({
      kind: "rejected",
      reason: "outside_correction_window"
    });
    expect((await pool.query("SELECT count(*) FROM analytics_usage_claims")).rows[0]?.count).toBe(
      "1"
    );
  });

  it("rejects an ACK if the billing tier changes after admission", async () => {
    await pool.query(
      "UPDATE analytics_project_plans SET business_measurement_enabled=true WHERE project_id=$1",
      [projectId]
    );
    const policy = await loadCurrentProjectSemanticAnalyticsPolicy(db, policyInput());
    const event = JSON.parse(
      readFileSync(new URL("../fixtures/analytics-semantic-event.json", import.meta.url), "utf8")
    );
    const admitted = admitSemanticAnalyticsEvent(event, policy!.context);
    expect(admitted.accepted).toBe(true);
    if (!admitted.accepted) return;
    await pool.query("UPDATE organizations SET plan='solo' WHERE id=$1", [organizationId]);
    expect(
      await recheckProjectSemanticAnalyticsAdmission(db, policyInput(), admitted, policy!)
    ).toBe(false);
  });

  it("uses paid capacity units and fences a purchased-capacity reduction before ACK", async () => {
    await pool.query(
      "UPDATE analytics_project_plans SET business_measurement_enabled=true WHERE project_id=$1",
      [projectId]
    );
    await pool.query("UPDATE organizations SET additional_capacity_units=2 WHERE id=$1", [
      organizationId
    ]);
    const policy = await loadCurrentProjectSemanticAnalyticsPolicy(db, policyInput());
    expect(policy?.limits).toMatchObject({
      monthly_analytics_events: 4_250_000,
      monthly_analytics_sessions: 850_000
    });
    const admitted = admitSemanticAnalyticsEvent(serverEvent(), policy!.context);
    expect(admitted.accepted).toBe(true);
    if (!admitted.accepted) return;
    await pool.query("UPDATE organizations SET additional_capacity_units=0 WHERE id=$1", [
      organizationId
    ]);
    expect(
      await recheckProjectSemanticAnalyticsAdmission(db, policyInput(), admitted, policy!)
    ).toBe(false);
  });

  it("uses the exact last paid capacity unit once without over-claiming quota", async () => {
    await pool.query(
      "UPDATE analytics_project_plans SET business_measurement_enabled=true WHERE project_id=$1",
      [projectId]
    );
    await pool.query(
      `INSERT INTO analytics_usage_counters(organization_id,period_starts_at,analytics_events)
       VALUES($1,'2026-09-01T00:00:00.000Z',3749999)`,
      [organizationId]
    );
    const receipts = createSemanticAnalyticsReceiptStore(db);
    const first = await persistAt(receipts, objectStore, {
      policy: policyInput(),
      event: serverEvent()
    });
    expect(first.kind).toBe("accepted");
    const surplus = await persistAt(receipts, objectStore, {
      policy: policyInput(),
      event: {
        ...serverEvent(),
        event_id: randomUUID(),
        operation_id: `sha256:${"f".repeat(64)}`
      }
    });
    expect(surplus).toEqual({ kind: "quota_exceeded" });
    expect(
      (await pool.query("SELECT analytics_events FROM analytics_usage_counters")).rows[0]
        ?.analytics_events
    ).toBe(3_750_000);
    expect(
      (await pool.query("SELECT count(*) FROM semantic_analytics_receipts")).rows[0]?.count
    ).toBe("1");
  });

  it("does not persist a financial fact before a trusted billing-source namespace exists", async () => {
    const paymentCatalog = [{ ...catalog[0]!, name: "payment.succeeded", properties: {} }];
    await pool.query(
      "UPDATE analytics_project_catalogs SET entries=$2::jsonb WHERE project_id=$1",
      [projectId, JSON.stringify(paymentCatalog)]
    );
    await pool.query(
      "UPDATE analytics_project_plans SET catalog=$2::jsonb,business_measurement_enabled=true WHERE project_id=$1",
      [projectId, JSON.stringify(paymentCatalog)]
    );
    const base = serverEvent();
    const payment = SemanticAnalyticsEventSchema.parse({
      ...base,
      payload: {
        ...base.payload,
        name: "payment.succeeded",
        properties: {},
        money: { amount_minor: "1000", currency: "USD", exponent: 2 },
        financial: {
          kind: "payment",
          payment_id: `sha256:${"b".repeat(64)}`,
          subscription_id: null
        }
      }
    });
    expect(
      await persistAt(createSemanticAnalyticsReceiptStore(db), objectStore, {
        policy: policyInput(),
        event: payment
      })
    ).toEqual({ kind: "rejected", reason: "source_not_authorized" });
    expect(
      (await pool.query("SELECT count(*) FROM semantic_analytics_receipts")).rows[0]?.count
    ).toBe("0");
    expect(
      (await pool.query("SELECT count(*) FROM semantic_analytics_pending_objects")).rows[0]?.count
    ).toBe("0");
    expect((await pool.query("SELECT count(*) FROM analytics_usage_claims")).rows[0]?.count).toBe(
      "0"
    );
  });

  it("charges the organization's active billing period from current policy", async () => {
    await pool.query(
      "UPDATE analytics_project_plans SET business_measurement_enabled=true WHERE project_id=$1",
      [projectId]
    );
    await pool.query(
      `UPDATE organizations SET billing_period_starts_at='2026-09-15T00:00:00.000Z',
        billing_period_ends_at='2026-10-15T00:00:00.000Z' WHERE id=$1`,
      [organizationId]
    );
    const result = await persistAt(createSemanticAnalyticsReceiptStore(db), objectStore, {
      policy: policyInput(),
      event: serverEvent()
    });
    expect(result.kind).toBe("accepted");
    expect(
      (
        await pool.query<{ period_starts_at: Date }>(
          "SELECT period_starts_at FROM analytics_usage_counters WHERE organization_id=$1",
          [organizationId]
        )
      ).rows[0]?.period_starts_at.toISOString()
    ).toBe("2026-09-15T00:00:00.000Z");
  });

  it("rejects stale paid billing periods and a period change during the protected write", async () => {
    await pool.query(
      "UPDATE analytics_project_plans SET business_measurement_enabled=true WHERE project_id=$1",
      [projectId]
    );
    await pool.query(
      `UPDATE organizations SET billing_period_starts_at='2026-08-15T00:00:00.000Z',
        billing_period_ends_at='2026-09-15T00:00:00.000Z' WHERE id=$1`,
      [organizationId]
    );
    expect(await loadCurrentProjectSemanticAnalyticsPolicy(db, policyInput())).toBeNull();
    await pool.query(
      `UPDATE organizations SET billing_period_starts_at='2026-09-15T00:00:00.000Z',
        billing_period_ends_at='2026-10-15T00:00:00.000Z' WHERE id=$1`,
      [organizationId]
    );
    const result = await persistAt(
      createSemanticAnalyticsReceiptStore(db),
      {
        putObject: async (request) => {
          await objectStore.putObject(request);
          await pool.query(
            "UPDATE organizations SET billing_period_ends_at='2026-10-16T00:00:00.000Z' WHERE id=$1",
            [organizationId]
          );
        }
      },
      { policy: policyInput(), event: serverEvent() }
    );
    expect(result).toEqual({ kind: "authority_changed" });
    expect((await pool.query("SELECT count(*) FROM analytics_usage_counters")).rows[0]?.count).toBe(
      "0"
    );
  });

  it("fails closed on disabled settings, stale catalog or revoked writer", async () => {
    expect(await loadCurrentProjectSemanticAnalyticsPolicy(db, policyInput())).not.toBeNull();
    await pool.query("UPDATE project_analytics_settings SET enabled=false WHERE project_id=$1", [
      projectId
    ]);
    expect(await loadCurrentProjectSemanticAnalyticsPolicy(db, policyInput())).toBeNull();
    await pool.query("UPDATE project_analytics_settings SET enabled=true WHERE project_id=$1", [
      projectId
    ]);
    await pool.query("UPDATE analytics_project_plans SET catalog_revision=0 WHERE project_id=$1", [
      projectId
    ]);
    expect(await loadCurrentProjectSemanticAnalyticsPolicy(db, policyInput())).toBeNull();
    await pool.query("UPDATE analytics_project_plans SET catalog_revision=1 WHERE project_id=$1", [
      projectId
    ]);
    await pool.query("UPDATE analytics_writers SET revoked_at=now() WHERE id=$1", [writerId]);
    expect(await loadCurrentProjectSemanticAnalyticsPolicy(db, policyInput())).toBeNull();
  });

  it("rejects a credential for another project and a relay principal with a server writer", async () => {
    expect(
      await loadCurrentProjectSemanticAnalyticsPolicy(db, {
        ...policyInput(),
        projectId: randomUUID()
      })
    ).toBeNull();
    expect(
      await loadCurrentProjectSemanticAnalyticsPolicy(db, { ...policyInput(), principal: "relay" })
    ).toBeNull();
  });

  it("keeps direct project tokens client-only and checks revocation", async () => {
    const tokenHash = "d".repeat(64);
    const tokenId = randomUUID();
    await pool.query(
      "INSERT INTO project_tokens(id,project_id,token_hash,label) VALUES($1,$2,$3,'Browser')",
      [tokenId, projectId, tokenHash]
    );
    await pool.query(
      "UPDATE analytics_project_plans SET business_measurement_enabled=true WHERE project_id=$1",
      [projectId]
    );
    const direct = await loadCurrentProjectSemanticAnalyticsPolicy(db, {
      ...policyInput(),
      principal: "project_token",
      credentialHash: tokenHash
    });
    expect(direct?.context.principal).toBe("project_token");
    expect(direct?.context.businessMeasurementAllowed).toBe(false);
    const event = JSON.parse(
      readFileSync(new URL("../fixtures/analytics-semantic-event.json", import.meta.url), "utf8")
    );
    expect(admitSemanticAnalyticsEvent(event, direct!.context)).toEqual({
      accepted: false,
      reason: "source_not_authorized"
    });
    await pool.query("UPDATE project_tokens SET revoked_at=now() WHERE id=$1", [tokenId]);
    expect(
      await loadCurrentProjectSemanticAnalyticsPolicy(db, {
        ...policyInput(),
        principal: "project_token",
        credentialHash: tokenHash
      })
    ).toBeNull();
  });

  it("holds tier and issuer authority stable through a receipt transaction", async () => {
    await db.transaction!(async (tx) => {
      expect(await loadCurrentProjectSemanticAnalyticsPolicy(tx, policyInput())).not.toBeNull();
      const racer = await pool.connect();
      try {
        const attempts: Array<{ sql: string; params: string[] }> = [
          { sql: "UPDATE organizations SET plan='solo' WHERE id=$1", params: [organizationId] },
          {
            sql: "UPDATE organization_members SET suspended_at=now() WHERE organization_id=$1 AND user_id=$2",
            params: [organizationId, ownerUserId]
          }
        ];
        for (const { sql, params } of attempts) {
          await racer.query("BEGIN");
          await racer.query("SET LOCAL lock_timeout='50ms'");
          await expect(racer.query(sql, params)).rejects.toMatchObject({ code: "55P03" });
          await racer.query("ROLLBACK");
        }
      } finally {
        racer.release();
      }
    });
  });
});
