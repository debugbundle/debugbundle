import {
  AnalyticsSavedFunnelCreateSchema,
  AnalyticsSavedFunnelSchema,
  AnalyticsSavedFunnelUpdateSchema,
  getTierCapabilities,
  type AnalyticsSavedFunnel,
  type AnalyticsSavedFunnelCreate,
  type AnalyticsSavedFunnelUpdate,
  type TierName
} from "../../shared-types/src/index.js";
import { runInTransaction } from "./transaction.js";
import type { Queryable } from "./types.js";

export type CreateAnalyticsSavedFunnelResult =
  | { status: "created"; funnel: AnalyticsSavedFunnel }
  | { status: "project_not_found" | "funnel_key_taken" | "limit_reached" };

export interface AnalyticsSavedFunnelStore {
  listSavedFunnelsForProject(input: {
    organization_id: string;
    project_id: string;
  }): Promise<AnalyticsSavedFunnel[]>;
  createSavedFunnelForProject(input: {
    organization_id: string;
    project_id: string;
    created_by_user_id: string;
    definition: AnalyticsSavedFunnelCreate;
  }): Promise<CreateAnalyticsSavedFunnelResult>;
  updateSavedFunnelForProject(input: {
    organization_id: string;
    project_id: string;
    funnel_key: string;
    update: AnalyticsSavedFunnelUpdate;
  }): Promise<AnalyticsSavedFunnel | null>;
  archiveSavedFunnelForProject(input: {
    organization_id: string;
    project_id: string;
    funnel_key: string;
  }): Promise<AnalyticsSavedFunnel | null>;
}

type SavedFunnelRow = {
  project_id: unknown;
  funnel_key: unknown;
  display_name: unknown;
  steps: unknown;
  created_at: unknown;
  updated_at: unknown;
  archived_at: unknown;
};

