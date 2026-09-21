import {
  z,
  BulkIncidentMutationBodySchema,
  ImprovementParamsSchema,
  ImprovementsQuerySchema,
  IncidentParamsSchema,
  IncidentsQuerySchema,
  LogsQuerySchema,
  ProjectParamsSchema,
  ProjectImprovementParamsSchema,
  ServicesQuerySchema,
  anyMemberAuth,
  memberBearerAuth,
  projectBearerAuth,
  component,
  type OperationSpec
} from "./openapi-model.js";
import {
  apiError,
  ingestionRequest,
  ingestionResponse,
  incidentListResponse,
  incidentResponse,
  bulkIncidentResponse,
  improvementListResponse,
  improvementResponse,
  improvementSnoozeBody,
  bundleResponse,
  bundlePending,
  bundleFailed,
  reproductionResponse,
  logsResponse,
  servicesResponse,
  improvementSettingsUpdate,
  improvementSettingsResponse
} from "./openapi-components.js";

export function evidenceOperations(): OperationSpec[] {
  return [
    {
      method: "post",
      path: "/v1/events",
      operationId: "ingestEvents",
      summary: "Ingest batched events",
      tags: ["Ingestion"],
      security: projectBearerAuth,
      requestBody: ingestionRequest,
      responses: {
        "202": { description: "Events accepted for processing.", schema: ingestionResponse },
        "400": { description: "Malformed ingestion payload.", schema: ingestionResponse },
        "401": { description: "Project token is invalid.", schema: ingestionResponse },
        "429": {
          description: "Rate limit or monthly ingestion quota exceeded.",
          schema: ingestionResponse,
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
      path: "/v1/incidents",
      operationId: "listIncidents",
      summary: "List incidents",
      tags: ["Incidents"],
      security: anyMemberAuth,
      query: IncidentsQuerySchema,
      responses: {
        "200": { description: "Incident list.", schema: incidentListResponse },
        "400": { description: "Invalid query parameters.", schema: apiError },
        "401": { description: "Member token is invalid.", schema: apiError }
      }
    },

    {
      method: "post",
      path: "/v1/incidents/resolve",
      operationId: "resolveIncidents",
      summary: "Resolve incidents in bulk",
      tags: ["Incidents"],
      security: anyMemberAuth,
      requestBody: component("BulkIncidentMutationBody", BulkIncidentMutationBodySchema),
      responses: {
        "200": {
          description: "Resolved incident details in request order.",
          schema: bulkIncidentResponse
        },
        "400": { description: "Invalid request body.", schema: apiError },
        "401": { description: "Member token is invalid.", schema: apiError },
        "404": { description: "One or more incidents were not found.", schema: apiError },
        "500": { description: "Incident resolution is unavailable.", schema: apiError }
      }
    },

    {
      method: "post",
      path: "/v1/incidents/reopen",
      operationId: "reopenIncidents",
      summary: "Reopen incidents in bulk",
      tags: ["Incidents"],
      security: anyMemberAuth,
      requestBody: component("BulkIncidentMutationBody", BulkIncidentMutationBodySchema),
      responses: {
        "200": {
          description: "Reopened incident details in request order.",
          schema: bulkIncidentResponse
        },
        "400": { description: "Invalid request body.", schema: apiError },
        "401": { description: "Member token is invalid.", schema: apiError },
        "404": { description: "One or more incidents were not found.", schema: apiError },
        "500": { description: "Incident reopen is unavailable.", schema: apiError }
      }
    },

    {
      method: "get",
      path: "/v1/incidents/{id}",
      operationId: "getIncident",
      summary: "Get a single incident",
      tags: ["Incidents"],
      security: anyMemberAuth,
      params: IncidentParamsSchema,
      responses: {
        "200": { description: "Incident details.", schema: incidentResponse },
        "400": { description: "Invalid incident id.", schema: apiError },
        "401": { description: "Member token is invalid.", schema: apiError },
        "404": { description: "Incident was not found.", schema: apiError }
      }
    },

    {
      method: "post",
      path: "/v1/incidents/{id}/resolve",
      operationId: "resolveIncident",
      summary: "Resolve an incident",
      tags: ["Incidents"],
      security: anyMemberAuth,
      params: IncidentParamsSchema,
      responses: {
        "200": { description: "Resolved incident details.", schema: incidentResponse },
        "400": { description: "Invalid incident id.", schema: apiError },
        "401": { description: "Member token is invalid.", schema: apiError },
        "404": { description: "Incident was not found.", schema: apiError },
        "500": { description: "Incident resolution is unavailable.", schema: apiError }
      }
    },

    {
      method: "post",
      path: "/v1/incidents/{id}/reopen",
      operationId: "reopenIncident",
      summary: "Reopen an incident",
      tags: ["Incidents"],
      security: memberBearerAuth,
      params: IncidentParamsSchema,
      responses: {
        "200": { description: "Reopened incident details.", schema: incidentResponse },
        "400": { description: "Invalid incident id.", schema: apiError },
        "401": { description: "Member token is invalid.", schema: apiError },
        "404": { description: "Incident was not found.", schema: apiError },
        "500": { description: "Incident reopen is unavailable.", schema: apiError }
      }
    },

    {
      method: "get",
      path: "/v1/incidents/{id}/bundle",
      operationId: "getBundle",
      summary: "Get the generated bundle for an incident",
      tags: ["Incidents"],
      security: memberBearerAuth,
      params: IncidentParamsSchema,
      responses: {
        "200": {
          description: "Bundle document or a generation status.",
          schema: { oneOf: [bundleResponse, bundlePending, bundleFailed] }
        },
        "400": { description: "Invalid incident id.", schema: apiError },
        "401": { description: "Member token is invalid.", schema: apiError },
        "404": { description: "Incident was not found.", schema: apiError }
      }
    },

    {
      method: "get",
      path: "/v1/incidents/{id}/reproduction",
      operationId: "getReproduction",
      summary: "Get the reproduction artifact for an incident",
      tags: ["Incidents"],
      security: memberBearerAuth,
      params: IncidentParamsSchema,
      responses: {
        "200": {
          description: "Reproduction artifact or a pending status.",
          schema: reproductionResponse
        },
        "400": { description: "Invalid incident id.", schema: apiError },
        "401": { description: "Member token is invalid.", schema: apiError },
        "404": { description: "Incident or reproduction artifact was not found.", schema: apiError }
      }
    },

    {
      method: "get",
      path: "/v1/improvements",
      operationId: "listImprovements",
      summary: "List hosted improvement opportunities",
      tags: ["Improvements"],
      security: memberBearerAuth,
      query: ImprovementsQuerySchema,
      responses: {
        "200": { description: "Improvement opportunity list.", schema: improvementListResponse },
        "400": { description: "Invalid query parameters.", schema: apiError },
        "401": { description: "Member token is invalid.", schema: apiError },
        "404": { description: "Improvement management is unavailable.", schema: apiError }
      }
    },

    {
      method: "get",
      path: "/v1/improvements/{id}",
      operationId: "getImprovement",
      summary: "Get a hosted improvement opportunity",
      tags: ["Improvements"],
      security: memberBearerAuth,
      params: ImprovementParamsSchema,
      responses: {
        "200": { description: "Improvement opportunity details.", schema: improvementResponse },
        "400": { description: "Invalid improvement id.", schema: apiError },
        "401": { description: "Member token is invalid.", schema: apiError },
        "404": { description: "Improvement opportunity was not found.", schema: apiError }
      }
    },

    {
      method: "post",
      path: "/v1/improvements/{id}/resolve",
      operationId: "resolveImprovement",
      summary: "Resolve a hosted improvement opportunity",
      tags: ["Improvements"],
      security: memberBearerAuth,
      params: ImprovementParamsSchema,
      responses: {
        "200": { description: "Resolved improvement opportunity.", schema: improvementResponse },
        "400": { description: "Invalid improvement id.", schema: apiError },
        "401": { description: "Member token is invalid.", schema: apiError },
        "404": {
          description: "Improvement opportunity was not found or resolution is unavailable.",
          schema: apiError
        }
      }
    },

    {
      method: "post",
      path: "/v1/improvements/{id}/reopen",
      operationId: "reopenImprovement",
      summary: "Reopen a hosted improvement opportunity",
      tags: ["Improvements"],
      security: memberBearerAuth,
      params: ImprovementParamsSchema,
      responses: {
        "200": { description: "Reopened improvement opportunity.", schema: improvementResponse },
        "400": { description: "Invalid improvement id.", schema: apiError },
        "401": { description: "Member token is invalid.", schema: apiError },
        "404": {
          description: "Improvement opportunity was not found or reopen is unavailable.",
          schema: apiError
        }
      }
    },

    {
      method: "post",
      path: "/v1/improvements/{id}/snooze",
      operationId: "snoozeImprovement",
      summary: "Snooze a hosted improvement opportunity",
      tags: ["Improvements"],
      security: memberBearerAuth,
      params: ImprovementParamsSchema,
      requestBody: improvementSnoozeBody,
      responses: {
        "200": { description: "Snoozed improvement opportunity.", schema: improvementResponse },
        "400": { description: "Invalid improvement id or snooze timestamp.", schema: apiError },
        "401": { description: "Member token is invalid.", schema: apiError },
        "404": {
          description: "Improvement opportunity was not found or snooze is unavailable.",
          schema: apiError
        }
      }
    },

    {
      method: "get",
      path: "/v1/projects/{id}/improvements/{improvementId}/bundle",
      operationId: "getImprovementBundle",
      summary: "Get the hosted bundle for an improvement opportunity",
      tags: ["Improvements"],
      security: anyMemberAuth,
      params: ProjectImprovementParamsSchema,
      responses: {
        "200": {
          description: "Improvement bundle document or generation status.",
          schema: { oneOf: [bundleResponse, bundlePending, bundleFailed] }
        },
        "400": { description: "Invalid project or improvement id.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "404": {
          description: "Project or improvement opportunity was not found.",
          schema: apiError
        }
      }
    },

    {
      method: "get",
      path: "/v1/logs",
      operationId: "getLogs",
      summary: "Query incident logs",
      tags: ["Incidents"],
      security: memberBearerAuth,
      query: LogsQuerySchema,
      responses: {
        "200": { description: "Incident logs.", schema: logsResponse },
        "400": { description: "Invalid query parameters.", schema: apiError },
        "401": { description: "Member token is invalid.", schema: apiError }
      }
    },

    {
      method: "get",
      path: "/v1/services",
      operationId: "listServices",
      summary: "List services for a project",
      tags: ["Services"],
      security: memberBearerAuth,
      query: ServicesQuerySchema,
      responses: {
        "200": { description: "Project services.", schema: servicesResponse },
        "400": { description: "Invalid query parameters.", schema: apiError },
        "401": { description: "Member token is invalid.", schema: apiError },
        "404": { description: "Project was not found.", schema: apiError },
        "500": { description: "Service retrieval is unavailable.", schema: apiError }
      }
    },

    {
      method: "get",
      path: "/v1/projects/{id}/improvement-settings",
      operationId: "getImprovementSettings",
      summary: "Get automated improvement settings for a project",
      tags: ["Improvements"],
      security: anyMemberAuth,
      params: ProjectParamsSchema,
      responses: {
        "200": {
          description: "Automated improvement settings.",
          schema: improvementSettingsResponse
        },
        "400": { description: "Invalid project id.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "404": { description: "Project was not found.", schema: apiError }
      }
    },

    {
      method: "patch",
      path: "/v1/projects/{id}/improvement-settings",
      operationId: "updateImprovementSettings",
      summary: "Update automated improvement settings for a project",
      tags: ["Improvements"],
      security: anyMemberAuth,
      params: ProjectParamsSchema,
      requestBody: improvementSettingsUpdate,
      responses: {
        "200": {
          description: "Updated automated improvement settings.",
          schema: improvementSettingsResponse
        },
        "400": { description: "Invalid project id or request body.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "403": {
          description: "Owner/admin access or an eligible paid tier is required.",
          schema: apiError
        },
        "404": {
          description: "Project was not found or improvement settings are unavailable.",
          schema: apiError
        }
      }
    }
  ];
}
