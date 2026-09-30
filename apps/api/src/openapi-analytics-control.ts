import { z } from "zod";
import {
  ProjectSemanticFunnelQuerySchema,
  ProjectSemanticFunnelRecentQuerySchema,
  ProjectSemanticFunnelReportResponseSchema
} from "../../../packages/analytics-engine/src/funnel-report-protocol.js";
import {
  AnalyticsMeasurementPlanSchema,
  AnalyticsIdentityNamespaceApplySchema,
  AnalyticsIdentityNamespaceApplyRequestSchema,
  AnalyticsIdentityNamespaceChangeSchema,
  AnalyticsIdentityNamespacePreviewSchema,
  AnalyticsIdentityNamespaceRecordSchema,
  AnalyticsProjectPlanApplyRequestSchema,
  AnalyticsProjectPlanApplyResponseSchema,
  AnalyticsProjectPlanPreviewSchema,
  AnalyticsProjectPlanRecordSchema,
  AnalyticsProjectPlanValidationResponseSchema,
  AnalyticsSpaceApplySchema,
  AnalyticsSpaceChangeSchema,
  AnalyticsSpacePreviewSchema,
  AnalyticsSpaceResponseSchema,
  AnalyticsSpacesResponseSchema,
  AnalyticsSpacePlanApplyRequestSchema,
  AnalyticsSpacePlanApplyResponseSchema,
  AnalyticsSpacePlanPreviewSchema,
  AnalyticsSpacePlanRecordSchema,
  AnalyticsSemanticJobRetryResponseSchema,
  AnalyticsWriterApplyRequestSchema,
  AnalyticsWriterApplyResultSchema,
  AnalyticsWriterChangeSchema,
  AnalyticsWriterListSchema,
  AnalyticsWriterPreviewSchema
} from "../../../packages/shared-types/src/index.js";
import type { OperationSpec, SchemaComponent, SecurityRequirement } from "./openapi-model.js";

const IdParams = z.object({ id: z.string().uuid() }).strict();
const EventParams = z.object({ id: z.string().uuid(), eventId: z.string().uuid() }).strict();
const ProjectScopeParams = z.object({ kind: z.literal("project"), id: z.string().uuid() }).strict();
const SpaceListQuery = z.object({ organization_id: z.string().uuid() }).strict();
const schema = (name: string, value: unknown): SchemaComponent => ({ name, schema: value });

