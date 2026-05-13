import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const SLACK_APP_INSTALL_STATE_COOKIE_NAME = "dbundle_slack_app_install_state";

export interface SlackOAuthConfig {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  stateSecret: string;
}

export interface SlackInstallStatePayload {
  organization_id: string;
  project_id: string;
  return_to: string;
}

export interface SlackOAuthExchangeResult {
  access_token: string;
  team: {
    id: string;
    name?: string;
  };
  incoming_webhook: {
    url: string;
    channel_id: string;
    channel?: string;
    configuration_url?: string;
  };
}

function normalizeNonEmptyEnv(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? null : trimmed;
}

function buildCookieAttributes(options: { secure?: boolean; sameSite?: "Lax" | "Strict" }): string {
  const parts = ["Path=/", "HttpOnly", `SameSite=${options.sameSite ?? "Lax"}`];
  if (options.secure !== false) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

export function buildSlackAppInstallStateCookie(state: string, expiresAt: string, options: { secure?: boolean } = {}): string {
  return `${SLACK_APP_INSTALL_STATE_COOKIE_NAME}=${encodeURIComponent(state)}; ${buildCookieAttributes({
    sameSite: "Lax",
    ...(options.secure === undefined ? {} : { secure: options.secure })
  })}; Expires=${new Date(expiresAt).toUTCString()}`;
}

export function buildClearedSlackAppInstallStateCookie(options: { secure?: boolean } = {}): string {
  return `${SLACK_APP_INSTALL_STATE_COOKIE_NAME}=; ${buildCookieAttributes({
    sameSite: "Lax",
    ...(options.secure === undefined ? {} : { secure: options.secure })
  })}; Expires=${new Date(0).toUTCString()}; Max-Age=0`;
}

export function shouldUseSecureCookies(): boolean {
  return process.env["AUTH_COOKIE_SECURE"] !== "false";
}

export function resolveAppRedirectBaseUrl(): string {
  return (process.env["APP_BASE_URL"] ?? "http://localhost:5291").replace(/\/+$/, "");
}

export function resolveSlackOAuthConfig(env: Record<string, string | undefined> = process.env): SlackOAuthConfig | null {
  const clientId = normalizeNonEmptyEnv(env["SLACK_CLIENT_ID"]);
  const clientSecret = normalizeNonEmptyEnv(env["SLACK_CLIENT_SECRET"]);
  const callbackUrl = normalizeNonEmptyEnv(env["SLACK_OAUTH_CALLBACK_URL"]);
  const stateSecret = normalizeNonEmptyEnv(env["SLACK_OAUTH_STATE_SECRET"]);

  if (clientId === null || clientSecret === null || callbackUrl === null || stateSecret === null) {
    return null;
  }

  return {
    clientId,
    clientSecret,
    callbackUrl,
    stateSecret
  };
}

export function normalizeSlackInstallReturnPath(value: string | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  if (!normalized.startsWith("/") || normalized.startsWith("//")) {
    return null;
  }

  return normalized;
}

export function buildSlackInstallState(input: {
  organizationId: string;
  projectId: string;
  returnTo: string;
  secret: string;
  now?: Date;
  lifetimeMs?: number;
}): { token: string; expires_at: string } {
  const now = input.now ?? new Date();
  const expiresAt = new Date(now.getTime() + (input.lifetimeMs ?? 10 * 60 * 1000)).toISOString();
  const payload = Buffer.from(
    JSON.stringify({
      nonce: randomBytes(16).toString("hex"),
      organization_id: input.organizationId,
      project_id: input.projectId,
      return_to: input.returnTo,
      expires_at: expiresAt
    }),
    "utf8"
  ).toString("base64url");
  const signature = createHmac("sha256", input.secret).update(payload).digest("base64url");
  return {
    token: `${payload}.${signature}`,
    expires_at: expiresAt
  };
}

export function readSlackInstallState(
  state: string,
  secret: string,
  now: Date = new Date()
): SlackInstallStatePayload | null {
  const [payloadValue, signatureValue, ...rest] = state.split(".");
  if (payloadValue === undefined || signatureValue === undefined || rest.length > 0) {
    return null;
  }

  const expectedSignature = createHmac("sha256", secret).update(payloadValue).digest("base64url");
  const provided = Buffer.from(signatureValue, "utf8");
  const expected = Buffer.from(expectedSignature, "utf8");
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(payloadValue, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const record = payload as {
    organization_id?: unknown;
    project_id?: unknown;
    return_to?: unknown;
    expires_at?: unknown;
  };
  const returnTo = normalizeSlackInstallReturnPath(
    typeof record.return_to === "string" ? record.return_to : undefined
  );
  if (
    typeof record.organization_id !== "string" ||
    record.organization_id.length === 0 ||
    typeof record.project_id !== "string" ||
    record.project_id.length === 0 ||
    returnTo === null ||
    typeof record.expires_at !== "string" ||
    Number.isNaN(Date.parse(record.expires_at)) ||
    Date.parse(record.expires_at) <= now.getTime()
  ) {
    return null;
  }

  return {
    organization_id: record.organization_id,
    project_id: record.project_id,
    return_to: returnTo
  };
}

export function isMatchingInstallStateCookie(expectedState: string, cookieState: string | null): boolean {
  if (cookieState === null) {
    return false;
  }

  const expected = Buffer.from(expectedState, "utf8");
  const provided = Buffer.from(cookieState, "utf8");
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

export function buildSlackInstallUrl(input: {
  clientId: string;
  callbackUrl: string;
  state: string;
}): string {
  const url = new URL("https://slack.com/oauth/v2/authorize");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("scope", "incoming-webhook");
  url.searchParams.set("redirect_uri", input.callbackUrl);
  url.searchParams.set("state", input.state);
  return url.toString();
}

export async function exchangeSlackOAuthCode(input: {
  code: string;
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  fetchImpl?: typeof fetch;
}): Promise<SlackOAuthExchangeResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      code: input.code,
      redirect_uri: input.callbackUrl
    }).toString()
  });

  if (!response.ok) {
    throw new Error(`slack_oauth_http_error_${response.status}`);
  }

  const body = (await response.json()) as {
    ok?: boolean;
    error?: string;
    access_token?: unknown;
    team?: { id?: unknown; name?: unknown } | null;
    incoming_webhook?: { url?: unknown; channel_id?: unknown; channel?: unknown; configuration_url?: unknown } | null;
  };

  if (body.ok !== true) {
    throw new Error(`slack_oauth_error:${typeof body.error === "string" ? body.error : "unknown"}`);
  }
  if (
    typeof body.access_token !== "string" ||
    typeof body.team?.id !== "string" ||
    typeof body.incoming_webhook?.url !== "string" ||
    typeof body.incoming_webhook?.channel_id !== "string"
  ) {
    throw new Error("slack_oauth_response_invalid");
  }

  return {
    access_token: body.access_token,
    team: {
      id: body.team.id,
      ...(typeof body.team.name === "string" ? { name: body.team.name } : {})
    },
    incoming_webhook: {
      url: body.incoming_webhook.url,
      channel_id: body.incoming_webhook.channel_id,
      ...(typeof body.incoming_webhook.channel === "string" ? { channel: body.incoming_webhook.channel } : {}),
      ...(typeof body.incoming_webhook.configuration_url === "string"
        ? { configuration_url: body.incoming_webhook.configuration_url }
        : {})
    }
  };
}
