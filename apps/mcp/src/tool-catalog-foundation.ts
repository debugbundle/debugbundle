import { z } from "zod";

const optionalBearerTokenSchema = z.string().optional();
const sourceSchema = z.enum(["local", "cloud"]).optional();
const listIncidentsInputSchema = z.object({
  bearerToken: optionalBearerTokenSchema,
  source: sourceSchema,
  projectId: z.string().optional(),
  environment: z.string().optional(),
  service: z.string().optional(),
  status: z.string().optional(),
  severity: z.string().optional(),
  firstSeenAfter: z.string().optional(),
  attentionAfter: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.number().optional()
});
const incidentLookupInputSchema = z.object({
  bearerToken: optionalBearerTokenSchema,
  source: sourceSchema,
  incidentId: z.string()
});
const bulkIncidentLookupInputSchema = z.object({
  bearerToken: optionalBearerTokenSchema,
  source: sourceSchema,
  incidentIds: z.array(z.string()).min(1).max(1000)
});
const improvementLookupInputSchema = z.object({
  bearerToken: z.string(),
  improvementId: z.string()
});

export const MCP_TOOL_CATALOG_FOUNDATION = [
  {
    name: "doctor",
    group: "setup",
    description: "Run local DebugBundle environment diagnostics.",
    inputSchema: z.object({
      authFilePath: z.string().optional(),
      privacy: z.boolean().optional()
    })
  },
  {
    name: "validate",
    group: "setup",
    description: "Validate local DebugBundle project setup and optionally apply fixes.",
    inputSchema: z.object({
      fix: z.boolean().optional()
    })
  },
  {
    name: "verify_local",
    group: "setup",
    description: "Run the local verification flow against the current repository.",
    inputSchema: z.object({})
  },
  {
    name: "verify_cloud",
    group: "setup",
    description: "Verify hosted ingestion or actively prove hosted incident creation.",
    inputSchema: z.object({
      projectId: z.string(),
      service: z.string().optional(),
      environment: z.string().optional(),
      maxAgeMinutes: z.number().optional(),
      trigger5xx: z.boolean().optional(),
      trigger4xxStatus: z.number().int().min(400).max(499).optional(),
      authFilePath: z.string().optional()
    })
  },
  {
    name: "smoke",
    group: "setup",
    description: "Run the end-to-end smoke flow for a hosted project.",
    inputSchema: z.object({
      projectId: z.string(),
      service: z.string().optional(),
      environment: z.string().optional(),
      maxAgeMinutes: z.number().optional(),
      authFilePath: z.string().optional()
    })
  },
  {
    name: "analyze",
    group: "analyze",
    description: "Run local agent-oriented DebugBundle analysis.",
    inputSchema: z.object({
      type: z.string().optional(),
      local: z.boolean().optional()
    })
  },
  {
    name: "list_incidents",
    group: "retrieval",
    description:
      "List incidents from local storage, cloud storage, or the combined connected view.",
    inputSchema: listIncidentsInputSchema
  },
  {
    name: "get_incident",
    group: "retrieval",
    description: "Fetch a single incident by incident id.",
    inputSchema: incidentLookupInputSchema
  },
  {
    name: "get_incident_context",
    group: "retrieval",
    description: "Fetch deterministic one-call incident context for explanation and triage.",
    inputSchema: incidentLookupInputSchema
  },
  {
    name: "resolve_incident",
    group: "retrieval",
    description: "Resolve an incident by incident id.",
    inputSchema: incidentLookupInputSchema
  },
  {
    name: "resolve_incidents",
    group: "retrieval",
    description: "Resolve incidents in bulk by incident id.",
    inputSchema: bulkIncidentLookupInputSchema
  },
  {
    name: "reopen_incident",
    group: "retrieval",
    description: "Reopen an incident by incident id.",
    inputSchema: incidentLookupInputSchema
  },
  {
    name: "reopen_incidents",
    group: "retrieval",
    description: "Reopen incidents in bulk by incident id.",
    inputSchema: bulkIncidentLookupInputSchema
  },
  {
    name: "get_bundle",
    group: "retrieval",
    description: "Fetch the debug bundle for an incident.",
    inputSchema: incidentLookupInputSchema
  },
  {
    name: "get_reproduction",
    group: "retrieval",
    description: "Fetch the reproduction artifact for an incident.",
    inputSchema: incidentLookupInputSchema
  },
  {
    name: "get_logs",
    group: "retrieval",
    description: "Fetch log records for an incident from the hosted API.",
    inputSchema: z.object({
      bearerToken: z.string(),
      incidentId: z.string(),
      level: z.string().optional(),
      cursor: z.string().optional(),
      limit: z.number().optional()
    })
  },
  {
    name: "list_improvements",
    group: "improvements",
    description:
      "List hosted improvement opportunities for the current workspace or a specific project.",
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string().optional(),
      environment: z.string().optional(),
      service: z.string().optional(),
      status: z.string().optional(),
      severity: z.string().optional(),
      kind: z.string().optional(),
      cursor: z.string().optional(),
      limit: z.number().optional()
    })
  },
  {
    name: "get_improvement",
    group: "improvements",
    description: "Fetch a single hosted improvement opportunity by id.",
    inputSchema: improvementLookupInputSchema
  },
  {
    name: "get_improvement_bundle",
    group: "improvements",
    description:
      "Fetch the hosted improvement bundle artifact for a project improvement opportunity.",
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      improvementId: z.string()
    })
  },
  {
    name: "resolve_improvement",
    group: "improvements",
    description: "Resolve a hosted improvement opportunity.",
    inputSchema: improvementLookupInputSchema
  },
  {
    name: "reopen_improvement",
    group: "improvements",
    description: "Reopen a hosted improvement opportunity.",
    inputSchema: improvementLookupInputSchema
  },
  {
    name: "snooze_improvement",
    group: "improvements",
    description: "Snooze a hosted improvement opportunity until an ISO8601 timestamp.",
    inputSchema: z.object({
      bearerToken: z.string(),
      improvementId: z.string(),
      snoozedUntil: z.string()
    })
  },
  {
    name: "get_github_status",
    group: "github",
    description:
      "Get the project GitHub App installation status and optional project repo assignment.",
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string().optional()
    })
  },
  {
    name: "list_github_repositories",
    group: "github",
    description:
      "List repositories available to the project GitHub App installation for owner/admin callers.",
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string().optional()
    })
  },
  {
    name: "list_github_dispatch_rules",
    group: "github",
    description: "List GitHub dispatch automation rules for a project.",
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string()
    })
  },
  {
    name: "create_github_dispatch_rule",
    group: "github",
    description: "Create a GitHub dispatch automation rule for a project.",
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      name: z.string(),
      eventTypes: z.array(z.string()),
      environments: z.array(z.string()),
      services: z.array(z.string()),
      severityMin: z.enum(["low", "medium", "high", "critical"]),
      bundleType: z.enum(["failure", "improvement"]),
      incidentStatus: z.enum(["new_only", "reopened_only", "new_or_reopened"]),
      cooldownSeconds: z.number(),
      enabled: z.boolean().optional()
    })
  },
  {
    name: "update_github_dispatch_rule",
    group: "github",
    description: "Update a GitHub dispatch automation rule.",
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      ruleId: z.string(),
      name: z.string().optional(),
      eventTypes: z.array(z.string()).optional(),
      environments: z.array(z.string()).optional(),
      services: z.array(z.string()).optional(),
      severityMin: z.enum(["low", "medium", "high", "critical"]).optional(),
      bundleType: z.enum(["failure", "improvement"]).optional(),
      incidentStatus: z.enum(["new_only", "reopened_only", "new_or_reopened"]).optional(),
      cooldownSeconds: z.number().optional(),
      enabled: z.boolean().optional()
    })
  },
  {
    name: "delete_github_dispatch_rule",
    group: "github",
    description: "Delete a GitHub dispatch automation rule.",
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      ruleId: z.string()
    })
  },
  {
    name: "list_github_deliveries",
    group: "github",
    description: "List GitHub dispatch delivery history for a project.",
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      status: z.enum(["pending", "retrying", "delivered", "failed", "skipped"]).optional(),
      limit: z.number().optional()
    })
  },
  {
    name: "retry_github_delivery",
    group: "github",
    description: "Retry a failed GitHub dispatch delivery.",
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      deliveryId: z.string()
    })
  },
  {
    name: "set_project_github_repo",
    group: "github",
    description: "Assign a primary GitHub repository to a project.",
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      owner: z.string(),
      repo: z.string()
    })
  },
  {
    name: "remove_project_github_repo",
    group: "github",
    description: "Remove a project GitHub repository assignment.",
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string()
    })
  },
  {
    name: "list_project_tokens",
    group: "tokens",
    description: "List project tokens for a project.",
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      limit: z.number().optional()
    })
  },
  {
    name: "create_project_token",
    group: "tokens",
    description: "Create a new project token.",
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      label: z.string(),
      allowedOrigins: z.array(z.string()).optional()
    })
  },
  {
    name: "revoke_project_token",
    group: "tokens",
    description: "Revoke a project token.",
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      tokenId: z.string()
    })
  },
  {
    name: "list_member_tokens",
    group: "tokens",
    description: "List member tokens for the authenticated member.",
    inputSchema: z.object({
      bearerToken: z.string(),
      limit: z.number().optional()
    })
  },
  {
    name: "create_member_token",
    group: "tokens",
    description: "Create a new member token.",
    inputSchema: z.object({
      bearerToken: z.string(),
      label: z.string()
    })
  },
  {
    name: "revoke_member_token",
    group: "tokens",
    description: "Revoke a member token.",
    inputSchema: z.object({
      bearerToken: z.string(),
      tokenId: z.string()
    })
  }
] as const;