export function createAnalyticsControlOpenApiOperations(input: {
  apiError: SchemaComponent;
  anyMemberAuth: SecurityRequirement[];
}): OperationSpec[] {
  const { apiError, anyMemberAuth } = input;
  const errors = {
    "400": { description: "Invalid or mismatched request.", schema: apiError },
    "401": { description: "Member authentication required.", schema: apiError },
    "403": { description: "Current management access denied.", schema: apiError },
    "404": { description: "Scope or optional management service unavailable.", schema: apiError },
    "429": { description: "Management request rate limited.", schema: apiError }
  };
  const conflict = {
    "409": { description: "Revision, reviewed content or capacity conflict.", schema: apiError }
  };
  const common = { tags: ["Analytics Management"], security: anyMemberAuth };
  const spaceChange = schema("AnalyticsSpaceChange", AnalyticsSpaceChangeSchema);
  const spaceApply = schema("AnalyticsSpaceApply", AnalyticsSpaceApplySchema);
  const spaceResponse = schema("AnalyticsSpaceResponse", AnalyticsSpaceResponseSchema);
  const spacePreview = schema("AnalyticsSpacePreview", AnalyticsSpacePreviewSchema);
  const operations: OperationSpec[] = [
    {
      ...common,
      method: "post",
      path: "/v1/analytics/scopes/{kind}/{id}/reports/query",
      operationId: "queryProjectSemanticAnalyticsReport",
      summary: "Query a project ordered-funnel report; disabled in default composition",
      params: ProjectScopeParams,
      requestBody: schema(
        "ProjectSemanticFunnelQuery",
        z.union([ProjectSemanticFunnelQuerySchema, ProjectSemanticFunnelRecentQuerySchema])
      ),
      responses: {
        "200": {
          description: "Partial or unavailable report with explicit evidence coverage.",
          schema: schema(
            "ProjectSemanticFunnelReportResponse",
            ProjectSemanticFunnelReportResponseSchema
          )
        },
        ...errors,
        "409": {
          description: "Current definition has insufficient retained history.",
          schema: apiError
        },
        "413": { description: "Body exceeds 8 KiB.", schema: apiError },
        "503": { description: "Semantic report service is disabled.", schema: apiError }
      }
    },
    {
      ...common,
      method: "get",
      path: "/v1/analytics/spaces",
      operationId: "listAnalyticsSpaces",
      summary: "List spaces visible across every current source",
      query: SpaceListQuery,
      responses: {
        "200": {
          description: "Currently accessible spaces.",
          schema: schema("AnalyticsSpacesResponse", AnalyticsSpacesResponseSchema)
        },
        ...errors
      }
    },
    {
      ...common,
      method: "get",
      path: "/v1/analytics/spaces/{id}",
      operationId: "getAnalyticsSpace",
      summary: "Read a space with current all-source authorization",
      params: IdParams,
      responses: {
        "200": { description: "Current space metadata.", schema: spaceResponse },
        ...errors
      }
    }
  ];
  operations.push(
    {
      ...common,
      method: "post",
      path: "/v1/projects/{id}/analytics/events/{eventId}/retry",
      operationId: "retryFailedSemanticAnalyticsEvent",
      summary:
        "Queue an owned failed semantic event while its accepted raw input remains available",
      params: EventParams,
      responses: {
        "202": {
          description: "The exact failed event was requeued; processing remains asynchronous.",
          schema: schema(
            "AnalyticsSemanticJobRetryResponse",
            AnalyticsSemanticJobRetryResponseSchema
          )
        },
        ...errors,
        "409": {
          description: "No eligible failed job or retained accepted raw input.",
          schema: apiError
        },
        "503": {
          description: "Semantic recovery is disabled in default composition.",
          schema: apiError
        }
      }
    },
    {
      ...common,
      method: "get",
      path: "/v1/projects/{id}/analytics/identity-namespace",
      operationId: "getAnalyticsIdentityNamespace",
      summary: "Read current project identity namespace metadata; currently unavailable",
      params: IdParams,
      responses: {
        "200": {
          description: "Current namespace revision and key fingerprint, never the key.",
          schema: schema("AnalyticsIdentityNamespaceRecord", AnalyticsIdentityNamespaceRecordSchema)
        },
        ...errors,
        "503": { description: "Namespace management is disabled.", schema: apiError }
      }
    },
    {
      ...common,
      method: "post",
      path: "/v1/projects/{id}/analytics/identity-namespace/preview",
      operationId: "previewAnalyticsIdentityNamespace",
      summary: "Review a project identity namespace change without writing; currently unavailable",
      params: IdParams,
      requestBody: schema(
        "AnalyticsIdentityNamespaceChange",
        AnalyticsIdentityNamespaceChangeSchema
      ),
      responses: {
        "200": {
          description: "Current and proposed fingerprint, context fence and reviewed content hash.",
          schema: schema(
            "AnalyticsIdentityNamespacePreview",
            AnalyticsIdentityNamespacePreviewSchema
          )
        },
        ...errors,
        ...conflict,
        "503": { description: "Namespace management is disabled.", schema: apiError }
      }
    },
    {
      ...common,
      method: "post",
      path: "/v1/projects/{id}/analytics/identity-namespace/apply",
      operationId: "applyAnalyticsIdentityNamespace",
      summary: "Apply a reviewed project identity namespace change; currently unavailable",
      params: IdParams,
      requestBody: schema(
        "AnalyticsIdentityNamespaceApplyRequest",
        AnalyticsIdentityNamespaceApplyRequestSchema
      ),
      responses: {
        "200": {
          description: "Revisioned namespace result with replay disposition.",
          schema: schema("AnalyticsIdentityNamespaceApply", AnalyticsIdentityNamespaceApplySchema)
        },
        ...errors,
        ...conflict,
        "413": { description: "Body exceeds 4 KiB.", schema: apiError },
        "503": { description: "Namespace management is disabled.", schema: apiError }
      }
    }
  );
  for (const target of [
    { path: "/v1/analytics/spaces", suffix: "Create", params: undefined },
    { path: "/v1/analytics/spaces/{id}", suffix: "Change", params: IdParams }
  ] as const) {
    operations.push(
      {
        ...common,
        method: "post",
        path: `${target.path}/preview`,
        operationId: `previewAnalyticsSpace${target.suffix}`,
        summary: "Preview a reviewed space membership change without writing",
        ...(target.params === undefined ? {} : { params: target.params }),
        requestBody: spaceChange,
        responses: {
          "200": { description: "Reviewed space diff and hash.", schema: spacePreview },
          ...errors,
          ...conflict
        }
      },
      {
        ...common,
        method: "post",
        path: `${target.path}/apply`,
        operationId: `applyAnalyticsSpace${target.suffix}`,
        summary: "Apply a reviewed space membership change",
        ...(target.params === undefined ? {} : { params: target.params }),
        requestBody: spaceApply,
        responses: {
          "200": { description: "Applied space revision.", schema: spaceResponse },
          ...errors,
          ...conflict
        }
      }
    );
  }
  const spacePlan = "/v1/analytics/spaces/{id}/plan";
  operations.push(
    {
      ...common,
      method: "get",
      path: spacePlan,
      operationId: "getAnalyticsSpacePlan",
      summary: "Read a current source-complete space plan declaration",
      params: IdParams,
      responses: {
        "200": {
          description: "Current declaration; report-bearing plans are not yet available.",
          schema: schema("AnalyticsSpacePlanRecord", AnalyticsSpacePlanRecordSchema)
        },
        ...errors
      }
    },
    {
      ...common,
      method: "post",
      path: `${spacePlan}/validate`,
      operationId: "validateAnalyticsSpacePlan",
      summary: "Validate space plan structure and references without a write",
      params: IdParams,
      requestBody: schema("AnalyticsMeasurementPlan", AnalyticsMeasurementPlanSchema),
      responses: {
        "200": {
          description: "Fixed validation issues; source and mode checks run during preview.",
          schema: schema(
            "AnalyticsProjectPlanValidationResponse",
            AnalyticsProjectPlanValidationResponseSchema
          )
        },
        ...errors,
        "413": { description: "Body exceeds 256 KiB.", schema: apiError }
      }
    },
    {
      ...common,
      method: "post",
      path: `${spacePlan}/preview`,
      operationId: "previewAnalyticsSpacePlan",
      summary: "Review a zero-report, source-complete space plan declaration",
      params: IdParams,
      requestBody: schema("AnalyticsMeasurementPlan", AnalyticsMeasurementPlanSchema),
      responses: {
        "200": {
          description: "Current source revisions, coverage and reviewed content hash.",
          schema: schema("AnalyticsSpacePlanPreview", AnalyticsSpacePlanPreviewSchema)
        },
        ...errors,
        ...conflict,
        "413": { description: "Body exceeds 256 KiB.", schema: apiError }
      }
    },
    {
      ...common,
      method: "post",
      path: `${spacePlan}/apply`,
      operationId: "applyAnalyticsSpacePlan",
      summary: "Apply a reviewed zero-report space plan declaration",
      params: IdParams,
      requestBody: schema("AnalyticsSpacePlanApplyRequest", AnalyticsSpacePlanApplyRequestSchema),
      responses: {
        "200": {
          description: "Applied declaration and replay disposition.",
          schema: schema("AnalyticsSpacePlanApplyResponse", AnalyticsSpacePlanApplyResponseSchema)
        },
        ...errors,
        ...conflict,
        "413": { description: "Body exceeds 256 KiB.", schema: apiError }
      }
    }
  );
  const project = "/v1/projects/{id}/analytics";
  const writers = `${project}/writers`;
  operations.push(
    {
      ...common,
      method: "get",
      path: writers,
      operationId: "listAnalyticsWriters",
      summary: "List current project analytics writer credentials without secrets",
      params: IdParams,
      responses: {
        "200": {
          description: "Current writer metadata.",
          schema: schema("AnalyticsWriterList", AnalyticsWriterListSchema)
        },
        ...errors
      }
    },
    {
      ...common,
      method: "post",
      path: `${writers}/preview`,
      operationId: "previewAnalyticsWriter",
      summary: "Preview a writer credential change without issuing a secret",
      params: IdParams,
      requestBody: schema("AnalyticsWriterChange", AnalyticsWriterChangeSchema),
      responses: {
        "200": {
          description: "Reviewed writer change and hash.",
          schema: schema("AnalyticsWriterPreview", AnalyticsWriterPreviewSchema)
        },
        ...errors,
        ...conflict
      }
    },
    {
      ...common,
      method: "post",
      path: `${writers}/apply`,
      operationId: "applyAnalyticsWriter",
      summary: "Apply a reviewed writer change; show a new secret only once",
      params: IdParams,
      requestBody: schema("AnalyticsWriterApplyRequest", AnalyticsWriterApplyRequestSchema),
      responses: {
        "200": {
          description: "Applied writer change; an issued secret is returned only once.",
          schema: schema("AnalyticsWriterApplyResult", AnalyticsWriterApplyResultSchema)
        },
        ...errors,
        ...conflict
      }
    }
  );
  const plan = `${project}/plan`;
  const proposedPlan = schema("AnalyticsMeasurementPlan", AnalyticsMeasurementPlanSchema);
  operations.push(
    {
      ...common,
      method: "get",
      path: plan,
      operationId: "getAnalyticsProjectPlan",
      summary: "Read the current project plan and observed producer coverage",
      params: IdParams,
      responses: {
        "200": {
          description:
            "Current plan, prospective report definitions and retained current-entry observations, including bounded submitted SDK name/version rows with an explicit truncation flag; observation is not package or success-boundary verification.",
          schema: schema("AnalyticsProjectPlanRecord", AnalyticsProjectPlanRecordSchema)
        },
        ...errors
      }
    },
    {
      ...common,
      method: "post",
      path: `${plan}/validate`,
      operationId: "validateAnalyticsProjectPlan",
      summary: "Validate a project plan without writing or proving instrumentation",
      params: IdParams,
      requestBody: proposedPlan,
      responses: {
        "200": {
          description: "Fixed validation issues or valid declaration.",
          schema: schema(
            "AnalyticsProjectPlanValidationResponse",
            AnalyticsProjectPlanValidationResponseSchema
          )
        },
        ...errors,
        "413": { description: "Plan body exceeds 256 KiB.", schema: apiError }
      }
    },
    {
      ...common,
      method: "post",
      path: `${plan}/preview`,
      operationId: "previewAnalyticsProjectPlan",
      summary: "Preview a project plan with a revision-bound review hash",
      params: IdParams,
      requestBody: proposedPlan,
      responses: {
        "200": {
          description: "Plan diff, effective capacity and reviewed hash.",
          schema: schema("AnalyticsProjectPlanPreview", AnalyticsProjectPlanPreviewSchema)
        },
        ...errors,
        ...conflict,
        "413": { description: "Plan body exceeds 256 KiB.", schema: apiError }
      }
    },
    {
      ...common,
      method: "post",
      path: `${plan}/apply`,
      operationId: "applyAnalyticsProjectPlan",
      summary: "Apply a reviewed project plan prospectively",
      params: IdParams,
      requestBody: schema(
        "AnalyticsProjectPlanApplyRequest",
        AnalyticsProjectPlanApplyRequestSchema
      ),
      responses: {
        "200": {
          description: "Applied project plan revision or idempotent replay.",
          schema: schema(
            "AnalyticsProjectPlanApplyResponse",
            AnalyticsProjectPlanApplyResponseSchema
          )
        },
        ...errors,
        ...conflict,
        "413": { description: "Plan body exceeds 256 KiB.", schema: apiError }
      }
    }
  );
  return operations;
}
