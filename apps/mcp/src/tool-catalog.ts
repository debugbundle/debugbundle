import { z } from 'zod';

import { ProjectColorTagSchema } from '../../../packages/shared-types/src/index.js';

import { ALERT_MCP_TOOL_NAMES } from './alert-tools.js';
import { ANALYZE_MCP_TOOL_NAMES } from './analyze-tools.js';
import { ANALYTICS_METRICS_MCP_TOOL_CATALOG } from './analytics-metrics-tool-catalog.js';
import { ANALYTICS_METRICS_MCP_TOOL_NAMES } from './analytics-metrics-tools.js';
import { ANALYTICS_SETTINGS_MCP_TOOL_CATALOG } from './analytics-settings-tool-catalog.js';
import { ANALYTICS_SETTINGS_MCP_TOOL_NAMES } from './analytics-settings-tools.js';
import { BILLING_MCP_TOOL_NAMES } from './billing-tools.js';
import { CAPTURE_RULE_MCP_TOOL_NAMES } from './capture-rule-tools.js';
import { CAPTURE_POLICY_MCP_TOOL_NAMES } from './capture-policy-tools.js';
import { GITHUB_MCP_TOOL_NAMES } from './github-tools.js';
import { HEALTH_CHECK_MCP_TOOL_NAMES } from './health-check-tools.js';
import { HEALTH_CHECK_MCP_TOOL_CATALOG } from './health-check-tool-catalog.js';
import { IMPROVEMENT_MCP_TOOL_NAMES } from './improvement-tools.js';
import { IMPROVEMENT_SETTINGS_MCP_TOOL_NAMES } from './improvement-settings-tools.js';
import { MEMBER_MCP_TOOL_NAMES } from './member-tools.js';
import { PROBE_MCP_TOOL_CATALOG } from './probe-tool-catalog.js';
import { PROBE_MCP_TOOL_NAMES } from './probe-tools.js';
import { PROJECT_MCP_TOOL_NAMES } from './project-tools.js';
import { RETRIEVAL_MCP_TOOL_NAMES } from './retrieval-tools.js';
import { SERVICE_MCP_TOOL_NAMES } from './services-tools.js';
import { SETUP_MCP_TOOL_NAMES } from './setup-tools.js';
import { SLACK_MCP_TOOL_NAMES } from './slack-tools.js';
import { TOKEN_MCP_TOOL_NAMES } from './token-tools.js';
import { WEBHOOK_MCP_TOOL_NAMES } from './webhook-tools.js';
import { WEEKLY_REPORT_MCP_TOOL_NAMES } from './weekly-report-tools.js';

type McpToolName =
  | (typeof ALERT_MCP_TOOL_NAMES)[number]
  | (typeof ANALYZE_MCP_TOOL_NAMES)[number]
  | (typeof ANALYTICS_METRICS_MCP_TOOL_NAMES)[number]
  | (typeof ANALYTICS_SETTINGS_MCP_TOOL_NAMES)[number]
  | (typeof BILLING_MCP_TOOL_NAMES)[number]
  | (typeof CAPTURE_RULE_MCP_TOOL_NAMES)[number]
  | (typeof CAPTURE_POLICY_MCP_TOOL_NAMES)[number]
  | (typeof GITHUB_MCP_TOOL_NAMES)[number]
  | (typeof HEALTH_CHECK_MCP_TOOL_NAMES)[number]
  | (typeof IMPROVEMENT_MCP_TOOL_NAMES)[number]
  | (typeof IMPROVEMENT_SETTINGS_MCP_TOOL_NAMES)[number]
  | (typeof MEMBER_MCP_TOOL_NAMES)[number]
  | (typeof PROBE_MCP_TOOL_NAMES)[number]
  | (typeof PROJECT_MCP_TOOL_NAMES)[number]
  | (typeof RETRIEVAL_MCP_TOOL_NAMES)[number]
  | (typeof SERVICE_MCP_TOOL_NAMES)[number]
  | (typeof SETUP_MCP_TOOL_NAMES)[number]
  | (typeof SLACK_MCP_TOOL_NAMES)[number]
  | (typeof TOKEN_MCP_TOOL_NAMES)[number]
  | (typeof WEBHOOK_MCP_TOOL_NAMES)[number]
  | (typeof WEEKLY_REPORT_MCP_TOOL_NAMES)[number];

