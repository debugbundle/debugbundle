import { z } from "zod";
import {
  ServiceDefinitionCreateSchema,
  ServiceDefinitionUpdateSchema,
  ServiceDefinitionSchema,
  ServiceDefinitionPageSchema
} from "../../../packages/shared-types/src/project-services.js";
import { anyMemberAuth, component, type OperationSpec } from "./openapi-model.js";
import { apiError } from "./openapi-components.js";

export function projectServicesOperations(): OperationSpec[] {
  return (["list", "get", "create", "update"] as const).map(
    (action): OperationSpec => ({
      method: action === "create" ? "post" : action === "update" ? "patch" : "get",
      path: `/v1/projects/{id}/service-definitions${action === "get" || action === "update" ? "/{serviceId}" : ""}`,
      operationId: `${action}ServiceDefinition${action === "list" ? "s" : ""}`,
      summary: `${action} logical project service${action === "create" || action === "update" ? "; requires project owner/admin" : ""}`,
      tags: ["Projects"],
      security: anyMemberAuth,
      params: z
        .object({
          id: z.string().guid(),
          ...(action === "get" || action === "update" ? { serviceId: z.string().guid() } : {})
        })
        .strict(),
      ...(action === "list"
        ? {
            query: z
              .object({
                limit: z.coerce.number().int().min(1).max(200).default(100),
                cursor: z.string().guid().optional()
              })
              .strict()
          }
        : {}),
      ...(action === "create" || action === "update"
        ? {
            requestBody: component(
              action === "create" ? "ServiceDefinitionCreate" : "ServiceDefinitionUpdate",
              action === "create" ? ServiceDefinitionCreateSchema : ServiceDefinitionUpdateSchema
            )
          }
        : {}),
      responses: {
        [action === "create" ? "201" : "200"]: {
          description:
            "Logical service metadata; existing service_id remains an environment-specific instance ID.",
          schema:
            action === "list"
              ? component("ServiceDefinitionPage", ServiceDefinitionPageSchema)
              : component(
                  "ServiceDefinitionResponse",
                  z.object({ service: ServiceDefinitionSchema })
                )
        },
        "400": {
          description: "Invalid scope, metadata, repository URL/root or pagination.",
          schema: apiError
        },
        "401": { description: "Authentication required.", schema: apiError },
        "403": {
          description: "Insufficient permission or suspended shared access.",
          schema: apiError
        },
        "404": {
          description: "Project or service is unavailable to this member.",
          schema: apiError
        },
        "409": {
          description: "Service name conflicts with another logical or legacy input name.",
          schema: apiError
        },
        "503": { description: "Service catalogue unavailable in this runtime.", schema: apiError }
      }
    })
  );
}
