import { z } from "zod";
import {
  ProjectMergeRequestSchema,
  ProjectMergeApplySchema,
  ProjectMergePlanSchema,
  ProjectMergeOperationSchema,
  ProjectMergeVerificationSchema
} from "../../../packages/shared-types/src/project-consolidation.js";
import { anyMemberAuth, component, type OperationSpec } from "./openapi-model.js";
const error = component(
  "ProjectMergeError",
  z.object({ error: z.string(), operation_id: z.string().guid().optional() })
);
export function projectMergeOperations(): OperationSpec[] {
  return (["preview", "apply", "lookup", "status", "verify", "resume", "cancel"] as const).map(
    (action): OperationSpec => ({
      method:
        action === "preview" || action === "apply" || action === "resume" || action === "cancel"
          ? "post"
          : "get",
      path:
        action === "preview"
          ? "/v1/project-merges/preview"
          : action === "apply" || action === "lookup"
            ? "/v1/project-merges"
            : `/v1/project-merges/{id}${action === "verify" ? "/verification" : action === "resume" || action === "cancel" ? `/${action}` : ""}`,
      operationId: `${action}ProjectMerge`,
      summary: `${action} checked project consolidation; requires current owner`,
      tags: ["Projects"],
      security: anyMemberAuth,
      ...(action === "lookup"
        ? {
            query: z
              .object({ idempotency_key: ProjectMergeApplySchema.shape.idempotency_key })
              .strict()
          }
        : action !== "preview" && action !== "apply"
          ? { params: z.object({ id: z.string().guid() }).strict() }
          : {}),
      ...(action === "preview" || action === "apply"
        ? {
            requestBody: component(
              action === "preview" ? "ProjectMergeRequest" : "ProjectMergeApply",
              action === "preview" ? ProjectMergeRequestSchema : ProjectMergeApplySchema
            )
          }
        : {}),
      responses: {
        "200": {
          description:
            "Checked result. Completed server consolidation leaves repository adoption and deployed-runtime verification pending.",
          schema:
            action === "preview"
              ? component("ProjectMergePlan", ProjectMergePlanSchema)
              : action === "verify"
                ? component("ProjectMergeVerification", ProjectMergeVerificationSchema)
                : component("ProjectMergeOperation", ProjectMergeOperationSchema)
        },
        "400": { description: "Invalid request or selector.", schema: error },
        "401": { description: "Member authentication required.", schema: error },
        "404": { description: "Operation unavailable to this current owner.", schema: error },
        "409": {
          description:
            "Stale plan, incompatible policy/access, active operation or cancellation after cutover. Preserve operation_id and inspect status.",
          schema: error
        },
        "503": {
          description: "Merge service unavailable or server-side apply disabled.",
          schema: error
        }
      }
    })
  );
}
