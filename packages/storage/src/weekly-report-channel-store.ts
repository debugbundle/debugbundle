import { randomUUID } from "node:crypto";

import { getTierCapabilities } from "../../shared-types/src/index.js";

import type {
  Queryable,
  WeeklyReportChannelRecord,
  WeeklyReportChannelStore,
  WeeklyReportScheduleDayOfWeek
} from "./types.js";

type WeeklyReportChannelRow = {
  channel_id: string;
  project_id: string;
  organization_plan?: string;
  channel: "email" | "slack";
  config: Record<string, unknown>;
  schedule_day_of_week: WeeklyReportScheduleDayOfWeek;
  schedule_hour_of_day: number;
  schedule_timezone: string;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
};

function mapWeeklyReportChannel(row: WeeklyReportChannelRow): WeeklyReportChannelRecord {
  return {
    channel_id: row.channel_id,
    project_id: row.project_id,
    channel: row.channel,
    config: row.config,
    schedule: {
      day_of_week: row.schedule_day_of_week,
      hour_of_day: row.schedule_hour_of_day,
      timezone: row.schedule_timezone
    },
    is_enabled: row.is_enabled,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export function createPostgresWeeklyReportChannelStore(db: Queryable): WeeklyReportChannelStore {
  function isChannelAllowed(row: WeeklyReportChannelRow): boolean {
    return row.channel !== "slack" || getTierCapabilities(row.organization_plan).slack_integration;
  }

  return {
    async listWeeklyReportChannelsForOrganization(input) {
      const result = await db.query<WeeklyReportChannelRow>(
        `
          SELECT
            wrc.id AS channel_id,
            wrc.project_id,
            COALESCE(o.plan, 'free') AS organization_plan,
            wrc.channel,
            wrc.config,
            wrc.schedule_day_of_week,
            wrc.schedule_hour_of_day,
            wrc.schedule_timezone,
            wrc.is_enabled,
            wrc.created_at::text AS created_at,
            wrc.updated_at::text AS updated_at
          FROM weekly_report_channels wrc
          JOIN projects p ON p.id = wrc.project_id
          JOIN organizations o ON o.id = p.organization_id
          WHERE wrc.project_id = $2
            AND p.organization_id = $1
          ORDER BY wrc.created_at ASC
          LIMIT $3
        `,
        [input.organization_id, input.project_id, input.limit]
      );

      if (result.rows.length === 0) {
        const project = await db.query<{ id: string }>(
          `
            SELECT p.id
            FROM projects p
            WHERE p.id = $2
              AND p.organization_id = $1
            LIMIT 1
          `,
          [input.organization_id, input.project_id]
        );

        if (project.rows[0] === undefined) {
          return null;
        }
      }

      return result.rows.map(mapWeeklyReportChannel);
    },

    async createWeeklyReportChannelForOrganization(input) {
      try {
        const result = await db.query<WeeklyReportChannelRow>(
          `
            INSERT INTO weekly_report_channels (
              id,
              project_id,
              channel,
              config,
              schedule_day_of_week,
              schedule_hour_of_day,
              schedule_timezone,
              is_enabled,
              created_at,
              updated_at
            )
            SELECT
              $3,
              p.id,
              $4,
              $5::jsonb,
              $6,
              $7,
              $8,
              $9,
              now(),
              now()
            FROM projects p
            WHERE p.organization_id = $1
              AND p.id = $2
            RETURNING
              id AS channel_id,
              project_id,
              channel,
              config,
              schedule_day_of_week,
              schedule_hour_of_day,
              schedule_timezone,
              is_enabled,
              created_at::text AS created_at,
              updated_at::text AS updated_at
          `,
          [
            input.organization_id,
            input.project_id,
            randomUUID(),
            input.channel,
            JSON.stringify(input.config),
            input.schedule.day_of_week,
            input.schedule.hour_of_day,
            input.schedule.timezone,
            input.is_enabled
          ]
        );

        const row = result.rows[0];
        return row === undefined ? null : mapWeeklyReportChannel(row);
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "23505" &&
          "constraint" in error &&
          error.constraint === "weekly_report_channels_project_email_unique_idx"
        ) {
          return "email_channel_exists";
        }

        throw error;
      }
    },

    async updateWeeklyReportChannelForOrganization(input) {
      const updates: string[] = [];
      const params: unknown[] = [input.organization_id, input.channel_id];

      if (input.config !== undefined) {
        params.push(JSON.stringify(input.config));
        updates.push(`config = $${params.length}::jsonb`);
      }
      if (input.schedule !== undefined) {
        params.push(input.schedule.day_of_week);
        updates.push(`schedule_day_of_week = $${params.length}`);
        params.push(input.schedule.hour_of_day);
        updates.push(`schedule_hour_of_day = $${params.length}`);
        params.push(input.schedule.timezone);
        updates.push(`schedule_timezone = $${params.length}`);
      }
      if (input.is_enabled !== undefined) {
        params.push(input.is_enabled);
        updates.push(`is_enabled = $${params.length}`);
      }

      if (updates.length === 0) {
        return null;
      }

      updates.push("updated_at = now()");

      const result = await db.query<WeeklyReportChannelRow>(
        `
          UPDATE weekly_report_channels wrc
          SET ${updates.join(", ")}
          FROM projects p
          WHERE wrc.project_id = p.id
            AND p.organization_id = $1
            AND wrc.id = $2
          RETURNING
            wrc.id AS channel_id,
            wrc.project_id,
            wrc.channel,
            wrc.config,
            wrc.schedule_day_of_week,
            wrc.schedule_hour_of_day,
            wrc.schedule_timezone,
            wrc.is_enabled,
            wrc.created_at::text AS created_at,
            wrc.updated_at::text AS updated_at
        `,
        params
      );

      const row = result.rows[0];
      return row === undefined ? null : mapWeeklyReportChannel(row);
    },

    async deleteWeeklyReportChannelForOrganization(input) {
      const result = await db.query<{ channel_id: string }>(
        `
          DELETE FROM weekly_report_channels wrc
          USING projects p
          WHERE wrc.project_id = p.id
            AND p.organization_id = $1
            AND wrc.id = $2
          RETURNING wrc.id AS channel_id
        `,
        [input.organization_id, input.channel_id]
      );

      return result.rows[0] ?? null;
    },

    async listEnabledWeeklyReportChannels(input) {
      const result = await db.query<WeeklyReportChannelRow>(
        `
          SELECT
            wrc.id AS channel_id,
            wrc.project_id,
            COALESCE(o.plan, 'free') AS organization_plan,
            wrc.channel,
            wrc.config,
            wrc.schedule_day_of_week,
            wrc.schedule_hour_of_day,
            wrc.schedule_timezone,
            wrc.is_enabled,
            wrc.created_at::text AS created_at,
            wrc.updated_at::text AS updated_at
          FROM weekly_report_channels wrc
          JOIN projects p ON p.id = wrc.project_id
          JOIN organizations o ON o.id = p.organization_id
          WHERE wrc.is_enabled = true
          ORDER BY wrc.created_at ASC
          LIMIT $1
        `,
        [input.limit]
      );

      return result.rows.filter(isChannelAllowed).map(mapWeeklyReportChannel);
    },

    async getWeeklyReportChannelById(input) {
      const result = await db.query<WeeklyReportChannelRow>(
        `
          SELECT
            wrc.id AS channel_id,
            wrc.project_id,
            COALESCE(o.plan, 'free') AS organization_plan,
            wrc.channel,
            wrc.config,
            wrc.schedule_day_of_week,
            wrc.schedule_hour_of_day,
            wrc.schedule_timezone,
            wrc.is_enabled,
            wrc.created_at::text AS created_at,
            wrc.updated_at::text AS updated_at
          FROM weekly_report_channels wrc
          JOIN projects p ON p.id = wrc.project_id
          JOIN organizations o ON o.id = p.organization_id
          WHERE wrc.id = $1
          LIMIT 1
        `,
        [input.channel_id]
      );

      const row = result.rows[0];
      return row === undefined ? null : mapWeeklyReportChannel(row);
    }
  };
}
