import { describe, expect, it, vi } from "vitest";

import { hashToken } from "../../../packages/auth/src/index.js";
import { hashAuditIdentifier, recordAuditLog, resolveAuditActorType } from "../../../apps/api/src/audit-logging.ts";

describe("api audit logging helpers", () => {
  it("resolves audit actor type from authorization headers", () => {
    expect(resolveAuditActorType({})).toBe("browser_session");
    expect(resolveAuditActorType({ authorization: "Bearer dbundle_mem_test" })).toBe("member_token");
  });

  it("normalizes identifiers before hashing them for audit metadata", () => {
    expect(hashAuditIdentifier("  OWEN@EXAMPLE.COM ")).toBe(hashToken("owen@example.com"));
  });

  it("records audit logs when a store is configured", async () => {
    const createAuditLog = vi.fn().mockResolvedValue(undefined);

    await recordAuditLog(
      { createAuditLog },
      {
        organization_id: "org_123",
        actor_user_id: "usr_123",
        actor_type: "browser_session",
        action: "auth.login",
        target_type: "session",
        target_id: "ses_123",
        status: "success",
        ip_address: "127.0.0.1",
        metadata: { authentication_method: "password" }
      }
    );

    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: "org_123",
        actor_user_id: "usr_123",
        actor_type: "browser_session",
        action: "auth.login",
        target_type: "session",
        target_id: "ses_123",
        status: "success",
        ip_address: "127.0.0.1",
        metadata: { authentication_method: "password" },
        occurred_at: expect.any(String)
      })
    );
  });

  it("fails open and emits a sanitized warning when audit persistence fails", async () => {
    const createAuditLog = vi.fn().mockRejectedValue(new Error("db offline"));
    const logger = {
      warn: vi.fn()
    };

    await expect(
      recordAuditLog(
        { createAuditLog },
        {
          organization_id: null,
          actor_user_id: null,
          actor_type: "anonymous",
          action: "auth.login",
          target_type: "session",
          target_id: null,
          status: "failure",
          ip_address: "127.0.0.1",
          metadata: { email_hash: "secret_hash" }
        },
        logger
      )
    ).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledWith(
      {
        action: "auth.login",
        target_type: "session",
        status: "failure",
        error_message: "db offline"
      },
      "audit_log_write_failed"
    );
  });
});