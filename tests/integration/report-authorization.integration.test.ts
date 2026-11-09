import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it } from "vitest";
import { bootstrapStorageSchema } from "../../packages/storage/src/migrations.js";
import {
  captureReportScope,
  canAccessReportScope,
  requireReportRecipients
} from "../../packages/storage/src/report-authorization.js";
import {
  createIntegrationPool,
  createQueryable,
  runIntegration
} from "../helpers/integration-setup.js";
runIntegration("saved report scope authority", () => {
  const pool = createIntegrationPool(),
    db = createQueryable(pool);
  let org: string,
    project: string,
    owner: string,
    admin: string,
    viewer: string,
    unverified: string,
    token: string;
  const actor = (user_id: string) => ({
    version: 1 as const,
    kind: "browser_session" as const,
    user_id
  });
  beforeEach(async () => {
    await pool.query("DROP SCHEMA public CASCADE");
    await pool.query("CREATE SCHEMA public");
    await bootstrapStorageSchema(db);
    [org, project, owner, admin, viewer, unverified, token] = Array.from({ length: 7 }, () =>
      randomUUID()
    ) as [string, string, string, string, string, string, string];
    for (const user of [owner, admin, viewer, unverified])
      await pool.query("INSERT INTO users(id,email,email_verified_at) VALUES($1,$2,$3)", [
        user,
        `${user}@example.test`,
        user === unverified ? null : "2026-11-01"
      ]);
    await pool.query(
      "INSERT INTO organizations(id,name,slug,plan) VALUES($1::uuid,'Reports',$1::text,'business')",
      [org]
    );
    for (const user of [owner, admin, viewer])
      await pool.query(
        "INSERT INTO organization_members(id,organization_id,user_id,role) VALUES($1,$2,$3,$4)",
        [randomUUID(), org, user, user === owner ? "owner" : "member"]
      );
    await pool.query(
      "INSERT INTO projects(id,organization_id,owner_user_id,name,slug) VALUES($1::uuid,$2,$3,'Project',$1::text)",
      [project, org, owner]
    );
    for (const [user, role] of [
      [admin, "admin"],
      [viewer, "viewer"]
    ])
      await pool.query(
        "INSERT INTO project_members(id,project_id,user_id,role) VALUES($1,$2,$3,$4)",
        [randomUUID(), project, user, role]
      );
    await pool.query(
      "INSERT INTO member_tokens(id,user_id,organization_id,token_hash,label,scope_policy) VALUES($1::uuid,$2,$3,$1::text,'Reports',$4::jsonb)",
      [
        token,
        admin,
        org,
        JSON.stringify({
          version: 1,
          mode: "projects",
          projects: [{ project_id: project, origin_project_ids: [project] }],
          permissions: ["project:write"]
        })
      ]
    );
  });
  afterAll(async () => {
    await pool.end();
  });
  it("keeps full-scope reading distinct from administration and checks live suspension", async () => {
    const scope = await captureReportScope(db, {
      organization_id: org,
      project_ids: [project],
      initiator: actor(admin)
    });
    expect(scope).toEqual([{ project_id: project, origin_project_ids: [project] }]);
    expect(
      await canAccessReportScope(db, {
        organization_id: org,
        scope,
        initiator: actor(viewer),
        manage: false
      })
    ).toBe(true);
    expect(
      await canAccessReportScope(db, {
        organization_id: org,
        scope,
        initiator: actor(viewer),
        manage: true
      })
    ).toBe(false);
    await pool.query(
      "UPDATE organization_members SET suspended_at=now() WHERE organization_id=$1 AND user_id=$2",
      [org, admin]
    );
    expect(
      await canAccessReportScope(db, {
        organization_id: org,
        scope,
        initiator: actor(admin),
        manage: true
      })
    ).toBe(false);
  });
  it("intersects stored token permissions and live roles, including revocation", async () => {
    const initiator = {
      version: 1 as const,
      kind: "member_token" as const,
      user_id: admin,
      token_id: token
    };
    await expect(
      captureReportScope(db, { organization_id: org, project_ids: [project], initiator })
    ).rejects.toThrow("forbidden");
    await pool.query(
      "UPDATE member_tokens SET scope_policy=jsonb_set(scope_policy,'{permissions}','[\"project:admin\"]') WHERE id=$1",
      [token]
    );
    const scope = await captureReportScope(db, {
      organization_id: org,
      project_ids: [project],
      initiator
    });
    await pool.query("UPDATE member_tokens SET revoked_at=now() WHERE id=$1", [token]);
    expect(
      await canAccessReportScope(db, { organization_id: org, scope, initiator, manage: false })
    ).toBe(false);
  });
  it("requires every recipient to be verified and currently able to read the whole accepted scope", async () => {
    const scope = await captureReportScope(db, {
      organization_id: org,
      project_ids: [project],
      initiator: actor(admin)
    });
    await expect(
      requireReportRecipients(db, { organization_id: org, scope, user_ids: [viewer] })
    ).resolves.toBeUndefined();
    await expect(
      requireReportRecipients(db, { organization_id: org, scope, user_ids: [viewer, unverified] })
    ).rejects.toThrow("invalid_report_recipient");
    await pool.query("DELETE FROM project_members WHERE project_id=$1 AND user_id=$2", [
      project,
      viewer
    ]);
    await expect(
      requireReportRecipients(db, { organization_id: org, scope, user_ids: [viewer] })
    ).rejects.toThrow("invalid_report_recipient");
  });
  it("does not let project authority substitute another organisation's report ownership", async () => {
    await expect(
      captureReportScope(db, {
        organization_id: randomUUID(),
        project_ids: [project],
        initiator: actor(admin)
      })
    ).rejects.toThrow("invalid_report_scope");
  });
});
