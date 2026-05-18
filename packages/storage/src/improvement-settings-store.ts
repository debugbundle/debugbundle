import type { ImprovementBundleSensitivity, ImprovementSettings } from "../../shared-types/src/index.js";
import type { Queryable } from "./types.js";

type ImprovementSettingsRow = ImprovementSettings & Record<string, unknown>;

export interface ImprovementSettingsStore {
  getImprovementSettingsByProjectId(projectId: string): Promise<ImprovementSettings | null>;
  updateImprovementSettings(input: {
    project_id: string;
    automated_improvement_bundles_enabled?: boolean;
    improvement_bundle_sensitivity?: ImprovementBundleSensitivity;
  }): Promise<ImprovementSettings | null>;
}

export function createPostgresImprovementSettingsStore(db: Queryable): ImprovementSettingsStore {
  return {
    async getImprovementSettingsByProjectId(projectId) {
      const result = await db.query<ImprovementSettingsRow>(
        `
          SELECT automated_improvement_bundles_enabled, improvement_bundle_sensitivity
          FROM projects
          WHERE id = $1
          LIMIT 1
        `,
        [projectId]
      );

      return result.rows[0] ?? null;
    },

    async updateImprovementSettings(input) {
      const updates: string[] = [];
      const params: unknown[] = [];
      let paramIndex = 1;

      if (input.automated_improvement_bundles_enabled !== undefined) {
        updates.push(`automated_improvement_bundles_enabled = $${paramIndex}`);
        params.push(input.automated_improvement_bundles_enabled);
        paramIndex += 1;
      }

      if (input.improvement_bundle_sensitivity !== undefined) {
        updates.push(`improvement_bundle_sensitivity = $${paramIndex}`);
        params.push(input.improvement_bundle_sensitivity);
        paramIndex += 1;
      }

      if (updates.length === 0) {
        throw new Error("improvement_settings_update_empty");
      }

      updates.push("updated_at = NOW()");
      params.push(input.project_id);

      const result = await db.query<ImprovementSettingsRow>(
        `
          UPDATE projects
          SET ${updates.join(", ")}
          WHERE id = $${paramIndex}
          RETURNING automated_improvement_bundles_enabled, improvement_bundle_sensitivity
        `,
        params
      );

      return result.rows[0] ?? null;
    },
  };
}
