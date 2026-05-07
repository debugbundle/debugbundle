import { describe, expect, it, vi } from "vitest";

import { createPostgresAuditLogStore } from "../../../packages/storage/src/index.js";

describe("audit log store", () => {
  it("creates audit log records", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          audit_log_id: "44444444-4444-4444-8444-444444444444",
          organization_id: "org_123",
          actor_user_id: "usr_123",
          actor_type: "browser_session",
          action: "auth.login",
          target_type: "session",
          target_id: "ses_123",
          status: "success",
          ip_address: "127.0.0.1",
          metadata: { authentication_method: "password" },
          occurred_at: "2026-04-03T12:00:00.000Z",
          created_at: "2026-04-03T12:00:00.100Z"
        }
      ]
    });

    const store = createPostgresAuditLogStore({ query });

    await expect(
      store.createAuditLog({
        organization_id: "org_123",
        actor_user_id: "usr_123",
        actor_type: "browser_session",
        action: "auth.login",
        target_type: "session",
        target_id: "ses_123",
        status: "success",
        ip_address: "127.0.0.1",
        metadata: { authentication_method: "password" },
        occurred_at: "2026-04-03T12:00:00.000Z"
      })
    ).resolves.toEqual({
      audit_log_id: "44444444-4444-4444-8444-444444444444",
      organization_id: "org_123",
      actor_user_id: "usr_123",
      actor_type: "browser_session",
      action: "auth.login",
      target_type: "session",
      target_id: "ses_123",
      status: "success",
      ip_address: "127.0.0.1",
      metadata: { authentication_method: "password" },
      occurred_at: "2026-04-03T12:00:00.000Z",
      created_at: "2026-04-03T12:00:00.100Z"
    });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO audit_logs"),
      [
        expect.any(String),
        "org_123",
        "usr_123",
        "browser_session",
        "auth.login",
        "session",
        "ses_123",
        "success",
        "127.0.0.1",
        JSON.stringify({ authentication_method: "password" }),
        "2026-04-03T12:00:00.000Z"
      ]
    );
  });

  it("throws when insert returns no rows", async () => {
    const store = createPostgresAuditLogStore({
      query: vi.fn().mockResolvedValue({ rows: [] })
    });

    await expect(
      store.createAuditLog({
        organization_id: null,
        actor_user_id: null,
        actor_type: "anonymous",
        action: "auth.login",
        target_type: "session",
        target_id: null,
        status: "failure",
        ip_address: "127.0.0.1",
        metadata: { reason: "invalid_credentials" },
        occurred_at: "2026-04-03T12:00:00.000Z"
      })
    ).rejects.toThrow("audit_log_insert_failed");
  });
});