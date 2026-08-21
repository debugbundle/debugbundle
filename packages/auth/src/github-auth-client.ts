import { normalizeEmail } from "./primitives.js";

const DEFAULT_GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const DEFAULT_GITHUB_ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token";
const DEFAULT_GITHUB_DEVICE_CODE_URL = "https://github.com/login/device/code";
const DEFAULT_GITHUB_USER_URL = "https://api.github.com/user";
const DEFAULT_GITHUB_EMAILS_URL = "https://api.github.com/user/emails";
const GITHUB_OAUTH_ISSUER = "https://github.com/login/oauth";

export interface GitHubOAuthIdentity {
  github_user_id: string;
  email: string;
  avatar_url?: string;
}

export type GitHubAccessTokenIdentityResult =
  | {
      ok: true;
      identity: GitHubOAuthIdentity;
    }
  | {
      ok: false;
      error: "token_invalid" | "email_unavailable";
    };

export type GitHubDeviceAuthorizationStartResult =
  | {
      ok: true;
      device_code: string;
      user_code: string;
      verification_uri: string;
      expires_in: number;
      interval: number;
    }
  | {
      ok: false;
      error: "device_flow_disabled" | "provider_error";
    };

export type GitHubDeviceAuthorizationPollResult =
  | {
      status: "pending";
      interval_seconds: number;
    }
  | {
      status: "approved";
      identity: GitHubOAuthIdentity;
    }
  | {
      status: "denied" | "expired" | "email_unavailable" | "provider_error";
    };

export interface GitHubOAuthClient {
  exchangeCodeForIdentity(input: { code: string }): Promise<GitHubOAuthIdentity | null>;
  resolveIdentityFromAccessToken(input: { access_token: string }): Promise<GitHubAccessTokenIdentityResult>;
  beginDeviceAuthorization(input: { scope?: string }): Promise<GitHubDeviceAuthorizationStartResult>;
  pollDeviceAuthorization(input: { device_code: string; interval_seconds: number }): Promise<GitHubDeviceAuthorizationPollResult>;
}

export interface GitHubOAuthClientConfig {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  authorizeUrl?: string;
  accessTokenUrl?: string;
  deviceCodeUrl?: string;
  userUrl?: string;
  emailsUrl?: string;
  fetchImplementation?: typeof fetch;
}

export interface GitHubOAuthConfig {
  clientId: string;
  callbackUrl: string;
  appRedirectUrl: string;
  authorizeUrl?: string;
  stateSecret: string;
  stateLifetimeMs?: number;
  client: GitHubOAuthClient;
}

async function resolveIdentityFromAccessToken(
  fetchImplementation: typeof fetch,
  input: {
    accessToken: string;
    userUrl: string;
    emailsUrl: string;
  }
): Promise<GitHubAccessTokenIdentityResult> {
  const authorizationHeader = `Bearer ${input.accessToken}`;
  const userResponse = await fetchImplementation(input.userUrl, {
    headers: {
      Accept: "application/json",
      Authorization: authorizationHeader,
      "User-Agent": "debugbundle"
    }
  });

  if (!userResponse.ok) {
    return {
      ok: false,
      error: "token_invalid"
    };
  }

  const userPayload = (await userResponse.json()) as {
    id?: string | number;
    email?: string | null;
    avatar_url?: string | null;
  };
  const githubUserId = userPayload.id === undefined ? null : String(userPayload.id);
  if (githubUserId === null || githubUserId.length === 0) {
    return {
      ok: false,
      error: "token_invalid"
    };
  }

  let email = typeof userPayload.email === "string" && userPayload.email.length > 0 ? normalizeEmail(userPayload.email) : null;
  if (email === null) {
    const emailsResponse = await fetchImplementation(input.emailsUrl, {
      headers: {
        Accept: "application/json",
        Authorization: authorizationHeader,
        "User-Agent": "debugbundle"
      }
    });
    if (!emailsResponse.ok) {
      return {
        ok: false,
        error: "email_unavailable"
      };
    }

    const emailsPayload = (await emailsResponse.json()) as Array<{
      email?: string;
      primary?: boolean;
      verified?: boolean;
    }>;
    const primaryVerifiedEmail = emailsPayload.find(
      (entry) => entry.primary === true && entry.verified === true && typeof entry.email === "string"
    );

    if (primaryVerifiedEmail?.email === undefined) {
      return {
        ok: false,
        error: "email_unavailable"
      };
    }

    email = normalizeEmail(primaryVerifiedEmail.email);
  }

  return {
    ok: true,
    identity: {
      github_user_id: githubUserId,
      email,
      ...(typeof userPayload.avatar_url === "string" && userPayload.avatar_url.length > 0
        ? { avatar_url: userPayload.avatar_url }
        : {})
    }
  };
}

