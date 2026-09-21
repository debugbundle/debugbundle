import {
  z,
  ProjectParamsSchema,
  ProbeActivateBodySchema,
  ProbeDeactivateBodySchema,
  anyMemberAuth,
  memberBearerAuth,
  projectBearerAuth,
  component,
  type OperationSpec
} from "./openapi-model.js";
import {
  apiError,
  probeActivationResponse,
  probeActivationListResponse,
  probeDeactivationResponse,
  analyticsSettingsUpdate,
  analyticsSettingsResponse,
  sdkConfigResponse
} from "./openapi-components.js";
import { createAnalyticsMetricOpenApiOperations } from "./openapi-analytics.js";

export function captureOperations(): OperationSpec[] {
  return [
    {
      method: "post",
      path: "/v1/projects/{id}/probes/activate",
      operationId: "activateProbes",
      summary: "Activate remote probes",
      tags: ["Probes"],
      security: memberBearerAuth,
      params: ProjectParamsSchema,
      requestBody: component("ProbeActivateBody", ProbeActivateBodySchema),
      responses: {
        "201": { description: "Probe activation created.", schema: probeActivationResponse },
        "400": { description: "Invalid project id or request body.", schema: apiError },
        "401": { description: "Member token is invalid.", schema: apiError },
        "403": {
          description: "Paused shared collaborator access cannot manage probes.",
          schema: apiError
        },
        "404": { description: "Project was not found.", schema: apiError },
        "409": { description: "Concurrent activation limit reached.", schema: apiError },
        "429": {
          description: "Monthly remote activation quota exceeded.",
          schema: apiError,
          headers: {
            "Retry-After": {
              description: "Seconds until the caller should retry.",
              schema: z.string()
            }
          }
        }
      }
    },

    {
      method: "get",
      path: "/v1/projects/{id}/probes",
      operationId: "listActiveProbes",
      summary: "List active remote probes",
      tags: ["Probes"],
      security: memberBearerAuth,
      params: ProjectParamsSchema,
      responses: {
        "200": { description: "Active probe activations.", schema: probeActivationListResponse },
        "400": { description: "Invalid project id.", schema: apiError },
        "401": { description: "Member token is invalid.", schema: apiError },
        "403": {
          description: "Paused shared collaborator access cannot view preserved probe activations.",
          schema: apiError
        },
        "404": { description: "Project was not found.", schema: apiError }
      }
    },

    {
      method: "post",
      path: "/v1/projects/{id}/probes/deactivate",
      operationId: "deactivateProbes",
      summary: "Deactivate a remote probe",
      tags: ["Probes"],
      security: memberBearerAuth,
      params: ProjectParamsSchema,
      requestBody: component("ProbeDeactivateBody", ProbeDeactivateBodySchema),
      responses: {
        "200": { description: "Probe activation deactivated.", schema: probeDeactivationResponse },
        "400": { description: "Invalid project id or request body.", schema: apiError },
        "401": { description: "Member token is invalid.", schema: apiError },
        "403": {
          description:
            "Remote probes are not available for the caller tier, and paused shared collaborator access cannot manage probes.",
          schema: apiError
        },
        "404": { description: "Activation was not found.", schema: apiError }
      }
    },

    ...createAnalyticsMetricOpenApiOperations({ apiError, anyMemberAuth }),

    {
      method: "get",
      path: "/v1/projects/{id}/analytics-settings",
      operationId: "getAnalyticsSettings",
      summary: "Get AnalyticsBundle settings for a project",
      tags: ["Analytics"],
      security: anyMemberAuth,
      params: ProjectParamsSchema,
      responses: {
        "200": { description: "AnalyticsBundle settings.", schema: analyticsSettingsResponse },
        "400": { description: "Invalid project id.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "404": { description: "Project was not found.", schema: apiError }
      }
    },

    {
      method: "patch",
      path: "/v1/projects/{id}/analytics-settings",
      operationId: "updateAnalyticsSettings",
      summary: "Update AnalyticsBundle settings for a project",
      tags: ["Analytics"],
      security: anyMemberAuth,
      params: ProjectParamsSchema,
      requestBody: analyticsSettingsUpdate,
      responses: {
        "200": {
          description: "Updated AnalyticsBundle settings.",
          schema: analyticsSettingsResponse
        },
        "400": { description: "Invalid project id or request body.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "403": {
          description: "Owner/admin access or an eligible tier is required.",
          schema: apiError
        },
        "404": {
          description: "Project was not found or analytics settings are unavailable.",
          schema: apiError
        }
      }
    },

    {
      method: "get",
      path: "/v1/sdk/config",
      operationId: "getSdkConfig",
      summary: "Get SDK config for a project token",
      tags: ["SDK"],
      security: projectBearerAuth,
      responses: {
        "200": { description: "SDK config payload.", schema: sdkConfigResponse },
        "304": { description: "SDK config has not changed since the provided ETag." },
        "401": { description: "Project token is invalid.", schema: apiError }
      }
    }
  ];
}
