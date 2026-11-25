import { defineStorageSchemaMigration } from "./schema-migration-definition.js";
import type { Queryable } from "./types.js";

export const CAPTURE_RULE_THRESHOLD_TABLES = ["capture_rule_threshold_events"] as const;

export const CAPTURE_RULE_THRESHOLD_MIGRATION = defineStorageSchemaMigration({
  id: "202611240001_add_capture_rule_thresholds",
  description:
    "Add capture rule threshold parameters and bounded threshold event window tracking.",
  statements: [
    `ALTER TABLE capture_rules ADD COLUMN IF NOT EXISTS threshold_count integer CHECK (threshold_count IS NULL OR (threshold_count >= 2 AND threshold_count <= 1000))`,
    `ALTER TABLE capture_rules ADD COLUMN IF NOT EXISTS threshold_window_seconds integer CHECK (threshold_window_seconds IS NULL OR (threshold_window_seconds >= 60 AND threshold_window_seconds <= 86400))`,
    `ALTER TABLE capture_rules ADD COLUMN IF NOT EXISTS threshold_group_by text CHECK (threshold_group_by IS NULL OR threshold_group_by IN ('resource', 'fingerprint'))`,
    `CREATE TABLE IF NOT EXISTS capture_rule_threshold_events (
      event_id uuid PRIMARY KEY,
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      rule_id uuid NOT NULL REFERENCES capture_rules(id) ON DELETE CASCADE,
      service_name text NOT NULL,
      environment text NOT NULL,
      bucket_key text NOT NULL,
      resource_route text,
      occurred_at timestamptz NOT NULL,
      received_at timestamptz NOT NULL,
      expires_at timestamptz NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS capture_rule_threshold_events_bucket_idx ON capture_rule_threshold_events (project_id, rule_id, service_name, environment, bucket_key, received_at)`,
    `CREATE INDEX IF NOT EXISTS capture_rule_threshold_events_expiry_idx ON capture_rule_threshold_events (expires_at, event_id)`
  ]
});

export async function captureRuleThresholdSchemaAvailable(db: Queryable): Promise<boolean> {
  const { rows } = await db.query<{ ready: boolean }>(
    `SELECT to_regclass('public.capture_rule_threshold_events') IS NOT NULL
      AND (SELECT count(*) FROM information_schema.columns
           WHERE table_schema='public' AND table_name='capture_rules'
             AND is_nullable='YES' AND (column_name,data_type) IN (
               ('threshold_count','integer'),
               ('threshold_window_seconds','integer'),
               ('threshold_group_by','text')
             ))=3
      AND EXISTS (SELECT 1 FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid=c.conrelid AND c.conkey=ARRAY[a.attnum]
        JOIN pg_index i ON i.indexrelid=c.conindid
        WHERE c.conrelid=to_regclass('public.capture_rule_threshold_events') AND c.contype='p'
          AND a.attname='event_id' AND NOT c.condeferrable AND i.indisvalid AND i.indisready)
      AND EXISTS (SELECT 1 FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid=c.conrelid AND c.conkey=ARRAY[a.attnum]
        JOIN pg_attribute target ON target.attrelid=c.confrelid AND c.confkey=ARRAY[target.attnum]
        WHERE c.conrelid=to_regclass('public.capture_rule_threshold_events') AND c.contype='f'
          AND a.attname='project_id' AND c.confrelid=to_regclass('public.projects')
          AND target.attname='id' AND c.convalidated)
      AND EXISTS (SELECT 1 FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid=c.conrelid AND c.conkey=ARRAY[a.attnum]
        JOIN pg_attribute target ON target.attrelid=c.confrelid AND c.confkey=ARRAY[target.attnum]
        WHERE c.conrelid=to_regclass('public.capture_rule_threshold_events') AND c.contype='f'
          AND a.attname='rule_id' AND c.confrelid=to_regclass('public.capture_rules')
          AND target.attname='id' AND c.convalidated)
      AND to_regclass('public.capture_rule_threshold_events_bucket_idx') IS NOT NULL
      AND to_regclass('public.capture_rule_threshold_events_expiry_idx') IS NOT NULL
      AND (SELECT count(*) FROM information_schema.columns
           WHERE table_schema='public' AND table_name='capture_rule_threshold_events'
             AND is_nullable='NO' AND (column_name,data_type) IN (
               ('event_id','uuid'),
               ('project_id','uuid'),
               ('rule_id','uuid'),
               ('service_name','text'),
               ('environment','text'),
               ('bucket_key','text'),
               ('occurred_at','timestamp with time zone'),
               ('received_at','timestamp with time zone'),
               ('expires_at','timestamp with time zone')
             ))=9
      AND EXISTS (SELECT 1 FROM information_schema.columns
           WHERE table_schema='public' AND table_name='capture_rule_threshold_events'
             AND column_name='resource_route' AND data_type='text' AND is_nullable='YES') AS ready`,
    []
  );
  return rows[0]?.ready === true;
}