export function createPostgresAnalyticsSavedFunnelStore(db: Queryable): AnalyticsSavedFunnelStore {
  return {
    async listSavedFunnelsForProject(input) {
      const result = await db.query<SavedFunnelRow>(
        `
          SELECT ${savedFunnelColumns("afd")}
          FROM analytics_funnel_definitions afd
          JOIN projects p ON p.id = afd.project_id
          WHERE p.organization_id = $1::uuid
            AND afd.project_id = $2::uuid
            AND afd.archived_at IS NULL
          ORDER BY afd.updated_at DESC, afd.funnel_key ASC
        `,
        [input.organization_id, input.project_id]
      );
      return result.rows.map(mapSavedFunnelRow);
    },

    async createSavedFunnelForProject(input) {
      const definition = AnalyticsSavedFunnelCreateSchema.parse(input.definition);
      return runInTransaction(db, async (tx) => {
        const project = await tx.query<{
          max_saved_funnels: unknown;
          organization_plan: unknown;
        }>(
          `
            SELECT
              settings.max_saved_funnels,
              organizations.plan AS organization_plan
            FROM projects p
            JOIN organizations ON organizations.id = p.organization_id
            LEFT JOIN project_analytics_settings settings ON settings.project_id = p.id
            WHERE p.organization_id = $1::uuid
              AND p.id = $2::uuid
            FOR UPDATE OF p
          `,
          [input.organization_id, input.project_id]
        );
        const projectRow = project.rows[0];
        if (projectRow === undefined) return { status: "project_not_found" };

        const existing = await tx.query<{ archived_at: unknown }>(
          `
            SELECT archived_at
            FROM analytics_funnel_definitions
            WHERE project_id = $1::uuid
              AND funnel_key = $2
            LIMIT 1
          `,
          [input.project_id, definition.funnel_key]
        );
        if (existing.rows[0]?.archived_at == null && existing.rows[0] !== undefined) {
          return { status: "funnel_key_taken" };
        }

        const count = await tx.query<{ active_count: unknown }>(
          `
            SELECT COUNT(*) AS active_count
            FROM analytics_funnel_definitions
            WHERE project_id = $1::uuid
              AND archived_at IS NULL
          `,
          [input.project_id]
        );
        const tierLimit = getTierCapabilities(
          parseTierName(projectRow.organization_plan)
        ).max_analytics_saved_funnels;
        const projectLimit =
          projectRow.max_saved_funnels == null ? tierLimit : toNumber(projectRow.max_saved_funnels);
        const effectiveLimit = Math.min(projectLimit, tierLimit);
        if (toNumber(count.rows[0]?.active_count) >= effectiveLimit) {
          return { status: "limit_reached" };
        }

        const persisted = await tx.query<SavedFunnelRow>(
          `
            INSERT INTO analytics_funnel_definitions (
              project_id,
              funnel_key,
              display_name,
              steps,
              created_by_user_id
            )
            VALUES ($1::uuid, $2, $3, $4::jsonb, $5::uuid)
            ON CONFLICT (project_id, funnel_key) DO UPDATE
            SET
              display_name = EXCLUDED.display_name,
              steps = EXCLUDED.steps,
              created_by_user_id = EXCLUDED.created_by_user_id,
              archived_at = NULL,
              updated_at = now()
            WHERE analytics_funnel_definitions.archived_at IS NOT NULL
            RETURNING ${savedFunnelColumns("analytics_funnel_definitions")}
          `,
          [
            input.project_id,
            definition.funnel_key,
            definition.display_name,
            JSON.stringify(definition.steps),
            input.created_by_user_id
          ]
        );
        const row = persisted.rows[0];
        if (row === undefined) throw new Error("analytics_saved_funnel_create_race");
        return { status: "created", funnel: mapSavedFunnelRow(row) };
      });
    },

    async updateSavedFunnelForProject(input) {
      const update = AnalyticsSavedFunnelUpdateSchema.parse(input.update);
      const result = await db.query<SavedFunnelRow>(
        `
          UPDATE analytics_funnel_definitions afd
          SET
            display_name = COALESCE($4, afd.display_name),
            steps = COALESCE($5::jsonb, afd.steps),
            updated_at = now()
          FROM projects p
          WHERE p.id = afd.project_id
            AND p.organization_id = $1::uuid
            AND afd.project_id = $2::uuid
            AND afd.funnel_key = $3
            AND afd.archived_at IS NULL
          RETURNING ${savedFunnelColumns("afd")}
        `,
        [
          input.organization_id,
          input.project_id,
          input.funnel_key,
          update.display_name ?? null,
          update.steps === undefined ? null : JSON.stringify(update.steps)
        ]
      );
      const row = result.rows[0];
      return row === undefined ? null : mapSavedFunnelRow(row);
    },

    async archiveSavedFunnelForProject(input) {
      const result = await db.query<SavedFunnelRow>(
        `
          UPDATE analytics_funnel_definitions afd
          SET archived_at = now(), updated_at = now()
          FROM projects p
          WHERE p.id = afd.project_id
            AND p.organization_id = $1::uuid
            AND afd.project_id = $2::uuid
            AND afd.funnel_key = $3
            AND afd.archived_at IS NULL
          RETURNING ${savedFunnelColumns("afd")}
        `,
        [input.organization_id, input.project_id, input.funnel_key]
      );
      const row = result.rows[0];
      return row === undefined ? null : mapSavedFunnelRow(row);
    }
  };
}

function savedFunnelColumns(alias: string): string {
  return `
    ${alias}.project_id::text AS project_id,
    ${alias}.funnel_key,
    ${alias}.display_name,
    ${alias}.steps,
    ${alias}.created_at,
    ${alias}.updated_at,
    ${alias}.archived_at
  `;
}

function mapSavedFunnelRow(row: SavedFunnelRow): AnalyticsSavedFunnel {
  return AnalyticsSavedFunnelSchema.parse({
    project_id: row.project_id,
    funnel_key: row.funnel_key,
    display_name: row.display_name,
    steps: parseJson(row.steps),
    created_at: toIsoString(row.created_at),
    updated_at: toIsoString(row.updated_at),
    archived_at: row.archived_at == null ? null : toIsoString(row.archived_at)
  });
}

function parseJson(value: unknown): unknown {
  return typeof value === "string" ? JSON.parse(value) : value;
}

function toIsoString(value: unknown): unknown {
  return value instanceof Date ? value.toISOString() : value;
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return Number.NaN;
}

function parseTierName(value: unknown): TierName {
  if (value === "free" || value === "solo" || value === "team") return value;
  throw new Error("analytics_saved_funnel_invalid_organization_plan");
}