type McpToolGroup =
  | 'alerts'
  | 'analyze'
  | 'analytics_metrics'
  | 'analytics_settings'
  | 'billing'
  | 'capture_rules'
  | 'capture_policy'
  | 'github'
  | 'health_checks'
  | 'improvements'
  | 'improvement_settings'
  | 'members'
  | 'probes'
  | 'projects'
  | 'retrieval'
  | 'services'
  | 'setup'
  | 'slack'
  | 'tokens'
  | 'webhooks'
  | 'weekly_reports';

type McpToolCatalogEntry = {
  name: McpToolName;
  group: McpToolGroup;
  description: string;
  inputSchema: z.ZodTypeAny;
};

const jsonObjectSchema = z.record(z.unknown());
const optionalBearerTokenSchema = z.string().optional();
const sourceSchema = z.enum(['local', 'cloud']).optional();
const verificationEventTypeSchema = z.enum(['verification.passed', 'verification.failed']);
const weeklyReportScheduleSchema = z.object({
  dayOfWeek: z.string(),
  hourOfDay: z.number(),
  timezone: z.string(),
});

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
  limit: z.number().optional(),
});

const incidentLookupInputSchema = z.object({
  bearerToken: optionalBearerTokenSchema,
  source: sourceSchema,
  incidentId: z.string(),
});

const bulkIncidentLookupInputSchema = z.object({
  bearerToken: optionalBearerTokenSchema,
  source: sourceSchema,
  incidentIds: z.array(z.string()).min(1).max(1000),
});

const improvementLookupInputSchema = z.object({
  bearerToken: z.string(),
  improvementId: z.string(),
});

