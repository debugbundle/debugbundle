import { configurationFixtureDb } from "../../helpers/project-configuration-fixture.js";
import { describe, expect, it, vi } from "vitest";

import { createPostgresMetadataStore as createRawMetadataStore } from "../../../packages/storage/src/index.js";
import { createPgError } from "../../helpers/fake-pg-error.ts";

const createPostgresMetadataStore = (db: Parameters<typeof createRawMetadataStore>[0]) =>
  createRawMetadataStore(configurationFixtureDb(db.query));

describe("postgres metadata project invitations", () => {
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
    expect(query).toHaveBeenCalledWith(expect.stringContaining("AND expires_at <= now()"), [
      "proj_123",
      "dev@example.com"
    ]);
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

    expect(await invalidStore.acceptProjectInviteForUser!(acceptInput)).toEqual({
      kind: "invalid_token"
    });
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
    expect(await lostInsertStore.acceptProjectInviteForUser!(acceptInput)).toEqual({
      kind: "invalid_token"
    });
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
});
