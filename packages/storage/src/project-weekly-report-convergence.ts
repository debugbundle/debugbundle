import type { Queryable } from "./types.js";

/** The checked plan requires equivalent schedule multisets. Match duplicates by
 * stable IDs, flatten prior aliases, and retain every original channel/claim. */
export async function convergeProjectWeeklyReports(
  db: Queryable,
  input: {
    target_project_id: string;
    source_project_ids: string[];
    operation_id: string;
  }
): Promise<void> {
  await db.query(
    `WITH ranked AS MATERIALIZED (
    SELECT c.*,row_number() OVER(PARTITION BY project_id,channel,config,schedule_day_of_week,schedule_hour_of_day,schedule_timezone,is_enabled ORDER BY id) AS ordinal
    FROM weekly_report_channels c WHERE project_id=ANY($1::uuid[]) OR project_id=$2
  ), mappings AS MATERIALIZED (
    SELECT source.id AS source_id,target.id AS target_id FROM ranked source JOIN ranked target
      ON (source.channel,source.config,source.schedule_day_of_week,source.schedule_hour_of_day,source.schedule_timezone,source.is_enabled,source.ordinal)
        =(target.channel,target.config,target.schedule_day_of_week,target.schedule_hour_of_day,target.schedule_timezone,target.is_enabled,target.ordinal)
      WHERE source.project_id=ANY($1::uuid[]) AND target.project_id=$2
  ), flattened AS (
    UPDATE weekly_report_channel_aliases aliases SET canonical_channel_id=m.target_id,operation_id=$3
    FROM mappings m WHERE aliases.canonical_channel_id=m.source_id RETURNING aliases.legacy_channel_id
  ) INSERT INTO weekly_report_channel_aliases(legacy_channel_id,canonical_channel_id,operation_id)
    SELECT source_id,target_id,$3::uuid FROM mappings`,
    [input.source_project_ids, input.target_project_id, input.operation_id]
  );
}
