import { randomUUID } from "node:crypto";

import type {
  GitHubOAuthConfig,
  GitHubOAuthIdentity
} from "./github-auth-client.js";
import { resolveGitHubAccountForIdentity } from "./github-account-linking.js";
import {
  type GitHubUserAccountResult,
  type IssuedMemberTokenRecord,
  type WebUserAccount,
  generateMemberToken,
  normalizeEmail
} from "./primitives.js";

const DEFAULT_GITHUB_DEVICE_SCOPE = "read:user user:email";

export interface GitHubDeviceAuthorizationRecord {
  request_id: string;
  device_code: string;
  user_code: string;
  verification_uri: string;
  interval_seconds: number;
  expires_at: string;
  accepted_terms_at: string | null;
  created_at: string;
  completed_at: string | null;
  claimed_at: string | null;
  terminal_error: string | null;
  user_id: string | null;
  organization_id: string | null;
}

export interface GitHubCliAuthStore {
  findUserAccountByEmail(email: string): Promise<WebUserAccount | null>;
  findGitHubUserAccountByProviderUserId?(githubUserId: string): Promise<WebUserAccount | null>;
  upsertGitHubUserAccount(input: {
    github_user_id: string;
    email: string;
    verified_at: string;
    accepted_terms_at?: string;
  }): Promise<GitHubUserAccountResult>;
  createGitHubDeviceAuthorization(input: {
    request_id: string;
    device_code: string;
    user_code: string;
    verification_uri: string;
    interval_seconds: number;
    expires_at: string;
    accepted_terms_at: string | null;
    created_at: string;
  }): Promise<GitHubDeviceAuthorizationRecord>;
  getGitHubDeviceAuthorization(requestId: string): Promise<GitHubDeviceAuthorizationRecord | null>;
  completeGitHubDeviceAuthorization(input: {
    request_id: string;
    user_id: string;
    organization_id: string;
    completed_at: string;
  }): Promise<boolean>;
  setGitHubDeviceAuthorizationTerminalError(input: {
    request_id: string;
    terminal_error: string;
  }): Promise<boolean>;
  claimGitHubDeviceAuthorizationMemberToken(input: {
    request_id: string;
    token_id: string;
    token_hash: string;
    label: string;
    claimed_at: string;
  }): Promise<
    | IssuedMemberTokenRecord
    | "not_found"
    | "pending"
    | "expired"
    | "claimed"
    | "terminal_error"
  >;
  issueMemberTokenForUser(input: {
    token_id: string;
    user_id: string;
    organization_id: string;
    token_hash: string;
    label: string;
    created_at: string;
  }): Promise<IssuedMemberTokenRecord>;
}

export type BeginGitHubDeviceAuthResult =
  | {
      ok: true;
      request_id: string;
      user_code: string;
      verification_uri: string;
      interval_seconds: number;
      expires_at: string;
    }
  | {
      ok: false;
      error: "provider_not_configured" | "device_flow_disabled" | "provider_error";
    };

export type PollGitHubDeviceAuthResult =
  | {
      ok: true;
      status: "pending";
      interval_seconds: number;
      expires_at: string;
    }
  | {
      ok: true;
      status: "approved" | "claimed";
      expires_at: string;
    }
  | {
      ok: true;
      status: "denied" | "expired";
      reason: "access_denied" | "expired_token";
      expires_at: string;
    }
  | {
      ok: true;
      status: "rejected";
      reason: "github_email_unavailable" | "account_signup_disabled" | "account_suspended" | "provider_error";
      expires_at: string;
    }
  | {
      ok: false;
      error: "provider_not_configured" | "request_not_found";
    };

export type ClaimGitHubDeviceAuthResult =
  | {
      ok: true;
      token: IssuedMemberTokenRecord & { plaintext: string };
    }
  | {
      ok: false;
      error: "provider_not_configured" | "request_not_found" | "pending" | "expired" | "claimed" | "rejected";
    };

export type ExchangeGitHubAccessTokenResult =
  | {
      ok: true;
      token: IssuedMemberTokenRecord & { plaintext: string };
      created_user: boolean;
    }
  | {
      ok: false;
      error:
        | "provider_not_configured"
        | "oauth_exchange_failed"
        | "github_email_unavailable"
        | "account_signup_disabled"
        | "account_suspended";
    };

export interface GitHubCliAuthService {
  beginDeviceAuth(input: { accepted_terms_at: string; now?: Date }): Promise<BeginGitHubDeviceAuthResult>;
  pollDeviceAuth(input: { request_id: string; now?: Date }): Promise<PollGitHubDeviceAuthResult>;
  claimDeviceAuth(input: { request_id: string; label: string; now?: Date }): Promise<ClaimGitHubDeviceAuthResult>;
  exchangeGitHubAccessToken(input: {
    github_access_token: string;
    label: string;
    accepted_terms_at: string;
    now?: Date;
  }): Promise<ExchangeGitHubAccessTokenResult>;
}

