import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { bootstrapStorageSchema } from "../../packages/storage/src/migrations.js";
import { migrateStorageSchema } from "../../packages/storage/src/schema-migrations.js";
import { createProjectMergeStore } from "../../packages/storage/src/project-merge-store.js";
import { createServiceDefinitionStore } from "../../packages/storage/src/service-definition-store.js";
import { createMetadataAlerts } from "../../packages/storage/src/metadata-alerts.js";
import { createPostgresAlertDeliveryStore } from "../../packages/storage/src/alert-delivery-store.js";
import { createPostgresWebhookDeliveryStore } from "../../packages/storage/src/webhook-delivery-store.js";
import { createPostgresGitHubStore } from "../../packages/storage/src/github-store.js";
import { seedExternalProjectCollaborator } from "../helpers/shared-project-collaborator.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration,
  seedOwnedProject
} from "../helpers/integration-setup.js";

runIntegration("consolidated automation snapshots and management", () => {
  const pool = createIntegrationPool(),
    db = createQueryable(pool);
  const alerts = createMetadataAlerts(db),
    delivery = createPostgresAlertDeliveryStore(db),
    webhooks = createPostgresWebhookDeliveryStore(db);
  beforeAll(async () => {
    await bootstrapStorageSchema(db);
    await migrateStorageSchema(db);
  });
  afterAll(async () => {
    await pool.end();
  });
  it("does not turn service metadata into automation authority over another same-account project", async () => {
    const f = await fixture(),
      github = createPostgresGitHubStore(db),
      other = randomUUID();
    const collaborator = await seedExternalProjectCollaborator(pool, [f.target, f.source]);
    await pool.query(
      "INSERT INTO projects(id,organization_id,owner_user_id,name,slug) VALUES($1::uuid,$2,$3,'Private other',$1::text)",
      [other, f.organizationId, f.userId]
    );
    const installation = await github.upsertGitHubInstallationForOrganization({
      organization_id: f.organizationId,
      installation_id: Number.parseInt(f.target.replaceAll("-", "").slice(0, 12), 16),
      account_login: "fixture",
      account_type: "User",
      status: "active"
    });
    for (const [project, repo] of [
      [f.target, "system"],
      [f.source, "web"],
      [other, "private-other"]
    ])
      await github.upsertProjectGitHubRepoForOrganization({
        organization_id: f.organizationId,
        project_id: project!,
        installation_id: installation.id,
        repo_owner: "fixture",
        repo_name: repo!,
        default_branch: "main"
      });
    await f.definitions.update({
      project_id: f.source,
      user_id: collaborator,
      service_definition_id: f.web.service_definition_id,
      repository_url: "https://github.com/fixture/private-other"
    });
    await f.consolidate();
    const rule = await github.createProjectGitHubRuleForOrganization({
      ...f.scope(f.target),
      created_by_user_id: collaborator,
      name: "Site dispatch",
      enabled: true,
      event_types: ["bundle.created"],
      environments: [],
      services: ["Site"],
      severity_min: null,
      bundle_type: null,
      incident_status: "new_or_reopened",
      cooldown_seconds: 60
    });
    expect(rule).not.toBeNull();
    expect(
      await github.listMatchingGitHubDispatchRules({
        project_id: f.source,
        event_type: "bundle.created",
        service_name: "web",
        environment: "production",
        severity: "high",
        bundle_type: "failure",
        incident_status: "new_or_reopened"
      })
    ).toEqual([]);
  });
  it("keeps a retained repository binding manageable without changing another origin", async () => {
    const f = await fixture(),
      github = createPostgresGitHubStore(db);
    const collaborator = await seedExternalProjectCollaborator(pool, [f.target, f.source]);
    const installation = await github.upsertGitHubInstallationForOrganization({
      organization_id: f.organizationId,
      installation_id: Number.parseInt(f.target.replaceAll("-", "").slice(0, 12), 16),
      account_login: "fixture",
      account_type: "User",
      status: "active"
    });
    const assign = (project: string, name: string, actor: string = f.userId) =>
      github.upsertProjectGitHubRepoForOrganization({
        actor_user_id: actor,
        organization_id: f.organizationId,
        project_id: project,
        installation_id: installation.id,
        repo_owner: "fixture",
        repo_name: name,
        default_branch: "main"
      });
    await assign(f.target, "system");
    const original = await assign(f.source, "site");
    await f.consolidate();
    expect(await assign(f.source, "site-renamed", collaborator)).toMatchObject({
      id: original!.id,
      project_id: f.source,
      repo_name: "site-renamed"
    });
    expect(
      await github.getProjectGitHubRepoForOrganization({
        organization_id: f.organizationId,
        project_id: f.target
      })
    ).toMatchObject({ repo_name: "system" });
    await pool.query("DELETE FROM project_members WHERE project_id=$1 AND user_id=$2", [
      f.target,
      collaborator
    ]);
    expect(await assign(f.source, "forbidden", collaborator)).toBeNull();
    expect(
      await github.deleteProjectGitHubRepoForOrganization({
        organization_id: f.organizationId,
        project_id: f.source,
        actor_user_id: collaborator
      })
    ).toBe(false);
    expect(
      await github.getProjectGitHubRepoForOrganization({
        organization_id: f.organizationId,
        project_id: f.source
      })
    ).toMatchObject({ repo_name: "site-renamed" });
    expect(
      await github.deleteProjectGitHubRepoForOrganization({
        organization_id: f.organizationId,
        project_id: f.source,
        actor_user_id: f.userId
      })
    ).toBe(true);
    expect(
      await github.getProjectGitHubRepoForOrganization({
        organization_id: f.organizationId,
        project_id: f.target
      })
    ).toMatchObject({ repo_name: "system" });
  });
  it("allows only the current account owner to disconnect retained bindings through the installation cascade", async () => {
    const f = await fixture(),
      github = createPostgresGitHubStore(db);
    const collaborator = await seedExternalProjectCollaborator(pool, [f.target, f.source]);
    const installation = await github.upsertGitHubInstallationForOrganization({
      organization_id: f.organizationId,
      installation_id: Number.parseInt(f.target.replaceAll("-", "").slice(0, 12), 16),
      account_login: "fixture",
      account_type: "User",
      status: "active"
    });
    for (const project of [f.target, f.source])
      await github.upsertProjectGitHubRepoForOrganization({
        organization_id: f.organizationId,
        project_id: project,
        installation_id: installation.id,
        repo_owner: "fixture",
        repo_name: project,
        default_branch: "main"
      });
    await f.consolidate();
    await expect(
      pool.query("DELETE FROM project_github_repos WHERE project_id=$1", [f.source])
    ).rejects.toThrow("project_consolidated");
    expect(
      await github.deleteGitHubInstallationForOrganization({
        organization_id: f.organizationId,
        actor_user_id: collaborator
      })
    ).toBe(false);
    expect(
      await github.deleteGitHubInstallationForOrganization({
        organization_id: f.organizationId,
        actor_user_id: f.userId
      })
    ).toBe(true);
    expect(
      (
        await pool.query("SELECT id FROM project_github_repos WHERE project_id=ANY($1::uuid[])", [
          [f.target, f.source]
        ])
      ).rows
    ).toEqual([]);
    expect(
      (await pool.query("SELECT id FROM projects WHERE id=ANY($1::uuid[])", [[f.target, f.source]]))
        .rows
    ).toHaveLength(2);
  });
  it("bounds installation disconnect behind the account merge fence", async () => {
    const f = await fixture(),
      github = createPostgresGitHubStore(db);
    await github.upsertGitHubInstallationForOrganization({
      organization_id: f.organizationId,
      installation_id: Number.parseInt(f.target.replaceAll("-", "").slice(0, 12), 16),
      account_login: "fixture",
      account_type: "User",
      status: "active"
    });
    const lock = await pool.connect();
    try {
      await lock.query("BEGIN");
      await lock.query("SELECT id FROM organizations WHERE id=$1 FOR SHARE", [f.organizationId]);
      await expect(
        github.deleteGitHubInstallationForOrganization({
          organization_id: f.organizationId,
          actor_user_id: f.userId
        })
      ).rejects.toMatchObject({ message: "project_configuration_busy", code: "40001" });
    } finally {
      await lock.query("ROLLBACK");
      lock.release();
    }
    expect(
      await github.getGitHubInstallationForOrganization({ organization_id: f.organizationId })
    ).not.toBeNull();
    expect(
      await github.deleteGitHubInstallationForOrganization({ organization_id: f.organizationId })
    ).toBe(true);
  });
  it("preserves original GitHub repositories and scopes while new rules resolve the matching service repository", async () => {
    const f = await fixture(),
      github = createPostgresGitHubStore(db);
    const install = await github.upsertGitHubInstallationForOrganization({
      organization_id: f.organizationId,
      installation_id: Number.parseInt(f.target.replaceAll("-", "").slice(0, 12), 16),
      account_login: "fixture",
      account_type: "User",
      status: "active"
    });
    for (const [id, repo] of [
      [f.target, "system"],
      [f.source, "web"]
    ])
      await github.upsertProjectGitHubRepoForOrganization({
        organization_id: f.organizationId,
        project_id: id!,
        installation_id: install.id,
        repo_owner: "fixture",
        repo_name: repo!,
        default_branch: "main"
      });
    const create = (id: string, services: string[] = []) =>
      github.createProjectGitHubRuleForOrganization({
        ...f.scope(id),
        name: "Dispatch",
        enabled: true,
        event_types: ["bundle.created"],
        environments: [],
        services,
        severity_min: null,
        bundle_type: null,
        incident_status: "new_or_reopened",
        cooldown_seconds: 60
      });
    const targetRule = await create(f.target),
      sourceRule = await create(f.source, ["web"]);
    await f.consolidate();
    const global = await create(f.target, ["Site"]);
    const matched = await github.listMatchingGitHubDispatchRules({
      project_id: f.source,
      event_type: "bundle.created",
      service_name: "web",
      environment: "production",
      severity: "high",
      bundle_type: "failure",
      incident_status: "new_or_reopened"
    });
    expect(matched.map((r) => [r.rule_id, r.repo_name]).sort()).toEqual(
      [
        [sourceRule!.rule_id, "web"],
        [global!.rule_id, "web"]
      ].sort()
    );
    expect(matched.some((r) => r.rule_id === targetRule!.rule_id)).toBe(false);
    expect(
      (
        await github.listProjectGitHubRulesForOrganization({
          organization_id: f.organizationId,
          project_id: f.target
        })
      )
        ?.map((r) => r.rule_id)
        .sort()
    ).toEqual([targetRule!.rule_id, sourceRule!.rule_id, global!.rule_id].sort());
    expect(
      (
        await github.listProjectGitHubRulesForOrganization({
          organization_id: f.organizationId,
          project_id: f.target
        })
      )?.find((r) => r.rule_id === sourceRule!.rule_id)?.services
    ).toEqual(["Site"]);
    await github.updateProjectGitHubRuleForOrganization({
      organization_id: f.organizationId,
      project_id: f.target,
      rule_id: sourceRule!.rule_id,
      actor_user_id: f.userId,
      actor_role: "owner",
      services: ["Site"],
      cooldown_seconds: 120
    });
    expect(
      (
        await pool.query(
          "SELECT project_id,scope_origin_ids,filter_project_id,cooldown_seconds FROM github_dispatch_rules WHERE id=$1",
          [sourceRule!.rule_id]
        )
      ).rows[0]
    ).toEqual({
      project_id: f.source,
      scope_origin_ids: [f.source],
      filter_project_id: f.target,
      cooldown_seconds: 120
    });
  });
  it("rejects a foreign account's GitHub installation before changing repository context", async () => {
    const f = await fixture(),
      other = await fixture(),
      github = createPostgresGitHubStore(db);
    const installation = await github.upsertGitHubInstallationForOrganization({
      organization_id: other.organizationId,
      installation_id: Number.parseInt(other.target.replaceAll("-", "").slice(0, 12), 16),
      account_login: "other",
      account_type: "User",
      status: "active"
    });
    expect(
      await github.upsertProjectGitHubRepoForOrganization({
        organization_id: f.organizationId,
        project_id: f.target,
        actor_user_id: f.userId,
        installation_id: installation.id,
        repo_owner: "other",
        repo_name: "private",
        default_branch: "main"
      })
    ).toBeNull();
    expect(
      (await pool.query("SELECT id FROM project_github_repos WHERE project_id=$1", [f.target])).rows
    ).toEqual([]);
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
      organizationName: "Automation",
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
    const scope = (projectId: string) => ({
      organization_id: organizationId,
      project_id: projectId,
      created_by_user_id: userId
    });
    const newAlert = (projectId: string) =>
      alerts.createAlertForOrganization({
        ...scope(projectId),
        channel: "email",
        condition_type: "new_incident",
        cooldown_seconds: 60,
        config: { recipient: "owner@example.test" },
        is_enabled: true
      });
    const newWebhook = (projectId: string, services: string[] = []) =>
      webhooks.createWebhookForOrganization({
        ...scope(projectId),
        url: "https://example.test/hook",
        signing_secret: "preserved-fixture-secret",
        events: ["bundle.created"],
        filters: { service: services },
        is_enabled: true
      });
    const consolidate = async () => {
      const store = createProjectMergeStore(db, { enabled: true });
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
      const plan = await store.preview({ user_id: userId, request });
      expect(plan.blockers).toEqual([]);
      await store.apply({
        user_id: userId,
        request,
        plan_digest: plan.plan_digest,
        idempotency_key: randomUUID()
      });
    };
    const matchAlert = (projectId: string, service: string) =>
      delivery.listMatchingAlerts({
        project_id: projectId,
        service_name: service,
        environment: "production",
        condition_type: "new_incident",
        severity: "high"
      });
    const matchWebhook = (projectId: string, service: string) =>
      webhooks.listMatchingWebhooks({
        project_id: projectId,
        service_name: service,
        environment: "production",
        event_type: "bundle.created",
        severity: "high"
      });
    return {
      organizationId,
      userId,
      target,
      source,
      definitions,
      web,
      scope,
      newAlert,
      newWebhook,
      consolidate,
      matchAlert,
      matchWebhook
    };
  }
  it("retains both old project-wide rule scopes and applies newly created rules across the current project", async () => {
    const f = await fixture();
    const oldTarget = await f.newAlert(f.target),
      oldSource = await f.newAlert(f.source);
    const hookTarget = await f.newWebhook(f.target),
      hookSource = await f.newWebhook(f.source);
    await f.consolidate();
    const global = await f.newAlert(f.target),
      hookGlobal = await f.newWebhook(f.target);
    expect((await f.matchAlert(f.target, "api")).map((a) => a.alert_id).sort()).toEqual(
      [oldTarget!.alert_id, global!.alert_id].sort()
    );
    expect((await f.matchAlert(f.source, "web")).map((a) => a.alert_id).sort()).toEqual(
      [oldSource!.alert_id, global!.alert_id].sort()
    );
    expect((await f.matchWebhook(f.target, "api")).map((a) => a.webhook_id).sort()).toEqual(
      [hookTarget!.webhook_id, hookGlobal!.webhook_id].sort()
    );
    expect((await f.matchWebhook(f.source, "web")).map((a) => a.webhook_id).sort()).toEqual(
      [hookSource!.webhook_id, hookGlobal!.webhook_id].sort()
    );
    expect(
      (
        await alerts.listAlertsForOrganization({
          organization_id: f.organizationId,
          project_id: f.target,
          limit: 100
        })
      )
        ?.map((a) => a.alert_id)
        .sort()
    ).toEqual([oldTarget!.alert_id, oldSource!.alert_id, global!.alert_id].sort());
    expect(
      (
        await webhooks.listWebhooksForOrganization({
          organization_id: f.organizationId,
          project_id: f.target,
          limit: 100
        })
      )
        ?.map((a) => a.webhook_id)
        .sort()
    ).toEqual([hookTarget!.webhook_id, hookSource!.webhook_id, hookGlobal!.webhook_id].sort());
    await alerts.updateAlertForOrganization({
      organization_id: f.organizationId,
      project_id: f.target,
      alert_id: oldSource!.alert_id,
      actor_user_id: f.userId,
      actor_role: "owner",
      cooldown_seconds: 120
    });
    await webhooks.updateWebhookForOrganization({
      organization_id: f.organizationId,
      project_id: f.target,
      webhook_id: hookSource!.webhook_id,
      actor_user_id: f.userId,
      actor_role: "owner",
      is_enabled: false
    });
    expect(
      (
        await pool.query(
          "SELECT project_id,cooldown_seconds,scope_origin_ids FROM alert_rules WHERE id=$1",
          [oldSource!.alert_id]
        )
      ).rows[0]
    ).toMatchObject({ project_id: f.source, cooldown_seconds: 120, scope_origin_ids: [f.source] });
    expect(
      (
        await pool.query("SELECT project_id,is_enabled FROM agent_webhooks WHERE id=$1", [
          hookSource!.webhook_id
        ])
      ).rows[0]
    ).toEqual({ project_id: f.source, is_enabled: false });
  });
  it("matches retained webhook filters through canonical names without cross-origin collisions", async () => {
    const f = await fixture();
    const old = await f.newWebhook(f.source, ["web"]);
    await f.consolidate();
    const fresh = await f.newWebhook(f.target, ["Site"]);
    expect(
      (
        await webhooks.listWebhooksForOrganization({
          organization_id: f.organizationId,
          project_id: f.target,
          limit: 100
        })
      )?.find((r) => r.webhook_id === old!.webhook_id)?.filters.service
    ).toEqual(["Site"]);
    expect((await f.matchWebhook(f.source, "web")).map((a) => a.webhook_id).sort()).toEqual(
      [old!.webhook_id, fresh!.webhook_id].sort()
    );
    expect(await f.matchWebhook(f.target, "web")).toEqual([]);
    expect(await f.matchWebhook(f.target, "api")).toEqual([]);
    await webhooks.updateWebhookForOrganization({
      organization_id: f.organizationId,
      project_id: f.target,
      webhook_id: old!.webhook_id,
      actor_user_id: f.userId,
      actor_role: "owner",
      filters: { service: ["Site"] }
    });
    expect((await f.matchWebhook(f.source, "Site")).map((a) => a.webhook_id).sort()).toEqual(
      [old!.webhook_id, fresh!.webhook_id].sort()
    );
    expect(
      (
        await pool.query(
          "SELECT project_id,secret_hash,scope_origin_ids,filter_project_id FROM agent_webhooks WHERE id=$1",
          [old!.webhook_id]
        )
      ).rows[0]
    ).toEqual({
      project_id: f.source,
      secret_hash: "preserved-fixture-secret",
      scope_origin_ids: [f.source],
      filter_project_id: f.target
    });
  });
  it("widens an existing rule only on explicit intent and rejects a revoked actor's stale role", async () => {
    const f = await fixture();
    const member = await seedExternalProjectCollaborator(pool, [f.target, f.source]);
    const alert = await f.newAlert(f.target),
      hook = await f.newWebhook(f.target);
    await f.consolidate();
    const scope = {
      organization_id: f.organizationId,
      project_id: f.target,
      actor_user_id: member,
      actor_role: "admin" as const
    };
    await alerts.updateAlertForOrganization({
      ...scope,
      alert_id: alert!.alert_id,
      project_scope: "current_project"
    });
    await webhooks.updateWebhookForOrganization({
      ...scope,
      webhook_id: hook!.webhook_id,
      project_scope: "current_project"
    });
    const testDelivery = await webhooks.createTestDeliveryForOrganization({
      ...scope,
      webhook_id: hook!.webhook_id,
      event_type: "bundle.created"
    });
    expect(testDelivery).not.toBeNull();
    expect((await f.matchAlert(f.source, "web")).map((a) => a.alert_id)).toEqual([alert!.alert_id]);
    expect((await f.matchWebhook(f.source, "web")).map((a) => a.webhook_id)).toEqual([
      hook!.webhook_id
    ]);
    await pool.query("DELETE FROM project_members WHERE project_id=$1 AND user_id=$2", [
      f.target,
      member
    ]);
    expect(
      await webhooks.createTestDeliveryForOrganization({
        ...scope,
        webhook_id: hook!.webhook_id,
        event_type: "bundle.created"
      })
    ).toBeNull();
    await pool.query("UPDATE webhook_deliveries SET status='failed' WHERE id=$1", [
      testDelivery!.delivery_id
    ]);
    expect(
      await webhooks.retryDeliveryForOrganization({
        ...scope,
        webhook_id: hook!.webhook_id,
        delivery_id: testDelivery!.delivery_id
      })
    ).toBeNull();
    expect(
      await alerts.updateAlertForOrganization({
        ...scope,
        alert_id: alert!.alert_id,
        is_enabled: false
      })
    ).toBeNull();
    expect(
      await webhooks.updateWebhookForOrganization({
        ...scope,
        webhook_id: hook!.webhook_id,
        is_enabled: false
      })
    ).toBeNull();
    expect(
      (await pool.query("SELECT is_enabled FROM alert_rules WHERE id=$1", [alert!.alert_id]))
        .rows[0]?.is_enabled
    ).toBe(true);
    expect(
      (await pool.query("SELECT is_enabled FROM agent_webhooks WHERE id=$1", [hook!.webhook_id]))
        .rows[0]?.is_enabled
    ).toBe(true);
  });
  it("keeps delivery namespaces and dedupe for a new canonical rule matching an imported incident", async () => {
    const f = await fixture();
    await f.consolidate();
    const rule = await f.newAlert(f.target);
    const incident = randomUUID();
    await pool.query(
      "INSERT INTO incidents(id,project_id,fingerprint,title,severity,first_seen_at,last_seen_at) VALUES($1,$2,'scoped-delivery','Failure','high',now(),now())",
      [incident, f.source]
    );
    const input = {
      alert_id: rule!.alert_id,
      project_id: f.source,
      incident_id: incident,
      condition_type: "new_incident" as const,
      dedupe_key: "first",
      notification_key: "fixture-notification",
      cooldown_seconds: 0,
      channel: "email" as const,
      payload: { project_id: f.source, incident_id: incident }
    };
    const first = await delivery.createAlertDeliveryIntent(input);
    expect(first.created).toBe(true);
    expect((await delivery.createAlertDeliveryIntent(input)).created).toBe(false);
    const digest = await delivery.queueAlertEmailDigestItem({
      ...input,
      recipient: "owner@example.test",
      aggregation_window_seconds: 60,
      allow_new_digest: true
    });
    expect(digest.created).toBe(true);
    const read = await delivery.getAlertEmailDigest(digest.digest_id!);
    expect(read?.total_incident_count).toBe(1);
    expect(read?.items[0]).toMatchObject({
      project_id: f.source,
      incident_id: incident,
      alert_id: rule!.alert_id,
      payload: input.payload
    });
    expect(
      (
        await pool.query("SELECT project_id,payload FROM alert_deliveries WHERE id=$1", [
          first.delivery_id
        ])
      ).rows[0]
    ).toEqual({ project_id: f.source, payload: input.payload });
  });
});
