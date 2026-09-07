import type { OpenAiToolName } from "../../../packages/mcp-core/src/index.js";

export type OpenAiMcpMethod =
  | "initialize"
  | "notifications/initialized"
  | "ping"
  | "tools/list"
  | "tools/call"
  | "invalid"
  | "other";

export type OpenAiMcpAdmission =
  | "allowed"
  | "auth_rejected"
  | "canonical_host_rejected"
  | "capacity_rejected"
  | "coordination_unavailable"
  | "rate_limited"
  | "unauthenticated";

export type OpenAiOAuthEndpoint =
  | "/.well-known/oauth-authorization-server"
  | "/.well-known/openid-configuration"
  | "/oauth/authorize"
  | "/oauth/token"
  | "/oauth/revoke"
  | "/oauth/userinfo"
  | "/oauth/jwks.json"
  | "/oauth/reviewer/access"
  | "/oauth/interaction/:uid/reviewer"
  | "/oauth/interaction/:uid"
  | "/oauth/other";

export type OpenAiOAuthAdmission =
  | "allowed"
  | "canonical_host_rejected"
  | "capacity_rejected"
  | "coordination_unavailable"
  | "credential_rejected"
  | "invalid_payload"
  | "rate_limited";

export type OpenAiOperationalSignal =
  | {
      category: "mcp_request_failure" | "mcp_request_timeout";
      method: OpenAiMcpMethod;
      tool?: OpenAiToolName;
      status: number;
      admission: OpenAiMcpAdmission;
    }
  | {
      category: "mcp_admission_rejected";
      method: OpenAiMcpMethod;
      tool?: OpenAiToolName;
      status: number;
      admission: "capacity_rejected" | "rate_limited";
    }
  | {
      category: "oauth_request_failure";
      endpoint: OpenAiOAuthEndpoint;
      status: number;
      admission: OpenAiOAuthAdmission;
    }
  | {
      category: "reviewer_credential_expiring";
      remainingDays: number;
      expired: boolean;
    };

export type OpenAiOperationalMonitor = (signal: OpenAiOperationalSignal) => void;

// Monitoring is explicitly outside the OAuth/MCP domain transaction. A
// reporting adapter must never change a customer-visible request outcome.
export function reportOpenAiOperationalSignal(
  monitor: OpenAiOperationalMonitor | undefined,
  signal: OpenAiOperationalSignal
): void {
  try {
    monitor?.(signal);
  } catch {
    // DebugBundle's SDK is fail-safe, and injected adapters must preserve that invariant.
  }
}
