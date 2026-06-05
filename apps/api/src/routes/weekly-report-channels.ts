import type { FastifyInstance } from "fastify";

import { getTierCapabilities } from "../../../../packages/shared-types/src/index.js";
import type { ProjectAccessRecord, ResolveMemberResult } from "../../../../packages/storage/src/index.js";
import type { ApiDependencies } from "../api-types.js";
import { isSharedProjectAccessSuspended, requireRateLimitedMemberAuth } from "../api-helpers.js";
import {
  CreateWeeklyReportChannelBodySchema,
  UpdateWeeklyReportChannelBodySchema,
  WeeklyReportChannelParamsSchema,
  WeeklyReportChannelsQuerySchema
} from "../schemas.js";

async function ensureSlackIntegrationEnabled(
  dependencies: ApiDependencies,
  organizationId: string
): Promise<boolean> {
  if (dependencies.billingManagement === undefined) {
    return false;
  }

  const summary = await dependencies.billingManagement.getBillingSummaryForOrganization({
    organization_id: organizationId,
    now: new Date().toISOString()
  });

  return summary !== null && getTierCapabilities(summary.plan).slack_integration;
}

function canManageWeeklyReports(access: ProjectAccessRecord): boolean {
  return access.effective_role === "owner" || access.effective_role === "admin";
}

async function resolveWeeklyReportProjectAccess(
  dependencies: ApiDependencies,
  input: {
    member: ResolveMemberResult;
    project_id: string;
  }
): Promise<ProjectAccessRecord | null> {
  if (dependencies.projectManagement?.resolveProjectAccessForUser === undefined) {
    return null;
  }

  return dependencies.projectManagement.resolveProjectAccessForUser({
    user_id: input.member.member_id,
    project_id: input.project_id
  });
}

async function resolveEditableWeeklyReportChannel(
  dependencies: ApiDependencies,
  input: {
    member: ResolveMemberResult;
    channel_id: string;
  }
): Promise<
  | {
      access: ProjectAccessRecord;
    }
  | "forbidden"
  | null
> {
  const channel = await dependencies.weeklyReportManagement?.getWeeklyReportChannelById?.({
    channel_id: input.channel_id
  });
  if (channel === undefined || channel === null) {
    return null;
  }

  const access = await resolveWeeklyReportProjectAccess(dependencies, {
    member: input.member,
    project_id: channel.project_id
  });
  if (access === null) {
    return null;
  }
  if (!canManageWeeklyReports(access)) {
    return "forbidden";
  }

  return { access };
}

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

    const access = await resolveWeeklyReportProjectAccess(dependencies, {
      member,
      project_id: parsedQuery.data.project_id
    });
    if (access === null) {
      return reply.status(404).send({ error: "project_not_found" });
    }
    if (isSharedProjectAccessSuspended(access)) {
      return reply.status(403).send({ error: "shared_access_suspended" });
    }

    const channels = await dependencies.weeklyReportManagement.listWeeklyReportChannelsForOrganization({
      organization_id: access.organization_id,
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

    const access = await resolveWeeklyReportProjectAccess(dependencies, {
      member,
      project_id: parsedBody.data.project_id
    });
    if (access === null) {
      return reply.status(404).send({ error: "project_not_found" });
    }
    if (isSharedProjectAccessSuspended(access)) {
      return reply.status(403).send({ error: "shared_access_suspended" });
    }
    if (!canManageWeeklyReports(access)) {
      return reply.status(403).send({ error: "forbidden" });
    }

    if (
      parsedBody.data.channel === "slack" &&
      "slack_destination_id" in parsedBody.data.config
    ) {
      if (dependencies.slackManagement === undefined) {
        return reply.status(503).send({ error: "slack_not_configured" });
      }
      if (!(await ensureSlackIntegrationEnabled(dependencies, access.organization_id))) {
        return reply.status(403).send({ error: "upgrade_required" });
      }

      const scopedProject = await dependencies.slackManagement.listSlackDestinationsForProjectInOrganization({
        organization_id: access.organization_id,
        project_id: parsedBody.data.project_id,
        limit: 1
      });
      if (scopedProject === null) {
        return reply.status(404).send({ error: "project_not_found" });
      }

      const destination = await dependencies.slackManagement.getSlackDestinationForOrganization({
        organization_id: access.organization_id,
        slack_destination_id: parsedBody.data.config.slack_destination_id
      });
      if (destination === null) {
        return reply.status(404).send({ error: "slack_destination_not_found" });
      }
    }

    const channel = await dependencies.weeklyReportManagement.createWeeklyReportChannelForOrganization({
      organization_id: access.organization_id,
      project_id: parsedBody.data.project_id,
      channel: parsedBody.data.channel,
      config: parsedBody.data.config,
      schedule: parsedBody.data.schedule,
      is_enabled: parsedBody.data.is_enabled
    });
    if (channel === null) {
      return reply.status(404).send({ error: "project_not_found" });
    }
    if (channel === "email_channel_exists") {
      return reply.status(409).send({ error: "weekly_report_email_channel_exists" });
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

    const editableChannel = await resolveEditableWeeklyReportChannel(dependencies, {
      member,
      channel_id: parsedParams.data.id
    });
    if (editableChannel === null) {
      return reply.status(404).send({ error: "weekly_report_channel_not_found" });
    }
    if (editableChannel === "forbidden") {
      return reply.status(403).send({ error: "forbidden" });
    }
    if (isSharedProjectAccessSuspended(editableChannel.access)) {
      return reply.status(403).send({ error: "shared_access_suspended" });
    }

    if (
      parsedBody.data.config !== undefined &&
      parsedBody.data.config !== null &&
      "slack_destination_id" in parsedBody.data.config
    ) {
      if (dependencies.slackManagement === undefined) {
        return reply.status(503).send({ error: "slack_not_configured" });
      }
      if (!(await ensureSlackIntegrationEnabled(dependencies, editableChannel.access.organization_id))) {
        return reply.status(403).send({ error: "upgrade_required" });
      }

      const destination = await dependencies.slackManagement.getSlackDestinationForOrganization({
        organization_id: editableChannel.access.organization_id,
        slack_destination_id: parsedBody.data.config.slack_destination_id
      });
      if (destination === null) {
        return reply.status(404).send({ error: "slack_destination_not_found" });
      }
    }

    const channel = await dependencies.weeklyReportManagement.updateWeeklyReportChannelForOrganization({
      organization_id: editableChannel.access.organization_id,
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

    const editableChannel = await resolveEditableWeeklyReportChannel(dependencies, {
      member,
      channel_id: parsedParams.data.id
    });
    if (editableChannel === null) {
      return reply.status(404).send({ error: "weekly_report_channel_not_found" });
    }
    if (editableChannel === "forbidden") {
      return reply.status(403).send({ error: "forbidden" });
    }
    if (isSharedProjectAccessSuspended(editableChannel.access)) {
      return reply.status(403).send({ error: "shared_access_suspended" });
    }

    const deleted = await dependencies.weeklyReportManagement.deleteWeeklyReportChannelForOrganization({
      organization_id: editableChannel.access.organization_id,
      channel_id: parsedParams.data.id
    });
    if (deleted === null) {
      return reply.status(404).send({ error: "weekly_report_channel_not_found" });
    }

    return reply.status(204).send();
  });
}
