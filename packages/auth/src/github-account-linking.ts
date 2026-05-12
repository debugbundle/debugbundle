import type { GitHubOAuthIdentity } from "./github-auth-client.js";
import type { GitHubUserAccountInput, GitHubUserAccountResult, WebUserAccount } from "./primitives.js";
import { normalizeEmail } from "./primitives.js";

export interface GitHubAccountResolverStore {
  findUserAccountByEmail(email: string): Promise<WebUserAccount | null>;
  findGitHubUserAccountByProviderUserId?(githubUserId: string): Promise<WebUserAccount | null>;
  upsertGitHubUserAccount(input: GitHubUserAccountInput): Promise<GitHubUserAccountResult>;
}

export type ResolveGitHubAccountResult =
  | {
      ok: true;
      account: GitHubUserAccountResult;
    }
  | {
      ok: false;
      error: "account_signup_disabled";
    };

export async function resolveGitHubAccountForIdentity(input: {
  store: GitHubAccountResolverStore;
  identity: GitHubOAuthIdentity;
  verified_at: string;
  accepted_terms_at?: string;
  isNewAccountSignupAllowed: (email: string) => boolean;
}): Promise<ResolveGitHubAccountResult> {
  const normalizedEmail = normalizeEmail(input.identity.email);
  const existingGithubAccount =
    (await input.store.findGitHubUserAccountByProviderUserId?.(input.identity.github_user_id)) ?? null;
  const existingEmailAccount = existingGithubAccount ?? (await input.store.findUserAccountByEmail(normalizedEmail));

  if (existingGithubAccount === null && existingEmailAccount === null && !input.isNewAccountSignupAllowed(normalizedEmail)) {
    return {
      ok: false,
      error: "account_signup_disabled"
    };
  }

  return {
    ok: true,
    account: await input.store.upsertGitHubUserAccount({
      github_user_id: input.identity.github_user_id,
      email: normalizedEmail,
      verified_at: input.verified_at,
      ...(input.accepted_terms_at === undefined ? {} : { accepted_terms_at: input.accepted_terms_at })
    })
  };
}
