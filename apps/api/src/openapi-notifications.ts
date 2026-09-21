import {
  z,
  AlertsQuerySchema,
  CreateAlertBodySchema,
  CreateWebhookBodySchema,
  CreateWeeklyReportChannelBodySchema,
  ProjectParamsSchema,
  ProjectScopedQuerySchema,
  ProjectSlackDestinationDeleteParamsSchema,
  SlackAppCallbackQuerySchema,
  SlackAppInstallUrlQuerySchema,
  UpdateAlertBodySchema,
  UpdateWebhookBodySchema,
  UpdateWeeklyReportChannelBodySchema,
  WebhookDeliveriesParamsSchema,
  WebhookDeliveriesQuerySchema,
  WebhookDeliveryRetryParamsSchema,
  WebhookParamsSchema,
  WebhooksQuerySchema,
  WebhookTestBodySchema,
  WeeklyReportChannelParamsSchema,
  WeeklyReportChannelsQuerySchema,
  anyMemberAuth,
  component,
  type OperationSpec
} from "./openapi-model.js";
import {
  apiError,
  slackInstallUrlResponse,
  slackDestinationListResponse,
  slackDestinationTestResponse,
  alertsResponse,
  alertResponse,
  weeklyReportChannelsResponse,
  weeklyReportChannelResponse,
  webhookListResponse,
  webhookResponse,
  webhookCreateResponse,
  webhookDeliveriesResponse,
  webhookTestResponse,
  webhookRetryResponse
} from "./openapi-components.js";

