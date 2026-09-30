import { z } from "zod";
import {
  AnalyticsIdentityNamespaceApplyInputSchema,
  AnalyticsIdentityNamespaceGetInputSchema,
  AnalyticsIdentityNamespacePreviewInputSchema
} from "../../cli/src/analytics-identity-namespace-api.js";

const auth = { bearerToken: z.string().min(1).max(4096) };
export const ANALYTICS_IDENTITY_NAMESPACE_MCP_TOOL_CATALOG = [
  {
    name: "analytics_identity_namespace_get",
    group: "analytics_identity_namespace",
    description:
      "Read the current project identity namespace revision and key fingerprint with owner access. Never returns the HMAC key.",
    inputSchema: AnalyticsIdentityNamespaceGetInputSchema.extend(auth)
  },
  {
    name: "analytics_identity_namespace_preview",
    group: "analytics_identity_namespace",
    description:
      "Review a project identity namespace configure, rotate or revoke without writing. Shows whether existing contexts are fenced and returns a content-bound preview hash.",
    inputSchema: AnalyticsIdentityNamespacePreviewInputSchema.extend(auth)
  },
  {
    name: "analytics_identity_namespace_apply",
    group: "analytics_identity_namespace",
    description:
      "Apply a reviewed project identity namespace change using its preview hash, expected revision and idempotency key. Only a key fingerprint is accepted; keep the HMAC key on the customer backend.",
    inputSchema: AnalyticsIdentityNamespaceApplyInputSchema.extend(auth)
  }
] as const;
export const ANALYTICS_IDENTITY_NAMESPACE_MCP_TOOL_NAMES =
  ANALYTICS_IDENTITY_NAMESPACE_MCP_TOOL_CATALOG.map((tool) => tool.name);
