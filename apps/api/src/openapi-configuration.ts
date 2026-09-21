import {
  AvailabilityCheckCreateBodySchema,
  AvailabilityCheckTestBodySchema,
  AvailabilityCheckUpdateBodySchema,
  IncidentParamsSchema,
  ProjectCaptureRuleParamsSchema,
  ProjectParamsSchema,
  ProjectAvailabilityCheckParamsSchema,
  TokenListQuerySchema,
  anyMemberAuth,
  component,
  type OperationSpec
} from "./openapi-model.js";
import {
  apiError,
  successResponse,
  captureRuleCreate,
  createCaptureRuleFromSuggestion,
  captureRuleUpdate,
  captureRuleResponse,
  captureRulesResponse,
  captureRuleSuggestionsResponse,
  capturePolicyUpdate,
  capturePolicyResponse,
  availabilityCheckListResponse,
  availabilityCheckResponse,
  availabilityCheckMutationResponse,
  availabilityCheckDeleteResponse,
  availabilityCheckResultsResponse,
  availabilityCheckDailyRollupsResponse,
  availabilityCheckTestResponse
} from "./openapi-components.js";

export function configurationOperations(): OperationSpec[] {
  return [
    {
      method: "get",
      path: "/v1/projects/{id}/availability-checks",
      operationId: "listAvailabilityChecks",
      summary: "List hosted health checks for a project",
      tags: ["Health"],
      security: anyMemberAuth,
      params: ProjectParamsSchema,
      query: TokenListQuerySchema,
      responses: {
        "200": {
          description: "Hosted health checks plus project plan limits.",
          schema: availabilityCheckListResponse
        },
        "400": { description: "Invalid project id or query parameters.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "404": {
          description: "Project was not found or availability checks are unavailable.",
          schema: apiError
        }
      }
    },

    {
      method: "post",
      path: "/v1/projects/{id}/availability-checks",
      operationId: "createAvailabilityCheck",
      summary: "Create a hosted health check",
      tags: ["Health"],
      security: anyMemberAuth,
      params: ProjectParamsSchema,
      requestBody: component("AvailabilityCheckCreateBody", AvailabilityCheckCreateBodySchema),
      responses: {
        "201": {
          description: "Hosted health check created.",
          schema: availabilityCheckMutationResponse
        },
        "400": { description: "Invalid project id, payload, or blocked target.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "403": { description: "Owner or admin project access is required.", schema: apiError },
        "404": {
          description: "Project was not found or availability checks are unavailable.",
          schema: apiError
        },
        "409": {
          description: "Tier count or minimum-interval limit was reached.",
          schema: apiError
        }
      }
    },

    {
      method: "get",
      path: "/v1/projects/{id}/availability-checks/{checkId}",
      operationId: "getAvailabilityCheck",
      summary: "Get one hosted health check",
      tags: ["Health"],
      security: anyMemberAuth,
      params: ProjectAvailabilityCheckParamsSchema,
      responses: {
        "200": {
          description: "Hosted health check detail plus project plan limits.",
          schema: availabilityCheckResponse
        },
        "400": { description: "Invalid project id or check id.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "404": {
          description: "Health check was not found or availability checks are unavailable.",
          schema: apiError
        }
      }
    },

    {
      method: "patch",
      path: "/v1/projects/{id}/availability-checks/{checkId}",
      operationId: "updateAvailabilityCheck",
      summary: "Update a hosted health check",
      tags: ["Health"],
      security: anyMemberAuth,
      params: ProjectAvailabilityCheckParamsSchema,
      requestBody: component("AvailabilityCheckUpdateBody", AvailabilityCheckUpdateBodySchema),
      responses: {
        "200": {
          description: "Hosted health check updated.",
          schema: availabilityCheckMutationResponse
        },
        "400": {
          description: "Invalid project id, check id, payload, or blocked target.",
          schema: apiError
        },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "403": { description: "Owner or admin project access is required.", schema: apiError },
        "404": {
          description: "Health check was not found or availability checks are unavailable.",
          schema: apiError
        },
        "409": { description: "Minimum-interval limit was reached.", schema: apiError }
      }
    },

    {
      method: "delete",
      path: "/v1/projects/{id}/availability-checks/{checkId}",
      operationId: "deleteAvailabilityCheck",
      summary: "Delete a hosted health check",
      tags: ["Health"],
      security: anyMemberAuth,
      params: ProjectAvailabilityCheckParamsSchema,
      responses: {
        "200": {
          description: "Hosted health check deleted.",
          schema: availabilityCheckDeleteResponse
        },
        "400": { description: "Invalid project id or check id.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "403": { description: "Owner or admin project access is required.", schema: apiError },
        "404": {
          description: "Health check was not found or availability checks are unavailable.",
          schema: apiError
        }
      }
    },

    {
      method: "get",
      path: "/v1/projects/{id}/availability-checks/{checkId}/results",
      operationId: "listAvailabilityCheckResults",
      summary: "List retained health-check execution results",
      tags: ["Health"],
      security: anyMemberAuth,
      params: ProjectAvailabilityCheckParamsSchema,
      query: TokenListQuerySchema,
      responses: {
        "200": {
          description: "Recent retained execution results.",
          schema: availabilityCheckResultsResponse
        },
        "400": {
          description: "Invalid project id, check id, or query parameters.",
          schema: apiError
        },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "404": {
          description: "Health check was not found or availability checks are unavailable.",
          schema: apiError
        }
      }
    },

    {
      method: "get",
      path: "/v1/projects/{id}/availability-checks/{checkId}/daily-rollups",
      operationId: "listAvailabilityCheckDailyRollups",
      summary: "List retained per-day health-check history",
      tags: ["Health"],
      security: anyMemberAuth,
      params: ProjectAvailabilityCheckParamsSchema,
      query: TokenListQuerySchema,
      responses: {
        "200": {
          description: "Retained daily health history.",
          schema: availabilityCheckDailyRollupsResponse
        },
        "400": {
          description: "Invalid project id, check id, or query parameters.",
          schema: apiError
        },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "404": {
          description: "Health check was not found or availability checks are unavailable.",
          schema: apiError
        }
      }
    },

    {
      method: "post",
      path: "/v1/projects/{id}/availability-checks/test",
      operationId: "testAvailabilityCheck",
      summary: "Run a side-effect-free hosted health-check test",
      tags: ["Health"],
      security: anyMemberAuth,
      params: ProjectParamsSchema,
      requestBody: component("AvailabilityCheckTestBody", AvailabilityCheckTestBodySchema),
      responses: {
        "200": {
          description: "Side-effect-free health-check test result.",
          schema: availabilityCheckTestResponse
        },
        "400": { description: "Invalid project id, payload, or blocked target.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "403": { description: "Owner or admin project access is required.", schema: apiError },
        "404": {
          description: "Project was not found or availability checks are unavailable.",
          schema: apiError
        }
      }
    },

    {
      method: "post",
      path: "/v1/incidents/{id}/capture-rule-suggestion",
      operationId: "suggestCaptureRule",
      summary: "Generate deterministic capture rule suggestions from an incident bundle",
      tags: ["Capture Rules"],
      security: anyMemberAuth,
      params: IncidentParamsSchema,
      responses: {
        "200": { description: "Capture rule suggestions.", schema: captureRuleSuggestionsResponse },
        "400": { description: "Invalid incident id.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "404": { description: "Incident was not found.", schema: apiError }
      }
    },

    {
      method: "post",
      path: "/v1/incidents/{id}/capture-rules",
      operationId: "createCaptureRuleFromSuggestion",
      summary: "Create a project capture rule from an incident suggestion",
      tags: ["Capture Rules"],
      security: anyMemberAuth,
      params: IncidentParamsSchema,
      requestBody: createCaptureRuleFromSuggestion,
      responses: {
        "201": { description: "Capture rule created.", schema: captureRuleResponse },
        "400": { description: "Invalid incident id or request body.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "403": {
          description:
            "Owner/admin access is required, and paused shared collaborator access cannot create capture rules.",
          schema: apiError
        },
        "404": { description: "Incident, suggestion, or project was not found.", schema: apiError },
        "409": {
          description: "Suggestion generation is unavailable until a bundle is ready.",
          schema: apiError
        }
      }
    },

    {
      method: "get",
      path: "/v1/projects/{id}/capture-rules",
      operationId: "listCaptureRules",
      summary: "List project capture rules",
      tags: ["Capture Rules"],
      security: anyMemberAuth,
      params: ProjectParamsSchema,
      responses: {
        "200": { description: "Project capture rules.", schema: captureRulesResponse },
        "400": { description: "Invalid project id.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "404": { description: "Project was not found.", schema: apiError }
      }
    },

    {
      method: "post",
      path: "/v1/projects/{id}/capture-rules",
      operationId: "createCaptureRule",
      summary: "Create a project capture rule",
      tags: ["Capture Rules"],
      security: anyMemberAuth,
      params: ProjectParamsSchema,
      requestBody: captureRuleCreate,
      responses: {
        "201": { description: "Capture rule created.", schema: captureRuleResponse },
        "400": { description: "Invalid project id or request body.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "403": { description: "Owner/admin access is required.", schema: apiError },
        "404": {
          description: "Project was not found or capture rules are unavailable.",
          schema: apiError
        }
      }
    },

    {
      method: "patch",
      path: "/v1/projects/{id}/capture-rules/{ruleId}",
      operationId: "updateCaptureRule",
      summary: "Update a project capture rule",
      tags: ["Capture Rules"],
      security: anyMemberAuth,
      params: ProjectCaptureRuleParamsSchema,
      requestBody: captureRuleUpdate,
      responses: {
        "200": { description: "Capture rule updated.", schema: captureRuleResponse },
        "400": { description: "Invalid project id, rule id, or request body.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "403": { description: "Owner/admin access is required.", schema: apiError },
        "404": {
          description: "Capture rule was not found or capture rules are unavailable.",
          schema: apiError
        }
      }
    },

    {
      method: "delete",
      path: "/v1/projects/{id}/capture-rules/{ruleId}",
      operationId: "deleteCaptureRule",
      summary: "Delete a project capture rule",
      tags: ["Capture Rules"],
      security: anyMemberAuth,
      params: ProjectCaptureRuleParamsSchema,
      responses: {
        "200": { description: "Capture rule deleted.", schema: successResponse },
        "400": { description: "Invalid project id or rule id.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "403": { description: "Owner/admin access is required.", schema: apiError },
        "404": {
          description: "Capture rule was not found or capture rules are unavailable.",
          schema: apiError
        }
      }
    },

    {
      method: "get",
      path: "/v1/projects/{id}/capture-policy",
      operationId: "getCapturePolicy",
      summary: "Get the resolved capture policy for a project",
      tags: ["Capture Policy"],
      security: anyMemberAuth,
      params: ProjectParamsSchema,
      responses: {
        "200": { description: "Resolved capture policy.", schema: capturePolicyResponse },
        "400": { description: "Invalid project id.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "404": { description: "Project was not found.", schema: apiError }
      }
    },

    {
      method: "patch",
      path: "/v1/projects/{id}/capture-policy",
      operationId: "updateCapturePolicy",
      summary: "Update the capture policy for a project",
      tags: ["Capture Policy"],
      security: anyMemberAuth,
      params: ProjectParamsSchema,
      requestBody: capturePolicyUpdate,
      responses: {
        "200": { description: "Updated resolved capture policy.", schema: capturePolicyResponse },
        "400": { description: "Invalid project id or request body.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "403": { description: "Owner access is required.", schema: apiError },
        "404": {
          description: "Project was not found or capture policy is unavailable.",
          schema: apiError
        }
      }
    }
  ];
}
