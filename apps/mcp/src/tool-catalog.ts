import {
  NOTIFICATION_MCP_TOOL_NAMES,
  NOTIFICATION_MCP_TOOL_CATALOG
} from "./notification-tools.js";
import {
  ORGANIZATION_MCP_TOOL_NAMES,
  ORGANIZATION_MCP_TOOL_CATALOG
} from "./organization-tools.js";
import { REFERRAL_MCP_TOOL_NAMES, REFERRAL_MCP_TOOL_CATALOG } from "./referral-tools.js";
import {
  PUBLIC_STATUS_MCP_TOOL_NAMES,
  PUBLIC_STATUS_MCP_TOOL_CATALOG
} from "./public-status-tools.js";
import {
  ANALYTICS_FLOW_MCP_TOOL_NAMES,
  ANALYTICS_FLOW_MCP_TOOL_CATALOG
} from "./analytics-flow-tools.js";
import { z } from "zod";
import {
  PROJECT_MERGE_MCP_TOOL_NAMES,
  PROJECT_MERGE_MCP_TOOL_CATALOG
} from "./project-merge-tools.js";
import {
  SERVICE_DEFINITION_MCP_TOOL_NAMES,
  SERVICE_DEFINITION_MCP_TOOL_CATALOG
} from "./service-definition-tools.js";

import { ALERT_MCP_TOOL_NAMES } from "./alert-tools.js";
import { ANALYZE_MCP_TOOL_NAMES } from "./analyze-tools.js";
import { ANALYTICS_METRICS_MCP_TOOL_CATALOG } from "./analytics-metrics-tool-catalog.js";
import { ANALYTICS_METRICS_MCP_TOOL_NAMES } from "./analytics-metrics-tools.js";
import { ANALYTICS_SETTINGS_MCP_TOOL_CATALOG } from "./analytics-settings-tool-catalog.js";
import { ANALYTICS_SETTINGS_MCP_TOOL_NAMES } from "./analytics-settings-tools.js";
import { ANALYTICS_SAVED_FUNNEL_MCP_TOOL_CATALOG } from "./analytics-saved-funnel-tool-catalog.js";
import { ANALYTICS_SAVED_FUNNEL_MCP_TOOL_NAMES } from "./analytics-saved-funnel-tools.js";
import { BILLING_MCP_TOOL_NAMES } from "./billing-tools.js";
import { CAPTURE_RULE_MCP_TOOL_NAMES } from "./capture-rule-tools.js";
import { CAPTURE_POLICY_MCP_TOOL_NAMES } from "./capture-policy-tools.js";
import { GITHUB_MCP_TOOL_NAMES } from "./github-tools.js";
import { HEALTH_CHECK_MCP_TOOL_NAMES } from "./health-check-tools.js";
import { HEALTH_CHECK_MCP_TOOL_CATALOG } from "./health-check-tool-catalog.js";
import { IMPROVEMENT_MCP_TOOL_NAMES } from "./improvement-tools.js";
import { IMPROVEMENT_SETTINGS_MCP_TOOL_NAMES } from "./improvement-settings-tools.js";
import { MEMBER_MCP_TOOL_NAMES } from "./member-tools.js";
import { MEMBER_MCP_TOOL_CATALOG } from "./member-tool-catalog.js";
import { PROBE_MCP_TOOL_CATALOG } from "./probe-tool-catalog.js";
import { PROBE_MCP_TOOL_NAMES } from "./probe-tools.js";
import { PROJECT_MCP_TOOL_NAMES } from "./project-tools.js";
import { RETRIEVAL_MCP_TOOL_NAMES } from "./retrieval-tools.js";
import { SERVICE_MCP_TOOL_NAMES } from "./services-tools.js";
import { SETUP_MCP_TOOL_NAMES } from "./setup-tools.js";
import { SLACK_MCP_TOOL_NAMES } from "./slack-tools.js";
import { TOKEN_MCP_TOOL_NAMES } from "./token-tools.js";
import { WEBHOOK_MCP_TOOL_NAMES } from "./webhook-tools.js";
import { WEEKLY_REPORT_MCP_TOOL_NAMES } from "./weekly-report-tools.js";

