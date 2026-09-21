import { z } from "zod";
import { getOpenAiToolSchemas } from "../../../packages/mcp-core/src/index.js";
import { AgentTokenSchema } from "../../../packages/token-management/src/index.js";
import { anyMemberAuth, component, type OperationSpec } from "./openapi-model.js";
import { apiError } from "./openapi-components.js";

const projectParams = z.object({ id: z.string().uuid() });
const incidentParams = projectParams.extend({ incidentId: z.string().uuid() });
const errors = {
  "400": { description: "Invalid request.", schema: apiError },
  "401": {
    description: "Invalid, expired, revoked, or wrong-project credential.",
    schema: apiError
  },
  "403": { description: "Issuer access is no longer allowed.", schema: apiError },
  "404": { description: "Minimized evidence is unavailable.", schema: apiError },
  "429": { description: "Read rate limit exceeded.", schema: apiError },
  "503": { description: "Agent access is unavailable.", schema: apiError }
};
const privacyHeaders = {
  "Cache-Control": {
    description: "Evidence is never cached by shared HTTP caches.",
    schema: z.literal("no-store")
  },
  "x-debugbundle-privacy-policy": {
    description: "Mandatory evidence projection policy.",
    schema: z.literal("telemetry-privacy-v1")
  }
};

export function agentOperations(): OperationSpec[] {
  const evidence: OperationSpec[] = [
    {
      method: "get",
      path: "/v1/agent/projects/{id}",
      operationId: "agentProjectSummary",
      summary: "Read minimized project identity",
      tags: ["Agent evidence"],
      params: projectParams,
      security: [{ agentBearerToken: [] }],
      responses: {
        ...errors,
        "200": {
          description: "Project identity only.",
          headers: privacyHeaders,
          schema: component(
            "AgentProjectSummary",
            z
              .object({
                project: z.object({ project_id: z.string().uuid(), name: z.string() }).strict()
              })
              .strict()
          )
        }
      }
    }
  ];
  for (const [suffix, name, operationId, summary] of [
    ["/incidents", "list_incidents", "agentListIncidents", "List minimized incidents"],
    ["/incidents/{incidentId}", "get_incident", "agentGetIncident", "Read a minimized incident"],
    [
      "/incidents/{incidentId}/context",
      "get_incident_context",
      "agentGetIncidentContext",
      "Read minimized incident context"
    ],
    ["/incidents/{incidentId}/bundle", "get_bundle", "agentGetBundle", "Read a minimized bundle"]
  ] as const) {
    evidence.push({
      method: "get",
      path: `/v1/agent/projects/{id}${suffix}`,
      operationId,
      summary,
      tags: ["Agent evidence"],
      security: [{ agentBearerToken: [] }],
      params: name === "list_incidents" ? projectParams : incidentParams,
      ...(name === "list_incidents"
        ? {
            query: z
              .object({
                limit: z.coerce.number().int().min(1).max(50).optional(),
                cursor: z.string().max(2048).optional()
              })
              .strict()
          }
        : {}),
      responses: {
        ...errors,
        "200": {
          description: "Bounded projected evidence; no raw events or management access.",
          headers: privacyHeaders,
          schema: component(`Agent_${name}`, getOpenAiToolSchemas(name).outputSchema)
        }
      }
    });
  }
  const record = AgentTokenSchema.omit({ plaintext: true });
  return [
    ...evidence,
    {
      method: "get",
      path: "/v1/projects/{id}/agent-tokens",
      operationId: "listAgentTokens",
      summary: "List project agent credentials as an owner or admin",
      tags: ["Tokens"],
      security: anyMemberAuth,
      params: projectParams,
      responses: {
        ...errors,
        "200": {
          description: "Credential metadata without plaintext.",
          schema: component("AgentTokenList", z.object({ tokens: z.array(record) }).strict())
        }
      }
    },
    {
      method: "post",
      path: "/v1/projects/{id}/agent-tokens",
      operationId: "createAgentToken",
      summary:
        "Issue one project-bound read-only credential; default expiry 30 days, maximum 90 days",
      tags: ["Tokens"],
      security: anyMemberAuth,
      params: projectParams,
      requestBody: component(
        "CreateAgentToken",
        z
          .object({
            label: z.string().trim().min(1).max(120),
            expires_at: z.string().datetime().optional()
          })
          .strict()
      ),
      responses: {
        ...errors,
        "201": {
          description:
            "Credential with one-time plaintext; issuance must be enabled after rollout.",
          headers: { "Cache-Control": privacyHeaders["Cache-Control"] },
          schema: component(
            "AgentTokenCreated",
            z.object({ token: AgentTokenSchema.extend({ plaintext: z.string() }) }).strict()
          )
        }
      }
    },
    {
      method: "post",
      path: "/v1/projects/{id}/agent-tokens/{tokenId}/revoke",
      operationId: "revokeAgentToken",
      summary: "Revoke a project agent credential as an owner or admin",
      tags: ["Tokens"],
      security: anyMemberAuth,
      params: projectParams.extend({ tokenId: z.string().uuid() }),
      responses: {
        ...errors,
        "200": {
          description: "Revoked credential metadata.",
          schema: component("AgentTokenRevoked", z.object({ token: record }).strict())
        }
      }
    }
  ];
}