export function notificationsOperations(): OperationSpec[] {
  return [
    {
      method: "get",
      path: "/v1/slack/app/install-url",
      operationId: "getSlackAppInstallUrl",
      summary: "Create a Slack OAuth install URL",
      tags: ["Slack"],
      security: anyMemberAuth,
      query: SlackAppInstallUrlQuerySchema,
      responses: {
        "200": { description: "Slack OAuth install URL.", schema: slackInstallUrlResponse },
        "400": { description: "Invalid query parameters.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "403": {
          description:
            "Owner access is required, or paused shared collaborator access cannot delete preserved Slack setup.",
          schema: apiError
        },
        "404": { description: "Project was not found.", schema: apiError },
        "503": { description: "Slack integration is not configured.", schema: apiError }
      }
    },

    {
      method: "get",
      path: "/v1/slack/app/callback",
      operationId: "completeSlackAppInstall",
      summary: "Complete the Slack OAuth install flow",
      tags: ["Slack"],
      query: SlackAppCallbackQuerySchema,
      responses: {
        "302": {
          description:
            "Redirects back to the application after Slack OAuth completes or is cancelled."
        }
      }
    },

    {
      method: "get",
      path: "/v1/projects/{id}/slack/destinations",
      operationId: "listProjectSlackDestinations",
      summary: "List reusable Slack destinations for a project organization",
      tags: ["Slack"],
      security: anyMemberAuth,
      params: ProjectParamsSchema,
      responses: {
        "200": {
          description: "Reusable Slack destinations.",
          schema: slackDestinationListResponse
        },
        "400": { description: "Invalid project id.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "403": {
          description:
            "Paused shared collaborator access cannot view preserved Slack destinations.",
          schema: apiError
        },
        "404": { description: "Project was not found.", schema: apiError },
        "503": { description: "Slack integration is not configured.", schema: apiError }
      }
    },

    {
      method: "post",
      path: "/v1/projects/{id}/slack/destinations/{destinationId}/test",
      operationId: "testProjectSlackDestination",
      summary: "Send a test message to a reusable Slack destination",
      tags: ["Slack"],
      security: anyMemberAuth,
      params: ProjectSlackDestinationDeleteParamsSchema,
      responses: {
        "200": {
          description: "Slack destination test delivered.",
          schema: slackDestinationTestResponse
        },
        "400": { description: "Invalid project id or Slack destination id.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "403": { description: "Owner access or Team tier is required.", schema: apiError },
        "404": { description: "Project or Slack destination was not found.", schema: apiError },
        "502": { description: "Slack delivery failed.", schema: apiError },
        "503": { description: "Slack integration is not configured.", schema: apiError }
      }
    },

    {
      method: "delete",
      path: "/v1/projects/{id}/slack/destinations/{destinationId}",
      operationId: "deleteProjectSlackDestination",
      summary: "Delete a reusable Slack destination",
      tags: ["Slack"],
      security: anyMemberAuth,
      params: ProjectSlackDestinationDeleteParamsSchema,
      responses: {
        "204": { description: "Slack destination deleted." },
        "400": { description: "Invalid project id or Slack destination id.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "403": {
          description:
            "Owner access is required, or paused shared collaborator access cannot delete preserved Slack setup.",
          schema: apiError
        },
        "404": { description: "Slack destination was not found.", schema: apiError },
        "409": {
          description: "Slack destination is still referenced by an alert rule or weekly report.",
          schema: apiError
        },
        "503": { description: "Slack integration is not configured.", schema: apiError }
      }
    },

    {
      method: "get",
      path: "/v1/alerts",
      operationId: "listAlerts",
      summary: "List alert rules",
      tags: ["Alerts"],
      security: anyMemberAuth,
      query: AlertsQuerySchema,
      responses: {
        "200": { description: "Alert rules.", schema: alertsResponse },
        "400": { description: "Invalid query parameters.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "404": { description: "Project was not found.", schema: apiError }
      }
    },

    {
      method: "post",
      path: "/v1/alerts",
      operationId: "createAlert",
      summary: "Create an alert rule",
      tags: ["Alerts"],
      security: anyMemberAuth,
      requestBody: component("CreateAlertBody", CreateAlertBodySchema),
      responses: {
        "201": { description: "Alert rule created.", schema: alertResponse },
        "400": { description: "Invalid request body.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "404": { description: "Project was not found.", schema: apiError }
      }
    },

    {
      method: "patch",
      path: "/v1/alerts/{id}",
      operationId: "updateAlert",
      summary: "Update an alert rule",
      tags: ["Alerts"],
      security: anyMemberAuth,
      params: component("AlertPathParams", z.object({ id: z.string().uuid() }).strict()).schema,
      requestBody: component("UpdateAlertBody", UpdateAlertBodySchema),
      responses: {
        "200": { description: "Updated alert rule.", schema: alertResponse },
        "400": { description: "Invalid alert id or request body.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "404": { description: "Alert was not found.", schema: apiError }
      }
    },

    {
      method: "delete",
      path: "/v1/alerts/{id}",
      operationId: "deleteAlert",
      summary: "Delete an alert rule",
      tags: ["Alerts"],
      security: anyMemberAuth,
      params: component("AlertPathParams", z.object({ id: z.string().uuid() }).strict()).schema,
      responses: {
        "204": { description: "Alert rule deleted." },
        "400": { description: "Invalid alert id.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "404": { description: "Alert was not found.", schema: apiError }
      }
    },

    {
      method: "get",
      path: "/v1/weekly-report-channels",
      operationId: "listWeeklyReportChannels",
      summary: "List weekly report channels",
      tags: ["Weekly Reports"],
      security: anyMemberAuth,
      query: WeeklyReportChannelsQuerySchema,
      responses: {
        "200": {
          description:
            "Weekly report channels, including preserved Slack channels paused by downgrade.",
          schema: weeklyReportChannelsResponse
        },
        "400": { description: "Invalid query parameters.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "404": { description: "Project was not found.", schema: apiError }
      }
    },

    {
      method: "post",
      path: "/v1/weekly-report-channels",
      operationId: "createWeeklyReportChannel",
      summary: "Create a weekly report channel",
      tags: ["Weekly Reports"],
      security: anyMemberAuth,
      requestBody: component("CreateWeeklyReportChannelBody", CreateWeeklyReportChannelBodySchema),
      responses: {
        "201": {
          description: "Weekly report channel created.",
          schema: weeklyReportChannelResponse
        },
        "400": { description: "Invalid request body.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "403": {
          description:
            "Team tier is required for connected Slack destinations, and paused shared collaborator access cannot manage weekly reports.",
          schema: apiError
        },
        "404": { description: "Project was not found.", schema: apiError },
        "503": { description: "Slack integration is not configured.", schema: apiError }
      }
    },

    {
      method: "patch",
      path: "/v1/weekly-report-channels/{id}",
      operationId: "updateWeeklyReportChannel",
      summary: "Update a weekly report channel",
      tags: ["Weekly Reports"],
      security: anyMemberAuth,
      params: WeeklyReportChannelParamsSchema,
      requestBody: component("UpdateWeeklyReportChannelBody", UpdateWeeklyReportChannelBodySchema),
      responses: {
        "200": {
          description: "Updated weekly report channel.",
          schema: weeklyReportChannelResponse
        },
        "400": { description: "Invalid channel id or request body.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "404": { description: "Weekly report channel was not found.", schema: apiError },
        "403": {
          description:
            "Team tier is required for connected Slack destinations, and paused shared collaborator access cannot manage weekly reports.",
          schema: apiError
        },
        "503": { description: "Slack integration is not configured.", schema: apiError }
      }
    },

    {
      method: "delete",
      path: "/v1/weekly-report-channels/{id}",
      operationId: "deleteWeeklyReportChannel",
      summary: "Delete a weekly report channel",
      tags: ["Weekly Reports"],
      security: anyMemberAuth,
      params: WeeklyReportChannelParamsSchema,
      responses: {
        "204": { description: "Weekly report channel deleted." },
        "400": { description: "Invalid channel id.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "404": { description: "Weekly report channel was not found.", schema: apiError }
      }
    },

    {
      method: "get",
      path: "/v1/webhooks",
      operationId: "listWebhooks",
      summary: "List webhooks",
      tags: ["Webhooks"],
      security: anyMemberAuth,
      query: WebhooksQuerySchema,
      responses: {
        "200": { description: "Webhooks for a project.", schema: webhookListResponse },
        "400": { description: "Invalid query parameters.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "404": { description: "Project was not found.", schema: apiError }
      }
    },

    {
      method: "post",
      path: "/v1/webhooks",
      operationId: "createWebhook",
      summary: "Create a webhook",
      tags: ["Webhooks"],
      security: anyMemberAuth,
      requestBody: component("CreateWebhookBody", CreateWebhookBodySchema),
      responses: {
        "201": { description: "Webhook created.", schema: webhookCreateResponse },
        "400": { description: "Invalid request body.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "404": { description: "Project was not found.", schema: apiError }
      }
    },

    {
      method: "get",
      path: "/v1/webhooks/{id}",
      operationId: "getWebhook",
      summary: "Get a webhook",
      tags: ["Webhooks"],
      security: anyMemberAuth,
      params: WebhookParamsSchema,
      responses: {
        "200": { description: "Webhook details.", schema: webhookResponse },
        "400": { description: "Invalid webhook id.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "404": { description: "Webhook was not found.", schema: apiError }
      }
    },

    {
      method: "patch",
      path: "/v1/webhooks/{id}",
      operationId: "updateWebhook",
      summary: "Update a webhook",
      tags: ["Webhooks"],
      security: anyMemberAuth,
      params: WebhookParamsSchema,
      requestBody: component("UpdateWebhookBody", UpdateWebhookBodySchema),
      responses: {
        "200": { description: "Updated webhook.", schema: webhookResponse },
        "400": { description: "Invalid webhook id or request body.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "404": { description: "Webhook was not found.", schema: apiError }
      }
    },

    {
      method: "delete",
      path: "/v1/webhooks/{id}",
      operationId: "deleteWebhook",
      summary: "Delete a webhook",
      tags: ["Webhooks"],
      security: anyMemberAuth,
      params: WebhookParamsSchema,
      responses: {
        "204": { description: "Webhook deleted." },
        "400": { description: "Invalid webhook id.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "404": { description: "Webhook was not found.", schema: apiError }
      }
    },

    {
      method: "post",
      path: "/v1/webhooks/{id}/test",
      operationId: "testWebhook",
      summary: "Queue a synthetic webhook delivery",
      tags: ["Webhooks"],
      security: anyMemberAuth,
      params: WebhookParamsSchema,
      requestBody: component("WebhookTestBody", WebhookTestBodySchema),
      responses: {
        "200": { description: "Synthetic delivery queued.", schema: webhookTestResponse },
        "400": { description: "Invalid webhook id or request body.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "404": { description: "Webhook was not found.", schema: apiError }
      }
    },

    {
      method: "get",
      path: "/v1/webhooks/{id}/deliveries",
      operationId: "listWebhookDeliveries",
      summary: "List webhook deliveries",
      tags: ["Webhooks"],
      security: anyMemberAuth,
      params: WebhookDeliveriesParamsSchema,
      query: WebhookDeliveriesQuerySchema.merge(ProjectScopedQuerySchema),
      responses: {
        "200": { description: "Webhook deliveries.", schema: webhookDeliveriesResponse },
        "400": { description: "Invalid webhook id or query parameters.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "404": { description: "Webhook was not found.", schema: apiError }
      }
    },

    {
      method: "post",
      path: "/v1/webhooks/{id}/deliveries/{deliveryId}/retry",
      operationId: "retryWebhookDelivery",
      summary: "Retry a webhook delivery",
      tags: ["Webhooks"],
      security: anyMemberAuth,
      params: WebhookDeliveryRetryParamsSchema,
      responses: {
        "200": {
          description: "Webhook delivery reset for retrying.",
          schema: webhookRetryResponse
        },
        "400": { description: "Invalid webhook or delivery id.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "404": { description: "Webhook or delivery was not found.", schema: apiError }
      }
    }
  ];
}