type McpToolName =
  | (typeof REPORT_DELIVERY_MCP_TOOL_NAMES)[number]
  | (typeof REPORT_PDF_MCP_TOOL_NAMES)[number]
  | (typeof REPORT_RUN_MCP_TOOL_NAMES)[number]
  | (typeof REPORT_MCP_TOOL_NAMES)[number]
  | (typeof REFERRAL_MCP_TOOL_NAMES)[number]
  | (typeof ORGANIZATION_MCP_TOOL_NAMES)[number]
  | (typeof PROJECT_MERGE_MCP_TOOL_NAMES)[number]
  | (typeof SERVICE_DEFINITION_MCP_TOOL_NAMES)[number]
  | (typeof NOTIFICATION_MCP_TOOL_NAMES)[number]
  | (typeof PUBLIC_STATUS_MCP_TOOL_NAMES)[number]
  | (typeof ANALYTICS_FLOW_MCP_TOOL_NAMES)[number]
  | (typeof ALERT_MCP_TOOL_NAMES)[number]
  | (typeof ANALYZE_MCP_TOOL_NAMES)[number]
  | (typeof ANALYTICS_METRICS_MCP_TOOL_NAMES)[number]
  | (typeof ANALYTICS_SETTINGS_MCP_TOOL_NAMES)[number]
  | (typeof ANALYTICS_SAVED_FUNNEL_MCP_TOOL_NAMES)[number]
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
  | "reports"
  | "referrals"
  | "organizations"
  | "notifications"
  | "public_status"
  | "analytics_flows"
  | "alerts"
  | "analyze"
  | "analytics_metrics"
  | "analytics_settings"
  | "analytics_saved_funnels"
  | "billing"
  | "capture_rules"
  | "capture_policy"
  | "github"
  | "health_checks"
  | "improvements"
  | "improvement_settings"
  | "members"
  | "probes"
  | "projects"
  | "retrieval"
  | "services"
  | "setup"
  | "slack"
  | "tokens"
  | "webhooks"
  | "weekly_reports";

type McpToolCatalogEntry = {
  annotations?: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
  };
  name: McpToolName;
  group: McpToolGroup;
  description: string;
  inputSchema: z.ZodTypeAny;
};
import { MCP_TOOL_CATALOG_FOUNDATION } from "./tool-catalog-foundation.js";
import { MCP_TOOL_CATALOG_OPERATIONS } from "./tool-catalog-operations.js";

