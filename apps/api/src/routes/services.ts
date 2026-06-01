import type { FastifyInstance } from "fastify";

import type { ApiDependencies } from "../api-types.js";
import { requireRateLimitedMemberAuth } from "../api-helpers.js";
import { ServicesQuerySchema } from "../schemas.js";

export function registerServicesRoutes(app: FastifyInstance, dependencies: ApiDependencies): void {
  app.get("/v1/services", async (request, reply) => {
    const member = await requireRateLimitedMemberAuth(request, reply, dependencies, "retrieval-read");
    if (member === null) {
      return;
    }

    const parsedQuery = ServicesQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.status(400).send({
        error: "invalid_query"
      });
    }

    if (dependencies.incidentRetrieval.listServicesForOrganization === undefined) {
      return reply.status(500).send({
        error: "services_retrieval_unavailable"
      });
    }

    const services = await dependencies.incidentRetrieval.listServicesForOrganization({
      organization_id: member.organization_id,
      user_id: member.member_id,
      project_id: parsedQuery.data.project_id,
      limit: parsedQuery.data.limit
    });

    if (services === null) {
      return reply.status(404).send({
        error: "project_not_found"
      });
    }

    return reply.status(200).send({
      services
    });
  });
}
