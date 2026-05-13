import { randomUUID } from "node:crypto";

import type { Queryable } from "./types.js";

export interface SlackDestinationRecord extends Record<string, unknown> {
  slack_destination_id: string;
  organization_id: string;
  slack_team_id: string;
  slack_team_name: string | null;
  slack_channel_id: string;
  slack_channel_name: string | null;
  installed_by_member_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SlackDestinationSecretRecord extends SlackDestinationRecord {
  webhook_url_ciphertext: string;
}

export interface DeleteSlackDestinationResult {
  slack_destination_id: string;
}

export interface SlackDestinationStore {
  listSlackDestinationsForProjectInOrganization(input: {
    organization_id: string;
    project_id: string;
    limit: number;
  }): Promise<SlackDestinationRecord[] | null>;
  getSlackDestinationForOrganization(input: {
    organization_id: string;
    slack_destination_id: string;
  }): Promise<SlackDestinationRecord | null>;
  upsertSlackDestinationForOrganization(input: {
    organization_id: string;
    slack_team_id: string;
    slack_team_name?: string | null;
    slack_channel_id: string;
    slack_channel_name?: string | null;
    webhook_url_ciphertext: string;
    installed_by_member_id?: string | null;
  }): Promise<SlackDestinationRecord>;
  deleteSlackDestinationForProjectInOrganization(input: {
    organization_id: string;
    project_id: string;
    slack_destination_id: string;
  }): Promise<DeleteSlackDestinationResult | "destination_in_use" | null>;
  getSlackDestinationSecretForDelivery(input: {
    slack_destination_id: string;
  }): Promise<SlackDestinationSecretRecord | null>;
  getSlackDestinationSecretForOrganization(input: {
    organization_id: string;
    slack_destination_id: string;
  }): Promise<SlackDestinationSecretRecord | null>;
}

type SlackDestinationRow = {
  slack_destination_id: string;
  organization_id: string;
  slack_team_id: string;
  slack_team_name: string | null;
  slack_channel_id: string;
  slack_channel_name: string | null;
  installed_by_member_id: string | null;
  webhook_url_ciphertext: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

function mapSlackDestination(row: SlackDestinationRow): SlackDestinationRecord {
  return {
    slack_destination_id: row.slack_destination_id,
    organization_id: row.organization_id,
    slack_team_id: row.slack_team_id,
    slack_team_name: row.slack_team_name,
    slack_channel_id: row.slack_channel_id,
    slack_channel_name: row.slack_channel_name,
    installed_by_member_id: row.installed_by_member_id,
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function mapSlackDestinationSecret(row: SlackDestinationRow): SlackDestinationSecretRecord {
  return {
    ...mapSlackDestination(row),
    webhook_url_ciphertext: row.webhook_url_ciphertext
  };
}

export function createPostgresSlackDestinationStore(db: Queryable): SlackDestinationStore {
  return {
    async listSlackDestinationsForProjectInOrganization(input) {
      const scopedProject = await db.query<{ id: string }>(
        `
          SELECT p.id
          FROM projects p
          WHERE p.id = $2
            AND p.organization_id = $1
          LIMIT 1
        `,
        [input.organization_id, input.project_id]
      );

      if (scopedProject.rows[0] === undefined) {
        return null;
      }

      const result = await db.query<SlackDestinationRow>(
        `
          SELECT
            sd.id AS slack_destination_id,
            sd.organization_id,
            sd.slack_team_id,
            sd.slack_team_name,
            sd.slack_channel_id,
            sd.slack_channel_name,
            sd.installed_by_member_id,
            sd.webhook_url_ciphertext,
            sd.is_active,
            sd.created_at::text AS created_at,
            sd.updated_at::text AS updated_at
          FROM slack_destinations sd
          WHERE sd.organization_id = $1
            AND sd.is_active = true
          ORDER BY
            COALESCE(sd.slack_team_name, sd.slack_team_id) ASC,
            COALESCE(sd.slack_channel_name, sd.slack_channel_id) ASC,
            sd.created_at ASC
          LIMIT $2
        `,
        [input.organization_id, input.limit]
      );

      return result.rows.map(mapSlackDestination);
    },

    async getSlackDestinationForOrganization(input) {
      const result = await db.query<SlackDestinationRow>(
        `
          SELECT
            sd.id AS slack_destination_id,
            sd.organization_id,
            sd.slack_team_id,
            sd.slack_team_name,
            sd.slack_channel_id,
            sd.slack_channel_name,
            sd.installed_by_member_id,
            sd.webhook_url_ciphertext,
            sd.is_active,
            sd.created_at::text AS created_at,
            sd.updated_at::text AS updated_at
          FROM slack_destinations sd
          WHERE sd.organization_id = $1
            AND sd.id = $2
            AND sd.is_active = true
          LIMIT 1
        `,
        [input.organization_id, input.slack_destination_id]
      );

      const row = result.rows[0];
      return row === undefined ? null : mapSlackDestination(row);
    },

    async upsertSlackDestinationForOrganization(input) {
      const destinationId = randomUUID();
      const result = await db.query<SlackDestinationRow>(
        `
          INSERT INTO slack_destinations (
            id,
            organization_id,
            slack_team_id,
            slack_team_name,
            slack_channel_id,
            slack_channel_name,
            webhook_url_ciphertext,
            installed_by_member_id,
            is_active,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, now(), now())
          ON CONFLICT (organization_id, slack_team_id, slack_channel_id)
          DO UPDATE SET
            slack_team_name = EXCLUDED.slack_team_name,
            slack_channel_name = EXCLUDED.slack_channel_name,
            webhook_url_ciphertext = EXCLUDED.webhook_url_ciphertext,
            installed_by_member_id = EXCLUDED.installed_by_member_id,
            is_active = true,
            updated_at = now()
          RETURNING
            id AS slack_destination_id,
            organization_id,
            slack_team_id,
            slack_team_name,
            slack_channel_id,
            slack_channel_name,
            installed_by_member_id,
            webhook_url_ciphertext,
            is_active,
            created_at::text AS created_at,
            updated_at::text AS updated_at
        `,
        [
          destinationId,
          input.organization_id,
          input.slack_team_id,
          input.slack_team_name ?? null,
          input.slack_channel_id,
          input.slack_channel_name ?? null,
          input.webhook_url_ciphertext,
          input.installed_by_member_id ?? null
        ]
      );

      return mapSlackDestination(result.rows[0]!);
    },

    async deleteSlackDestinationForProjectInOrganization(input) {
      const usage = await db.query<{ in_use: boolean }>(
        `
          SELECT EXISTS (
            SELECT 1
            FROM alert_rules ar
            JOIN projects p ON p.id = ar.project_id
            WHERE p.organization_id = $1
              AND ar.channel = 'slack'
              AND ar.config->>'slack_destination_id' = $2
          )
          OR EXISTS (
            SELECT 1
            FROM weekly_report_channels wrc
            JOIN projects p ON p.id = wrc.project_id
            WHERE p.organization_id = $1
              AND wrc.channel = 'slack'
              AND wrc.config->>'slack_destination_id' = $2
          ) AS in_use
        `,
        [input.organization_id, input.slack_destination_id]
      );

      if (usage.rows[0]?.in_use === true) {
        return "destination_in_use";
      }

      const result = await db.query<DeleteSlackDestinationResult & Record<string, unknown>>(
        `
          DELETE FROM slack_destinations sd
          USING projects p
          WHERE p.id = $2
            AND p.organization_id = $1
            AND sd.organization_id = p.organization_id
            AND sd.id = $3
          RETURNING sd.id AS slack_destination_id
        `,
        [input.organization_id, input.project_id, input.slack_destination_id]
      );

      return result.rows[0] ?? null;
    },

    async getSlackDestinationSecretForDelivery(input) {
      const result = await db.query<SlackDestinationRow>(
        `
          SELECT
            sd.id AS slack_destination_id,
            sd.organization_id,
            sd.slack_team_id,
            sd.slack_team_name,
            sd.slack_channel_id,
            sd.slack_channel_name,
            sd.installed_by_member_id,
            sd.webhook_url_ciphertext,
            sd.is_active,
            sd.created_at::text AS created_at,
            sd.updated_at::text AS updated_at
          FROM slack_destinations sd
          WHERE sd.id = $1
            AND sd.is_active = true
          LIMIT 1
        `,
        [input.slack_destination_id]
      );

      const row = result.rows[0];
      return row === undefined ? null : mapSlackDestinationSecret(row);
    },

    async getSlackDestinationSecretForOrganization(input) {
      const result = await db.query<SlackDestinationRow>(
        `
          SELECT
            sd.id AS slack_destination_id,
            sd.organization_id,
            sd.slack_team_id,
            sd.slack_team_name,
            sd.slack_channel_id,
            sd.slack_channel_name,
            sd.installed_by_member_id,
            sd.webhook_url_ciphertext,
            sd.is_active,
            sd.created_at::text AS created_at,
            sd.updated_at::text AS updated_at
          FROM slack_destinations sd
          WHERE sd.organization_id = $1
            AND sd.id = $2
            AND sd.is_active = true
          LIMIT 1
        `,
        [input.organization_id, input.slack_destination_id]
      );

      const row = result.rows[0];
      return row === undefined ? null : mapSlackDestinationSecret(row);
    }
  };
}
