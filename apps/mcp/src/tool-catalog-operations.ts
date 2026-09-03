import { z } from "zod";

import { ProjectColorTagSchema } from "../../../packages/shared-types/src/index.js";

const jsonObjectSchema = z.record(z.unknown());
const verificationEventTypeSchema = z.enum(["verification.passed", "verification.failed"]);
const weeklyReportScheduleSchema = z.object({
  dayOfWeek: z.string(),
  hourOfDay: z.number(),
  timezone: z.string()
});

export const MCP_TOOL_CATALOG_OPERATIONS = [
  {
    name: "list_webhooks",
    group: "webhooks",
    description: "List webhooks for a project.",
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      limit: z.number().optional()
    })
  },
  {
    name: "create_webhook",
    group: "webhooks",
    description: "Create a webhook endpoint.",
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      url: z.string(),
      events: z.array(z.string()),
      filters: jsonObjectSchema.optional(),
      isEnabled: z.boolean().optional()
    })
  },
  {
    name: "update_webhook",
    group: "webhooks",
    description: "Update a webhook endpoint.",
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      webhookId: z.string(),
      url: z.string().optional(),
      events: z.array(z.string()).optional(),
      filters: jsonObjectSchema.optional(),
      isEnabled: z.boolean().optional()
    })
  },
  {
    name: "delete_webhook",
    group: "webhooks",
    description: "Delete a webhook endpoint.",
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      webhookId: z.string()
    })
  },
  {
    name: "test_webhook",
    group: "webhooks",
    description: "Queue a synthetic webhook delivery.",
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      webhookId: z.string(),
      eventType: verificationEventTypeSchema.optional()
    })
  },
  {
    name: "list_webhook_deliveries",
    group: "webhooks",
    description: "List deliveries for a webhook endpoint.",
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      webhookId: z.string(),
      limit: z.number().optional()
    })
  },
  {
    name: "retry_webhook_delivery",
    group: "webhooks",
    description: "Retry a webhook delivery.",
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      webhookId: z.string(),
      deliveryId: z.string()
    })
  },
  {
    name: "list_slack_destinations",
    group: "slack",
    description: "List reusable connected Slack destinations for a project organization.",
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string()
    })
  },
  {
    name: "get_slack_connect_url",
    group: "slack",
    description: "Return a browser Slack connect URL for a project.",
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      returnTo: z.string().optional()
    })
  },
  {
    name: "test_slack_destination",
    group: "slack",
    description: "Send a test message to a connected Slack destination.",
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      destinationId: z.string()
    })
  },
  {
    name: "delete_slack_destination",
    group: "slack",
    description: "Delete a connected Slack destination from a project organization.",
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      destinationId: z.string()
    })
  },
  {
    name: "list_weekly_report_channels",
    group: "weekly_reports",
    description: "List weekly report delivery channels for a project.",
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      limit: z.number().optional()
    })
  },
  {
    name: "create_weekly_report_channel",
    group: "weekly_reports",
    description:
      "Create a weekly report delivery channel. Email channel config supports up to 3 recipients in config.to.",
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      channel: z.string(),
      config: jsonObjectSchema,
      schedule: weeklyReportScheduleSchema,
      isEnabled: z.boolean().optional()
    })
  },
  {
    name: "update_weekly_report_channel",
    group: "weekly_reports",
    description:
      "Update a weekly report delivery channel. Email channel config supports up to 3 recipients in config.to.",
    inputSchema: z.object({
      bearerToken: z.string(),
      channelId: z.string(),
      config: jsonObjectSchema.optional(),
      schedule: weeklyReportScheduleSchema.optional(),
      isEnabled: z.boolean().optional()
    })
  },
  {
    name: "delete_weekly_report_channel",
    group: "weekly_reports",
    description: "Delete a weekly report delivery channel.",
    inputSchema: z.object({
      bearerToken: z.string(),
      channelId: z.string()
    })
  },
  {
    name: "list_alerts",
    group: "alerts",
    description: "List alert rules for a project.",
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      limit: z.number().optional()
    })
  },
  {
    name: "create_alert",
    group: "alerts",
    description: "Create an alert rule, including optional severity-threshold lifecycle scope.",
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      serviceId: z.string().optional(),
      channel: z.string(),
      conditionType: z.string(),
      severityMin: z.string().optional(),
      severityLifecycleScope: z.enum(["new_incident", "incident_regressed", "both"]).optional(),
      cooldownSeconds: z.number().int().min(0).max(604800).optional(),
      config: jsonObjectSchema,
      isEnabled: z.boolean().optional()
    })
  },
  {
    name: "update_alert",
    group: "alerts",
    description: "Update an alert rule, including optional severity-threshold lifecycle scope.",
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      alertId: z.string(),
      serviceId: z.string().nullable().optional(),
      channel: z.string().optional(),
      conditionType: z.string().optional(),
      severityMin: z.string().nullable().optional(),
      severityLifecycleScope: z
        .enum(["new_incident", "incident_regressed", "both"])
        .nullable()
        .optional(),
      cooldownSeconds: z.number().int().min(0).max(604800).optional(),
      config: jsonObjectSchema.nullable().optional(),
      isEnabled: z.boolean().optional()
    })
  },
  {
    name: "delete_alert",
    group: "alerts",
    description: "Delete an alert rule.",
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      alertId: z.string()
    })
  },
  {
    name: "list_projects",
    group: "projects",
    description: "List projects in the organization.",
    inputSchema: z.object({
      bearerToken: z.string(),
      limit: z.number().optional()
    })
  },
  {
    name: "create_project",
    group: "projects",
    description: "Create a new project.",
    inputSchema: z.object({
      bearerToken: z.string(),
      name: z.string(),
      slug: z.string(),
      environmentDefault: z.string().optional(),
      colorTag: ProjectColorTagSchema.nullable().optional()
    })
  },
  {
    name: "update_project",
    group: "projects",
    description: "Update a project.",
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      name: z.string().optional(),
      slug: z.string().optional(),
      environmentDefault: z.string().optional(),
      colorTag: ProjectColorTagSchema.nullable().optional()
    })
  },
  {
    name: "delete_project",
    group: "projects",
    description: "Delete a project.",
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string()
    })
  },
  {
    name: "list_capture_rules",
    group: "capture_rules",
    description: "List project capture rules.",
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string()
    })
  },
  {
    name: "create_capture_rule",
    group: "capture_rules",
    description: "Create a project capture rule.",
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      create: jsonObjectSchema
    })
  },
  {
    name: "update_capture_rule",
    group: "capture_rules",
    description: "Update a project capture rule.",
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      ruleId: z.string(),
      update: jsonObjectSchema
    })
  },
  {
    name: "delete_capture_rule",
    group: "capture_rules",
    description: "Delete a project capture rule.",
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      ruleId: z.string()
    })
  },
  {
    name: "suggest_capture_rules_from_incident",
    group: "capture_rules",
    description: "Generate deterministic capture rule suggestions from an incident bundle.",
    inputSchema: z.object({
      bearerToken: z.string(),
      incidentId: z.string()
    })
  },
  {
    name: "create_capture_rule_from_incident_suggestion",
    group: "capture_rules",
    description: "Create a capture rule from an incident-derived suggestion.",
    inputSchema: z.object({
      bearerToken: z.string(),
      incidentId: z.string(),
      create: jsonObjectSchema
    })
  }
] as const;
