import type { FastifyInstance } from "fastify";

import type { ApiDependencies } from "../api-types.js";
import { requireRateLimitedMemberAuth, requireRateLimitedOwnerMemberAuth } from "../api-helpers.js";
import { CreateProjectBodySchema, ProjectParamsSchema, ProjectsQuerySchema, UpdateProjectBodySchema } from "../schemas.js";

export function registerProjectRoutes(app: FastifyInstance, dependencies: ApiDependencies): void {
  app.get("/v1/projects", async (request, reply) => {
    const member = await requireRateLimitedMemberAuth(request, reply, dependencies, "management-read");
    if (member === null) {
      return;
    }
    if (dependencies.projectManagement === undefined) {
      return reply.status(404).send({ error: "projects_not_available" });
    }

    const parsedQuery = ProjectsQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.status(400).send({ error: "invalid_query" });
    }

    const projects = await dependencies.projectManagement.listProjectsForOrganization({
      organization_id: member.organization_id,
      now: new Date().toISOString(),
      limit: parsedQuery.data.limit
    });

    return reply.status(200).send({ projects });
  });

  app.post("/v1/projects", async (request, reply) => {
    const member = await requireRateLimitedOwnerMemberAuth(request, reply, dependencies, "management-write");
    if (member === null) {
      return;
    }
    if (member === "forbidden") {
      return reply.status(403).send({ error: "forbidden" });
    }
    if (dependencies.projectManagement === undefined) {
      return reply.status(404).send({ error: "projects_not_available" });
    }

    const parsedBody = CreateProjectBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: "invalid_payload" });
    }

    const project = await dependencies.projectManagement.createProjectForOrganization({
      organization_id: member.organization_id,
      name: parsedBody.data.name,
      slug: parsedBody.data.slug,
      environment_default: parsedBody.data.environment_default
    });

    if (project === null) {
      return reply.status(409).send({ error: "project_slug_taken" });
    }

    return reply.status(201).send({ project });
  });

  app.patch("/v1/projects/:id", async (request, reply) => {
    const member = await requireRateLimitedOwnerMemberAuth(request, reply, dependencies, "management-write");
    if (member === null) {
      return;
    }
    if (member === "forbidden") {
      return reply.status(403).send({ error: "forbidden" });
    }
    if (dependencies.projectManagement === undefined) {
      return reply.status(404).send({ error: "projects_not_available" });
    }

    const parsedParams = ProjectParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_project_id" });
    }

    const parsedBody = UpdateProjectBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: "invalid_payload" });
    }

    const project = await dependencies.projectManagement.updateProjectForOrganization({
      organization_id: member.organization_id,
      project_id: parsedParams.data.id,
      ...(parsedBody.data.name === undefined ? {} : { name: parsedBody.data.name }),
      ...(parsedBody.data.slug === undefined ? {} : { slug: parsedBody.data.slug }),
      ...(parsedBody.data.environment_default === undefined
        ? {}
        : { environment_default: parsedBody.data.environment_default })
    });

    if (project === "slug_taken") {
      return reply.status(409).send({ error: "project_slug_taken" });
    }

    if (project === null) {
      return reply.status(404).send({ error: "project_not_found" });
    }

    return reply.status(200).send({ project });
  });

  app.delete("/v1/projects/:id", async (request, reply) => {
    const member = await requireRateLimitedOwnerMemberAuth(request, reply, dependencies, "management-write");
    if (member === null) {
      return;
    }
    if (member === "forbidden") {
      return reply.status(403).send({ error: "forbidden" });
    }
    if (dependencies.projectManagement === undefined) {
      return reply.status(404).send({ error: "projects_not_available" });
    }

    const parsedParams = ProjectParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_project_id" });
    }

    const project = await dependencies.projectManagement.deleteProjectForOrganization({
      organization_id: member.organization_id,
      project_id: parsedParams.data.id
    });

    if (project === null) {
      return reply.status(404).send({ error: "project_not_found" });
    }

    return reply.status(200).send({ project });
  });
}
