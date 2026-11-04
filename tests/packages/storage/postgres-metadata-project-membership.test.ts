import { configurationFixtureDb } from "../../helpers/project-configuration-fixture.js";
import { describe, expect, it, vi } from "vitest";

import { createPostgresMetadataStore as createRawMetadataStore } from "../../../packages/storage/src/index.js";

const createPostgresMetadataStore = (db: Parameters<typeof createRawMetadataStore>[0]) =>
  createRawMetadataStore(configurationFixtureDb(db.query));

describe("postgres metadata project membership", () => {
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
          rows: [
            {
              owner_user_id: "usr_owner",
              owner_email: "owner@example.com",
              created_at: "2026-03-16T00:00:00.000Z"
            }
          ]
        })
    });
    const updateMissingStore = createPostgresMetadataStore({
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [{ actor_role: "admin" }]
        })
        .mockResolvedValueOnce({
          rows: [
            {
              owner_user_id: "usr_owner",
              owner_email: "owner@example.com",
              created_at: "2026-03-16T00:00:00.000Z"
            }
          ]
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
          rows: [
            {
              owner_user_id: "usr_owner",
              owner_email: "owner@example.com",
              created_at: "2026-03-16T00:00:00.000Z"
            }
          ]
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
          rows: [
            {
              owner_user_id: "usr_owner",
              owner_email: "owner@example.com",
              created_at: "2026-03-16T00:00:00.000Z"
            }
          ]
        })
    });
    const removeMissingStore = createPostgresMetadataStore({
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [{ actor_role: "admin" }]
        })
        .mockResolvedValueOnce({
          rows: [
            {
              owner_user_id: "usr_owner",
              owner_email: "owner@example.com",
              created_at: "2026-03-16T00:00:00.000Z"
            }
          ]
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
        rows: [
          {
            owner_user_id: "usr_owner",
            owner_email: "owner@example.com",
            created_at: "2026-03-16T00:00:00.000Z"
          }
        ]
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
        rows: [
          {
            owner_user_id: "usr_owner",
            owner_email: "owner@example.com",
            created_at: "2026-03-16T00:00:00.000Z"
          }
        ]
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
