import type { GitHubOAuthIdentity } from "./github-auth-client.js";
import type {
  GitHubUserAccountInput,
  GitHubUserAccountResult,
  SignupOfferHint
} from "./primitives.js";
import { normalizeEmail } from "./primitives.js";

export interface GitHubAccountResolverStore {
  upsertGitHubUserAccount(input: GitHubUserAccountInput): Promise<GitHubUserAccountResult>;
}

export async function resolveGitHubAccountForIdentity(input: {
  store: GitHubAccountResolverStore;
  signup_offer?: SignupOfferHint;
  identity: GitHubOAuthIdentity;
  verified_at: string;
  accepted_terms_at?: string;
}): Promise<GitHubUserAccountResult> {
  const normalizedEmail = normalizeEmail(input.identity.email);
  return input.store.upsertGitHubUserAccount({
    github_user_id: input.identity.github_user_id,
    email: normalizedEmail,
    verified_at: input.verified_at,
    ...(input.signup_offer ? { signup_offer: input.signup_offer } : {}),
    ...(input.accepted_terms_at === undefined ? {} : { accepted_terms_at: input.accepted_terms_at })
  });
}
