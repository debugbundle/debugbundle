import { describe, expect, it, vi } from "vitest";
import { createAgentTokenStore } from "../../../packages/storage/src/agent-token-store.js";
import type { Queryable } from "../../../packages/storage/src/migrations.js";

const PROJECT = "00000000-0000-4000-8000-000000000001";
const USER = "11111111-1111-4111-8111-111111111111";

describe("agent token store", () => {
  it("validates labels before issuing and scopes revocation to actor, project, and token", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const store = createAgentTokenStore({ query } as Queryable);
    for (const label of ["", "x".repeat(121)]) {
      await expect(
        store.create({
          projectId: PROJECT,
          actorUserId: USER,
          label,
          expiresAt: "2026-10-20T00:00:00.000Z"
        })
      ).rejects.toThrow("agent_token_label_invalid");
    }
    expect(query).not.toHaveBeenCalled();
    expect(await store.resolveByTokenHash("missing")).toBeNull();
    expect(
      await store.revoke({ projectId: PROJECT, actorUserId: USER, tokenId: "token" })
    ).toBeNull();
    expect(query.mock.lastCall?.[1]).toEqual([PROJECT, USER, "token"]);
    const revoked = { token_id: "token", revoked_at: "2026-09-21T00:00:00.000Z" };
    query.mockResolvedValueOnce({ rows: [revoked] });
    expect(await store.revoke({ projectId: PROJECT, actorUserId: USER, tokenId: "token" })).toEqual(
      revoked
    );
  });
  it("resolves only with a read query and live project/issuer membership", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ project_id: PROJECT, user_id: USER }] });
    const record = await createAgentTokenStore({ query } as Queryable).resolveByTokenHash("hash");
    expect(record?.project_id).toBe(PROJECT);
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[0]).toMatch(
      /JOIN projects p|JOIN organizations org|project_members pm/
    );
    expect(query.mock.calls[0]?.[0]).not.toMatch(/UPDATE|INSERT|DELETE/);
    expect(query.mock.calls[0]?.[1]).toEqual(["hash"]);
  });

  it("creates a hashed single-project credential and never stores or lists plaintext", async () => {
    const query = vi
      .fn()
      .mockResolvedValue({ rows: [{ token_id: USER, project_id: PROJECT, label: "CI" }] });
    const store = createAgentTokenStore({ query } as Queryable);
    const created = await store.create({
      projectId: PROJECT,
      actorUserId: USER,
      label: "CI",
      expiresAt: "2026-10-20T00:00:00.000Z"
    });
    expect(created?.plaintext).toMatch(/^dbundle_agent_/);
    expect(query.mock.calls[0]?.[0]).toContain("'incident:read-minimized', 'telemetry-privacy-v1'");
    expect(query.mock.calls[0]?.[1]).not.toContain(created?.plaintext);
    const listed = await store.list({ projectId: PROJECT, actorUserId: USER });
    expect(listed?.[0]).not.toHaveProperty("plaintext");
  });

  it("does not issue a credential if the issuer loses owner/admin access", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const created = await createAgentTokenStore({ query } as Queryable).create({
      projectId: PROJECT,
      actorUserId: USER,
      label: "agent",
      expiresAt: "2026-10-20T00:00:00.000Z"
    });
    expect(created).toBeNull();
  });
});
