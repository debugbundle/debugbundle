import { createProjectMergeStore } from "../../packages/storage/src/project-merge-store.js";
import { readCurrentBillingContact } from "../../packages/storage/src/billing-contact.js";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import { migrateStorageSchema } from "../../packages/storage/src/schema-migrations.js";
import { bootstrapStorageSchema } from "../../packages/storage/src/migrations.js";
import {
  createPostgresOrganizationManagementStore,
  OrganizationManagementError
} from "../../packages/storage/src/organization-management-store.js";
import { createPostgresMetadataStore } from "../../packages/storage/src/index.js";
import { createPostgresRetentionStore } from "../../packages/storage/src/retention-store.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration
} from "../helpers/integration-setup.js";

runIntegration("organization people and ownership", () => {
  const pool = createIntegrationPool();
  const db = createQueryable(pool);
  const store = createPostgresOrganizationManagementStore(db);
  let owner: string, admin: string, member: string, org: string;
  beforeEach(async () => {
    await pool.query("DROP SCHEMA public CASCADE");
    await pool.query("CREATE SCHEMA public");
    await bootstrapStorageSchema(db);
    await migrateStorageSchema(db);
    [owner, admin, member, org] = Array.from({ length: 4 }, () => randomUUID()) as [
      string,
      string,
      string,
      string
    ];
    for (const user of [owner, admin, member])
      await pool.query("INSERT INTO users(id,email,email_verified_at) VALUES($1,$2,now())", [
        user,
        `${user}@example.test`
      ]);
    await pool.query(
      "INSERT INTO organizations(id,name,slug,plan) VALUES($1,'Business',$2,'business')",
      [org, org]
    );
    for (const [user, role] of [
      [owner, "owner"],
      [admin, "admin"],
      [member, "member"]
    ])
      await pool.query(
        "INSERT INTO organization_members(id,organization_id,user_id,role) VALUES($1,$2,$3,$4)",
        [randomUUID(), org, user, role]
      );
  });
  afterAll(async () => {
    await pool.end();
  });

  afterEach(() => vi.unstubAllEnvs());
  async function selfHostedFixture(mode: string): Promise<void> {
    if (mode !== "selfhost") return;
    vi.stubEnv("SELFHOST_MODE", "true");
    await pool.query("UPDATE organizations SET plan='free' WHERE id=$1", [org]);
    await pool.query(
      "UPDATE organization_members SET grants_paused_at=NULL WHERE organization_id=$1",
      [org]
    );
  }
  async function fillPeopleTo999(): Promise<void> {
    const ids = Array.from({ length: 996 }, () => randomUUID());
    await pool.query(
      "INSERT INTO users(id,email) SELECT id,id::text||'@example.test' FROM unnest($1::uuid[]) id",
      [ids]
    );
    await pool.query(
      "INSERT INTO organization_members(id,organization_id,user_id,role) SELECT gen_random_uuid(),$1,id,'member' FROM unnest($2::uuid[]) id",
      [org, ids]
    );
  }

  async function mergedProjects() {
    const target = randomUUID(),
      source = randomUUID(),
      operation = randomUUID();
    for (const id of [target, source])
      await pool.query(
        "INSERT INTO projects(id,organization_id,owner_user_id,name,slug) VALUES($1,$2,$3,'Merged',$4)",
        [id, org, owner, id]
      );
    await pool.query(
      "INSERT INTO project_merge_operations(id,organization_id,actor_user_id,target_project_id,idempotency_key,request,plan_digest,state) VALUES($1,$2,$3,$4,$5,'{}',$6,'completed')",
      [operation, org, owner, target, operation, "a".repeat(64)]
    );
    return {
      target,
      source,
      operation,
      bind: async () => {
        await pool.query(
          "INSERT INTO project_legacy_bindings(legacy_project_id,canonical_project_id,scope_origin_ids,operation_id) VALUES($1,$2,ARRAY[$1::uuid],$3)",
          [source, target, operation]
        );
      }
    };
  }

  it("does not expand legacy admin credentials or permit peer/owner administration", async () => {
    const actor = { organization_id: org, actor_user_id: admin, include_organization_grants: true };
    await expect(
      store.listOrganizationPeople({ ...actor, include_organization_grants: false })
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(await store.listOrganizationPeople(actor)).toHaveLength(3);
    await expect(
      store.updateOrganizationPerson({ ...actor, user_id: owner, changes: { suspended: true } })
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      store.updateOrganizationPerson({ ...actor, user_id: member, changes: { role: "admin" } })
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      store.removeOrganizationPerson({ ...actor, user_id: admin })
    ).rejects.toMatchObject({ code: "forbidden" });
    await store.updateOrganizationPerson({
      ...actor,
      user_id: member,
      changes: { project_access: "all", default_project_role: "viewer" }
    });
    const project = randomUUID();
    await pool.query(
      "INSERT INTO projects(id,organization_id,owner_user_id,name,slug) VALUES($1,$2,$3,'Future',$4)",
      [project, org, owner, project]
    );
    expect(
      (
        await pool.query("SELECT debugbundle_project_actor_role($1,$2,true,false) AS role", [
          project,
          member
        ])
      ).rows[0].role
    ).toBe("viewer");
    await store.updateOrganizationPerson({
      ...actor,
      user_id: member,
      changes: { suspended: true }
    });
    expect(
      (
        await pool.query("SELECT debugbundle_project_actor_role($1,$2,true,false) AS role", [
          project,
          member
        ])
      ).rows[0].role
    ).toBeNull();
  });

  it("requires the Owner to review paused inherited grants", async () => {
    await pool.query(
      "UPDATE organization_members SET grants_paused_at=now() WHERE organization_id=$1 AND user_id=$2",
      [org, member]
    );
    await expect(
      store.updateOrganizationPerson({
        organization_id: org,
        actor_user_id: admin,
        include_organization_grants: true,
        user_id: member,
        changes: { project_access: "all" }
      })
    ).rejects.toMatchObject({ code: "forbidden" });
    await store.updateOrganizationPerson({
      organization_id: org,
      actor_user_id: owner,
      user_id: member,
      changes: { suspended: false }
    });
    expect(
      (
        await pool.query(
          "SELECT grants_paused_at FROM organization_members WHERE organization_id=$1 AND user_id=$2",
          [org, member]
        )
      ).rows[0].grants_paused_at
    ).not.toBeNull();
    await store.updateOrganizationPerson({
      organization_id: org,
      actor_user_id: owner,
      user_id: member,
      changes: { project_access: "all", default_project_role: "viewer" }
    });
    expect(
      (
        await pool.query(
          "SELECT grants_paused_at FROM organization_members WHERE organization_id=$1 AND user_id=$2",
          [org, member]
        )
      ).rows[0].grants_paused_at
    ).toBeNull();
  });

  it("prunes terminal invitation credentials in bounded batches without deleting active or recent requests", async () => {
    const old = randomUUID(),
      recent = randomUUID(),
      active = randomUUID();
    for (const [id, expires, canceled] of [
      [old, "now()-interval '91 days'", "NULL"],
      [recent, "now()-interval '91 days'", "now()"],
      [active, "now()+interval '1 day'", "NULL"]
    ]) {
      await pool.query(
        `INSERT INTO organization_invites(id,organization_id,email,role,project_access,default_project_role,invite_token_hash,created_at,expires_at,canceled_at)
        VALUES($1::uuid,$2,$3,'member','selected','viewer',$1::text,now()-interval '100 days',${expires},${canceled})`,
        [id, org, `${id}@example.test`]
      );
    }
    const transfer = randomUUID();
    await pool.query(
      `INSERT INTO organization_ownership_transfers(id,organization_id,requested_by_user_id,recipient_user_id,accept_token_hash,created_at,expires_at,accepted_at)
      VALUES($1::uuid,$2,$3,$4,$1::text,now()-interval '100 days',now()-interval '98 days',now()-interval '99 days')`,
      [transfer, org, owner, member]
    );
    const retained = createPostgresRetentionStore(db);
    expect(
      await retained.pruneExpiredOrganizationCredentials!({
        now: new Date().toISOString(),
        limit: 1
      })
    ).toBe(2);
    expect(
      (await pool.query("SELECT id FROM organization_invites ORDER BY id")).rows.map(
        (row: { id: string }) => row.id
      )
    ).toEqual([recent, active].sort());
    expect(
      await retained.pruneExpiredOrganizationCredentials!({
        now: new Date().toISOString(),
        limit: 1
      })
    ).toBe(0);
  });

  it("delegates setup while keeping the billing owner and returning the actor's actual role", async () => {
    const metadata = createPostgresMetadataStore(db);
    const input = {
      user_id: admin,
      organization_id: org,
      name: "Delegated",
      slug: "delegated",
      environment_default: "production",
      weekly_report_timezone: "UTC"
    };
    expect(await metadata.createProjectForUser!(input)).toBeNull();
    const project = await metadata.createProjectForUser!({
      ...input,
      include_organization_grants: true
    });
    expect(project).toMatchObject({
      owner_user_id: owner,
      effective_role: "admin",
      relationship: "shared"
    });
    expect(
      (
        await pool.query(
          "SELECT config->'to' AS recipients FROM weekly_report_channels WHERE project_id=$1",
          [project!.project_id]
        )
      ).rows
    ).toEqual([{ recipients: [`${owner}@example.test`] }]);
    expect(
      await metadata.updateProjectForUser!({
        user_id: admin,
        project_id: project!.project_id,
        name: "No legacy promotion"
      })
    ).toBeNull();
    expect(
      await metadata.updateProjectForUser!({
        user_id: admin,
        project_id: project!.project_id,
        name: "Managed",
        include_organization_grants: true
      })
    ).toMatchObject({ name: "Managed", effective_role: "admin" });
  });

  it("serialises distinct-person reservations while deduplicating current members", async () => {
    await fillPeopleTo999();
    const invite = (email: string) =>
      store.createOrganizationInvite({
        organization_id: org,
        actor_user_id: owner,
        email,
        role: "member",
        project_access: "selected",
        default_project_role: "member",
        project_ids: [],
        invite_token_hash: randomUUID(),
        expires_at: new Date(Date.now() + 86_400_000).toISOString()
      });
    const results = await Promise.allSettled([
      invite("one@example.test"),
      invite("two@example.test")
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(
      results
        .filter((result) => result.status === "rejected")
        .map((result) =>
          result.reason instanceof OrganizationManagementError
            ? result.reason.code
            : "unexpected_error"
        )
    ).toEqual(["people_limit_reached"]);
    // The same existing identity is allowed at capacity and does not consume a second place.
    await expect(invite(`${member}@example.test`)).resolves.toMatchObject({
      email: `${member}@example.test`
    });
  });

  it("shares one people cap across project invitations and concurrent cross-project acceptance", async () => {
    await fillPeopleTo999();
    const metadata = createPostgresMetadataStore(db),
      projects = [randomUUID(), randomUUID()];
    for (const id of projects)
      await pool.query(
        "INSERT INTO projects(id,organization_id,owner_user_id,name,slug) VALUES($1,$2,$3,'Shared',$4)",
        [id, org, owner, id]
      );
    const request = {
      user_id: owner,
      email: "last-person@example.test",
      role: "viewer" as const,
      invited_by_user_id: owner,
      expires_at: new Date(Date.now() + 86_400_000).toISOString()
    };
    const results = await Promise.all(
      projects.map((project_id, index) =>
        metadata.createInviteForProject!({
          ...request,
          project_id,
          invite_token_hash: `project-${index}`
        })
      )
    );
    expect(results.map((result) => result?.kind)).toEqual(["created", "created"]);
    expect(
      await metadata.createInviteForProject!({
        ...request,
        email: "overflow@example.test",
        project_id: projects[0]!,
        invite_token_hash: "overflow"
      })
    ).toMatchObject({ kind: "collaborator_limit_reached" });
    const recipient = randomUUID();
    await pool.query("INSERT INTO users(id,email,email_verified_at) VALUES($1,$2,now())", [
      recipient,
      request.email
    ]);
    const accepted = await Promise.all(
      projects.map((_, index) =>
        metadata.acceptProjectInviteForUser!({
          user_id: recipient,
          email: request.email,
          invite_token_hash: `project-${index}`,
          accepted_at: new Date().toISOString()
        })
      )
    );
    expect(accepted.map((result) => result.kind)).toEqual(["accepted", "accepted"]);
    expect(
      (await store.listOrganizationPeople({ organization_id: org, actor_user_id: owner })).filter(
        (person) => person.user_id === recipient
      )
    ).toEqual([expect.objectContaining({ direct_project_count: 2 })]);
  });

  it.each(["business", "selfhost"])(
    "accepts only a verified matching identity and retains explicit selected grants on %s",
    async (mode) => {
      await selfHostedFixture(mode);
      const recipient = randomUUID(),
        project = randomUUID();
      await pool.query("INSERT INTO users(id,email) VALUES($1,'recipient@example.test')", [
        recipient
      ]);
      await pool.query(
        "INSERT INTO projects(id,organization_id,owner_user_id,name,slug) VALUES($1,$2,$3,'Selected',$4)",
        [project, org, owner, project]
      );
      await store.createOrganizationInvite({
        organization_id: org,
        actor_user_id: owner,
        email: "recipient@example.test",
        role: "member",
        project_access: "selected",
        default_project_role: "viewer",
        project_ids: [project],
        invite_token_hash: "hash",
        expires_at: new Date(Date.now() + 86_400_000).toISOString()
      });
      await expect(
        store.acceptOrganizationInvite({
          user_id: recipient,
          invite_token_hash: "hash",
          now: new Date().toISOString()
        })
      ).rejects.toMatchObject({ code: "email_verification_required" });
      await pool.query("UPDATE users SET email_verified_at=now() WHERE id=$1", [recipient]);
      await pool.query("UPDATE users SET email='changed@example.test' WHERE id=$1", [recipient]);
      await expect(
        store.acceptOrganizationInvite({
          user_id: recipient,
          invite_token_hash: "hash",
          now: new Date().toISOString()
        })
      ).rejects.toMatchObject({ code: "invalid_invite" });
      await pool.query("UPDATE users SET email='recipient@example.test' WHERE id=$1", [recipient]);
      await expect(
        store.acceptOrganizationInvite({
          user_id: recipient,
          invite_token_hash: "hash",
          now: new Date().toISOString()
        })
      ).resolves.toEqual({ organization_id: org });
      expect(
        (
          await pool.query("SELECT debugbundle_project_actor_role($1,$2,false,$3) AS role", [
            project,
            recipient,
            mode === "selfhost"
          ])
        ).rows[0].role
      ).toBe("viewer");
      await expect(
        store.acceptOrganizationInvite({
          user_id: recipient,
          invite_token_hash: "hash",
          now: new Date().toISOString()
        })
      ).rejects.toMatchObject({ code: "invalid_invite" });
    }
  );

  it("rotates an invitation link and rechecks expired reservations before resending", async () => {
    const recipient = randomUUID();
    await pool.query(
      "INSERT INTO users(id,email,email_verified_at) VALUES($1,'recipient@example.test',now())",
      [recipient]
    );
    await fillPeopleTo999();
    const actor = { organization_id: org, actor_user_id: owner };
    const invitation = {
      ...actor,
      role: "member" as const,
      project_access: "selected" as const,
      default_project_role: "viewer" as const,
      project_ids: [],
      expires_at: new Date(Date.now() + 86_400_000).toISOString()
    };
    const invite = await store.createOrganizationInvite({
      ...invitation,
      email: "recipient@example.test",
      invite_token_hash: "old-link"
    });
    const refreshed = await store.refreshOrganizationInvite({
      ...actor,
      invite_id: invite.invite_id,
      invite_token_hash: "new-link",
      expires_at: invitation.expires_at
    });
    expect(refreshed).toMatchObject({
      invite_id: invite.invite_id,
      email: invite.email,
      default_project_role: "viewer"
    });
    await expect(
      store.acceptOrganizationInvite({
        user_id: recipient,
        invite_token_hash: "old-link",
        now: new Date().toISOString()
      })
    ).rejects.toMatchObject({ code: "invalid_invite" });
    await pool.query(
      "UPDATE organization_invites SET created_at=now()-interval '8 days',expires_at=now()-interval '1 day' WHERE id=$1",
      [invite.invite_id]
    );
    await store.createOrganizationInvite({
      ...invitation,
      email: "other@example.test",
      invite_token_hash: "last-place"
    });
    await expect(
      store.refreshOrganizationInvite({
        ...actor,
        invite_id: invite.invite_id,
        invite_token_hash: "over-cap",
        expires_at: invitation.expires_at
      })
    ).rejects.toMatchObject({ code: "people_limit_reached" });
    await pool.query(
      "UPDATE organization_invites SET canceled_at=now() WHERE invite_token_hash='last-place'"
    );
    await store.refreshOrganizationInvite({
      ...actor,
      invite_id: invite.invite_id,
      invite_token_hash: "accepted-link",
      expires_at: invitation.expires_at
    });
    await expect(
      store.acceptOrganizationInvite({
        user_id: recipient,
        invite_token_hash: "accepted-link",
        now: new Date().toISOString()
      })
    ).resolves.toEqual({ organization_id: org });
    await expect(
      store.refreshOrganizationInvite({
        ...actor,
        invite_id: invite.invite_id,
        invite_token_hash: "already-used",
        expires_at: invitation.expires_at
      })
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("keeps selected organisation invitations subject to the existing pending-invite merge guard", async () => {
    const merged = await mergedProjects();
    const actor = { organization_id: org, actor_user_id: owner };
    const merges = createProjectMergeStore(db, { enabled: true });
    const request = {
      target_project_id: merged.target,
      source_project_ids: [merged.source],
      service_mappings: []
    };
    expect((await merges.preview({ user_id: owner, request })).blockers).toEqual([]);
    const expires = new Date(Date.now() + 86_400_000).toISOString();
    // An all-project/future grant already includes the resulting project.
    await store.createOrganizationInvite({
      ...actor,
      email: "all@example.test",
      role: "member",
      project_access: "all",
      default_project_role: "viewer",
      project_ids: [],
      invite_token_hash: "all-future",
      expires_at: expires
    });
    expect((await merges.preview({ user_id: owner, request })).ready).toBe(true);
    const invite = await store.createOrganizationInvite({
      ...actor,
      email: `${member}@example.test`,
      role: "member",
      project_access: "selected",
      default_project_role: "viewer",
      project_ids: [merged.source],
      invite_token_hash: "before-merge",
      expires_at: expires
    });
    const refreshed = await store.refreshOrganizationInvite({
      ...actor,
      invite_id: invite.invite_id,
      invite_token_hash: "replacement",
      expires_at: expires
    });
    expect(refreshed.project_ids).toEqual([merged.source]);
    const preview = await merges.preview({ user_id: owner, request });
    expect(preview.ready).toBe(false);
    expect(preview.blockers).toContainEqual({
      code: "pending_invites",
      project_id: merged.source,
      resource: null
    });
    await store.cancelOrganizationInvite({ ...actor, invite_id: invite.invite_id });
    expect((await merges.preview({ user_id: owner, request })).ready).toBe(true);
  });

  it.each(["business", "selfhost"])(
    "transfers ownership only after recipient acceptance without transferring credentials on %s",
    async (mode) => {
      await selfHostedFixture(mode);
      const project = randomUUID(),
        token = randomUUID();
      await pool.query(
        "INSERT INTO projects(id,organization_id,owner_user_id,name,slug) VALUES($1,$2,$3,'Project',$4)",
        [project, org, owner, project]
      );
      await pool.query(
        "INSERT INTO member_tokens(id,user_id,organization_id,token_hash,label) VALUES($1,$2,$3,'old-owner-hash','Owner token')",
        [token, owner, org]
      );
      await store.requestOrganizationOwnershipTransfer({
        organization_id: org,
        actor_user_id: owner,
        recipient_user_id: member,
        accept_token_hash: "transfer-hash",
        expires_at: new Date(Date.now() + 86_400_000).toISOString()
      });
      expect(
        (await pool.query("SELECT owner_user_id FROM projects WHERE id=$1", [project])).rows[0]
          .owner_user_id
      ).toBe(owner);
      await expect(
        store.acceptOrganizationOwnershipTransfer({
          user_id: admin,
          accept_token_hash: "transfer-hash",
          now: new Date().toISOString()
        })
      ).rejects.toMatchObject({ code: "ownership_transfer_unavailable" });
      expect(
        (await pool.query("SELECT id FROM worker_jobs WHERE job_name='sync-billing-contact'")).rows
      ).toEqual([]);
      await pool.query("UPDATE organizations SET stripe_customer_id='cus_retained' WHERE id=$1", [
        org
      ]);
      await store.acceptOrganizationOwnershipTransfer({
        user_id: member,
        accept_token_hash: "transfer-hash",
        now: new Date().toISOString()
      });
      const intents = await pool.query(
        "SELECT payload FROM worker_jobs WHERE job_name='sync-billing-contact'"
      );
      expect(intents.rows).toEqual([
        { payload: { organization_id: org, transfer_id: expect.any(String) } }
      ]);
      expect(await readCurrentBillingContact(db, org)).toEqual({
        owner_user_id: member,
        customer_id: "cus_retained",
        email: `${member}@example.test`
      });
      expect(
        (await pool.query("SELECT owner_user_id FROM projects WHERE id=$1", [project])).rows[0]
          .owner_user_id
      ).toBe(member);
      expect(
        (
          await pool.query(
            "SELECT user_id FROM organization_members WHERE organization_id=$1 AND role='owner'",
            [org]
          )
        ).rows
      ).toEqual([{ user_id: member }]);
      expect(
        (await pool.query("SELECT user_id FROM member_tokens WHERE id=$1", [token])).rows[0].user_id
      ).toBe(owner);
      expect(
        (
          await pool.query("SELECT debugbundle_project_actor_role($1,$2,false,false) AS role", [
            project,
            owner
          ])
        ).rows[0].role
      ).toBeNull();
    }
  );

  it("updates all merged owner references while ordinary owner rewrites stay fenced", async () => {
    const merged = await mergedProjects();
    await merged.bind();
    await expect(
      pool.query("UPDATE projects SET owner_user_id=$2 WHERE id=$1", [merged.source, member])
    ).rejects.toThrow("project_consolidated");
    await store.requestOrganizationOwnershipTransfer({
      organization_id: org,
      actor_user_id: owner,
      recipient_user_id: member,
      accept_token_hash: "merged-transfer",
      expires_at: new Date(Date.now() + 86_400_000).toISOString()
    });
    await store.acceptOrganizationOwnershipTransfer({
      user_id: member,
      accept_token_hash: "merged-transfer",
      now: new Date().toISOString()
    });
    expect(
      (
        await pool.query("SELECT DISTINCT owner_user_id FROM projects WHERE organization_id=$1", [
          org
        ])
      ).rows
    ).toEqual([{ owner_user_id: member }]);
  });

  it("lets only the verified Owner cancel a pending transfer", async () => {
    const actor = { organization_id: org, actor_user_id: owner };
    const transfer = await store.requestOrganizationOwnershipTransfer({
      ...actor,
      recipient_user_id: member,
      accept_token_hash: "cancel-me",
      expires_at: new Date(Date.now() + 86_400_000).toISOString()
    });
    expect(await store.getOrganizationOwnershipTransfer(actor)).toMatchObject({
      transfer_id: transfer.transfer_id,
      recipient_user_id: member
    });
    await expect(
      store.cancelOrganizationOwnershipTransfer({
        ...actor,
        actor_user_id: admin,
        include_organization_grants: true
      })
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(await store.cancelOrganizationOwnershipTransfer(actor)).toBe(true);
    expect(await store.getOrganizationOwnershipTransfer(actor)).toBeNull();
    await expect(
      store.acceptOrganizationOwnershipTransfer({
        user_id: member,
        accept_token_hash: "cancel-me",
        now: new Date().toISOString()
      })
    ).rejects.toMatchObject({ code: "ownership_transfer_unavailable" });
  });

  it("removes all retained direct grants and pending invitations without removing the identity", async () => {
    const merged = await mergedProjects();
    for (const id of [merged.target, merged.source])
      await pool.query(
        "INSERT INTO project_members(id,project_id,user_id,role) VALUES($1,$2,$3,'member')",
        [randomUUID(), id, member]
      );
    await pool.query(
      "INSERT INTO project_invites(id,project_id,email,role,invited_by_user_id,invite_token_hash,expires_at) VALUES($1,$2,$3,'member',$4,'retained-invite',now()+interval '1 day')",
      [randomUUID(), merged.source, `${member}@example.test`, owner]
    );
    await pool.query(
      "INSERT INTO project_invites(id,project_id,email,role,invited_by_user_id,invite_token_hash,expires_at) VALUES($1,$2,'third-party@example.test','member',$3,'issued-invite',now()+interval '1 day')",
      [randomUUID(), merged.source, member]
    );
    await merged.bind();
    await store.removeOrganizationPerson({
      organization_id: org,
      actor_user_id: owner,
      user_id: member
    });
    expect(
      (await pool.query("SELECT id FROM project_members WHERE user_id=$1", [member])).rows
    ).toEqual([]);
    expect(
      (
        await pool.query(
          "SELECT canceled_at IS NOT NULL AS canceled FROM project_invites WHERE invite_token_hash IN ('retained-invite','issued-invite') ORDER BY invite_token_hash"
        )
      ).rows
    ).toEqual([{ canceled: true }, { canceled: true }]);
    expect((await pool.query("SELECT id FROM users WHERE id=$1", [member])).rows).toHaveLength(1);
    expect(
      (
        await pool.query("SELECT debugbundle_project_actor_role($1,$2,true,false) AS role", [
          merged.target,
          member
        ])
      ).rows[0].role
    ).toBeNull();
  });

  it("switches only an existing live session to a live membership", async () => {
    const other = randomUUID();
    await pool.query("INSERT INTO organizations(id,name,slug) VALUES($1,'Other',$2)", [
      other,
      other
    ]);
    await pool.query(
      "INSERT INTO sessions(id,user_id,organization_id,session_token_hash,expires_at) VALUES($1,$2,$3,'session-hash',now()+interval '1 day')",
      [randomUUID(), member, org]
    );
    const request = { user_id: member, session_token_hash: "session-hash", organization_id: other };
    expect(await store.switchSessionOrganization(request)).toBe(false);
    await pool.query(
      "INSERT INTO organization_members(id,organization_id,user_id,role) VALUES($1,$2,$3,'member')",
      [randomUUID(), other, member]
    );
    expect(await store.switchSessionOrganization(request)).toBe(true);
    await pool.query(
      "UPDATE organization_members SET suspended_at=now() WHERE organization_id=$1 AND user_id=$2",
      [org, member]
    );
    expect(await store.switchSessionOrganization({ ...request, organization_id: org })).toBe(false);
  });
});
