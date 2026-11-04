import { configurationFixtureDb } from "../../helpers/project-configuration-fixture.js";
import { describe, expect, it, vi } from "vitest";
import {
  createPostgresMetadataStore as createRawMetadataStore,
  type Queryable
} from "../../../packages/storage/src/index.js";

const createPostgresMetadataStore = (db: Parameters<typeof createRawMetadataStore>[0]) =>
  createRawMetadataStore(configurationFixtureDb(db.query));
describe("postgres metadata store", () => {
  it("should resolve a project token and record successful use", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        { project_id: "proj_123", organization_id: "org_123", revoked_at: null, expires_at: null }
      ]
    });
    const db: Queryable = { query };

    const store = createPostgresMetadataStore(db);
    const resolved = await store.resolveProjectByTokenHash("hash_abc");

    expect(resolved).toEqual({
      project_id: "proj_123",
      organization_id: "org_123",
      revoked_at: null,
      expires_at: null
    });
    expect(query).toHaveBeenCalledOnce();
    const sql = String(query.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("o.suspended_at IS NULL");
    expect(sql).toContain("UPDATE project_tokens");
    expect(sql).toContain("SET last_used_at = now()");
    expect(sql).toContain("resolved_token.revoked_at IS NULL");
    expect(sql).toContain("resolved_token.expires_at > now()");
    expect(sql).toContain("project_tokens.last_used_at < now() - $2::interval");
    expect(query).toHaveBeenCalledWith(expect.any(String), ["hash_abc", "5 minutes"]);
  });

  it("should return null when token hash is unknown", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const db: Queryable = { query };

    const store = createPostgresMetadataStore(db);
    const resolved = await store.resolveProjectByTokenHash("missing_hash");

    expect(resolved).toBeNull();
  });

  it("should resolve project plan from token hash", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          project_id: "proj_123",
          organization_id: "org_123",
          organization_plan: "solo",
          revoked_at: null,
          expires_at: null
        }
      ]
    });
    const db: Queryable = {
      query: query as Queryable["query"],
      transaction: async <Result>(callback: (tx: Queryable) => Promise<Result>) =>
        callback({ query: query as Queryable["query"] })
    };
    const store = createPostgresMetadataStore(db);

    const resolved = await store.resolveProjectByTokenHash("hash_abc");

    expect(resolved).toEqual({
      project_id: "proj_123",
      organization_id: "org_123",
      organization_plan: "solo",
      revoked_at: null,
      expires_at: null
    });
  });

  it("should resolve a member token and record successful use", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          member_id: "mem_123",
          organization_id: "org_123",
          role: "owner",
          revoked_at: null,
          expires_at: null
        }
      ]
    });
    const db: Queryable = { query };

    const store = createPostgresMetadataStore(db);
    const resolved = await store.resolveMemberByTokenHash("hash_member");

    expect(resolved).toEqual({
      member_id: "mem_123",
      organization_id: "org_123",
      role: "owner",
      revoked_at: null,
      expires_at: null
    });
    expect(query).toHaveBeenCalledOnce();
    const sql = String(query.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("om.suspended_at IS NULL");
    expect(sql).toContain("org.suspended_at IS NULL");
    expect(sql).toContain("UPDATE member_tokens");
    expect(sql).toContain("SET last_used_at = now()");
    expect(sql).toContain("resolved_token.revoked_at IS NULL");
    expect(sql).toContain("resolved_token.expires_at > now()");
    expect(sql).toContain("member_tokens.last_used_at < now() - $2::interval");
    expect(query).toHaveBeenCalledWith(expect.any(String), ["hash_member", "5 minutes"]);
  });

  it("should list and create scoped project tokens", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "proj_123" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            token_id: "11111111-1111-4111-8111-111111111111",
            project_id: "proj_123",
            label: "ci",
            created_at: "2026-03-11T00:00:00.000Z",
            last_used_at: null,
            revoked_at: null,
            expires_at: null
          }
        ]
      })
      .mockResolvedValueOnce({ rows: [{ id: "proj_123" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            token_id: "22222222-2222-4222-8222-222222222222",
            project_id: "proj_123",
            label: "agent",
            created_at: "2026-03-11T00:00:00.000Z",
            last_used_at: null,
            revoked_at: null,
            expires_at: null
          }
        ]
      });

    const store = createPostgresMetadataStore({ query });

    const listed = await store.listProjectTokensForOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      limit: 20
    });
    const created = await store.createProjectTokenForOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      label: "agent",
      allowed_origins: ["https://static.example.com"],
      token_hash: "hash_abc"
    });

    expect(listed).not.toBeNull();
    expect(listed?.[0]?.token_id).toBe("11111111-1111-4111-8111-111111111111");
    expect(created?.token_id).toBe("22222222-2222-4222-8222-222222222222");
    expect(String(query.mock.calls[1]?.[0] ?? "")).toContain("AND pt.revoked_at IS NULL");
  });

  it("should return null for out-of-scope project token operations", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const store = createPostgresMetadataStore({ query });

    const listed = await store.listProjectTokensForOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      limit: 20
    });
    const created = await store.createProjectTokenForOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      label: "ci",
      allowed_origins: [],
      token_hash: "hash_abc"
    });

    expect(listed).toBeNull();
    expect(created).toBeNull();
  });

  it("should revoke scoped project/member tokens and list member tokens", async (): Promise<void> => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            token_id: "11111111-1111-4111-8111-111111111111",
            project_id: "proj_123",
            label: "ci",
            created_at: "2026-03-11T00:00:00.000Z",
            last_used_at: null,
            revoked_at: "2026-03-11T01:00:00.000Z",
            expires_at: null
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          {
            token_id: "33333333-3333-4333-8333-333333333333",
            user_id: "usr_123",
            organization_id: "org_123",
            label: "cli",
            created_at: "2026-03-11T00:00:00.000Z",
            last_used_at: null,
            revoked_at: null,
            expires_at: null
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          {
            token_id: "33333333-3333-4333-8333-333333333333",
            user_id: "usr_123",
            organization_id: "org_123",
            label: "cli",
            created_at: "2026-03-11T00:00:00.000Z",
            last_used_at: null,
            revoked_at: null,
            expires_at: null
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          {
            token_id: "33333333-3333-4333-8333-333333333333",
            user_id: "usr_123",
            organization_id: "org_123",
            label: "cli",
            created_at: "2026-03-11T00:00:00.000Z",
            last_used_at: null,
            revoked_at: "2026-03-11T01:00:00.000Z",
            expires_at: null
          }
        ]
      });

    const store = createPostgresMetadataStore({ query });

    const revokedProject = await store.revokeProjectTokenForOrganization({
      organization_id: "org_123",
      project_id: "proj_123",
      token_id: "11111111-1111-4111-8111-111111111111",
      revoked_at: "2026-03-11T01:00:00.000Z"
    });
    const listedMember = await store.listMemberTokensForOrganization({
      organization_id: "org_123",
      user_id: "usr_123",
      limit: 20
    });
    const createdMember = await store.createMemberTokenForOrganization({
      organization_id: "org_123",
      user_id: "usr_123",
      label: "cli",
      token_hash: "hash_mem"
    });
    const revokedMember = await store.revokeMemberTokenForOrganization({
      organization_id: "org_123",
      user_id: "usr_123",
      token_id: "33333333-3333-4333-8333-333333333333",
      revoked_at: "2026-03-11T01:00:00.000Z"
    });

    expect(revokedProject?.revoked_at).toBe("2026-03-11T01:00:00.000Z");
    expect(listedMember[0]?.token_id).toBe("33333333-3333-4333-8333-333333333333");
    expect(createdMember.token_id).toBe("33333333-3333-4333-8333-333333333333");
    expect(revokedMember?.revoked_at).toBe("2026-03-11T01:00:00.000Z");
    expect(String(query.mock.calls[1]?.[0] ?? "")).toContain("AND revoked_at IS NULL");
  });

  it("should throw when member token insert returns no rows", async (): Promise<void> => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const store = createPostgresMetadataStore({ query });

    await expect(
      store.createMemberTokenForOrganization({
        organization_id: "org_123",
        user_id: "usr_123",
        label: "cli",
        token_hash: "hash_mem"
      })
    ).rejects.toThrow("member_token_insert_failed");
  });
});
