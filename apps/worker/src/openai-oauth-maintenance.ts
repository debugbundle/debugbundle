import type { RuntimeLogger } from "../../../packages/runtime-logger/src/index.js";
import type { OpenAiOAuthCleanupResult } from "../../../packages/storage/src/openai-oauth-store.js";

export interface OpenAiOAuthMaintenance {
  runIfDue(): Promise<boolean>;
}

export function createOpenAiOAuthMaintenance(input: {
  cleanupExpiredCredentials(request: { limit: number }): Promise<OpenAiOAuthCleanupResult>;
  logger: RuntimeLogger;
  intervalMs: number;
  batchSize: number;
  reviewerCredentialExpiresAt?: string;
  now?: () => number;
}): OpenAiOAuthMaintenance {
  let lastAttemptAt = 0;
  const now = input.now ?? Date.now;

  return {
    async runIfDue(): Promise<boolean> {
      const startedAt = now();
      if (lastAttemptAt !== 0 && startedAt - lastAttemptAt < input.intervalMs) {
        return false;
      }
      lastAttemptAt = startedAt;

      if (input.reviewerCredentialExpiresAt !== undefined) {
        const remainingMs = new Date(input.reviewerCredentialExpiresAt).getTime() - startedAt;
        const remainingDays = Math.floor(remainingMs / (24 * 60 * 60 * 1_000));
        if (remainingDays <= 14) {
          input.logger.warn(
            {
              event: "openai_reviewer_credential_expiring",
              remaining_days: remainingDays,
              expired: remainingMs <= 0
            },
            "openai_reviewer_credential_expiring"
          );
        }
      }

      const result = await input.cleanupExpiredCredentials({ limit: input.batchSize });
      input.logger.info(
        {
          event: "openai_oauth_cleanup",
          provider_artifacts_deleted: result.providerArtifacts,
          authorization_codes_deleted: result.authorizationCodes,
          refresh_tokens_deleted: result.refreshTokens,
          grants_deleted: result.grants,
          duration_ms: Math.max(0, Math.round(now() - startedAt))
        },
        "openai_oauth_cleanup_completed"
      );
      return true;
    }
  };
}
