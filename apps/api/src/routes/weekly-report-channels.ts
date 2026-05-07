import type { FastifyInstance } from "fastify";

import type { ApiDependencies } from "../api-types.js";
import { requireRateLimitedMemberAuth } from "../api-helpers.js";
import {
  CreateWeeklyReportChannelBodySchema,
  UpdateWeeklyReportChannelBodySchema,
  WeeklyReportChannelParamsSchema,
  WeeklyReportChannelsQuerySchema
} from "../schemas.js";

export function registerWeeklyReportChannelRoutes(app: FastifyInstance, dependencies: ApiDependencies): void {
  app.get("/v1/weekly-report-channels", async (request, reply) => {
    const member = await requireRateLimitedMemberAuth(request, reply, dependencies, "management-read");
    if (member === null) {
      return;
    }
    if (dependencies.weeklyReportManagement === undefined) {
      return reply.status(404).send({ error: "project_not_found" });
    }

    const parsedQuery = WeeklyReportChannelsQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.status(400).send({ error: "invalid_query" });
    }

    const channels = await dependencies.weeklyReportManagement.listWeeklyReportChannelsForOrganization({
      organization_id: member.organization_id,
      project_id: parsedQuery.data.project_id,
      limit: parsedQuery.data.limit
    });
    if (channels === null) {
      return reply.status(404).send({ error: "project_not_found" });
    }

    return reply.status(200).send({ channels });
  });

  app.post("/v1/weekly-report-channels", async (request, reply) => {
    const member = await requireRateLimitedMemberAuth(request, reply, dependencies, "management-write");
    if (member === null) {
      return;
    }
    if (dependencies.weeklyReportManagement === undefined) {
      return reply.status(404).send({ error: "project_not_found" });
    }

    const parsedBody = CreateWeeklyReportChannelBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: "invalid_payload" });
    }

    const channel = await dependencies.weeklyReportManagement.createWeeklyReportChannelForOrganization({
      organization_id: member.organization_id,
      project_id: parsedBody.data.project_id,
      channel: parsedBody.data.channel,
      config: parsedBody.data.config,
      schedule: parsedBody.data.schedule,
      is_enabled: parsedBody.data.is_enabled
    });
    if (channel === null) {
      return reply.status(404).send({ error: "project_not_found" });
    }

    return reply.status(201).send({ channel });
  });

  app.patch("/v1/weekly-report-channels/:id", async (request, reply) => {
    const member = await requireRateLimitedMemberAuth(request, reply, dependencies, "management-write");
    if (member === null) {
      return;
    }
    if (dependencies.weeklyReportManagement === undefined) {
      return reply.status(404).send({ error: "weekly_report_channel_not_found" });
    }

    const parsedParams = WeeklyReportChannelParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_weekly_report_channel_id" });
    }
    const parsedBody = UpdateWeeklyReportChannelBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: "invalid_payload" });
    }

    const channel = await dependencies.weeklyReportManagement.updateWeeklyReportChannelForOrganization({
      organization_id: member.organization_id,
      channel_id: parsedParams.data.id,
      ...(parsedBody.data.config !== undefined ? { config: parsedBody.data.config } : {}),
      ...(parsedBody.data.schedule !== undefined ? { schedule: parsedBody.data.schedule } : {}),
      ...(parsedBody.data.is_enabled !== undefined ? { is_enabled: parsedBody.data.is_enabled } : {})
    });
    if (channel === null) {
      return reply.status(404).send({ error: "weekly_report_channel_not_found" });
    }

    return reply.status(200).send({ channel });
  });

  app.delete("/v1/weekly-report-channels/:id", async (request, reply) => {
    const member = await requireRateLimitedMemberAuth(request, reply, dependencies, "management-write");
    if (member === null) {
      return;
    }
    if (dependencies.weeklyReportManagement === undefined) {
      return reply.status(404).send({ error: "weekly_report_channel_not_found" });
    }

    const parsedParams = WeeklyReportChannelParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_weekly_report_channel_id" });
    }

    const deleted = await dependencies.weeklyReportManagement.deleteWeeklyReportChannelForOrganization({
      organization_id: member.organization_id,
      channel_id: parsedParams.data.id
    });
    if (deleted === null) {
      return reply.status(404).send({ error: "weekly_report_channel_not_found" });
    }

    return reply.status(204).send();
  });
}