export const MCP_TOOL_CATALOG = [
  {
    name: 'doctor',
    group: 'setup',
    description: 'Run local DebugBundle environment diagnostics.',
    inputSchema: z.object({
      authFilePath: z.string().optional(),
      privacy: z.boolean().optional(),
    }),
  },
  {
    name: 'validate',
    group: 'setup',
    description: 'Validate local DebugBundle project setup and optionally apply fixes.',
    inputSchema: z.object({
      fix: z.boolean().optional(),
    }),
  },
  {
    name: 'verify_local',
    group: 'setup',
    description: 'Run the local verification flow against the current repository.',
    inputSchema: z.object({}),
  },
  {
    name: 'verify_cloud',
    group: 'setup',
    description: 'Verify hosted ingestion or actively prove hosted incident creation.',
    inputSchema: z.object({
      projectId: z.string(),
      service: z.string().optional(),
      environment: z.string().optional(),
      maxAgeMinutes: z.number().optional(),
      trigger5xx: z.boolean().optional(),
      trigger4xxStatus: z.number().int().min(400).max(499).optional(),
      authFilePath: z.string().optional(),
    }),
  },
  {
    name: 'smoke',
    group: 'setup',
    description: 'Run the end-to-end smoke flow for a hosted project.',
    inputSchema: z.object({
      projectId: z.string(),
      service: z.string().optional(),
      environment: z.string().optional(),
      maxAgeMinutes: z.number().optional(),
      authFilePath: z.string().optional(),
    }),
  },
  {
    name: 'analyze',
    group: 'analyze',
    description: 'Run local agent-oriented DebugBundle analysis.',
    inputSchema: z.object({
      type: z.string().optional(),
      local: z.boolean().optional(),
    }),
  },
  {
    name: 'list_incidents',
    group: 'retrieval',
    description: 'List incidents from local storage, cloud storage, or the combined connected view.',
    inputSchema: listIncidentsInputSchema,
  },
  {
    name: 'get_incident',
    group: 'retrieval',
    description: 'Fetch a single incident by incident id.',
    inputSchema: incidentLookupInputSchema,
  },
  {
    name: 'get_incident_context',
    group: 'retrieval',
    description: 'Fetch deterministic one-call incident context for explanation and triage.',
    inputSchema: incidentLookupInputSchema,
  },
  {
    name: 'resolve_incident',
    group: 'retrieval',
    description: 'Resolve an incident by incident id.',
    inputSchema: incidentLookupInputSchema,
  },
  {
    name: 'resolve_incidents',
    group: 'retrieval',
    description: 'Resolve incidents in bulk by incident id.',
    inputSchema: bulkIncidentLookupInputSchema,
  },
  {
    name: 'reopen_incident',
    group: 'retrieval',
    description: 'Reopen an incident by incident id.',
    inputSchema: incidentLookupInputSchema,
  },
  {
    name: 'reopen_incidents',
    group: 'retrieval',
    description: 'Reopen incidents in bulk by incident id.',
    inputSchema: bulkIncidentLookupInputSchema,
  },
  {
    name: 'get_bundle',
    group: 'retrieval',
    description: 'Fetch the debug bundle for an incident.',
    inputSchema: incidentLookupInputSchema,
  },
  {
    name: 'get_reproduction',
    group: 'retrieval',
    description: 'Fetch the reproduction artifact for an incident.',
    inputSchema: incidentLookupInputSchema,
  },
  {
    name: 'get_logs',
    group: 'retrieval',
    description: 'Fetch log records for an incident from the hosted API.',
    inputSchema: z.object({
      bearerToken: z.string(),
      incidentId: z.string(),
      level: z.string().optional(),
      cursor: z.string().optional(),
      limit: z.number().optional(),
    }),
  },
  {
    name: 'list_improvements',
    group: 'improvements',
    description: 'List hosted improvement opportunities for the current workspace or a specific project.',
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string().optional(),
      environment: z.string().optional(),
      service: z.string().optional(),
      status: z.string().optional(),
      severity: z.string().optional(),
      kind: z.string().optional(),
      cursor: z.string().optional(),
      limit: z.number().optional(),
    }),
  },
  {
    name: 'get_improvement',
    group: 'improvements',
    description: 'Fetch a single hosted improvement opportunity by id.',
    inputSchema: improvementLookupInputSchema,
  },
  {
    name: 'get_improvement_bundle',
    group: 'improvements',
    description: 'Fetch the hosted improvement bundle artifact for a project improvement opportunity.',
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      improvementId: z.string(),
    }),
  },
  {
    name: 'resolve_improvement',
    group: 'improvements',
    description: 'Resolve a hosted improvement opportunity.',
    inputSchema: improvementLookupInputSchema,
  },
  {
    name: 'reopen_improvement',
    group: 'improvements',
    description: 'Reopen a hosted improvement opportunity.',
    inputSchema: improvementLookupInputSchema,
  },
  {
    name: 'snooze_improvement',
    group: 'improvements',
    description: 'Snooze a hosted improvement opportunity until an ISO8601 timestamp.',
    inputSchema: z.object({
      bearerToken: z.string(),
      improvementId: z.string(),
      snoozedUntil: z.string(),
    }),
  },
  {
    name: 'get_github_status',
    group: 'github',
    description: 'Get the project GitHub App installation status and optional project repo assignment.',
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string().optional(),
    }),
  },
  {
    name: 'list_github_repositories',
    group: 'github',
    description: 'List repositories available to the project GitHub App installation for owner/admin callers.',
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string().optional(),
    }),
  },
  {
    name: 'list_github_dispatch_rules',
    group: 'github',
    description: 'List GitHub dispatch automation rules for a project.',
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
    }),
  },
  {
    name: 'create_github_dispatch_rule',
    group: 'github',
    description: 'Create a GitHub dispatch automation rule for a project.',
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      name: z.string(),
      eventTypes: z.array(z.string()),
      environments: z.array(z.string()),
      services: z.array(z.string()),
      severityMin: z.enum(['low', 'medium', 'high', 'critical']),
      bundleType: z.enum(['failure', 'improvement']),
      incidentStatus: z.enum(['new_only', 'reopened_only', 'new_or_reopened']),
      cooldownSeconds: z.number(),
      enabled: z.boolean().optional(),
    }),
  },
  {
    name: 'update_github_dispatch_rule',
    group: 'github',
    description: 'Update a GitHub dispatch automation rule.',
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      ruleId: z.string(),
      name: z.string().optional(),
      eventTypes: z.array(z.string()).optional(),
      environments: z.array(z.string()).optional(),
      services: z.array(z.string()).optional(),
      severityMin: z.enum(['low', 'medium', 'high', 'critical']).optional(),
      bundleType: z.enum(['failure', 'improvement']).optional(),
      incidentStatus: z.enum(['new_only', 'reopened_only', 'new_or_reopened']).optional(),
      cooldownSeconds: z.number().optional(),
      enabled: z.boolean().optional(),
    }),
  },
  {
    name: 'delete_github_dispatch_rule',
    group: 'github',
    description: 'Delete a GitHub dispatch automation rule.',
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      ruleId: z.string(),
    }),
  },
  {
    name: 'list_github_deliveries',
    group: 'github',
    description: 'List GitHub dispatch delivery history for a project.',
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      status: z.enum(['pending', 'retrying', 'delivered', 'failed', 'skipped']).optional(),
      limit: z.number().optional(),
    }),
  },
  {
    name: 'retry_github_delivery',
    group: 'github',
    description: 'Retry a failed GitHub dispatch delivery.',
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      deliveryId: z.string(),
    }),
  },
  {
    name: 'set_project_github_repo',
    group: 'github',
    description: 'Assign a primary GitHub repository to a project.',
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      owner: z.string(),
      repo: z.string(),
    }),
  },
  {
    name: 'remove_project_github_repo',
    group: 'github',
    description: 'Remove a project GitHub repository assignment.',
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
    }),
  },
  {
    name: 'list_project_tokens',
    group: 'tokens',
    description: 'List project tokens for a project.',
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      limit: z.number().optional(),
    }),
  },
  {
    name: 'create_project_token',
    group: 'tokens',
    description: 'Create a new project token.',
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      label: z.string(),
      allowedOrigins: z.array(z.string()).optional(),
    }),
  },
  {
    name: 'revoke_project_token',
    group: 'tokens',
    description: 'Revoke a project token.',
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      tokenId: z.string(),
    }),
  },
  {
    name: 'list_member_tokens',
    group: 'tokens',
    description: 'List member tokens for the authenticated member.',
    inputSchema: z.object({
      bearerToken: z.string(),
      limit: z.number().optional(),
    }),
  },
  {
    name: 'create_member_token',
    group: 'tokens',
    description: 'Create a new member token.',
    inputSchema: z.object({
      bearerToken: z.string(),
      label: z.string(),
    }),
  },
  {
    name: 'revoke_member_token',
    group: 'tokens',
    description: 'Revoke a member token.',
    inputSchema: z.object({
      bearerToken: z.string(),
      tokenId: z.string(),
    }),
  },
  {
    name: 'list_webhooks',
    group: 'webhooks',
    description: 'List webhooks for a project.',
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      limit: z.number().optional(),
    }),
  },
  {
    name: 'create_webhook',
    group: 'webhooks',
    description: 'Create a webhook endpoint.',
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      url: z.string(),
      events: z.array(z.string()),
      filters: jsonObjectSchema.optional(),
      isEnabled: z.boolean().optional(),
    }),
  },
  {
    name: 'update_webhook',
    group: 'webhooks',
    description: 'Update a webhook endpoint.',
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      webhookId: z.string(),
      url: z.string().optional(),
      events: z.array(z.string()).optional(),
      filters: jsonObjectSchema.optional(),
      isEnabled: z.boolean().optional(),
    }),
  },
  {
    name: 'delete_webhook',
    group: 'webhooks',
    description: 'Delete a webhook endpoint.',
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      webhookId: z.string(),
    }),
  },
  {
    name: 'test_webhook',
    group: 'webhooks',
    description: 'Queue a synthetic webhook delivery.',
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      webhookId: z.string(),
      eventType: verificationEventTypeSchema.optional(),
    }),
  },
  {
    name: 'list_webhook_deliveries',
    group: 'webhooks',
    description: 'List deliveries for a webhook endpoint.',
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      webhookId: z.string(),
      limit: z.number().optional(),
    }),
  },
  {
    name: 'retry_webhook_delivery',
    group: 'webhooks',
    description: 'Retry a webhook delivery.',
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      webhookId: z.string(),
      deliveryId: z.string(),
    }),
  },
  {
    name: 'list_slack_destinations',
    group: 'slack',
    description: 'List reusable connected Slack destinations for a project organization.',
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
    }),
  },
  {
    name: 'get_slack_connect_url',
    group: 'slack',
    description: 'Return a browser Slack connect URL for a project.',
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      returnTo: z.string().optional(),
    }),
  },
  {
    name: 'test_slack_destination',
    group: 'slack',
    description: 'Send a test message to a connected Slack destination.',
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      destinationId: z.string(),
    }),
  },
  {
    name: 'delete_slack_destination',
    group: 'slack',
    description: 'Delete a connected Slack destination from a project organization.',
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      destinationId: z.string(),
    }),
  },
  {
    name: 'list_weekly_report_channels',
    group: 'weekly_reports',
    description: 'List weekly report delivery channels for a project.',
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      limit: z.number().optional(),
    }),
  },
  {
    name: 'create_weekly_report_channel',
    group: 'weekly_reports',
    description: 'Create a weekly report delivery channel. Email channel config supports up to 3 recipients in config.to.',
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      channel: z.string(),
      config: jsonObjectSchema,
      schedule: weeklyReportScheduleSchema,
      isEnabled: z.boolean().optional(),
    }),
  },
  {
    name: 'update_weekly_report_channel',
    group: 'weekly_reports',
    description: 'Update a weekly report delivery channel. Email channel config supports up to 3 recipients in config.to.',
    inputSchema: z.object({
      bearerToken: z.string(),
      channelId: z.string(),
      config: jsonObjectSchema.optional(),
      schedule: weeklyReportScheduleSchema.optional(),
      isEnabled: z.boolean().optional(),
    }),
  },
  {
    name: 'delete_weekly_report_channel',
    group: 'weekly_reports',
    description: 'Delete a weekly report delivery channel.',
    inputSchema: z.object({
      bearerToken: z.string(),
      channelId: z.string(),
    }),
  },
  {
    name: 'list_alerts',
    group: 'alerts',
    description: 'List alert rules for a project.',
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      limit: z.number().optional(),
    }),
  },
  {
    name: 'create_alert',
    group: 'alerts',
    description: 'Create an alert rule, including optional severity-threshold lifecycle scope.',
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      serviceId: z.string().optional(),
      channel: z.string(),
      conditionType: z.string(),
      severityMin: z.string().optional(),
      severityLifecycleScope: z.enum(['new_incident', 'incident_regressed', 'both']).optional(),
      cooldownSeconds: z.number().int().min(0).max(604800).optional(),
      config: jsonObjectSchema,
      isEnabled: z.boolean().optional(),
    }),
  },
  {
    name: 'update_alert',
    group: 'alerts',
    description: 'Update an alert rule, including optional severity-threshold lifecycle scope.',
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      alertId: z.string(),
      serviceId: z.string().nullable().optional(),
      channel: z.string().optional(),
      conditionType: z.string().optional(),
      severityMin: z.string().nullable().optional(),
      severityLifecycleScope: z.enum(['new_incident', 'incident_regressed', 'both']).nullable().optional(),
      cooldownSeconds: z.number().int().min(0).max(604800).optional(),
      config: jsonObjectSchema.nullable().optional(),
      isEnabled: z.boolean().optional(),
    }),
  },
  {
    name: 'delete_alert',
    group: 'alerts',
    description: 'Delete an alert rule.',
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      alertId: z.string(),
    }),
  },
  {
    name: 'list_projects',
    group: 'projects',
    description: 'List projects in the organization.',
    inputSchema: z.object({
      bearerToken: z.string(),
      limit: z.number().optional(),
    }),
  },
  {
    name: 'create_project',
    group: 'projects',
    description: 'Create a new project.',
    inputSchema: z.object({
      bearerToken: z.string(),
      name: z.string(),
      slug: z.string(),
      environmentDefault: z.string().optional(),
      colorTag: ProjectColorTagSchema.nullable().optional(),
    }),
  },
  {
    name: 'update_project',
    group: 'projects',
    description: 'Update a project.',
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      name: z.string().optional(),
      slug: z.string().optional(),
      environmentDefault: z.string().optional(),
      colorTag: ProjectColorTagSchema.nullable().optional(),
    }),
  },
  {
    name: 'delete_project',
    group: 'projects',
    description: 'Delete a project.',
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
    }),
  },
  {
    name: 'list_capture_rules',
    group: 'capture_rules',
    description: 'List project capture rules.',
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
    }),
  },
  {
    name: 'create_capture_rule',
    group: 'capture_rules',
    description: 'Create a project capture rule.',
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      create: jsonObjectSchema,
    }),
  },
  {
    name: 'update_capture_rule',
    group: 'capture_rules',
    description: 'Update a project capture rule.',
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      ruleId: z.string(),
      update: jsonObjectSchema,
    }),
  },
  {
    name: 'delete_capture_rule',
    group: 'capture_rules',
    description: 'Delete a project capture rule.',
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      ruleId: z.string(),
    }),
  },
  {
    name: 'suggest_capture_rules_from_incident',
    group: 'capture_rules',
    description: 'Generate deterministic capture rule suggestions from an incident bundle.',
    inputSchema: z.object({
      bearerToken: z.string(),
      incidentId: z.string(),
    }),
  },
  {
    name: 'create_capture_rule_from_incident_suggestion',
    group: 'capture_rules',
    description: 'Create a capture rule from an incident-derived suggestion.',
    inputSchema: z.object({
      bearerToken: z.string(),
      incidentId: z.string(),
      create: jsonObjectSchema,
    }),
  },
  ...ANALYTICS_METRICS_MCP_TOOL_CATALOG,
  ...ANALYTICS_SETTINGS_MCP_TOOL_CATALOG,
  {
    name: 'get_capture_policy',
    group: 'capture_policy',
    description: 'Get the resolved capture policy for a project.',
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
    }),
  },
  {
    name: 'update_capture_policy',
    group: 'capture_policy',
    description: 'Update the capture policy for a project.',
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      update: z.object({
        preset: z.string().optional(),
        capture_logs: z.string().nullable().optional(),
        capture_request_events: z.string().nullable().optional(),
        capture_breadcrumbs: z.string().nullable().optional(),
        capture_probe_events: z.string().nullable().optional(),
        immediate_client_error_statuses: z.array(z.number().int().min(400).max(499)).nullable().optional(),
        immediate_client_error_path_rules: z.array(z.object({
          status_code: z.number().int().min(400).max(499),
          path_pattern: z.string(),
          methods: z.array(z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])).optional(),
        })).nullable().optional(),
      }),
    }),
  },
  {
    name: 'get_improvement_settings',
    group: 'improvement_settings',
    description: 'Get automated improvement settings for a project.',
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
    }),
  },
  {
    name: 'update_improvement_settings',
    group: 'improvement_settings',
    description: 'Update automated improvement settings for a project.',
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      update: z.object({
        automated_improvement_bundles_enabled: z.boolean().optional(),
        improvement_bundle_sensitivity: z.enum(['high_confidence', 'balanced', 'verbose']).optional(),
      }),
    }),
  },
  ...PROBE_MCP_TOOL_CATALOG,
  ...HEALTH_CHECK_MCP_TOOL_CATALOG,
  {
    name: 'get_billing_summary',
    group: 'billing',
    description: 'Get the billing summary for the organization.',
    inputSchema: z.object({
      bearerToken: z.string(),
    }),
  },
  {
    name: 'start_trial',
    group: 'billing',
    description: 'Start an eligible no-card trial for the organization.',
    inputSchema: z.object({
      bearerToken: z.string(),
      targetPlan: z.enum(['solo', 'team']),
    }),
  },
  {
    name: 'increase_capacity',
    group: 'billing',
    description: 'Increase additional capacity units.',
    inputSchema: z.object({
      bearerToken: z.string(),
      targetAdditionalCapacityUnits: z.number(),
    }),
  },
  {
    name: 'schedule_capacity_reduction',
    group: 'billing',
    description: 'Schedule a capacity reduction at end of billing cycle.',
    inputSchema: z.object({
      bearerToken: z.string(),
      targetAdditionalCapacityUnits: z.number(),
    }),
  },
  {
    name: 'cancel_capacity_reduction',
    group: 'billing',
    description: 'Cancel a scheduled capacity reduction.',
    inputSchema: z.object({
      bearerToken: z.string(),
    }),
  },
  {
    name: 'list_project_members',
    group: 'members',
    description: 'List members for a project.',
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
    }),
  },
  {
    name: 'list_project_member_invites',
    group: 'members',
    description: 'List pending invites for a project.',
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
    }),
  },
  {
    name: 'invite_project_member',
    group: 'members',
    description: 'Invite a collaborator to a project.',
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      email: z.string(),
      role: z.string(),
    }),
  },
  {
    name: 'cancel_project_member_invite',
    group: 'members',
    description: 'Cancel a pending project invite.',
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      inviteId: z.string(),
    }),
  },
  {
    name: 'update_project_member_role',
    group: 'members',
    description: 'Update the role of a project collaborator.',
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      userId: z.string(),
      role: z.string(),
    }),
  },
  {
    name: 'remove_project_member',
    group: 'members',
    description: 'Remove a collaborator from a project.',
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      userId: z.string(),
    }),
  },
  {
    name: 'leave_project',
    group: 'members',
    description: 'Leave a shared project as the authenticated collaborator.',
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
    }),
  },
  {
    name: 'list_services',
    group: 'services',
    description: 'List services for a project.',
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      limit: z.number().optional(),
    }),
  },
] satisfies readonly McpToolCatalogEntry[];

export const MCP_TOOL_NAMES = MCP_TOOL_CATALOG.map((tool) => tool.name);

export type { McpToolCatalogEntry, McpToolGroup, McpToolName };
