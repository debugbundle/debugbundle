import { getDefaultPreset } from "../../shared-types/src/index.js";
import type { CapturePolicyRecord, ImmediateClientErrorPathRule } from "../../shared-types/src/index.js";
import type { Queryable } from "./types.js";

export interface CapturePolicyStore {
  getCapturePolicyByProjectId(projectId: string): Promise<CapturePolicyRecord | null>;
  upsertCapturePolicy(input: {
    project_id: string;
    preset: string;
    capture_logs?: string | null;
    capture_request_events?: string | null;
    capture_breadcrumbs?: string | null;
    capture_probe_events?: string | null;
    immediate_client_error_statuses?: number[] | null;
    immediate_client_error_path_rules?: ImmediateClientErrorPathRule[] | null;
  }): Promise<CapturePolicyRecord>;
  createDefaultCapturePolicy(projectId: string, plan: string): Promise<CapturePolicyRecord>;
}

export function createPostgresCapturePolicyStore(db: Queryable): CapturePolicyStore {
  return {
    async getCapturePolicyByProjectId(projectId) {
      const result = await db.query<CapturePolicyRecord>(
        `
          SELECT project_id, preset, capture_logs, capture_request_events,
                 capture_breadcrumbs, capture_probe_events, immediate_client_error_statuses,
                 immediate_client_error_path_rules, updated_at
          FROM capture_policies
          WHERE project_id = $1
          LIMIT 1
        `,
        [projectId]
      );

      return result.rows[0] ?? null;
    },

    async upsertCapturePolicy(input) {
      const result = await db.query<CapturePolicyRecord>(
        `
          INSERT INTO capture_policies (
            project_id, preset, capture_logs, capture_request_events,
            capture_breadcrumbs, capture_probe_events, immediate_client_error_statuses,
            immediate_client_error_path_rules, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, NOW())
          ON CONFLICT (project_id)
          DO UPDATE SET
            preset = EXCLUDED.preset,
            capture_logs = EXCLUDED.capture_logs,
            capture_request_events = EXCLUDED.capture_request_events,
            capture_breadcrumbs = EXCLUDED.capture_breadcrumbs,
            capture_probe_events = EXCLUDED.capture_probe_events,
            immediate_client_error_statuses = EXCLUDED.immediate_client_error_statuses,
            immediate_client_error_path_rules = EXCLUDED.immediate_client_error_path_rules,
            updated_at = NOW()
          RETURNING project_id, preset, capture_logs, capture_request_events,
                    capture_breadcrumbs, capture_probe_events, immediate_client_error_statuses,
                    immediate_client_error_path_rules, updated_at
        `,
        [
          input.project_id,
          input.preset,
          input.capture_logs ?? null,
          input.capture_request_events ?? null,
          input.capture_breadcrumbs ?? null,
          input.capture_probe_events ?? null,
          input.immediate_client_error_statuses === undefined || input.immediate_client_error_statuses === null
            ? null
            : JSON.stringify(input.immediate_client_error_statuses),
          input.immediate_client_error_path_rules === undefined || input.immediate_client_error_path_rules === null
            ? null
            : JSON.stringify(input.immediate_client_error_path_rules),
        ]
      );

      return result.rows[0]!;
    },

    async createDefaultCapturePolicy(projectId, plan) {
      const preset = getDefaultPreset(plan);
      const result = await db.query<CapturePolicyRecord>(
        `
          INSERT INTO capture_policies (
            project_id, preset, capture_logs, capture_request_events,
            capture_breadcrumbs, capture_probe_events, immediate_client_error_statuses,
            immediate_client_error_path_rules, updated_at
          )
          VALUES ($1, $2, NULL, NULL, NULL, NULL, NULL, NULL, NOW())
          ON CONFLICT (project_id) DO NOTHING
          RETURNING project_id, preset, capture_logs, capture_request_events,
                    capture_breadcrumbs, capture_probe_events, immediate_client_error_statuses,
                    immediate_client_error_path_rules, updated_at
        `,
        [projectId, preset]
      );

      return result.rows[0]!;
    },
  };
}
