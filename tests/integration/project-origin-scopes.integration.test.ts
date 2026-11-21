import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { bootstrapStorageSchema } from "../../packages/storage/src/migrations.js";
import { migrateStorageSchema } from "../../packages/storage/src/schema-migrations.js";
import { createPostgresAlertGroupInspectionStore } from "../../packages/storage/src/alert-group-inspection.js";
import { createPostgresAlertDeliveryStore } from "../../packages/storage/src/alert-delivery-store.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration,
  seedOwnedProject
} from "../helpers/integration-setup.js";

runIntegration("canonical ownership with preserved project origins", () => {
  const pool = createIntegrationPool();
  const db = createQueryable(pool);
  beforeAll(async () => {
    await bootstrapStorageSchema(db);
    await migrateStorageSchema(db);
  });
  afterAll(async () => {
    await pool.end();
  });
  async function fixture() {
    const organizationId = randomUUID();
    const ownerUserId = randomUUID();
    const target = randomUUID();
    await seedOwnedProject({
      pool,
      organizationId,
      projectId: target,
      organizationName: "Origins",
      organizationSlug: organizationId,
      projectName: "System",
      projectSlug: target,
      ownerUserId,
      organizationPlan: "team"
    });
    const source = randomUUID();
    const later = randomUUID();
    for (const id of [source, later])
      await pool.query(
        "INSERT INTO projects(id,organization_id,owner_user_id,name,slug) VALUES($1::uuid,$2,$3,'Component',$1::text)",
        [id, organizationId, ownerUserId]
      );
    const operationId = randomUUID();
    await pool.query(
      "INSERT INTO project_merge_operations(id,organization_id,actor_user_id,target_project_id,idempotency_key,request,plan_digest,state) VALUES($1::uuid,$2,$3,$4,$1::text,'{}',$5,'queued')",
      [operationId, organizationId, ownerUserId, target, "a".repeat(64)]
    );
    return { organizationId, ownerUserId, target, source, later, operationId };
  }
  it("keeps old reads narrow and flattens later merges without changing their former scope", async () => {
    const f = await fixture();
    await pool.query(
      "INSERT INTO project_legacy_bindings(legacy_project_id,canonical_project_id,scope_origin_ids,operation_id) VALUES($1,$2,ARRAY[$1::uuid],$3)",
      [f.source, f.target, f.operationId]
    );
    const origins = async (id: string): Promise<string[]> =>
      (await pool.query<{ ids: string[] }>("SELECT debugbundle_project_origins($1) AS ids", [id]))
        .rows[0]!.ids;
    expect(await origins(f.source)).toEqual([f.source]);
    expect(await origins(f.target)).toEqual([f.target, f.source].sort());
    await pool.query(
      "UPDATE project_legacy_bindings SET canonical_project_id=$1 WHERE canonical_project_id=$2",
      [f.later, f.target]
    );
    await pool.query(
      "INSERT INTO project_legacy_bindings(legacy_project_id,canonical_project_id,scope_origin_ids,operation_id) VALUES($1,$2,$3,$4)",
      [f.target, f.later, [f.target, f.source].sort(), f.operationId]
    );
    expect(await origins(f.source)).toEqual([f.source]);
    expect(await origins(f.target)).toEqual([f.target, f.source].sort());
    expect(await origins(f.later)).toEqual([f.target, f.source, f.later].sort());
    expect(
      (
        await pool.query<{ id: string }>("SELECT debugbundle_canonical_project($1) AS id", [
          f.source
        ])
      ).rows[0]!.id
    ).toBe(f.later);
    await expect(pool.query("DELETE FROM projects WHERE id=$1", [f.source])).rejects.toThrow(
      "project_consolidated"
    );
    await expect(pool.query("DELETE FROM projects WHERE id=$1", [f.later])).rejects.toThrow(
      "project_has_origins"
    );
  });
  it("rejects cross-owner bindings and alias cycles at the storage boundary", async () => {
    const f = await fixture();
    const other = await fixture();
    await expect(
      pool.query(
        "INSERT INTO project_legacy_bindings(legacy_project_id,canonical_project_id,scope_origin_ids,operation_id) VALUES($1,$2,ARRAY[$1::uuid],$3)",
        [f.source, other.target, f.operationId]
      )
    ).rejects.toThrow("project_binding_scope_mismatch");
    await pool.query(
      "INSERT INTO project_legacy_bindings(legacy_project_id,canonical_project_id,scope_origin_ids,operation_id) VALUES($1,$2,ARRAY[$1::uuid],$3)",
      [f.source, f.target, f.operationId]
    );
    await expect(
      pool.query(
        "INSERT INTO project_legacy_bindings(legacy_project_id,canonical_project_id,scope_origin_ids,operation_id) VALUES($1,$2,ARRAY[$1::uuid],$3)",
        [f.target, f.source, f.operationId]
      )
    ).rejects.toThrow("project_binding_target_is_alias");
  });

  it("shows deliveries created under retained origins without exposing sibling or foreign history", async () => {
    const f = await fixture();
    const other = await fixture();
    await pool.query(
      "INSERT INTO project_legacy_bindings(legacy_project_id,canonical_project_id,scope_origin_ids,operation_id) VALUES($1,$2,ARRAY[$1::uuid],$3)",
      [f.source, f.target, f.operationId]
    );
    const [sourceIncident, targetIncident, slackRule, emailRule] = Array.from({ length: 4 }, () =>
      randomUUID()
    ) as [string, string, string, string];
    for (const [id, project] of [
      [sourceIncident, f.source],
      [targetIncident, f.target]
    ]) {
      await pool.query(
        `INSERT INTO incidents(id, project_id, environment, fingerprint, fingerprint_version,
          title, severity, status, first_seen_at, last_seen_at, occurrence_count)
         VALUES ($1::uuid, $2, 'production', $1::text, 'v2', 'Failure', 'high', 'open', now(), now(), 1)`,
        [id, project]
      );
    }
    for (const [rule, channel] of [
      [slackRule, "slack"],
      [emailRule, "email"]
    ]) {
      await pool.query(
        `INSERT INTO alert_rules(id, project_id, created_by_user_id, channel, condition_type,
          cooldown_seconds, config, is_enabled, scope_origin_ids)
         VALUES ($1,$2,$3,$4,'new_incident',0,'{}',true,debugbundle_project_origins($2))`,
        [rule, f.target, f.ownerUserId, channel]
      );
    }
    const delivery = createPostgresAlertDeliveryStore(db);
    const intent = {
      condition_type: "new_incident" as const,
      dedupe_key: "new_incident",
      cooldown_seconds: 0,
      payload: { secret: "never in group history" }
    };
    const sourceSlack = await delivery.createAlertDeliveryIntent({
      ...intent,
      alert_id: slackRule,
      project_id: f.source,
      incident_id: sourceIncident,
      notification_key: sourceIncident,
      channel: "slack"
    });
    const targetSlack = await delivery.createAlertDeliveryIntent({
      ...intent,
      alert_id: slackRule,
      project_id: f.target,
      incident_id: targetIncident,
      notification_key: targetIncident,
      channel: "slack"
    });
    const email = await delivery.queueAlertEmailDigestItem({
      ...intent,
      alert_id: emailRule,
      project_id: f.source,
      incident_id: sourceIncident,
      notification_key: sourceIncident,
      recipient: "private@example.test",
      aggregation_window_seconds: 10,
      allow_new_digest: true
    });
    if (!sourceSlack.delivery_id || !targetSlack.delivery_id || !email.digest_id) {
      throw new Error("Fixture failed to create the alert groups");
    }

    const inspection = createPostgresAlertGroupInspectionStore(db);
    const scope = { organization_id: f.organizationId, project_id: f.target, limit: 10 };
    const canonical = await inspection.listGroupsForOrganization(scope);
    expect(canonical?.groups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          group_id: sourceSlack.delivery_id,
          alert_id: slackRule,
          member_count: 1
        }),
        expect.objectContaining({ group_id: targetSlack.delivery_id, member_count: 1 }),
        expect.objectContaining({ group_id: email.digest_id, member_count: 1 })
      ])
    );
    const retained = { ...scope, project_id: f.source };
    const retainedGroups = await inspection.listGroupsForOrganization(retained);
    expect(retainedGroups?.groups).toHaveLength(2);
    expect(
      retainedGroups?.groups.find((group) => group.group_id === sourceSlack.delivery_id)
    ).toMatchObject({ alert_id: null, root_incident_id: sourceIncident, member_count: 1 });
    for (const view of [scope, retained]) {
      const detail = await inspection.getGroupForOrganization({
        ...view,
        group_id: email.digest_id,
        kind: "email_digest"
      });
      expect(detail?.members).toEqual([expect.objectContaining({ incident_id: sourceIncident })]);
      expect(JSON.stringify(detail)).not.toContain("private@example.test");
      expect(JSON.stringify(detail)).not.toContain("never in group history");
    }
    expect(
      await inspection.getGroupForOrganization({
        ...retained,
        group_id: targetSlack.delivery_id,
        kind: "direct"
      })
    ).toBeNull();
    const authorizedBeforeMerge = { ...scope, authorized_origin_ids: [f.target] };
    expect((await inspection.listGroupsForOrganization(authorizedBeforeMerge))?.groups).toEqual([
      expect.objectContaining({ group_id: targetSlack.delivery_id })
    ]);
    expect(
      await inspection.getGroupForOrganization({
        ...authorizedBeforeMerge,
        group_id: email.digest_id,
        kind: "email_digest"
      })
    ).toBeNull();
    expect(
      await inspection.getGroupForOrganization({
        ...scope,
        organization_id: other.organizationId,
        group_id: email.digest_id,
        kind: "email_digest"
      })
    ).toBeNull();
  });
});
