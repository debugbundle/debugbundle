import {
  OPENAI_CIMD_CLIENT_ID,
  OPENAI_HOSTED_MCP_SCOPES,
  OPENAI_MCP_ISSUER,
  OPENAI_MCP_RESOURCE,
  OPENAI_OIDC_SCOPES,
  OPENAI_PRODUCTION_REDIRECT_URI
} from "../../../packages/auth/src/index.js";

export interface OpenAiAuthorizationInteraction {
  uid: string;
  promptName: "login" | "consent";
  sessionAccountId?: string;
  providerGrantId?: string;
  productScopes: string[];
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("openai_authorization_interaction_invalid");
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("openai_authorization_interaction_invalid");
  }
  return value;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : typeof value === "string"
      ? [value]
      : [];
}

export function parseOpenAiAuthorizationInteraction(
  details: Record<string, unknown>
): OpenAiAuthorizationInteraction {
  const params = record(details["params"]);
  const prompt = record(details["prompt"]);
  const promptName = stringValue(prompt["name"]);
  const resources = stringArray(params["resource"]);
  const requestedScopes = stringValue(params["scope"])
    .split(" ")
    .filter((scope) => scope.length > 0);
  const requestedScopeSet = new Set(requestedScopes);
  const expectedScopes = [...OPENAI_OIDC_SCOPES, ...OPENAI_HOSTED_MCP_SCOPES];

  if (
    (promptName !== "login" && promptName !== "consent") ||
    params["client_id"] !== OPENAI_CIMD_CLIENT_ID ||
    params["redirect_uri"] !== OPENAI_PRODUCTION_REDIRECT_URI ||
    params["response_type"] !== "code" ||
    params["code_challenge_method"] !== "S256" ||
    stringValue(params["code_challenge"]).length < 43 ||
    resources.length !== 1 ||
    resources[0] !== OPENAI_MCP_RESOURCE ||
    requestedScopeSet.size !== expectedScopes.length ||
    expectedScopes.some((scope) => !requestedScopeSet.has(scope))
  ) {
    throw new Error("openai_authorization_interaction_invalid");
  }

  const session = details["session"] === undefined ? undefined : record(details["session"]);
  const sessionAccountId =
    session === undefined || session["accountId"] === undefined
      ? undefined
      : stringValue(session["accountId"]);
  const providerGrantId =
    details["grantId"] === undefined ? undefined : stringValue(details["grantId"]);

  return {
    uid: stringValue(details["uid"]),
    promptName,
    productScopes: [...OPENAI_HOSTED_MCP_SCOPES],
    ...(sessionAccountId === undefined ? {} : { sessionAccountId }),
    ...(providerGrantId === undefined ? {} : { providerGrantId })
  };
}

export function requireOpenAiAuthorizationContinueUrl(value: string): string {
  const url = new URL(value, OPENAI_MCP_ISSUER);
  if (
    url.origin !== OPENAI_MCP_ISSUER ||
    !url.pathname.startsWith("/oauth/authorize/") ||
    url.username !== "" ||
    url.password !== "" ||
    url.hash !== ""
  ) {
    throw new Error("openai_authorization_continue_url_invalid");
  }
  return url.toString();
}
