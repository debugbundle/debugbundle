import { memberReadScope } from "../member-access-scope.js";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  ServiceDefinitionCreateSchema,
  ServiceDefinitionUpdateSchema
} from "../../../../packages/shared-types/src/project-services.js";
import { ServiceDefinitionError } from "../../../../packages/storage/src/service-definition-store.js";
import type { ApiDependencies } from "../api-types.js";
import { requireRateLimitedMemberAuth } from "../api-helpers.js";
import { recordAuditLog, resolveAuditActorType } from "../audit-logging.js";

const paramsSchema = z
  .object({ id: z.string().guid(), serviceId: z.string().guid().optional() })
  .strict();
const querySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(200).default(100),
    cursor: z.string().guid().optional()
  })
  .strict();

export function registerProjectServicesRoutes(
  app: FastifyInstance,
  dependencies: ApiDependencies
): void {
  for (const action of ["list", "get", "create", "update"] as const) {
    const write = action === "create" || action === "update";
    app.route({
      method: action === "create" ? "POST" : action === "update" ? "PATCH" : "GET",
      url: `/v1/projects/:id/service-definitions${action === "get" || action === "update" ? "/:serviceId" : ""}`,
      async handler(request, reply) {
        const member = await requireRateLimitedMemberAuth(
          request,
          reply,
          dependencies,
          write ? "management-write" : "management-read"
        );
        if (!member) return;
        if (!dependencies.serviceDefinitions)
          return reply.status(503).send({ error: "service_definitions_unavailable" });
        const params = paramsSchema.safeParse(request.params);
        if (!params.success) return reply.status(400).send({ error: "invalid_service_scope" });
        const scope = {
          project_id: params.data.id,
          ...memberReadScope(member),
          user_id: member.member_id
        };
        const access = write
          ? await dependencies.projectManagement?.resolveProjectAccessForUser?.({
              ...memberReadScope(member),
              user_id: member.member_id,
              project_id: scope.project_id
            })
          : undefined;
        const auditOrganization = access?.organization_id ?? member.organization_id;
        let status: "success" | "failure" = "success";
        let reason: string | undefined;
        try {
          if (action === "list") {
            const query = querySchema.safeParse(request.query);
            if (!query.success) return reply.status(400).send({ error: "invalid_query" });
            return reply.send(
              await dependencies.serviceDefinitions.list({ ...scope, ...query.data })
            );
          }
          if (action === "get")
            return reply.send({
              service: await dependencies.serviceDefinitions.get({
                ...scope,
                service_definition_id: params.data.serviceId!
              })
            });
          const body = (
            action === "create" ? ServiceDefinitionCreateSchema : ServiceDefinitionUpdateSchema
          ).safeParse(request.body);
          if (!body.success) throw new ServiceDefinitionError("invalid_service_definition");
          const service =
            action === "create"
              ? await dependencies.serviceDefinitions.create({
                  ...scope,
                  ...ServiceDefinitionCreateSchema.parse(body.data)
                })
              : await dependencies.serviceDefinitions.update({
                  ...scope,
                  service_definition_id: params.data.serviceId!,
                  ...body.data
                });
          return reply.status(action === "create" ? 201 : 200).send({ service });
        } catch (error) {
          status = "failure";
          if (!(error instanceof ServiceDefinitionError)) throw error;
          reason = error.code;
          const code = error.code.endsWith("not_found")
            ? 404
            : ["forbidden", "shared_access_suspended"].includes(error.code)
              ? 403
              : [
                    "service_name_conflict",
                    "project_consolidated",
                    "service_alias_limit_exceeded"
                  ].includes(error.code)
                ? 409
                : 400;
          return reply.status(code).send({
            error: error.code,
            ...(error.canonical_project_id === null
              ? {}
              : {
                  canonical_project_id: error.canonical_project_id,
                  required_scope: "canonical_project"
                })
          });
        } finally {
          if (write)
            await recordAuditLog(dependencies.auditLogging, {
              organization_id: auditOrganization,
              actor_user_id: member.member_id,
              actor_type: resolveAuditActorType(request.headers),
              action: `service_definition.${action}`,
              target_type: "project",
              target_id: scope.project_id,
              status,
              ip_address: request.ip,
              metadata: reason === undefined ? {} : { reason }
            });
        }
      }
    });
  }
}
