import { hashToken } from "../../../packages/auth/src/index.js";
import { createRuntimeLoggerFromEnv } from "../../../packages/runtime-logger/src/index.js";
import type { AuditLogActorType, AuditLogStore } from "../../../packages/storage/src/index.js";

const auditLogger = createRuntimeLoggerFromEnv({
  app: "api",
  defaultService: "debugbundle-api",
  env: process.env,
  ...(process.env["npm_package_version"] === undefined ? {} : { version: process.env["npm_package_version"] })
});

interface WarnLogger {
  warn(bindings: Record<string, unknown>, message: string): void;
}

export function resolveAuditActorType(headers: { authorization?: string | undefined }): AuditLogActorType {
  return headers.authorization === undefined ? "browser_session" : "member_token";
}

export function hashAuditIdentifier(value: string): string {
  return hashToken(value.trim().toLowerCase());
}

export async function recordAuditLog(
  auditLogging: Pick<AuditLogStore, "createAuditLog"> | undefined,
  input: Omit<Parameters<AuditLogStore["createAuditLog"]>[0], "occurred_at">,
  logger: WarnLogger = auditLogger
): Promise<void> {
  if (auditLogging === undefined) {
    return;
  }

  try {
    await auditLogging.createAuditLog({
      ...input,
      occurred_at: new Date().toISOString()
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(
      {
        action: input.action,
        target_type: input.target_type,
        status: input.status,
        error_message: message
      },
      "audit_log_write_failed"
    );
  }
}