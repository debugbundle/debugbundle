import {
  type AuthEmailSender,
  generateEmailAuthCode,
  hashToken,
  normalizeEmail
} from "./primitives.js";

const DEFAULT_ACCOUNT_DELETION_CODE_LIFETIME_MS = 1000 * 60 * 10;

export interface AccountDeletionChallengeStore {
  replaceAccountDeletionChallenge(input: {
    organization_id: string;
    user_id: string;
    email: string;
    code_hash: string;
    expires_at: string;
    replaced_at: string;
  }): Promise<void>;
  consumeAccountDeletionChallenge(input: {
    organization_id: string;
    user_id: string;
    email: string;
    code_hash: string;
    used_at: string;
  }): Promise<{ email: string } | null>;
}

export interface AccountDeletionChallengeServiceOptions {
  authEmails?: Pick<AuthEmailSender, "sendAccountDeletionOtp">;
  codeLifetimeMs?: number;
}

export interface AccountDeletionChallengeService {
  requestDeletionOtp(input: {
    organization_id: string;
    user_id: string;
    email: string;
    now?: Date;
  }): Promise<{ ok: true; code_sent: boolean }>;
  verifyDeletionOtp(input: {
    organization_id: string;
    user_id: string;
    email: string;
    code: string;
    now?: Date;
  }): Promise<{ ok: true } | { ok: false; error: "invalid_code" }>;
}

export function createAccountDeletionChallengeService(
  store: AccountDeletionChallengeStore,
  options: AccountDeletionChallengeServiceOptions = {}
): AccountDeletionChallengeService {
  const codeLifetimeMs = options.codeLifetimeMs ?? DEFAULT_ACCOUNT_DELETION_CODE_LIFETIME_MS;

  return {
    async requestDeletionOtp(input) {
      const normalizedEmail = normalizeEmail(input.email);
      const now = input.now ?? new Date();
      const sender = options.authEmails?.sendAccountDeletionOtp;

      if (sender === undefined) {
        return { ok: true, code_sent: false };
      }

      const authCode = generateEmailAuthCode();
      await store.replaceAccountDeletionChallenge({
        organization_id: input.organization_id,
        user_id: input.user_id,
        email: normalizedEmail,
        code_hash: authCode.hash,
        expires_at: new Date(now.getTime() + codeLifetimeMs).toISOString(),
        replaced_at: now.toISOString()
      });
      await sender({
        email: normalizedEmail,
        code: authCode.plaintext,
        expires_in_minutes: Math.round(codeLifetimeMs / 60_000)
      });

      return { ok: true, code_sent: true };
    },

    async verifyDeletionOtp(input) {
      const normalizedEmail = normalizeEmail(input.email);
      const now = input.now ?? new Date();
      const consumed = await store.consumeAccountDeletionChallenge({
        organization_id: input.organization_id,
        user_id: input.user_id,
        email: normalizedEmail,
        code_hash: hashToken(input.code),
        used_at: now.toISOString()
      });

      if (consumed === null) {
        return {
          ok: false,
          error: "invalid_code"
        };
      }

      return { ok: true };
    }
  };
}