export const MCP_TOOL_CATALOG = [
  ...REPORT_DELIVERY_MCP_TOOL_CATALOG,
  ...REPORT_PDF_MCP_TOOL_CATALOG,
  ...REPORT_MCP_TOOL_CATALOG,
  ...REPORT_RUN_MCP_TOOL_CATALOG,
  ...REFERRAL_MCP_TOOL_CATALOG,
  ...ORGANIZATION_MCP_TOOL_CATALOG,
  ...PROJECT_MERGE_MCP_TOOL_CATALOG,
  ...SERVICE_DEFINITION_MCP_TOOL_CATALOG,
  ...NOTIFICATION_MCP_TOOL_CATALOG,
  ...PUBLIC_STATUS_MCP_TOOL_CATALOG,
  ...ANALYTICS_FLOW_MCP_TOOL_CATALOG,
  ...MCP_TOOL_CATALOG_FOUNDATION,
  ...MCP_TOOL_CATALOG_OPERATIONS,
  ...ANALYTICS_METRICS_MCP_TOOL_CATALOG,
  ...ANALYTICS_SETTINGS_MCP_TOOL_CATALOG,
  ...ANALYTICS_SAVED_FUNNEL_MCP_TOOL_CATALOG,
  {
    name: "get_capture_policy",
    group: "capture_policy",
    description: "Get the resolved capture policy for a project.",
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string()
    })
  },
  {
    name: "update_capture_policy",
    group: "capture_policy",
    description: "Update the capture policy for a project.",
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      update: z.object({
        preset: z.string().optional(),
        capture_logs: z.string().nullable().optional(),
        capture_request_events: z.string().nullable().optional(),
        capture_breadcrumbs: z.string().nullable().optional(),
        capture_probe_events: z.string().nullable().optional(),
        capture_diagnostic_context: z
          .boolean()
          .nullable()
          .optional()
          .describe(
            "Enable standalone diagnostic context, disable it, or restore preset defaults with null. Minimal policy always disables it; SDK opt-in and verified path support remain required."
          ),
        immediate_client_error_statuses: z
          .array(z.number().int().min(400).max(499))
          .nullable()
          .optional(),
        immediate_client_error_path_rules: z
          .array(
            z.object({
              status_code: z.number().int().min(400).max(499),
              path_pattern: z.string(),
              methods: z
                .array(z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]))
                .optional()
            })
          )
          .nullable()
          .optional()
      })
    })
  },
  {
    name: "get_improvement_settings",
    group: "improvement_settings",
    description: "Get automated improvement settings for a project.",
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string()
    })
  },
  {
    name: "update_improvement_settings",
    group: "improvement_settings",
    description: "Update automated improvement settings for a project.",
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      update: z.object({
        automated_improvement_bundles_enabled: z.boolean().optional(),
        improvement_bundle_sensitivity: z
          .enum(["high_confidence", "balanced", "verbose"])
          .optional()
      })
    })
  },
  ...PROBE_MCP_TOOL_CATALOG,
  ...HEALTH_CHECK_MCP_TOOL_CATALOG,
  {
    name: "billing_offer_change",
    group: "billing",
    description:
      "Read current paid interval/prices or preview, schedule and cancel a tier/interval change at renewal. Retains purchased capacity. Show the exact recurring total, effective date and feature loss, then obtain explicit user confirmation before schedule and send that confirmationToken. Cancel only the exact scheduleId from status. Immediate paid upgrades and purchases require the verified browser billing flow.",
    inputSchema: z
      .object({
        bearerToken: z.string(),
        action: z.enum(["status", "preview", "schedule", "cancel"]),
        targetPlan: z.enum(["solo", "team", "business"]).optional(),
        interval: z.enum(["month", "year"]).optional(),
        confirmationToken: z.string().max(8192).optional(),
        scheduleId: z.string().max(255).optional()
      })
      .strict()
  },
  {
    name: "billing_plan_change",
    group: "billing",
    description:
      "Preview or schedule Team to Solo at renewal on the same subscription, retaining extra capacity. Show the quote and Team feature loss and obtain explicit user confirmation before schedule; send that exact confirmationToken. Cancel releases only the exact scheduleId returned by status.",
    inputSchema: z.object({
      bearerToken: z.string(),
      action: z.enum(["status", "preview", "schedule", "cancel"]),
      confirmationToken: z.string().max(8192).optional(),
      scheduleId: z.string().max(255).optional()
    })
  },
  {
    name: "get_billing_summary",
    group: "billing",
    description: "Get the billing summary for the organization.",
    inputSchema: z.object({
      bearerToken: z.string()
    })
  },
  {
    name: "start_trial",
    group: "billing",
    description: "Start an eligible no-card trial for the organization.",
    inputSchema: z.object({
      bearerToken: z.string(),
      targetPlan: z.enum(["solo", "team", "business"])
    })
  },
  {
    name: "increase_capacity",
    group: "billing",
    description: "Increase additional capacity units.",
    inputSchema: z.object({
      bearerToken: z.string(),
      targetAdditionalCapacityUnits: z.number()
    })
  },
  {
    name: "schedule_capacity_reduction",
    group: "billing",
    description: "Schedule a capacity reduction at end of billing cycle.",
    inputSchema: z.object({
      bearerToken: z.string(),
      targetAdditionalCapacityUnits: z.number()
    })
  },
  {
    name: "cancel_capacity_reduction",
    group: "billing",
    description: "Cancel a scheduled capacity reduction.",
    inputSchema: z.object({
      bearerToken: z.string()
    })
  },
  ...MEMBER_MCP_TOOL_CATALOG,
  {
    name: "list_services",
    group: "services",
    description: "List services for a project.",
    inputSchema: z.object({
      bearerToken: z.string(),
      projectId: z.string(),
      limit: z.number().optional(),
      offset: z.number().int().min(0).max(100_000).optional()
    })
  }
] satisfies readonly McpToolCatalogEntry[];

export const MCP_TOOL_NAMES = MCP_TOOL_CATALOG.map((tool) => tool.name);

export type { McpToolCatalogEntry, McpToolGroup, McpToolName };
import { REPORT_MCP_TOOL_NAMES, REPORT_MCP_TOOL_CATALOG } from "./report-tools.js";
import { REPORT_RUN_MCP_TOOL_NAMES, REPORT_RUN_MCP_TOOL_CATALOG } from "./report-run-tools.js";
import { REPORT_PDF_MCP_TOOL_NAMES, REPORT_PDF_MCP_TOOL_CATALOG } from "./report-pdf-tools.js";
import {
  REPORT_DELIVERY_MCP_TOOL_NAMES,
  REPORT_DELIVERY_MCP_TOOL_CATALOG
} from "./report-delivery-tools.js";
