import { defineStorageSchemaMigration } from "./schema-migration-definition.js";
import type { Queryable } from "./types.js";

export const REPORT_LIFECYCLE_TABLES = [
  "report_lifecycle_facts",
  "report_source_coverage"
] as const;
export const REPORT_LIFECYCLE_BOOTSTRAP = [
  `CREATE TABLE report_source_coverage (
    project_id uuid PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    lifecycle_started_at timestamptz NOT NULL
  )`,
  `CREATE TABLE report_lifecycle_facts (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    source_type text NOT NULL CHECK(source_type IN ('incident','improvement')),
    source_id uuid NOT NULL, service_id uuid,
    transition text NOT NULL CHECK(transition IN ('opened','observed','resolved','regressed','reopened','restored','snoozed','severity_changed','state_changed')),
    from_status text CHECK(from_status IN ('open','resolved','regressed','snoozed','other')),
    to_status text NOT NULL CHECK(to_status IN ('open','resolved','regressed','snoozed','other')),
    severity text NOT NULL CHECK(severity IN ('low','medium','high','critical','unknown')),
    occurred_at timestamptz NOT NULL, recorded_at timestamptz NOT NULL DEFAULT statement_timestamp(),
    backfilled boolean NOT NULL DEFAULT false
  )`,
  `CREATE INDEX report_lifecycle_project_period_idx ON report_lifecycle_facts(project_id,occurred_at,id)`,
  `CREATE INDEX report_lifecycle_source_idx ON report_lifecycle_facts(project_id,source_type,source_id,id DESC)`,
  `CREATE INDEX report_lifecycle_retention_idx ON report_lifecycle_facts(occurred_at,id)`,
  `CREATE INDEX report_incidents_backfill_idx ON incidents(project_id,id)`,
  `CREATE INDEX report_improvements_backfill_idx ON improvement_opportunities(project_id,id)`,
  // A source FK would turn routine incident/artifact pruning into missing history.
  // Explicit project/account deletion still removes every dependent numeric fact.
  `CREATE OR REPLACE FUNCTION debugbundle_record_report_lifecycle() RETURNS trigger LANGUAGE plpgsql AS $$
  DECLARE source_kind text; action text; happened timestamptz; before_state text;
  BEGIN
    -- Old application workers may still be running between additive migrations.
    IF to_regclass('public.report_collection_coverage') IS NULL THEN RETURN NULL; END IF;
    IF NOT (EXISTS(SELECT 1 FROM report_collection_coverage c
      JOIN report_definitions d ON d.id=c.definition_id JOIN organizations o ON o.id=d.organization_id
      WHERE c.project_id=NEW.project_id AND d.enabled AND d.paused_at IS NULL AND NOT d.requires_owner_review AND o.suspended_at IS NULL)) THEN RETURN NULL; END IF;
    source_kind:=CASE WHEN TG_TABLE_NAME='incidents' THEN 'incident' ELSE 'improvement' END;
    IF TG_OP='INSERT' THEN
      action:=CASE WHEN NEW.status='open' THEN 'opened' ELSE 'observed' END;
      IF source_kind='incident' THEN happened:=NEW.first_seen_at; ELSE happened:=NEW.first_detected_at; END IF;
      before_state:=NULL;
    ELSE
      IF (OLD.status,OLD.severity) IS NOT DISTINCT FROM (NEW.status,NEW.severity) THEN RETURN NULL; END IF;
      before_state:=CASE WHEN OLD.status IN ('open','resolved','regressed','snoozed') THEN OLD.status ELSE 'other' END;
      IF OLD.status IS NOT DISTINCT FROM NEW.status THEN action:='severity_changed';
      ELSIF NEW.status='resolved' THEN action:='resolved';
      ELSIF NEW.status='regressed' THEN action:='regressed';
      ELSIF NEW.status='snoozed' THEN action:='snoozed';
      ELSIF NEW.status='open' AND OLD.status IN ('resolved','regressed') THEN action:='reopened';
      ELSIF NEW.status='open' THEN action:='restored';
      ELSE action:='state_changed'; END IF;
      happened:=statement_timestamp();
      IF action='resolved' THEN happened:=COALESCE(NEW.resolved_at,happened); END IF;
      IF source_kind='incident' AND action='regressed' THEN happened:=COALESCE(NEW.regressed_at,happened); END IF;
    END IF;
    INSERT INTO report_source_coverage(project_id,lifecycle_started_at)
      SELECT p.id,statement_timestamp() FROM projects p WHERE p.id=NEW.project_id ON CONFLICT(project_id) DO NOTHING;
    INSERT INTO report_lifecycle_facts(project_id,source_type,source_id,service_id,transition,from_status,to_status,severity,occurred_at)
      VALUES(NEW.project_id,source_kind,NEW.id,NEW.service_id,action,before_state,
        CASE WHEN NEW.status IN ('open','resolved','regressed','snoozed') THEN NEW.status ELSE 'other' END,
        CASE WHEN NEW.severity IN ('low','medium','high','critical') THEN NEW.severity ELSE 'unknown' END,happened);
    RETURN NULL;
  END $$`,
  ...["incidents", "improvement_opportunities"].map(
    (table) =>
      `CREATE TRIGGER ${table}_report_lifecycle AFTER INSERT OR UPDATE OF status,severity ON ${table} FOR EACH ROW EXECUTE FUNCTION debugbundle_record_report_lifecycle()`
  ),
  // Existing installations start with honest partial coverage. Historical facts
  // are backfilled separately from retained evidence, never during the migration.
  `INSERT INTO report_source_coverage(project_id,lifecycle_started_at) SELECT id,statement_timestamp() FROM projects ON CONFLICT(project_id) DO NOTHING`
] as const;
const readySql = `SELECT to_regclass('public.report_lifecycle_facts') IS NOT NULL AND to_regclass('public.report_source_coverage') IS NOT NULL
  AND (SELECT count(*)=14 FROM information_schema.columns WHERE table_schema='public' AND (
    (table_name='report_lifecycle_facts' AND column_name=ANY(ARRAY['id','project_id','source_type','source_id','service_id','transition','from_status','to_status','severity','occurred_at','recorded_at','backfilled'])) OR
    (table_name='report_source_coverage' AND column_name=ANY(ARRAY['project_id','lifecycle_started_at']))))
  AND to_regclass('public.report_lifecycle_project_period_idx') IS NOT NULL
  AND to_regclass('public.report_lifecycle_source_idx') IS NOT NULL
  AND to_regclass('public.report_lifecycle_retention_idx') IS NOT NULL
  AND to_regclass('public.report_incidents_backfill_idx') IS NOT NULL
  AND to_regclass('public.report_improvements_backfill_idx') IS NOT NULL
  AND (SELECT count(*)=2 FROM pg_trigger WHERE NOT tgisinternal AND tgenabled='O' AND tgtype=21
    AND tgfoid=to_regprocedure('public.debugbundle_record_report_lifecycle()')
    AND (tgname,tgrelid) IN (('incidents_report_lifecycle',to_regclass('public.incidents')),('improvement_opportunities_report_lifecycle',to_regclass('public.improvement_opportunities'))))`;
export const REPORT_LIFECYCLE_MIGRATION = defineStorageSchemaMigration({
  id: "202611070009_add_report_lifecycle_facts",
  description:
    "Preserve project-origin numeric lifecycle transitions atomically without retaining captured text.",
  statements: [
    ...REPORT_LIFECYCLE_BOOTSTRAP.map((sql) =>
      sql.startsWith("CREATE TRIGGER")
        ? `DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='${sql.split(" ")[2]}') THEN ${sql}; END IF; END $$`
        : sql
            .replace(/^CREATE TABLE /, "CREATE TABLE IF NOT EXISTS ")
            .replace(/^CREATE INDEX /, "CREATE INDEX IF NOT EXISTS ")
    ),
    `DO $$ BEGIN IF NOT (${readySql}) THEN RAISE EXCEPTION 'report_lifecycle_schema_incomplete'; END IF; END $$`
  ]
});
export async function reportLifecycleSchemaAvailable(db: Queryable): Promise<boolean> {
  return (
    (await db.query<{ available: boolean }>(`SELECT (${readySql}) AS available`, [])).rows[0]
      ?.available === true
  );
}
