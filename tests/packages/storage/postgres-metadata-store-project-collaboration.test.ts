import { describe, expect, it, vi } from "vitest";

import { createPostgresMetadataStore } from "../../../packages/storage/src/index.js";
import { createPgError } from "../../helpers/fake-pg-error.ts";

describe("postgres metadata store project collaboration", () => {
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

      if (sql.includes("CASE") && sql.includes("shared_with_you") && sql.includes("WHERE p.id = $2::uuid")) {
        return {
          rows: [
            {
              project_id: "proj_123",
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

      if (sql.includes("SELECT p.id AS project_id") && sql.includes("actor_membership.role = 'admin'")) {
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

      if (sql.includes("json_build_object") && sql.includes("WHERE p.owner_user_id = $1::uuid")) {
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
        organization_plan: "team",
        metrics: {
          open_incidents: 4,
          regressed_incidents: 1,
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
      if (sql.includes("WHERE p.id = $2::uuid")) {
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
              organization_plan: "free"
            }
          ]
        };
      }

      if (sql.includes("information_schema.tables")) {
        return { rows: [{ exists: true }] };
      }

      if (sql.includes("json_build_object") && sql.includes("WHERE p.owner_user_id = $1::uuid")) {
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
        organization_plan: "free",
        metrics: {
          open_incidents: 0,
          regressed_incidents: 0,
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
    expect(incidentListSql).toContain("FROM project_members pm");

    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("FROM project_members pm"),
      ["org_collaborator", "usr_collaborator", "proj_shared", 20]
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("FROM project_members pm"),
      ["org_collaborator", "inc_shared", "usr_collaborator"]
    );
    expect(query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("FROM project_members pm"),
      ["proj_shared", "org_collaborator", "usr_collaborator"]
    );
  });

  it("covers invite creation outcomes", async (): Promise<void> => {
    const unauthorizedStore = createPostgresMetadataStore({
      query: vi.fn().mockResolvedValue({ rows: [] })
    });
    const upgradeRequiredStore = createPostgresMetadataStore({
      query: vi.fn().mockResolvedValue({
        rows: [{ owner_plan: "free", actor_role: "owner", actor_membership_type: "owner" }]
      })
    });
    const limitReachedStore = createPostgresMetadataStore({
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [{ owner_plan: "team", actor_role: "admin", actor_membership_type: "collaborator" }]
        })
        .mockResolvedValueOnce({
          rows: [{ collaborator_count: "1000" }]
        })
    });
    const memberExistsStore = createPostgresMetadataStore({
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [{ owner_plan: "team", actor_role: "owner", actor_membership_type: "owner" }]
        })
        .mockResolvedValueOnce({
          rows: [{ collaborator_count: "2" }]
        })
        .mockResolvedValueOnce({
          rows: [{ user_id: "usr_existing" }]
        })
    });
    const createdStore = createPostgresMetadataStore({
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [{ owner_plan: "team", actor_role: "owner", actor_membership_type: "owner" }]
        })
        .mockResolvedValueOnce({
          rows: [{ collaborator_count: "2" }]
        })
        .mockResolvedValueOnce({
          rows: []
        })
        .mockResolvedValueOnce({
          rows: []
        })
        .mockResolvedValueOnce({
          rows: [
            {
              invite_id: "inv_123",
              project_id: "proj_123",
              email: "dev@example.com",
              role: "admin",
              invited_by_user_id: "usr_owner",
              accepted_at: null,
              canceled_at: null,
              expires_at: "2026-03-25T00:00:00.000Z",
              created_at: "2026-03-16T00:00:00.000Z"
            }
          ]
        })
    });
    const duplicateStore = createPostgresMetadataStore({
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [{ owner_plan: "team", actor_role: "owner", actor_membership_type: "owner" }]
        })
        .mockResolvedValueOnce({
          rows: [{ collaborator_count: "2" }]
        })
        .mockResolvedValueOnce({
          rows: []
        })
        .mockResolvedValueOnce({
          rows: []
        })
        .mockRejectedValueOnce(createPgError("23505", "project_invites_pending_project_email_key"))
    });

    const inviteInput = {
      project_id: "proj_123",
      user_id: "usr_owner",
      email: " Dev@example.com ",
      role: "admin" as const,
      invited_by_user_id: "usr_owner",
      invite_token_hash: "hash_invite",
      expires_at: "2026-03-25T00:00:00.000Z"
    };

    expect(await unauthorizedStore.createInviteForProject!(inviteInput)).toBeNull();
    expect(await upgradeRequiredStore.createInviteForProject!(inviteInput)).toEqual({
      kind: "upgrade_required",
      owner_plan: "free"
    });
    expect(await limitReachedStore.createInviteForProject!(inviteInput)).toEqual({
      kind: "collaborator_limit_reached",
      owner_plan: "team"
    });
    expect(await memberExistsStore.createInviteForProject!(inviteInput)).toEqual({
      kind: "member_exists",
      owner_plan: "team"
    });
    expect(await createdStore.createInviteForProject!(inviteInput)).toEqual({
      kind: "created",
      owner_plan: "team",
      invite: {
        invite_id: "inv_123",
        project_id: "proj_123",
        email: "dev@example.com",
        role: "admin",
        invited_by_user_id: "usr_owner",
        accepted_at: null,
        canceled_at: null,
        expires_at: "2026-03-25T00:00:00.000Z",
        created_at: "2026-03-16T00:00:00.000Z"
      }
    });
    expect(await duplicateStore.createInviteForProject!(inviteInput)).toEqual({
      kind: "invite_exists",
      owner_plan: "team"
    });
  });

  it("retires expired pending invites before creating a replacement invite", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [{ owner_plan: "team", actor_role: "owner", actor_membership_type: "owner" }]
      })
      .mockResolvedValueOnce({
        rows: [{ collaborator_count: "2" }]
      })
      .mockResolvedValueOnce({
        rows: []
      })
      .mockResolvedValueOnce({
        rows: []
      })
      .mockResolvedValueOnce({
        rows: [
          {
            invite_id: "inv_reissued",
            project_id: "proj_123",
            email: "dev@example.com",
            role: "member",
            invited_by_user_id: "usr_owner",
            accepted_at: null,
            canceled_at: null,
            expires_at: "2026-03-30T00:00:00.000Z",
            created_at: "2026-03-20T00:00:00.000Z"
          }
        ]
      });
    const store = createPostgresMetadataStore({ query });

    const result = await store.createInviteForProject!({
      project_id: "proj_123",
      user_id: "usr_owner",
      email: " Dev@example.com ",
      role: "member",
      invited_by_user_id: "usr_owner",
      invite_token_hash: "hash_reissued",
      expires_at: "2026-03-30T00:00:00.000Z"
    });

    expect(result).toEqual({
      kind: "created",
      owner_plan: "team",
      invite: {
        invite_id: "inv_reissued",
        project_id: "proj_123",
        email: "dev@example.com",
        role: "member",
        invited_by_user_id: "usr_owner",
        accepted_at: null,
        canceled_at: null,
        expires_at: "2026-03-30T00:00:00.000Z",
        created_at: "2026-03-20T00:00:00.000Z"
      }
    });
    expect(query.mock.calls.map((call) => String(call[0]))).toContainEqual(
      expect.stringContaining("SET canceled_at = now()")
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("AND expires_at <= now()"),
      ["proj_123", "dev@example.com"]
    );
  });

  it("covers invite cancellation and acceptance outcomes", async (): Promise<void> => {
    const cancelUnauthorizedStore = createPostgresMetadataStore({
      query: vi.fn().mockResolvedValue({ rows: [] })
    });
    const cancelMissingStore = createPostgresMetadataStore({
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [{ actor_role: "owner" }]
        })
        .mockResolvedValueOnce({
          rows: []
        })
    });
    const cancelSuccessStore = createPostgresMetadataStore({
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [{ actor_role: "admin" }]
        })
        .mockResolvedValueOnce({
          rows: [
            {
              invite_id: "inv_123",
              project_id: "proj_123",
              email: "invitee@example.com",
              role: "member",
              invited_by_user_id: "usr_owner",
              accepted_at: null,
              canceled_at: "2026-03-20T00:00:00.000Z",
              expires_at: "2026-03-25T00:00:00.000Z",
              created_at: "2026-03-16T00:00:00.000Z"
            }
          ]
        })
    });

    expect(
      await cancelUnauthorizedStore.cancelInviteForProject!({
        project_id: "proj_123",
        user_id: "usr_member",
        invite_id: "inv_123"
      })
    ).toBeNull();
    expect(
      await cancelMissingStore.cancelInviteForProject!({
        project_id: "proj_123",
        user_id: "usr_owner",
        invite_id: "inv_missing"
      })
    ).toBeNull();
    expect(
      await cancelSuccessStore.cancelInviteForProject!({
        project_id: "proj_123",
        user_id: "usr_admin",
        invite_id: "inv_123"
      })
    ).toEqual({
      invite_id: "inv_123",
      project_id: "proj_123",
      email: "invitee@example.com",
      role: "member",
      invited_by_user_id: "usr_owner",
      accepted_at: null,
      canceled_at: "2026-03-20T00:00:00.000Z",
      expires_at: "2026-03-25T00:00:00.000Z",
      created_at: "2026-03-16T00:00:00.000Z"
    });

    const invalidStore = createPostgresMetadataStore({
      query: vi.fn().mockResolvedValue({ rows: [] })
    });
    const mismatchStore = createPostgresMetadataStore({
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            invite_id: "inv_123",
            project_id: "proj_123",
            email: "expected@example.com",
            role: "admin"
          }
        ]
      })
    });
    const existingMembershipStore = createPostgresMetadataStore({
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              invite_id: "inv_123",
              project_id: "proj_123",
              email: "dev@example.com",
              role: "admin",
              owner_plan: "team"
            }
          ]
        })
        .mockResolvedValueOnce({
          rows: [
            {
              user_id: "usr_member",
              email: "dev@example.com",
              role: "member",
              membership_type: "collaborator",
              created_at: "2026-03-16T00:00:00.000Z"
            }
          ]
        })
        .mockResolvedValueOnce({ rows: [] })
    });
    const createdMembershipStore = createPostgresMetadataStore({
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              invite_id: "inv_123",
              project_id: "proj_123",
              email: "dev@example.com",
              role: "admin",
              owner_plan: "team"
            }
          ]
        })
        .mockResolvedValueOnce({
          rows: []
        })
        .mockResolvedValueOnce({
          rows: [
            {
              user_id: "usr_member",
              email: "dev@example.com",
              role: "admin",
              membership_type: "collaborator",
              created_at: "2026-03-20T00:00:00.000Z"
            }
          ]
        })
        .mockResolvedValueOnce({ rows: [] })
    });
    const lostInsertStore = createPostgresMetadataStore({
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              invite_id: "inv_123",
              project_id: "proj_123",
              email: "dev@example.com",
              role: "admin",
              owner_plan: "team"
            }
          ]
        })
        .mockResolvedValueOnce({
          rows: []
        })
        .mockResolvedValueOnce({
          rows: []
        })
    });

    const acceptInput = {
      invite_token_hash: "hash_invite",
      user_id: "usr_member",
      email: "dev@example.com",
      accepted_at: "2026-03-20T00:00:00.000Z"
    };

    expect(await invalidStore.acceptProjectInviteForUser!(acceptInput)).toEqual({ kind: "invalid_token" });
    expect(
      await mismatchStore.acceptProjectInviteForUser!({
        ...acceptInput,
        email: "other@example.com"
      })
    ).toEqual({ kind: "email_mismatch" });
    expect(await existingMembershipStore.acceptProjectInviteForUser!(acceptInput)).toEqual({
      kind: "accepted",
      membership: {
        project_id: "proj_123",
        user_id: "usr_member",
        email: "dev@example.com",
        role: "member",
        membership_type: "collaborator",
        avatar_object_key: null,
        created_at: "2026-03-16T00:00:00.000Z"
      }
    });
    expect(await createdMembershipStore.acceptProjectInviteForUser!(acceptInput)).toEqual({
      kind: "accepted",
      membership: {
        project_id: "proj_123",
        user_id: "usr_member",
        email: "dev@example.com",
        role: "admin",
        membership_type: "collaborator",
        avatar_object_key: null,
        created_at: "2026-03-20T00:00:00.000Z"
      }
    });
    expect(await lostInsertStore.acceptProjectInviteForUser!(acceptInput)).toEqual({ kind: "invalid_token" });
  });

  it("preserves collaborator access as suspended while still blocking invite acceptance when the current plan no longer allows sharing", async (): Promise<void> => {
    const accessStore = createPostgresMetadataStore({
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            project_id: "proj_123",
            organization_id: "org_123",
            owner_user_id: "usr_owner",
            owner_email: "owner@example.com",
            relationship: "shared",
            sharing_state: "shared_with_you",
            effective_role: "admin",
            organization_plan: "free"
          }
        ]
      })
    });
    const inviteStore = createPostgresMetadataStore({
      query: vi.fn().mockResolvedValueOnce({
        rows: [
          {
            invite_id: "inv_123",
            project_id: "proj_123",
            email: "dev@example.com",
            role: "admin",
            owner_plan: "free"
          }
        ]
      })
    });

    await expect(
      accessStore.resolveProjectAccessForUser!({
        user_id: "usr_member",
        project_id: "proj_123"
      })
    ).resolves.toEqual({
      project_id: "proj_123",
      organization_id: "org_123",
      owner_user_id: "usr_owner",
      owner_email: "owner@example.com",
      relationship: "shared",
      sharing_state: "shared_with_you",
      effective_role: "admin",
      shared_access_suspended: true,
      organization_plan: "free"
    });
    await expect(
      inviteStore.acceptProjectInviteForUser!({
        invite_token_hash: "hash_invite",
        user_id: "usr_member",
        email: "dev@example.com",
        accepted_at: "2026-03-20T00:00:00.000Z"
      })
    ).resolves.toEqual({ kind: "shared_access_suspended" });
  });

  it("qualifies joined invite columns when resolving an invite acceptance token", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const store = createPostgresMetadataStore({ query });

    await expect(
      store.acceptProjectInviteForUser!({
        invite_token_hash: "hash_invite",
        user_id: "usr_member",
        email: "dev@example.com",
        accepted_at: "2026-03-20T00:00:00.000Z"
      })
    ).resolves.toEqual({ kind: "invalid_token" });

    expect(query).toHaveBeenCalledTimes(1);

    const [sql] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("invites.id AS invite_id");
    expect(sql).toContain("invites.invite_token_hash = $1");
    expect(sql).toContain("invites.accepted_at IS NULL");
    expect(sql).toContain("invites.canceled_at IS NULL");
    expect(sql).toContain("invites.expires_at > $2::timestamptz");
  });

  it("covers member role updates and removals", async (): Promise<void> => {
    const updateUnauthorizedStore = createPostgresMetadataStore({
      query: vi.fn().mockResolvedValue({ rows: [] })
    });
    const updateOwnerStore = createPostgresMetadataStore({
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [{ actor_role: "owner" }]
        })
        .mockResolvedValueOnce({
          rows: [{ owner_user_id: "usr_owner", owner_email: "owner@example.com", created_at: "2026-03-16T00:00:00.000Z" }]
        })
    });
    const updateMissingStore = createPostgresMetadataStore({
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [{ actor_role: "admin" }]
        })
        .mockResolvedValueOnce({
          rows: [{ owner_user_id: "usr_owner", owner_email: "owner@example.com", created_at: "2026-03-16T00:00:00.000Z" }]
        })
        .mockResolvedValueOnce({
          rows: []
        })
    });
    const updateSuccessStore = createPostgresMetadataStore({
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [{ actor_role: "admin" }]
        })
        .mockResolvedValueOnce({
          rows: [{ owner_user_id: "usr_owner", owner_email: "owner@example.com", created_at: "2026-03-16T00:00:00.000Z" }]
        })
        .mockResolvedValueOnce({
          rows: [
            {
              user_id: "usr_member",
              email: "member@example.com",
              role: "admin",
              membership_type: "collaborator",
              created_at: "2026-03-17T00:00:00.000Z"
            }
          ]
        })
    });

    expect(
      await updateUnauthorizedStore.updateProjectMemberRole!({
        project_id: "proj_123",
        actor_user_id: "usr_member",
        user_id: "usr_other",
        role: "member"
      })
    ).toBeNull();
    expect(
      await updateOwnerStore.updateProjectMemberRole!({
        project_id: "proj_123",
        actor_user_id: "usr_owner",
        user_id: "usr_owner",
        role: "member"
      })
    ).toEqual({
      kind: "owner_role_change_forbidden",
      member: {
        user_id: "usr_owner",
        email: "owner@example.com",
        role: "owner",
        membership_type: "owner",
        created_at: "2026-03-16T00:00:00.000Z"
      }
    });
    expect(
      await updateMissingStore.updateProjectMemberRole!({
        project_id: "proj_123",
        actor_user_id: "usr_admin",
        user_id: "usr_missing",
        role: "admin"
      })
    ).toBeNull();
    expect(
      await updateSuccessStore.updateProjectMemberRole!({
        project_id: "proj_123",
        actor_user_id: "usr_admin",
        user_id: "usr_member",
        role: "admin"
      })
    ).toEqual({
      kind: "updated",
      member: {
        user_id: "usr_member",
        email: "member@example.com",
        role: "admin",
        membership_type: "collaborator",
        avatar_object_key: null,
        created_at: "2026-03-17T00:00:00.000Z"
      }
    });

    const removeUnauthorizedStore = createPostgresMetadataStore({
      query: vi.fn().mockResolvedValue({ rows: [] })
    });
    const removeOwnerStore = createPostgresMetadataStore({
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [{ actor_role: "owner" }]
        })
        .mockResolvedValueOnce({
          rows: [{ owner_user_id: "usr_owner", owner_email: "owner@example.com", created_at: "2026-03-16T00:00:00.000Z" }]
        })
    });
    const removeMissingStore = createPostgresMetadataStore({
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [{ actor_role: "admin" }]
        })
        .mockResolvedValueOnce({
          rows: [{ owner_user_id: "usr_owner", owner_email: "owner@example.com", created_at: "2026-03-16T00:00:00.000Z" }]
        })
        .mockResolvedValueOnce({
          rows: []
        })
    });
    const removeSuccessQuery = vi
        .fn()
        .mockResolvedValueOnce({
          rows: [{ actor_role: "admin" }]
        })
        .mockResolvedValueOnce({
          rows: [{ owner_user_id: "usr_owner", owner_email: "owner@example.com", created_at: "2026-03-16T00:00:00.000Z" }]
        })
        .mockResolvedValueOnce({
          rows: [
            {
              user_id: "usr_member",
              email: "member@example.com",
              role: "member",
              membership_type: "collaborator",
              created_at: "2026-03-17T00:00:00.000Z"
            }
          ]
        })
        .mockResolvedValue({ rows: [] });
    const removeSuccessStore = createPostgresMetadataStore({
      query: removeSuccessQuery
    });

    expect(
      await removeUnauthorizedStore.removeProjectMember!({
        project_id: "proj_123",
        actor_user_id: "usr_member",
        user_id: "usr_other"
      })
    ).toBeNull();
    expect(
      await removeOwnerStore.removeProjectMember!({
        project_id: "proj_123",
        actor_user_id: "usr_owner",
        user_id: "usr_owner"
      })
    ).toEqual({
      kind: "owner_removal_forbidden",
      member: {
        user_id: "usr_owner",
        email: "owner@example.com",
        role: "owner",
        membership_type: "owner",
        created_at: "2026-03-16T00:00:00.000Z"
      }
    });
    expect(
      await removeMissingStore.removeProjectMember!({
        project_id: "proj_123",
        actor_user_id: "usr_admin",
        user_id: "usr_missing"
      })
    ).toBeNull();
    expect(
      await removeSuccessStore.removeProjectMember!({
        project_id: "proj_123",
        actor_user_id: "usr_admin",
        user_id: "usr_member"
      })
    ).toEqual({
      kind: "removed",
      member: {
        user_id: "usr_member",
        email: "member@example.com",
        role: "member",
        membership_type: "collaborator",
        avatar_object_key: null,
        created_at: "2026-03-17T00:00:00.000Z"
      }
    });
    expect(removeSuccessQuery.mock.calls.map((call) => String(call[0]))).toEqual(
      expect.arrayContaining([
        expect.stringContaining("DELETE FROM github_dispatch_rules"),
        expect.stringContaining("DELETE FROM agent_webhooks"),
        expect.stringContaining("DELETE FROM alert_rules")
      ])
    );
  });

  it("removes member-owned automation when a collaborator leaves a shared project", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [{ owner_user_id: "usr_owner", owner_email: "owner@example.com", created_at: "2026-03-16T00:00:00.000Z" }]
      })
      .mockResolvedValueOnce({
        rows: [
          {
            user_id: "usr_member",
            email: "member@example.com",
            role: "member",
            membership_type: "collaborator",
            created_at: "2026-03-17T00:00:00.000Z"
          }
        ]
      })
      .mockResolvedValue({ rows: [] });
    const store = createPostgresMetadataStore({ query });

    await expect(
      store.leaveProjectMembership!({
        project_id: "proj_123",
        user_id: "usr_member"
      })
    ).resolves.toEqual({
      kind: "left",
      member: {
        user_id: "usr_member",
        email: "member@example.com",
        role: "member",
        membership_type: "collaborator",
        avatar_object_key: null,
        created_at: "2026-03-17T00:00:00.000Z"
      }
    });

    const calls = query.mock.calls.map((call) => ({
      sql: String(call[0]),
      params: call[1]
    }));
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sql: expect.stringContaining("DELETE FROM github_dispatch_rules"),
          params: ["proj_123", "usr_member"]
        }),
        expect.objectContaining({
          sql: expect.stringContaining("DELETE FROM agent_webhooks"),
          params: ["proj_123", "usr_member"]
        }),
        expect.objectContaining({
          sql: expect.stringContaining("DELETE FROM alert_rules"),
          params: ["proj_123", "usr_member"]
        })
      ])
    );
  });
});
