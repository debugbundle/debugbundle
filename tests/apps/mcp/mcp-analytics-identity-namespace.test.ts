import { expect, it, vi } from "vitest";
import {
  AnalyticsIdentityNamespaceApiError,
  type AnalyticsIdentityNamespaceApi
} from "../../../apps/cli/src/analytics-identity-namespace-api.js";
import { createAnalyticsIdentityNamespaceMcpTools } from "../../../apps/mcp/src/analytics-identity-namespace-tools.js";
import { ANALYTICS_IDENTITY_NAMESPACE_MCP_TOOL_CATALOG } from "../../../apps/mcp/src/analytics-identity-namespace-tool-catalog.js";
import { MCP_TOOL_CATALOG } from "../../../apps/mcp/src/tool-catalog.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const change = {
  action: "configure" as const,
  expected_revision: 0,
  idempotency_key: "22222222-2222-4222-8222-222222222222",
  key_fingerprint: `sha256:${"a".repeat(64)}`
};
const previewHash = "b".repeat(64);

it("registers strict local namespace get, preview and apply tools", () => {
  expect(ANALYTICS_IDENTITY_NAMESPACE_MCP_TOOL_CATALOG.map((tool) => tool.name)).toEqual([
    "analytics_identity_namespace_get",
    "analytics_identity_namespace_preview",
    "analytics_identity_namespace_apply"
  ]);
  for (const tool of ANALYTICS_IDENTITY_NAMESPACE_MCP_TOOL_CATALOG)
    expect(MCP_TOOL_CATALOG.some((entry) => entry.name === tool.name)).toBe(true);
  const apply = ANALYTICS_IDENTITY_NAMESPACE_MCP_TOOL_CATALOG[2].inputSchema;
  expect(apply.safeParse({ bearerToken: "member", projectId, change }).success).toBe(false);
  expect(apply.safeParse({ bearerToken: "member", projectId, change, previewHash }).success).toBe(
    true
  );
  expect(
    apply.safeParse({ bearerToken: "member", projectId, change, previewHash, key: "raw" }).success
  ).toBe(false);
});

it("dispatches through the shared API client and contains remote errors", async () => {
  const execute = vi.fn<AnalyticsIdentityNamespaceApi["execute"]>().mockResolvedValue({
    project_id: projectId,
    namespace_revision: 1,
    key_fingerprint: change.key_fingerprint,
    activated_at: "2026-09-29T12:00:00.000Z",
    revoked_at: null
  });
  const tools = createAnalyticsIdentityNamespaceMcpTools({ execute });
  await tools.analytics_identity_namespace_get({ bearerToken: "member", projectId });
  await tools.analytics_identity_namespace_preview({ bearerToken: "member", projectId, change });
  await tools.analytics_identity_namespace_apply({
    bearerToken: "member",
    projectId,
    change,
    previewHash
  });
  expect(execute.mock.calls.map(([input]) => input.operation.operation)).toEqual([
    "get",
    "preview",
    "apply"
  ]);
  await expect(
    tools.analytics_identity_namespace_apply({ bearerToken: "member", projectId, change })
  ).rejects.toThrow("mcp_tool_error:invalid_input");
  execute.mockRejectedValueOnce(
    new AnalyticsIdentityNamespaceApiError(403, "analytics_identity_namespace_forbidden")
  );
  await expect(
    tools.analytics_identity_namespace_get({ bearerToken: "member", projectId })
  ).rejects.toThrow("mcp_tool_error:analytics_identity_namespace_forbidden");
  execute.mockRejectedValueOnce(new Error(`untrusted ${change.key_fingerprint}`));
  await expect(
    tools.analytics_identity_namespace_get({ bearerToken: "member", projectId })
  ).rejects.toThrow("mcp_tool_error:analytics_identity_namespace_request_failed");
});
