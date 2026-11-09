import { configurationFixtureDb } from "../../helpers/project-configuration-fixture.js";
import { describe, expect, it, vi } from "vitest";

import { createPostgresMetadataStore as createRawMetadataStore } from "../../../packages/storage/src/index.js";

const createPostgresMetadataStore = (db: Parameters<typeof createRawMetadataStore>[0]) =>
  createRawMetadataStore(configurationFixtureDb(db.query));

describe("postgres metadata project collaboration reads", () => {
  it("resolves token origins plus project access, members, invites, and user project listings", async (): Promise<void> => {
    const calls: string[] = [];
    const query = vi.fn().mockImplementation((sql: string) => {
      calls.push(sql);

      if (sql.includes("FROM project_tokens pt") && sql.includes("pt.token_hash = $1")) {
        return {
          rows: [
            {
              project_id: "proj_123",
              organization_id: "org_123",
              organization_plan: "team",
              allowed_origins: ["https://static.example.com"],
              revoked_at: null,
              expires_at: null
            }
          ]
        };
      }

      if (
        sql.includes("CASE") &&
        sql.includes("shared_with_you") &&
        sql.includes("WHERE p.id = debugbundle_canonical_project($2::uuid)")
      ) {
        return {
          rows: [
            {
              project_id: "proj_123",
              project_name: "Checkout API",
              organization_id: "org_123",
              owner_user_id: "usr_owner",
              owner_email: "owner@example.com",
              relationship: "shared",
              sharing_state: "shared_with_you",
              effective_role: "admin",
              organization_plan: "team"
            }
          ]
        };
      }

      if (
        sql.includes("SELECT p.id AS project_id") &&
        sql.includes(
          "debugbundle_project_actor_role(p.id,$2::uuid,false,false) IN ('owner','admin')"
        )
      ) {
        return { rows: [{ project_id: "proj_123" }] };
      }

      if (sql.includes("SELECT COALESCE(org.plan, 'free') AS owner_plan")) {
        return { rows: [{ owner_plan: "team" }] };
      }

      if (sql.includes("UNION ALL") && sql.includes("FROM project_members pm")) {
        return {
          rows: [
            {
              user_id: "usr_owner",
              email: "owner@example.com",
              role: "owner",
              membership_type: "owner",
              avatar_object_key: null,
              created_at: "2026-03-16T00:00:00.000Z"
            },
            {
              user_id: "usr_admin",
              email: "admin@example.com",
              role: "admin",
              membership_type: "collaborator",
              avatar_object_key: "avatars/admin.png",
              created_at: "2026-03-17T00:00:00.000Z"
            }
          ]
        };
      }

      if (sql.includes("FROM project_invites") && sql.includes("expires_at > $2::timestamptz")) {
        return {
          rows: [
            {
              invite_id: "inv_123",
              project_id: "proj_123",
              email: "invitee@example.com",
              role: "member",
              invited_by_user_id: "usr_owner",
              accepted_at: null,
              canceled_at: null,
              expires_at: "2026-03-25T00:00:00.000Z",
              created_at: "2026-03-16T00:00:00.000Z"
            }
          ]
        };
      }

      if (sql.includes("information_schema.tables")) {
        return { rows: [{ exists: true }] };
      }

      if (
        sql.includes("json_build_object") &&
        sql.includes(
          "WHERE (canonical_project.owner_user_id = $1::uuid OR pm.user_id IS NOT NULL OR false)"
        )
      ) {
        return {
          rows: [
            {
              project_id: "proj_123",
              organization_id: "org_123",
              owner_user_id: "usr_owner",
              owner_email: "owner@example.com",
              relationship: "owned",
              sharing_state: "shared_by_you",
              effective_role: "owner",
              name: "Checkout App",
              slug: "checkout-app",
              environment_default: "production",
              organization_plan: "team",
              metrics: {
                open_incidents: 4,
                regressed_incidents: 1,
                attention_incidents_today: 1,
                opened_incidents_today: 1,
                opened_incidents_month: 6,
                monthly_bundle_requests: 12,
                monthly_raw_ingested_events: 48,
                retained_bundles: 3,
                monthly_alert_deliveries: 7
              },
              created_at: "2026-03-16T00:00:00.000Z",
              updated_at: "2026-03-18T00:00:00.000Z"
            }
          ]
        };
      }

      return { rows: [] };
    });

    const store = createPostgresMetadataStore({ query });

    const resolved = await store.resolveProjectByTokenHash("hash_abc");
    const access = await store.resolveProjectAccessForUser!({
      user_id: "usr_admin",
      project_id: "proj_123"
    });
    const members = await store.listMembersForProject!({
      project_id: "proj_123",
      user_id: "usr_owner"
    });
    const invites = await store.listPendingInvitesForProject!({
      project_id: "proj_123",
      user_id: "usr_owner",
      now: "2026-03-20T00:00:00.000Z"
    });
    const projects = await store.listProjectsForUser!({
      user_id: "usr_owner",
      now: "2026-03-20T00:00:00.000Z",
      limit: 10
    });

    expect(resolved).toEqual({
      project_id: "proj_123",
      organization_id: "org_123",
      organization_plan: "team",
      allowed_origins: ["https://static.example.com"],
      revoked_at: null,
      expires_at: null
    });
    expect(access).toEqual({
      project_id: "proj_123",
      project_name: "Checkout API",
      organization_id: "org_123",
      owner_user_id: "usr_owner",
      owner_email: "owner@example.com",
      relationship: "shared",
      sharing_state: "shared_with_you",
      effective_role: "admin",
      shared_access_suspended: false,
      organization_plan: "team"
    });
    expect(members).toEqual({
      owner_plan: "team",
      members: [
        {
          user_id: "usr_owner",
          email: "owner@example.com",
          role: "owner",
          membership_type: "owner",
          avatar_object_key: null,
          created_at: "2026-03-16T00:00:00.000Z"
        },
        {
          user_id: "usr_admin",
          email: "admin@example.com",
          role: "admin",
          membership_type: "collaborator",
          avatar_object_key: "avatars/admin.png",
          created_at: "2026-03-17T00:00:00.000Z"
        }
      ]
    });
    expect(invites).toEqual([
      {
        invite_id: "inv_123",
        project_id: "proj_123",
        email: "invitee@example.com",
        role: "member",
        invited_by_user_id: "usr_owner",
        accepted_at: null,
        canceled_at: null,
        expires_at: "2026-03-25T00:00:00.000Z",
        created_at: "2026-03-16T00:00:00.000Z"
      }
    ]);
    expect(projects).toEqual([
      {
        project_id: "proj_123",
        organization_id: "org_123",
        owner_user_id: "usr_owner",
        owner_email: "owner@example.com",
        relationship: "owned",
        sharing_state: "shared_by_you",
        effective_role: "owner",
        shared_access_suspended: false,
        name: "Checkout App",
        slug: "checkout-app",
        environment_default: "production",
        color_tag: null,
        organization_plan: "team",
        metrics: {
          open_incidents: 4,
          regressed_incidents: 1,
          attention_incidents_today: 1,
          opened_incidents_today: 1,
          opened_incidents_month: 6,
          monthly_bundle_requests: 12,
          monthly_raw_ingested_events: 48,
          retained_bundles: 3,
          monthly_alert_deliveries: 7
        },
        created_at: "2026-03-16T00:00:00.000Z",
        updated_at: "2026-03-18T00:00:00.000Z"
      }
    ]);
    expect(calls.some((sql) => sql.includes("monthly_alert_deliveries"))).toBe(true);
  });

  it("preserves shared collaborator access as suspended when the owner's current tier no longer allows sharing", async (): Promise<void> => {
    const query = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes("WHERE p.id = debugbundle_canonical_project($2::uuid)")) {
        return {
          rows: [
            {
              project_id: "proj_shared",
              project_name: "Shared Dashboard",
              organization_id: "org_free",
              owner_user_id: "usr_owner",
              owner_email: "owner@example.com",
              relationship: "shared",
              sharing_state: "shared_with_you",
              effective_role: "member",
              organization_plan: "free"
            }
          ]
        };
      }

      if (sql.includes("information_schema.tables")) {
        return { rows: [{ exists: true }] };
      }

      if (
        sql.includes("json_build_object") &&
        sql.includes(
          "WHERE (canonical_project.owner_user_id = $1::uuid OR pm.user_id IS NOT NULL OR false)"
        )
      ) {
        return {
          rows: [
            {
              project_id: "proj_shared",
              organization_id: "org_free",
              owner_user_id: "usr_owner",
              owner_email: "owner@example.com",
              relationship: "shared",
              sharing_state: "shared_with_you",
              effective_role: "member",
              name: "Shared App",
              slug: "shared-app",
              environment_default: "production",
              organization_plan: "free",
              metrics: {
                open_incidents: 0,
                regressed_incidents: 0,
                attention_incidents_today: 0,
                opened_incidents_today: 0,
                opened_incidents_month: 0,
                monthly_bundle_requests: 0,
                monthly_raw_ingested_events: 0,
                retained_bundles: 1,
                monthly_alert_deliveries: 0
              },
              created_at: "2026-03-16T00:00:00.000Z",
              updated_at: "2026-03-18T00:00:00.000Z"
            }
          ]
        };
      }

      return { rows: [] };
    });

    const store = createPostgresMetadataStore({ query });

    const access = await store.resolveProjectAccessForUser!({
      user_id: "usr_collaborator",
      project_id: "proj_shared"
    });
    const projects = await store.listProjectsForUser!({
      user_id: "usr_collaborator",
      now: "2026-03-20T00:00:00.000Z",
      limit: 10
    });

    expect(access).toEqual({
      project_id: "proj_shared",
      project_name: "Shared Dashboard",
      organization_id: "org_free",
      owner_user_id: "usr_owner",
      owner_email: "owner@example.com",
      relationship: "shared",
      sharing_state: "shared_with_you",
      effective_role: "member",
      shared_access_suspended: true,
      organization_plan: "free"
    });
    expect(projects).toEqual([
      {
        project_id: "proj_shared",
        organization_id: "org_free",
        owner_user_id: "usr_owner",
        owner_email: "owner@example.com",
        relationship: "shared",
        sharing_state: "shared_with_you",
        effective_role: "member",
        shared_access_suspended: true,
        name: "Shared App",
        slug: "shared-app",
        environment_default: "production",
        color_tag: null,
        organization_plan: "free",
        metrics: {
          open_incidents: 0,
          regressed_incidents: 0,
          attention_incidents_today: 0,
          opened_incidents_today: 0,
          opened_incidents_month: 0,
          monthly_bundle_requests: 0,
          monthly_raw_ingested_events: 0,
          retained_bundles: 1,
          monthly_alert_deliveries: 0
        },
        created_at: "2026-03-16T00:00:00.000Z",
        updated_at: "2026-03-18T00:00:00.000Z"
      }
    ]);
  });

  it("returns null when project collaboration scope checks fail", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const store = createPostgresMetadataStore({ query });

    expect(
      await store.resolveProjectAccessForUser!({
        user_id: "usr_admin",
        project_id: "proj_123"
      })
    ).toBeNull();
    expect(
      await store.listMembersForProject!({
        project_id: "proj_123",
        user_id: "usr_admin"
      })
    ).toBeNull();
    expect(
      await store.listPendingInvitesForProject!({
        project_id: "proj_123",
        user_id: "usr_admin",
        now: "2026-03-20T00:00:00.000Z"
      })
    ).toBeNull();
  });

  it("scopes incident retrieval to projects visible to a collaborator", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const store = createPostgresMetadataStore({ query });

    await store.listIncidentsForOrganization({
      organization_id: "org_collaborator",
      user_id: "usr_collaborator",
      project_id: "proj_shared",
      limit: 20
    });
    await store.getIncidentForOrganization({
      organization_id: "org_collaborator",
      user_id: "usr_collaborator",
      incident_id: "inc_shared"
    });
    await store.listServicesForOrganization?.({
      organization_id: "org_collaborator",
      user_id: "usr_collaborator",
      project_id: "proj_shared",
      limit: 20
    });

    const incidentListSql = String(query.mock.calls[0]?.[0] ?? "");
    expect(incidentListSql).toContain("$2::uuid IS NULL");
    expect(incidentListSql).toContain("$2::uuid IS NOT NULL");
    expect(incidentListSql).toContain(
      "debugbundle_project_actor_role(p.id,$2::uuid,false,false) IS NOT NULL"
    );

    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("debugbundle_project_actor_role(p.id,$2::uuid,false,false)"),
      ["org_collaborator", "usr_collaborator", "proj_shared", 20]
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("debugbundle_project_actor_role(p.id,$3::uuid,false,false)"),
      ["org_collaborator", "inc_shared", "usr_collaborator"]
    );
    expect(query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("debugbundle_project_actor_role(projects.id,$3::uuid,false,false)"),
      ["proj_shared", "org_collaborator", "usr_collaborator"]
    );
  });
});
