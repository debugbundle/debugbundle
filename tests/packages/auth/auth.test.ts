import { describe, expect, it } from "vitest";

import {
  MEMBER_TOKEN_PREFIX,
  PROJECT_TOKEN_PREFIX,
  SESSION_COOKIE_NAME,
  generateMemberToken,
  generateProjectToken,
  hashToken,
  readBearerToken,
  readCookieValue,
  requireMemberToken,
  requireProjectToken,
  validateMemberToken,
  validateProjectToken
} from "../../../packages/auth/src/index.js";

describe("auth token primitives", () => {
  it("generates project and member tokens with canonical prefixes", (): void => {
    const project = generateProjectToken("proj_123");
    const member = generateMemberToken("mem_123");

    expect(project.plaintext.startsWith(PROJECT_TOKEN_PREFIX)).toBe(true);
    expect(member.plaintext.startsWith(MEMBER_TOKEN_PREFIX)).toBe(true);
    expect(project.hash).toBe(hashToken(project.plaintext));
    expect(member.hash).toBe(hashToken(member.plaintext));
  });

  it("hashes tokens deterministically with sha256 hex output", (): void => {
    const token = "dbundle_proj_secret";

    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).toHaveLength(64);
    expect(hashToken(token)).not.toBe(token);
  });

  it("validates project and member token guards", async (): Promise<void> => {
    const project = await validateProjectToken("dbundle_proj_abc", () =>
      Promise.resolve({ project_id: "proj_123" })
    );
    const member = await validateMemberToken("dbundle_mem_abc", () =>
      Promise.resolve({ member_id: "mem_123", organization_id: "org_123" })
    );

    expect(project).toEqual({ ok: true, context: { project_id: "proj_123" } });
    expect(member).toEqual({
      ok: true,
      context: { member_id: "mem_123", organization_id: "org_123" }
    });
  });

  it("rejects invalid, expired, and revoked token contexts", async (): Promise<void> => {
    await expect(
      validateProjectToken("wrong-prefix", () => Promise.resolve({ project_id: "proj_123" }))
    ).resolves.toEqual({
      ok: false,
      error: "invalid_token"
    });
    await expect(
      validateMemberToken("dbundle_mem_missing", () => Promise.resolve(null))
    ).resolves.toEqual({
      ok: false,
      error: "invalid_token"
    });
    await expect(
      validateMemberToken("dbundle_mem_revoked", () =>
        Promise.resolve({
          member_id: "mem_123",
          organization_id: "org_123",
          revoked_at: "2026-03-16T00:00:00.000Z"
        })
      )
    ).resolves.toEqual({
      ok: false,
      error: "token_revoked"
    });
    await expect(
      validateMemberToken(
        "dbundle_mem_expired",
        () =>
          Promise.resolve({
            member_id: "mem_123",
            organization_id: "org_123",
            expires_at: "2026-03-16T00:00:00.000Z"
          }),
        { now: new Date("2026-03-16T00:00:01.000Z") }
      )
    ).resolves.toEqual({
      ok: false,
      error: "token_expired"
    });
  });

  it("enforces project and member token route guards", async (): Promise<void> => {
    const acceptedProject = await requireProjectToken({
      authorizationHeader: "Bearer dbundle_proj_valid",
      resolveByTokenHash: () => Promise.resolve({ project_id: "proj_123" })
    });
    const rejectedProject = await requireProjectToken({
      authorizationHeader: "Bearer dbundle_mem_wrong_scope",
      resolveByTokenHash: () => Promise.resolve({ project_id: "proj_123" })
    });
    const acceptedMember = await requireMemberToken({
      authorizationHeader: "Bearer dbundle_mem_valid",
      resolveByTokenHash: () =>
        Promise.resolve({ member_id: "mem_123", organization_id: "org_123" })
    });
    const rejectedMember = await requireMemberToken({
      authorizationHeader: "Bearer dbundle_proj_wrong_scope",
      resolveByTokenHash: () =>
        Promise.resolve({ member_id: "mem_123", organization_id: "org_123" })
    });

    expect(acceptedProject).toEqual({ ok: true, context: { project_id: "proj_123" } });
    expect(rejectedProject).toEqual({ ok: false, error: "invalid_project_token" });
    expect(acceptedMember).toEqual({
      ok: true,
      context: { member_id: "mem_123", organization_id: "org_123" }
    });
    expect(rejectedMember).toEqual({ ok: false, error: "invalid_member_token" });
  });

  it("parses bearer headers and cookie values safely", (): void => {
    expect(readBearerToken("Bearer dbundle_proj_abc")).toBe("dbundle_proj_abc");
    expect(readBearerToken("Basic abc")).toBeNull();
    expect(readCookieValue(undefined, SESSION_COOKIE_NAME)).toBeNull();
    expect(
      readCookieValue(`${SESSION_COOKIE_NAME}=session-secret; theme=light`, SESSION_COOKIE_NAME)
    ).toBe("session-secret");
  });
});
