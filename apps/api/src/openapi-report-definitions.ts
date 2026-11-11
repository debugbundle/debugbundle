import { ReportAllowanceResponseSchema } from "../../../packages/smart-reports/src/report-allowance.js";
import { z } from "zod";
import {
  CreateReportRequestSchema,
  DeleteReportDefinitionSchema,
  ReportDefinitionDeletedSchema,
  ReportDefinitionListSchema,
  ReportDefinitionResponseSchema
} from "../../../packages/smart-reports/src/report-api-contract.js";
import { ReplaceReportDefinitionSchema } from "../../../packages/smart-reports/src/report-definition.js";
import { apiError } from "./openapi-components.js";
import { anyMemberAuth, component, type OperationSpec } from "./openapi-model.js";
const params = z.object({ organizationId: z.uuid() }).strict();
const identity = params.extend({ definitionId: z.uuid() });
const path = "/v1/organizations/{organizationId}/report-definitions";
const metadata = { tags: ["Smart Reports"], security: anyMemberAuth };
const failures = {
  "400": { description: "Invalid definition, consent, scope or recipient.", schema: apiError },
  "401": { description: "Browser session or access token required.", schema: apiError },
  "403": {
    description: "Current role, credential, verification or Business entitlement is insufficient.",
    schema: apiError
  },
  "404": {
    description: "Definition unavailable under the entire accepted scope.",
    schema: apiError
  },
  "409": {
    description:
      "Version, request identity, workspace, definition limit or weekly-overlap conflict.",
    schema: apiError
  },
  "429": { description: "Management rate limit exceeded.", schema: apiError },
  "500": { description: "Definition operation failed safely.", schema: apiError }
};
const saved = component("ReportDefinitionResponse", ReportDefinitionResponseSchema);
export function reportDefinitionOperations(): OperationSpec[] {
  return [
    {
      ...metadata,
      method: "get",
      path: `${path}/{definitionId}/allowance`,
      operationId: "getReportAllowance",
      summary: "Read shared monthly report allowance and current-schedule forecast",
      params: identity,
      responses: {
        ...failures,
        "200": {
          description:
            "Private/no-store. Shared logical generations use the anchored monthly billing window even for annual accounts. Forecast includes only readable, runnable schedules and discloses partial scope. No reservation, schedule change or AI call.",
          schema: component("ReportAllowanceResponse", ReportAllowanceResponseSchema)
        }
      }
    },
    {
      ...metadata,
      method: "get",
      path,
      operationId: "listReportDefinitions",
      summary: "List definitions readable across their entire saved scope",
      params,
      responses: {
        ...failures,
        "200": {
          description: "Current readable records without private credential metadata.",
          schema: component("ReportDefinitionList", ReportDefinitionListSchema)
        }
      }
    },
    {
      ...metadata,
      method: "post",
      path,
      operationId: "createReportDefinition",
      summary: "Save an explicitly scoped Business report definition",
      params,
      requestBody: component("CreateReportDefinitionRequest", CreateReportRequestSchema),
      responses: {
        ...failures,
        "201": {
          description:
            "Saved definition; reuse the same request UUID and command after a lost acknowledgement.",
          schema: saved
        }
      }
    },
    {
      ...metadata,
      method: "get",
      path: `${path}/{definitionId}`,
      operationId: "getReportDefinition",
      summary: "Read one definition with current whole-scope access",
      params: identity,
      responses: {
        ...failures,
        "200": {
          description: "Authorised retained definition, including pause and Owner-review state.",
          schema: saved
        }
      }
    },
    {
      ...metadata,
      method: "patch",
      path: `${path}/{definitionId}`,
      operationId: "replaceReportDefinition",
      summary: "Replace a definition using its expected saved version",
      params: identity,
      requestBody: component("ReplaceReportDefinition", ReplaceReportDefinitionSchema),
      responses: {
        ...failures,
        "200": {
          description:
            "New version; ordinary edits preserve unchanged frozen project origins. Only the current Owner may explicitly clear plan-loss review.",
          schema: saved
        }
      }
    },
    {
      ...metadata,
      method: "delete",
      path: `${path}/{definitionId}`,
      operationId: "deleteReportDefinition",
      summary: "Delete a definition under current administration and version checks",
      params: identity,
      requestBody: component("DeleteReportDefinition", DeleteReportDefinitionSchema),
      responses: {
        ...failures,
        "200": {
          description: "Definition deleted.",
          schema: component("ReportDefinitionDeleted", ReportDefinitionDeletedSchema)
        }
      }
    }
  ];
}
