import { z } from "zod";
import { ReportRunCommandSchema } from "../../../packages/smart-reports/src/report-run.js";
import {
  ReportRunListQuerySchema,
  ReportRunListResponseSchema,
  ReportRunResponseSchema,
  ReportRunMutationSchema,
  ReportRunDeletedSchema
} from "../../../packages/smart-reports/src/report-run-api-contract.js";
import { apiError } from "./openapi-components.js";
import { anyMemberAuth, component, type OperationSpec } from "./openapi-model.js";
const params = z.object({ organizationId: z.uuid() }).strict();
const identity = params.extend({ runId: z.uuid() });
const path = "/v1/organizations/{organizationId}/reports";
const metadata = { tags: ["Smart Reports"], security: anyMemberAuth };
const failures = {
  "400": {
    description: "Invalid command, completed period, identity or cursor.",
    schema: apiError
  },
  "401": { description: "Browser session or access token required.", schema: apiError },
  "403": {
    description: "Current actor, credential, whole-scope role or entitlement is insufficient.",
    schema: apiError
  },
  "404": {
    description: "Reports disabled or run unavailable under the entire frozen scope.",
    schema: apiError
  },
  "409": {
    description: "Stale definition, workspace, request identity or run state.",
    schema: apiError
  },
  "429": {
    description: "Monthly generation, AI budget or management rate limit exceeded.",
    schema: apiError
  },
  "500": { description: "Report operation failed safely.", schema: apiError }
};
const saved = component("ReportRunResponse", ReportRunResponseSchema);
export function reportRunOperations(): OperationSpec[] {
  return [
    {
      ...metadata,
      method: "get",
      path,
      operationId: "listReports",
      summary: "List retained report metadata with current whole-scope access",
      params,
      query: ReportRunListQuerySchema,
      responses: {
        ...failures,
        "200": {
          description: "Authorised metadata only; follow next_cursor even when runs is empty.",
          schema: component("ReportRunList", ReportRunListResponseSchema)
        }
      }
    },
    {
      ...metadata,
      method: "get",
      path: `${path}/{runId}`,
      operationId: "getReport",
      summary: "Read one report's status, period and frozen scope",
      params: identity,
      responses: {
        ...failures,
        "200": {
          description: "Metadata without private model payloads or financial receipts.",
          schema: saved
        }
      }
    },
    {
      ...metadata,
      method: "post",
      path,
      operationId: "generateReport",
      summary: "Queue a report or explicit regeneration using one stable command identity",
      params,
      requestBody: component("ReportRunCommand", ReportRunCommandSchema),
      responses: {
        ...failures,
        "202": {
          description:
            "Durable admission and shared monthly reservation. Reuse the same UUID and command after a lost acknowledgement. Regeneration consumes a new generation. Model and budget are server controlled; email defaults false.",
          schema: saved
        }
      }
    },
    {
      ...metadata,
      method: "post",
      path: `${path}/{runId}/cancel`,
      operationId: "cancelReport",
      summary: "Cancel queued or processing work with current whole-scope administration",
      params: identity,
      requestBody: component("ReportRunMutation", ReportRunMutationSchema),
      responses: {
        ...failures,
        "200": {
          description: "Cancelled work; paid or uncertain model costs remain accounted for.",
          schema: saved
        }
      }
    },
    {
      ...metadata,
      method: "delete",
      path: `${path}/{runId}`,
      operationId: "deleteReport",
      summary: "Delete a report and its private generated content",
      params: identity,
      requestBody: component("ReportRunMutation", ReportRunMutationSchema),
      responses: {
        ...failures,
        "200": {
          description:
            "Deleted content and queued work. Minimal financial receipts may remain; delivered emails cannot be recalled.",
          schema: component("ReportRunDeleted", ReportRunDeletedSchema)
        }
      }
    }
  ];
}
