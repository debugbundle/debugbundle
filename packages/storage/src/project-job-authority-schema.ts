import { defineStorageSchemaMigration } from "./schema-migration-definition.js";
import type { Queryable } from "./migrations.js";
import { PROJECT_JOB_AUTHORITY_PROTOCOL } from "./project-job-authorization.js";

export const PROJECT_JOB_AUTHORITY_BOOTSTRAP = [
  `CREATE FUNCTION guard_worker_project_job_authority() RETURNS trigger LANGUAGE plpgsql
    SET search_path=public,pg_temp AS $$
    DECLARE bound_request boolean;
    BEGIN
      IF NEW.status<>'running' OR (OLD.status='running' AND NEW.lease_token IS NOT DISTINCT FROM OLD.lease_token) THEN RETURN NEW; END IF;
      bound_request:=NEW.payload ? 'initiating_authority';
      IF NOT bound_request AND NEW.job_name='build-analytics-bundle' THEN
        SELECT EXISTS(SELECT 1 FROM analytics_bundle_generations generation
          WHERE generation.id=CASE WHEN NEW.payload->>'generation_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            THEN (NEW.payload->>'generation_id')::uuid ELSE NULL END
            AND generation.initiating_authority IS NOT NULL) INTO bound_request;
      END IF;
      IF bound_request AND current_setting('debugbundle.worker_job_authority',true) IS DISTINCT FROM '${PROJECT_JOB_AUTHORITY_PROTOCOL}' THEN
        RAISE EXCEPTION 'worker_job_authority_protocol_required';
      END IF;
      RETURN NEW;
    END $$`,
  `CREATE TRIGGER worker_project_job_authority_guard BEFORE UPDATE ON worker_jobs
    FOR EACH ROW EXECUTE FUNCTION guard_worker_project_job_authority()`
] as const;

export const PROJECT_JOB_AUTHORITY_MIGRATION = defineStorageSchemaMigration({
  id: "202611070005_bind_project_job_initiators",
  description:
    "Bind new user-requested artifact work to initiating credentials and fence workers that cannot enforce them.",
  statements: [
    "ALTER TABLE analytics_bundle_generations ADD COLUMN IF NOT EXISTS initiating_authority jsonb CHECK (initiating_authority IS NULL OR jsonb_typeof(initiating_authority)='object')",
    PROJECT_JOB_AUTHORITY_BOOTSTRAP[0].replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION"),
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='worker_project_job_authority_guard' AND tgrelid='worker_jobs'::regclass) THEN ${PROJECT_JOB_AUTHORITY_BOOTSTRAP[1]}; END IF; END $$`
  ]
});
export async function projectJobAuthoritySchemaAvailable(db: Queryable): Promise<boolean> {
  const result = await db.query<{ available: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='analytics_bundle_generations' AND column_name='initiating_authority' AND data_type='jsonb')
    AND EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='worker_project_job_authority_guard' AND tgrelid='worker_jobs'::regclass AND NOT tgisinternal) AS available`,
    []
  );
  return result.rows[0]?.available === true;
}