export function createGitHubCliAuthService(
  store: GitHubCliAuthStore,
  options: {
    signupEmailAllowlist?: readonly string[];
    githubOAuth?: GitHubOAuthConfig;
  } = {}
): GitHubCliAuthService {
  const signupEmailAllowlist =
    options.signupEmailAllowlist === undefined
      ? null
      : new Set(options.signupEmailAllowlist.map((email) => normalizeEmail(email)).filter((email) => email.length > 0));

  function isNewAccountSignupAllowed(email: string): boolean {
    return signupEmailAllowlist === null || signupEmailAllowlist.has(email);
  }

  async function resolveGitHubAccount(input: {
    identity: GitHubOAuthIdentity;
    accepted_terms_at: string;
    now: Date;
  }): Promise<
    | {
        ok: true;
        account: GitHubUserAccountResult;
      }
    | {
        ok: false;
        error: "account_signup_disabled";
      }
  > {
    return resolveGitHubAccountForIdentity({
      store,
      identity: input.identity,
      verified_at: input.now.toISOString(),
      accepted_terms_at: input.accepted_terms_at,
      isNewAccountSignupAllowed
    });
  }

  return {
    async beginDeviceAuth(input): Promise<BeginGitHubDeviceAuthResult> {
      const githubOAuth = options.githubOAuth;
      if (githubOAuth === undefined) {
        return {
          ok: false,
          error: "provider_not_configured"
        };
      }

      const started = await githubOAuth.client.beginDeviceAuthorization({
        scope: DEFAULT_GITHUB_DEVICE_SCOPE
      });
      if (!started.ok) {
        return {
          ok: false,
          error: started.error
        };
      }

      const now = input.now ?? new Date();
      const requestId = randomUUID();
      const expiresAt = new Date(now.getTime() + (started.expires_in * 1_000)).toISOString();
      await store.createGitHubDeviceAuthorization({
        request_id: requestId,
        device_code: started.device_code,
        user_code: started.user_code,
        verification_uri: started.verification_uri,
        interval_seconds: started.interval,
        expires_at: expiresAt,
        accepted_terms_at: input.accepted_terms_at,
        created_at: now.toISOString()
      });

      return {
        ok: true,
        request_id: requestId,
        user_code: started.user_code,
        verification_uri: started.verification_uri,
        interval_seconds: started.interval,
        expires_at: expiresAt
      };
    },

    async pollDeviceAuth(input): Promise<PollGitHubDeviceAuthResult> {
      const githubOAuth = options.githubOAuth;
      if (githubOAuth === undefined) {
        return {
          ok: false,
          error: "provider_not_configured"
        };
      }

      const request = await store.getGitHubDeviceAuthorization(input.request_id);
      if (request === null) {
        return {
          ok: false,
          error: "request_not_found"
        };
      }

      const now = input.now ?? new Date();
      if (request.claimed_at !== null) {
        return {
          ok: true,
          status: "claimed",
          expires_at: request.expires_at
        };
      }
      if (request.completed_at !== null && request.user_id !== null && request.organization_id !== null) {
        return {
          ok: true,
          status: "approved",
          expires_at: request.expires_at
        };
      }
      if (request.terminal_error === "access_denied") {
        return {
          ok: true,
          status: "denied",
          reason: "access_denied",
          expires_at: request.expires_at
        };
      }
      if (request.terminal_error === "expired_token") {
        return {
          ok: true,
          status: "expired",
          reason: "expired_token",
          expires_at: request.expires_at
        };
      }
      if (
        request.terminal_error === "github_email_unavailable"
        || request.terminal_error === "account_signup_disabled"
        || request.terminal_error === "account_suspended"
        || request.terminal_error === "provider_error"
      ) {
        return {
          ok: true,
          status: "rejected",
          reason: request.terminal_error,
          expires_at: request.expires_at
        };
      }
      if (Date.parse(request.expires_at) <= now.getTime()) {
        await store.setGitHubDeviceAuthorizationTerminalError({
          request_id: request.request_id,
          terminal_error: "expired_token"
        });
        return {
          ok: true,
          status: "expired",
          reason: "expired_token",
          expires_at: request.expires_at
        };
      }

      const polled = await githubOAuth.client.pollDeviceAuthorization({
        device_code: request.device_code,
        interval_seconds: request.interval_seconds
      });

      if (polled.status === "pending") {
        return {
          ok: true,
          status: "pending",
          interval_seconds: polled.interval_seconds,
          expires_at: request.expires_at
        };
      }

      if (polled.status === "denied") {
        await store.setGitHubDeviceAuthorizationTerminalError({
          request_id: request.request_id,
          terminal_error: "access_denied"
        });
        return {
          ok: true,
          status: "denied",
          reason: "access_denied",
          expires_at: request.expires_at
        };
      }

      if (polled.status === "expired") {
        await store.setGitHubDeviceAuthorizationTerminalError({
          request_id: request.request_id,
          terminal_error: "expired_token"
        });
        return {
          ok: true,
          status: "expired",
          reason: "expired_token",
          expires_at: request.expires_at
        };
      }

      if (polled.status === "email_unavailable") {
        await store.setGitHubDeviceAuthorizationTerminalError({
          request_id: request.request_id,
          terminal_error: "github_email_unavailable"
        });
        return {
          ok: true,
          status: "rejected",
          reason: "github_email_unavailable",
          expires_at: request.expires_at
        };
      }

      if (polled.status === "provider_error") {
        await store.setGitHubDeviceAuthorizationTerminalError({
          request_id: request.request_id,
          terminal_error: "provider_error"
        });
        return {
          ok: true,
          status: "rejected",
          reason: "provider_error",
          expires_at: request.expires_at
        };
      }

      if (polled.status !== "approved") {
        return {
          ok: true,
          status: "rejected",
          reason: "provider_error",
          expires_at: request.expires_at
        };
      }

      const resolvedAccount = await resolveGitHubAccount({
        identity: polled.identity,
        accepted_terms_at: request.accepted_terms_at ?? now.toISOString(),
        now
      });
      if (!resolvedAccount.ok) {
        await store.setGitHubDeviceAuthorizationTerminalError({
          request_id: request.request_id,
          terminal_error: "account_signup_disabled"
        });
        return {
          ok: true,
          status: "rejected",
          reason: "account_signup_disabled",
          expires_at: request.expires_at
        };
      }

      const completed = await store.completeGitHubDeviceAuthorization({
        request_id: request.request_id,
        user_id: resolvedAccount.account.user_id,
        organization_id: resolvedAccount.account.organization_id,
        completed_at: now.toISOString()
      });

      if (!completed) {
        await store.setGitHubDeviceAuthorizationTerminalError({
          request_id: request.request_id,
          terminal_error: "account_suspended"
        });
        return {
          ok: true,
          status: "rejected",
          reason: "account_suspended",
          expires_at: request.expires_at
        };
      }

      return {
        ok: true,
        status: "approved",
        expires_at: request.expires_at
      };
    },

    async claimDeviceAuth(input): Promise<ClaimGitHubDeviceAuthResult> {
      if (options.githubOAuth === undefined) {
        return {
          ok: false,
          error: "provider_not_configured"
        };
      }

      const generated = generateMemberToken(input.request_id);
      const claimed = await store.claimGitHubDeviceAuthorizationMemberToken({
        request_id: input.request_id,
        token_id: randomUUID(),
        token_hash: generated.hash,
        label: input.label,
        claimed_at: (input.now ?? new Date()).toISOString()
      });

      if (claimed === "not_found") {
        return {
          ok: false,
          error: "request_not_found"
        };
      }
      if (claimed === "pending") {
        return {
          ok: false,
          error: "pending"
        };
      }
      if (claimed === "expired") {
        return {
          ok: false,
          error: "expired"
        };
      }
      if (claimed === "claimed") {
        return {
          ok: false,
          error: "claimed"
        };
      }
      if (claimed === "terminal_error") {
        return {
          ok: false,
          error: "rejected"
        };
      }

      return {
        ok: true,
        token: {
          ...claimed,
          plaintext: generated.plaintext
        }
      };
    },

    async exchangeGitHubAccessToken(input): Promise<ExchangeGitHubAccessTokenResult> {
      const githubOAuth = options.githubOAuth;
      if (githubOAuth === undefined) {
        return {
          ok: false,
          error: "provider_not_configured"
        };
      }

      const resolvedIdentity = await githubOAuth.client.resolveIdentityFromAccessToken({
        access_token: input.github_access_token
      });
      if (!resolvedIdentity.ok) {
        return {
          ok: false,
          error: resolvedIdentity.error === "email_unavailable" ? "github_email_unavailable" : "oauth_exchange_failed"
        };
      }

      const now = input.now ?? new Date();
      const resolvedAccount = await resolveGitHubAccount({
        identity: resolvedIdentity.identity,
        accepted_terms_at: input.accepted_terms_at,
        now
      });
      if (!resolvedAccount.ok) {
        return {
          ok: false,
          error: "account_signup_disabled"
        };
      }

      const generated = generateMemberToken(resolvedAccount.account.user_id);
      const issued = await store.issueMemberTokenForUser({
        token_id: randomUUID(),
        user_id: resolvedAccount.account.user_id,
        organization_id: resolvedAccount.account.organization_id,
        token_hash: generated.hash,
        label: input.label,
        created_at: now.toISOString()
      });

      return {
        ok: true,
        token: {
          ...issued,
          plaintext: generated.plaintext
        },
        created_user: resolvedAccount.account.created_user
      };
    }
  };
}
