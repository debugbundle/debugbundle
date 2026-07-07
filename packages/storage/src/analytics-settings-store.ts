import {
  AnalyticsSettingsSchema,
  type AnalyticsSettings,
  type AnalyticsSettingsUpdate,
} from "../../shared-types/src/index.js";
import type { Queryable } from "./types.js";

type AnalyticsSettingsRow = AnalyticsSettings & Record<string, unknown>;

const ANALYTICS_SETTING_COLUMNS = [
  "enabled",
  "privacy_mode",
  "consent_required",
  "capture_page_views",
  "capture_route_changes",
  "capture_actions",
  "capture_friction_signals",
  "journey_sample_rate",
  "raw_retention_days",
  "sample_retention_days",
  "aggregate_retention_months",
  "max_saved_funnels",
  "max_custom_dimensions",
  "approved_custom_dimensions",
] as const;

export interface AnalyticsSettingsStore {
  getAnalyticsSettingsByProjectId(projectId: string): Promise<AnalyticsSettings | null>;
  updateAnalyticsSettings(input: {
    project_id: string;
    update: AnalyticsSettingsUpdate;
  }): Promise<AnalyticsSettings | null>;
}

export function createPostgresAnalyticsSettingsStore(db: Queryable): AnalyticsSettingsStore {
  const getAnalyticsSettingsByProjectId = async (
    projectId: string
  ): Promise<AnalyticsSettings | null> => {
    const result = await db.query<AnalyticsSettingsRow>(
      `
        SELECT
          COALESCE(settings.enabled, false) AS enabled,
          COALESCE(settings.privacy_mode, 'strict') AS privacy_mode,
          COALESCE(settings.consent_required, false) AS consent_required,
          COALESCE(settings.capture_page_views, true) AS capture_page_views,
          COALESCE(settings.capture_route_changes, true) AS capture_route_changes,
          COALESCE(settings.capture_actions, false) AS capture_actions,
          COALESCE(settings.capture_friction_signals, true) AS capture_friction_signals,
          COALESCE(settings.journey_sample_rate, 0) AS journey_sample_rate,
          COALESCE(settings.raw_retention_days, 1) AS raw_retention_days,
          COALESCE(settings.sample_retention_days, 7) AS sample_retention_days,
          COALESCE(settings.aggregate_retention_months, 12) AS aggregate_retention_months,
          COALESCE(settings.max_saved_funnels, 3) AS max_saved_funnels,
          COALESCE(settings.max_custom_dimensions, 0) AS max_custom_dimensions,
          COALESCE(settings.approved_custom_dimensions, '[]'::jsonb) AS approved_custom_dimensions
        FROM projects
        LEFT JOIN project_analytics_settings settings ON settings.project_id = projects.id
        WHERE projects.id = $1
        LIMIT 1
      `,
      [projectId]
    );

    const row = result.rows[0];
    return row === undefined ? null : parseAnalyticsSettingsRow(row);
  };

  return {
    getAnalyticsSettingsByProjectId,

    async updateAnalyticsSettings(input) {
      const updateKeys = ANALYTICS_SETTING_COLUMNS.filter(
        (column) => input.update[column] !== undefined
      );

      if (updateKeys.length === 0) {
        throw new Error("analytics_settings_update_empty");
      }

      const existing = await getAnalyticsSettingsByProjectId(input.project_id);
      if (existing === null) {
        return null;
      }

      const candidate = AnalyticsSettingsSchema.parse({
        ...existing,
        ...input.update,
      });
      const params: unknown[] = [
        input.project_id,
        candidate.enabled,
        candidate.privacy_mode,
        candidate.consent_required,
        candidate.capture_page_views,
        candidate.capture_route_changes,
        candidate.capture_actions,
        candidate.capture_friction_signals,
        candidate.journey_sample_rate,
        candidate.raw_retention_days,
        candidate.sample_retention_days,
        candidate.aggregate_retention_months,
        candidate.max_saved_funnels,
        candidate.max_custom_dimensions,
        JSON.stringify(candidate.approved_custom_dimensions),
      ];
      const updateAssignments = ANALYTICS_SETTING_COLUMNS
        .map((column) => `${column} = EXCLUDED.${column}`)
        .concat("updated_at = NOW()")
        .join(", ");

      const result = await db.query<AnalyticsSettingsRow>(
        `
          INSERT INTO project_analytics_settings (
            project_id,
            enabled,
            privacy_mode,
            consent_required,
            capture_page_views,
            capture_route_changes,
            capture_actions,
            capture_friction_signals,
            journey_sample_rate,
            raw_retention_days,
            sample_retention_days,
            aggregate_retention_months,
            max_saved_funnels,
            max_custom_dimensions,
            approved_custom_dimensions
          )
          SELECT
            projects.id,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10,
            $11,
            $12,
            $13,
            $14,
            $15::jsonb
          FROM projects
          WHERE projects.id = $1
          ON CONFLICT (project_id) DO UPDATE
          SET ${updateAssignments}
          RETURNING
            enabled,
            privacy_mode,
            consent_required,
            capture_page_views,
            capture_route_changes,
            capture_actions,
            capture_friction_signals,
            journey_sample_rate,
            raw_retention_days,
            sample_retention_days,
            aggregate_retention_months,
            max_saved_funnels,
            max_custom_dimensions,
            approved_custom_dimensions
        `,
        params
      );

      const row = result.rows[0];
      return row === undefined ? null : parseAnalyticsSettingsRow(row);
    },
  };
}

function parseAnalyticsSettingsRow(row: AnalyticsSettingsRow): AnalyticsSettings {
  return AnalyticsSettingsSchema.parse({
    enabled: row.enabled,
    privacy_mode: row.privacy_mode,
    consent_required: row.consent_required,
    capture_page_views: row.capture_page_views,
    capture_route_changes: row.capture_route_changes,
    capture_actions: row.capture_actions,
    capture_friction_signals: row.capture_friction_signals,
    journey_sample_rate: toNumber(row.journey_sample_rate),
    raw_retention_days: toNumber(row.raw_retention_days),
    sample_retention_days: toNumber(row.sample_retention_days),
    aggregate_retention_months: toNumber(row.aggregate_retention_months),
    max_saved_funnels: toNumber(row.max_saved_funnels),
    max_custom_dimensions: toNumber(row.max_custom_dimensions),
    approved_custom_dimensions: parseJsonArray(row.approved_custom_dimensions),
  });
}

function toNumber(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    return Number(value);
  }
  return Number.NaN;
}

function parseJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  }
  return [];
}