export function createGitHubOAuthClient(config: GitHubOAuthClientConfig): GitHubOAuthClient {
  const fetchImplementation = config.fetchImplementation ?? fetch;
  const accessTokenUrl = config.accessTokenUrl ?? DEFAULT_GITHUB_ACCESS_TOKEN_URL;
  const deviceCodeUrl = config.deviceCodeUrl ?? DEFAULT_GITHUB_DEVICE_CODE_URL;
  const userUrl = config.userUrl ?? DEFAULT_GITHUB_USER_URL;
  const emailsUrl = config.emailsUrl ?? DEFAULT_GITHUB_EMAILS_URL;

  return {
    async exchangeCodeForIdentity(input): Promise<GitHubOAuthIdentity | null> {
      const tokenResponse = await fetchImplementation(accessTokenUrl, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          code: input.code,
          redirect_uri: config.callbackUrl
        })
      });
      if (!tokenResponse.ok) {
        return null;
      }

      const tokenPayload = (await tokenResponse.json()) as { access_token?: string };
      if (typeof tokenPayload.access_token !== "string" || tokenPayload.access_token.length === 0) {
        return null;
      }

      const resolved = await resolveIdentityFromAccessToken(fetchImplementation, {
        accessToken: tokenPayload.access_token,
        userUrl,
        emailsUrl
      });

      return resolved.ok ? resolved.identity : null;
    },

    async resolveIdentityFromAccessToken(input): Promise<GitHubAccessTokenIdentityResult> {
      return resolveIdentityFromAccessToken(fetchImplementation, {
        accessToken: input.access_token,
        userUrl,
        emailsUrl
      });
    },

    async beginDeviceAuthorization(input): Promise<GitHubDeviceAuthorizationStartResult> {
      const response = await fetchImplementation(deviceCodeUrl, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          client_id: config.clientId,
          ...(input.scope === undefined ? {} : { scope: input.scope })
        })
      });

      const payload = (await response.json().catch(() => ({}))) as {
        device_code?: string;
        user_code?: string;
        verification_uri?: string;
        expires_in?: number;
        interval?: number;
        error?: string;
      };

      if (!response.ok || typeof payload.device_code !== "string" || typeof payload.user_code !== "string" || typeof payload.verification_uri !== "string" || typeof payload.expires_in !== "number" || typeof payload.interval !== "number") {
        return {
          ok: false,
          error: payload.error === "device_flow_disabled" ? "device_flow_disabled" : "provider_error"
        };
      }

      return {
        ok: true,
        device_code: payload.device_code,
        user_code: payload.user_code,
        verification_uri: payload.verification_uri,
        expires_in: payload.expires_in,
        interval: payload.interval
      };
    },

    async pollDeviceAuthorization(input): Promise<GitHubDeviceAuthorizationPollResult> {
      const response = await fetchImplementation(accessTokenUrl, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          client_id: config.clientId,
          device_code: input.device_code,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code"
        })
      });

      const payload = (await response.json().catch(() => ({}))) as {
        access_token?: string;
        error?: string;
        interval?: number;
      };

      if (typeof payload.access_token === "string" && payload.access_token.length > 0) {
        const resolved = await resolveIdentityFromAccessToken(fetchImplementation, {
          accessToken: payload.access_token,
          userUrl,
          emailsUrl
        });

        if (!resolved.ok) {
          return {
            status: resolved.error === "email_unavailable" ? "email_unavailable" : "provider_error"
          };
        }

        return {
          status: "approved",
          identity: resolved.identity
        };
      }

      if (payload.error === "authorization_pending") {
        return {
          status: "pending",
          interval_seconds: input.interval_seconds
        };
      }

      if (payload.error === "slow_down") {
        return {
          status: "pending",
          interval_seconds: typeof payload.interval === "number" ? payload.interval : input.interval_seconds + 5
        };
      }

      if (payload.error === "access_denied") {
        return { status: "denied" };
      }

      if (payload.error === "expired_token" || payload.error === "token_expired") {
        return { status: "expired" };
      }

      return { status: "provider_error" };
    }
  };
}

export { DEFAULT_GITHUB_AUTHORIZE_URL, GITHUB_OAUTH_ISSUER };
