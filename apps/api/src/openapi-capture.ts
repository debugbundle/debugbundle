import {
  AnalyticsDeliveryReceiptSchema,
  AnalyticsIdentityAssociationSchema,
  AnalyticsIdentityContextCreateSchema,
  AnalyticsIdentityContextSchema,
  AnalyticsIdentityRevokeSchema,
  AnalyticsIdentityRevocationSchema,
  AnalyticsSubjectErasureReceiptSchema,
  AnalyticsSubjectErasureRequestSchema,
  AnalyticsSubjectErasureTaskStatusSchema,
  AnalyticsRelayIdentityContextReferenceSchema,
  SemanticAnalyticsEventSchema
} from "../../../packages/shared-types/src/index.js";
import {
  z,
  ProjectParamsSchema,
  ProbeActivateBodySchema,
  ProbeDeactivateBodySchema,
  anyMemberAuth,
  memberBearerAuth,
  projectBearerAuth,
  analyticsWriterBearerTokenSecurity,
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
  sdkConfigResponse,
  sdkWriterCapabilityResponse
} from "./openapi-components.js";
import { createAnalyticsMetricOpenApiOperations } from "./openapi-analytics.js";
import { createAnalyticsControlOpenApiOperations } from "./openapi-analytics-control.js";

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
      path: "/v1/projects/{id}/analytics/identity/erasures/{taskId}",
      operationId: "getSemanticAnalyticsSubjectErasureStatus",
      summary: "Read a project subject erasure task status; currently unavailable",
      tags: ["Analytics"],
      security: anyMemberAuth,
      params: z.object({ id: z.string().uuid(), taskId: z.string().uuid() }),
      responses: {
        "200": {
          description: "Payload-free current task progress for a project owner or admin.",
          schema: component(
            "AnalyticsSubjectErasureTaskStatus",
            AnalyticsSubjectErasureTaskStatusSchema
          )
        },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "403": { description: "Project owner or admin access required.", schema: apiError },
        "404": { description: "Task was not found in this project.", schema: apiError },
        "503": { description: "Project subject erasure is disabled.", schema: apiError }
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
    ...createAnalyticsControlOpenApiOperations({ apiError, anyMemberAuth }),

    {
      method: "post",
      path: "/v1/analytics/deliver",
      operationId: "deliverSemanticAnalyticsOutbox",
      summary:
        "Deliver server semantic events with indexed durable receipts; currently unavailable",
      tags: ["Analytics"],
      security: [analyticsWriterBearerTokenSecurity],
      requestBody: component(
        "AnalyticsDeliveryRequest",
        z.object({ events: z.array(SemanticAnalyticsEventSchema).min(1).max(256) }).strict()
      ),
      responses: {
        "200": {
          description: "Indexed durable receipt after the server delivery gate is enabled.",
          schema: component("AnalyticsDeliveryReceipt", AnalyticsDeliveryReceiptSchema)
        },
        "400": { description: "Invalid batch wrapper.", schema: apiError },
        "401": {
          description: "Valid server writer credential without browser Origin required.",
          schema: apiError
        },
        "413": { description: "Body exceeds 256 KiB.", schema: apiError },
        "429": {
          description:
            "Current writer-token ingestion rate is exhausted; all valid events have indexed retryable errors and no event was persisted.",
          schema: component("AnalyticsDeliveryReceipt", AnalyticsDeliveryReceiptSchema)
        },
        "503": {
          description: "Delivery is disabled or durable acceptance is unavailable.",
          schema: apiError
        }
      }
    },

    {
      method: "post",
      path: "/v1/analytics/relay/events",
      operationId: "deliverSemanticAnalyticsRelayEvents",
      summary:
        "Deliver relay client observations with indexed durable receipts; currently unavailable",
      tags: ["Analytics"],
      security: [analyticsWriterBearerTokenSecurity],
      requestBody: component(
        "AnalyticsRelayDeliveryRequest",
        z
          .object({
            events: z.array(SemanticAnalyticsEventSchema).min(1).max(256),
            identity_context: AnalyticsRelayIdentityContextReferenceSchema.optional()
          })
          .strict()
      ),
      responses: {
        "200": {
          description: "Indexed durable receipt after the relay gate is enabled.",
          schema: component("AnalyticsRelayDeliveryReceipt", AnalyticsDeliveryReceiptSchema)
        },
        "400": { description: "Invalid batch wrapper.", schema: apiError },
        "401": {
          description: "Valid relay writer credential without browser Origin required.",
          schema: apiError
        },
        "413": { description: "Body exceeds 256 KiB.", schema: apiError },
        "429": {
          description:
            "Current relay-writer ingestion rate is exhausted; valid events have indexed retryable errors.",
          schema: component("AnalyticsRelayDeliveryReceipt", AnalyticsDeliveryReceiptSchema)
        },
        "503": {
          description: "Relay delivery is disabled or durable acceptance is unavailable.",
          schema: apiError
        }
      }
    },

    ...[
      {
        path: "/v1/analytics/identity/contexts",
        operationId: "createSemanticAnalyticsIdentityContext",
        summary: "Create a short-lived relay identity context; currently unavailable",
        request: component("AnalyticsIdentityContextCreate", AnalyticsIdentityContextCreateSchema),
        response: component("AnalyticsIdentityContext", AnalyticsIdentityContextSchema),
        params: undefined
      },
      {
        path: "/v1/analytics/identity/contexts/{id}/associate",
        operationId: "associateSemanticAnalyticsIdentityContext",
        summary: "Associate known first-party identity; currently unavailable",
        request: component("AnalyticsIdentityAssociation", AnalyticsIdentityAssociationSchema),
        response: component("AnalyticsAssociatedIdentityContext", AnalyticsIdentityContextSchema),
        params: ProjectParamsSchema
      },
      {
        path: "/v1/analytics/identity/contexts/revoke",
        operationId: "revokeSemanticAnalyticsIdentityContext",
        summary: "Revoke a relay identity context; currently unavailable",
        request: component("AnalyticsIdentityRevoke", AnalyticsIdentityRevokeSchema),
        response: component("AnalyticsIdentityRevocation", AnalyticsIdentityRevocationSchema),
        params: undefined
      }
    ].map((route) => ({
      method: "post" as const,
      path: route.path,
      operationId: route.operationId,
      summary: route.summary,
      tags: ["Analytics"],
      security: [analyticsWriterBearerTokenSecurity],
      ...(route.params === undefined ? {} : { params: route.params }),
      requestBody: route.request,
      responses: {
        "200": { description: "First-party relay lifecycle metadata.", schema: route.response },
        "400": { description: "Invalid or mismatched request.", schema: apiError },
        "401": {
          description: "Current relay writer without browser Origin required.",
          schema: apiError
        },
        "409": { description: "Context is unavailable or changed.", schema: apiError },
        "413": { description: "Body exceeds 4 KiB.", schema: apiError },
        "503": { description: "Identity lifecycle is disabled.", schema: apiError }
      }
    })),

    {
      method: "post",
      path: "/v1/analytics/identity/erasures",
      operationId: "requestSemanticAnalyticsSubjectErasure",
      summary: "Request a relay-owned project subject erasure; currently unavailable",
      tags: ["Analytics"],
      security: [analyticsWriterBearerTokenSecurity],
      requestBody: component(
        "AnalyticsSubjectErasureRequest",
        AnalyticsSubjectErasureRequestSchema
      ),
      responses: {
        "202": {
          description: "Durable cutoff task receipt; deletion is asynchronous.",
          schema: component("AnalyticsSubjectErasureReceipt", AnalyticsSubjectErasureReceiptSchema)
        },
        "400": { description: "Invalid request.", schema: apiError },
        "401": {
          description: "Current relay writer without browser Origin required.",
          schema: apiError
        },
        "409": { description: "Erasure authority or idempotency conflict.", schema: apiError },
        "413": { description: "Body exceeds 4 KiB.", schema: apiError },
        "503": { description: "Project subject erasure is disabled.", schema: apiError }
      }
    },

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
      summary: "Get SDK config or negotiate disabled semantic analytics capability",
      tags: ["SDK"],
      security: [...projectBearerAuth, analyticsWriterBearerTokenSecurity],
      responses: {
        "200": {
          description:
            "Project-token config; an exact semantic-schema opt-in adds a private disabled capability. Server writers receive only that capability.",
          schema: { oneOf: [sdkConfigResponse, sdkWriterCapabilityResponse] }
        },
        "304": { description: "SDK config has not changed since the provided ETag." },
        "401": { description: "Project or server-writer credential is invalid.", schema: apiError },
        "406": { description: "Requested semantic schema is unsupported.", schema: apiError }
      }
    }
  ];
}
