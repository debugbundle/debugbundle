import { z } from "zod";
import { ReportContentViewSchema } from "../../../packages/smart-reports/src/report-content.js";
import { ReportReferenceSchema } from "../../../packages/smart-reports/src/model-evidence.js";
import { apiError } from "./openapi-components.js";
import { anyMemberAuth, component, type OperationSpec } from "./openapi-model.js";
const path = "/v1/organizations/{organizationId}/reports/{runId}";
const identity = z.object({ organizationId: z.uuid(), runId: z.uuid() }).strict();
const metadata = { tags: ["Smart Reports"], security: anyMemberAuth };
const failures = {
  "400": { description: "Invalid identity or reference.", schema: apiError },
  "401": { description: "Member authentication required.", schema: apiError },
  "403": { description: "Credential or current whole-scope access denied.", schema: apiError },
  "404": {
    description: "Report/source unavailable, expired, deleted or invalidated by privacy policy.",
    schema: apiError
  },
  "429": { description: "Read rate limit exceeded.", schema: apiError },
  "500": { description: "Content operation failed safely.", schema: apiError }
};
export function reportContentOperations(): OperationSpec[] {
  return [
    {
      ...metadata,
      method: "get",
      path: `${path}/document`,
      operationId: "getReportContent",
      summary: "Read canonical report facts/narrative and current retained-source availability",
      params: identity,
      responses: {
        ...failures,
        "200": {
          description:
            "Private/no-store canonical content. Current reader access to every origin is required; generation disablement or plan downgrade does not hide authorised archives.",
          schema: component("ReportContentView", ReportContentViewSchema)
        }
      }
    },
    {
      ...metadata,
      method: "get",
      path: `${path}/html`,
      operationId: "getReportHtml",
      summary: "Read a static escaped HTML rendering of the canonical report",
      params: identity,
      responses: {
        ...failures,
        "200": {
          description:
            "Private HTML with no scripts or remote assets, restrictive CSP and current authenticated source links. Does not generate new analysis.",
          mediaType: "text/html",
          schema: component("ReportHtml", z.string())
        }
      }
    },
    {
      ...metadata,
      method: "get",
      path: `${path}/sources/{reference}`,
      operationId: "openReportSource",
      summary: "Open a currently retained source under whole-report access",
      params: identity.extend({ reference: ReportReferenceSchema }),
      responses: {
        ...failures,
        "303": {
          description:
            "Authenticated configured dashboard source location. Expired/missing evidence returns report_source_unavailable.",
          headers: {
            Location: {
              description:
                "Trusted configured dashboard origin and validated DebugBundle project/incident or improvement path; never a model or user URL.",
              schema: z.string()
            }
          }
        }
      }
    }
  ];
}
