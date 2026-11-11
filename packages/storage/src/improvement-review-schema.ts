import { defineStorageSchemaMigration } from "./schema-migration-definition.js";
import type { Queryable } from "./types.js";
export const IMPROVEMENT_REVIEW_BOOTSTRAP = [
  `CREATE TABLE improvement_review_settings (
    organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
    version integer NOT NULL DEFAULT 1 CHECK(version>0), enabled boolean NOT NULL,
    accepted_scope jsonb NOT NULL CHECK(jsonb_typeof(accepted_scope)='array' AND jsonb_array_length(accepted_scope)<=10),
    initiating_authority jsonb NOT NULL CHECK(jsonb_typeof(initiating_authority)='object'),
    privacy_mode text NOT NULL CHECK(privacy_mode IN ('restricted','full')), source_consent boolean NOT NULL,
    requires_review boolean NOT NULL DEFAULT false, next_due_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now(), CHECK(NOT enabled OR (source_consent AND jsonb_array_length(accepted_scope)>0)))`,
  `CREATE INDEX improvement_review_settings_due_idx ON improvement_review_settings(next_due_at,organization_id) WHERE enabled AND NOT requires_review`,
  `CREATE INDEX improvement_review_settings_scope_idx ON improvement_review_settings USING gin(accepted_scope jsonb_path_ops)`,
  `CREATE TABLE improvement_review_usage (
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, generations integer NOT NULL DEFAULT 0 CHECK(generations>=0),
    held_nano_usd bigint NOT NULL DEFAULT 0 CHECK(held_nano_usd>=0), spent_nano_usd bigint NOT NULL DEFAULT 0 CHECK(spent_nano_usd>=0),
    budget_limit_nano_usd bigint NOT NULL CHECK(budget_limit_nano_usd>=0), PRIMARY KEY(organization_id,starts_at),
    CHECK(ends_at>starts_at), CHECK(held_nano_usd+spent_nano_usd<=budget_limit_nano_usd))`,
  `CREATE TABLE improvement_reviews (
    id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE, settings_version integer NOT NULL,
    accepted_scope jsonb NOT NULL, initiating_authority jsonb NOT NULL,
    privacy_mode text NOT NULL CHECK(privacy_mode IN ('restricted','full')), identities jsonb NOT NULL,
    period_starts_at timestamptz NOT NULL, period_ends_at timestamptz NOT NULL, cutoff_at timestamptz NOT NULL,
    status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','ready','factual_only','no_data','no_change','skipped_quota','paused_access','failed')),
    reason text CHECK(reason IN ('model_unavailable','model_rejected','model_uncertain','quota','access_changed','processing_failed')),
    privacy_invalidated boolean NOT NULL DEFAULT false, facts jsonb CHECK(facts IS NULL OR octet_length(facts::text)<=262144),
    facts_digest text CHECK(facts_digest IS NULL OR facts_digest ~ '^[a-f0-9]{64}$'),
    artifact jsonb CHECK(artifact IS NULL OR octet_length(artifact::text)<=524288),
    artifact_sha256 text CHECK(artifact_sha256 IS NULL OR artifact_sha256 ~ '^[a-f0-9]{64}$'),
    privacy_snapshot jsonb, processing_job_id text, last_claimed_at timestamptz,
    ai_window_starts_at timestamptz, ai_reserved_nano_usd bigint NOT NULL DEFAULT 0 CHECK(ai_reserved_nano_usd>=0),
    generation_counted boolean NOT NULL DEFAULT false, paid_attempts integer NOT NULL DEFAULT 0 CHECK(paid_attempts BETWEEN 0 AND 1),
    created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '90 days',
    UNIQUE(organization_id,project_id,period_starts_at), CHECK(period_ends_at=period_starts_at+interval '7 days'))`,
  `CREATE INDEX improvement_reviews_history_idx ON improvement_reviews(organization_id,created_at DESC,id)`,
  `CREATE INDEX improvement_reviews_pending_idx ON improvement_reviews(created_at,id) WHERE status IN ('queued','processing')`,
  `CREATE INDEX improvement_reviews_expiry_idx ON improvement_reviews(expires_at,id)`,
  `CREATE INDEX improvement_reviews_scope_idx ON improvement_reviews USING gin(accepted_scope jsonb_path_ops)`,
  `CREATE TABLE improvement_review_attempts (
    id uuid PRIMARY KEY, review_id uuid UNIQUE REFERENCES improvement_reviews(id) ON DELETE SET NULL,
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, window_starts_at timestamptz NOT NULL, lease_token uuid NOT NULL,
    request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[a-f0-9]{64}$'), facts_digest text NOT NULL CHECK(facts_digest ~ '^[a-f0-9]{64}$'),
    profile jsonb NOT NULL CHECK(jsonb_typeof(profile)='object'), input_tokens integer NOT NULL CHECK(input_tokens BETWEEN 1 AND 12000),
    principal_nano_usd bigint NOT NULL CHECK(principal_nano_usd BETWEEN 1 AND 25000000),
    state text NOT NULL DEFAULT 'sending' CHECK(state IN ('sending','uncertain','succeeded','rejected')),
    usage jsonb CHECK(usage IS NULL OR jsonb_typeof(usage)='object'), cost_nano_usd bigint CHECK(cost_nano_usd BETWEEN 0 AND principal_nano_usd),
    outcome_sha256 text CHECK(outcome_sha256 IS NULL OR outcome_sha256 ~ '^[a-f0-9]{64}$'),
    provider_response_id text UNIQUE CHECK(provider_response_id IS NULL OR provider_response_id ~ '^resp_[A-Za-z0-9_-]{1,200}$'),
    validated_guidance jsonb CHECK(validated_guidance IS NULL OR octet_length(validated_guidance::text)<=20000),
    diagnostic_code text CHECK(diagnostic_code IN ('review_output_rejected','review_provider_outcome_unknown')),
    created_at timestamptz NOT NULL DEFAULT now(), settled_at timestamptz,
    FOREIGN KEY(organization_id,window_starts_at) REFERENCES improvement_review_usage(organization_id,starts_at),
    CHECK((state IN ('succeeded','rejected'))=(usage IS NOT NULL AND cost_nano_usd IS NOT NULL AND provider_response_id IS NOT NULL AND settled_at IS NOT NULL)),
    CHECK(validated_guidance IS NULL OR state='succeeded'))`,
  `CREATE INDEX improvement_review_attempts_buffer_idx ON improvement_review_attempts(created_at,id) WHERE validated_guidance IS NOT NULL`,
  `CREATE INDEX improvement_review_attempts_sending_idx ON improvement_review_attempts(created_at,id) WHERE state='sending'`,
  `CREATE OR REPLACE FUNCTION debugbundle_delete_improvement_review() RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN
    UPDATE improvement_review_attempts SET validated_guidance=NULL WHERE review_id=OLD.id;
    UPDATE worker_jobs SET status='skipped',payload=NULL,lease_token=NULL,lease_expires_at=NULL,last_error_code='review_deleted',updated_at=clock_timestamp()
      WHERE id=OLD.processing_job_id AND status IN ('pending','running');
    IF OLD.paid_attempts=0 AND OLD.generation_counted THEN
      UPDATE improvement_review_usage SET generations=generations-1,held_nano_usd=held_nano_usd-OLD.ai_reserved_nano_usd
      WHERE organization_id=OLD.organization_id AND starts_at=OLD.ai_window_starts_at;
    END IF; RETURN OLD;
   END $$`,
  `CREATE TRIGGER improvement_reviews_delete_guard BEFORE DELETE ON improvement_reviews FOR EACH ROW EXECUTE FUNCTION debugbundle_delete_improvement_review()`,
  `CREATE OR REPLACE FUNCTION debugbundle_invalidate_source_reviews() RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN
    IF TG_OP='UPDATE' AND OLD.organization_id IS NOT DISTINCT FROM NEW.organization_id THEN RETURN NEW; END IF;
    UPDATE improvement_review_settings SET enabled=false,requires_review=true,version=version+1,accepted_scope='[]'::jsonb,source_consent=false,next_due_at=NULL,updated_at=clock_timestamp()
      WHERE accepted_scope @> jsonb_build_array(jsonb_build_object('project_id',OLD.id::text)) OR accepted_scope @> jsonb_build_array(jsonb_build_object('origin_project_ids',jsonb_build_array(OLD.id::text)));
    DELETE FROM improvement_reviews WHERE accepted_scope @> jsonb_build_array(jsonb_build_object('project_id',OLD.id::text)) OR accepted_scope @> jsonb_build_array(jsonb_build_object('origin_project_ids',jsonb_build_array(OLD.id::text)));
    IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
   END $$`,
  `CREATE TRIGGER projects_improvement_reviews_guard BEFORE DELETE OR UPDATE OF organization_id ON projects FOR EACH ROW EXECUTE FUNCTION debugbundle_invalidate_source_reviews()`,
  `CREATE OR REPLACE FUNCTION debugbundle_pause_improvement_reviews() RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN
    IF (NEW.plan NOT IN ('team','business') OR (NEW.plan='team' AND OLD.plan='business')) AND OLD.plan IS DISTINCT FROM NEW.plan THEN
      UPDATE improvement_review_settings SET enabled=false,requires_review=true,version=version+1,next_due_at=NULL,updated_at=clock_timestamp() WHERE organization_id=NEW.id;
    END IF; RETURN NULL;
   END $$`,
  `CREATE TRIGGER organizations_improvement_reviews_guard AFTER UPDATE OF plan ON organizations FOR EACH ROW EXECUTE FUNCTION debugbundle_pause_improvement_reviews()`,
  `CREATE OR REPLACE FUNCTION debugbundle_invalidate_review_analytics() RETURNS trigger LANGUAGE plpgsql AS $$
   DECLARE governing_project_id uuid; affected_origins uuid[]; narrowed boolean;
   BEGIN
    IF TG_OP='INSERT' THEN
      governing_project_id:=NEW.project_id;
      narrowed:=NEW.consent_required OR NEW.aggregate_retention_months<12;
    ELSIF TG_OP='DELETE' THEN
      governing_project_id:=OLD.project_id; narrowed:=true;
    ELSE
      governing_project_id:=OLD.project_id;
      narrowed:=(OLD.enabled AND NOT NEW.enabled) OR (OLD.privacy_mode<>'strict' AND NEW.privacy_mode='strict')
        OR (OLD.privacy_mode='custom' AND NEW.privacy_mode<>'custom') OR (NOT OLD.consent_required AND NEW.consent_required)
        OR NEW.aggregate_retention_months<OLD.aggregate_retention_months OR NOT (OLD.approved_custom_dimensions <@ NEW.approved_custom_dimensions);
    END IF;
    IF narrowed THEN
      affected_origins:=debugbundle_project_origins(debugbundle_canonical_project(governing_project_id));
      DELETE FROM improvement_reviews WHERE accepted_scope @> ANY(ARRAY(
        SELECT jsonb_build_array(jsonb_build_object('origin_project_ids',jsonb_build_array(origin::text))) FROM unnest(affected_origins) AS scope(origin)));
    END IF; RETURN NULL;
   END $$`,
  `CREATE TRIGGER project_analytics_review_privacy_guard AFTER INSERT OR UPDATE OR DELETE ON project_analytics_settings FOR EACH ROW EXECUTE FUNCTION debugbundle_invalidate_review_analytics()`
] as const;
const requiredColumns = {
  improvement_review_settings: [
    "organization_id",
    "version",
    "enabled",
    "accepted_scope",
    "initiating_authority",
    "privacy_mode",
    "source_consent",
    "requires_review",
    "next_due_at",
    "updated_at"
  ],
  improvement_review_usage: [
    "organization_id",
    "starts_at",
    "ends_at",
    "generations",
    "held_nano_usd",
    "spent_nano_usd",
    "budget_limit_nano_usd"
  ],
  improvement_reviews: [
    "id",
    "organization_id",
    "project_id",
    "settings_version",
    "accepted_scope",
    "initiating_authority",
    "privacy_mode",
    "identities",
    "period_starts_at",
    "period_ends_at",
    "cutoff_at",
    "status",
    "reason",
    "privacy_invalidated",
    "facts",
    "facts_digest",
    "artifact",
    "artifact_sha256",
    "privacy_snapshot",
    "processing_job_id",
    "last_claimed_at",
    "ai_window_starts_at",
    "ai_reserved_nano_usd",
    "generation_counted",
    "paid_attempts",
    "created_at",
    "expires_at"
  ],
  improvement_review_attempts: [
    "id",
    "review_id",
    "organization_id",
    "window_starts_at",
    "lease_token",
    "request_sha256",
    "facts_digest",
    "profile",
    "input_tokens",
    "principal_nano_usd",
    "state",
    "usage",
    "cost_nano_usd",
    "outcome_sha256",
    "provider_response_id",
    "validated_guidance",
    "diagnostic_code",
    "created_at",
    "settled_at"
  ]
} as const;
const columnGuards = Object.entries(requiredColumns)
  .map(
    ([table, columns]) =>
      `(SELECT count(*) FROM pg_attribute WHERE attrelid=to_regclass('public.${table}') AND NOT attisdropped AND attname=ANY(ARRAY[${columns.map((column) => `'${column}'`).join(",")}]))=${columns.length}`
  )
  .join(" AND ");
const readySql = `${columnGuards} AND to_regclass('public.improvement_review_settings') IS NOT NULL AND to_regclass('public.improvement_reviews') IS NOT NULL
 AND to_regclass('public.improvement_review_usage') IS NOT NULL AND to_regclass('public.improvement_review_attempts') IS NOT NULL
 AND to_regclass('public.improvement_reviews_history_idx') IS NOT NULL AND to_regclass('public.improvement_reviews_pending_idx') IS NOT NULL
 AND to_regclass('public.improvement_review_settings_scope_idx') IS NOT NULL
 AND to_regclass('public.improvement_reviews_expiry_idx') IS NOT NULL AND to_regclass('public.improvement_reviews_scope_idx') IS NOT NULL
 AND to_regclass('public.improvement_review_attempts_buffer_idx') IS NOT NULL AND to_regclass('public.improvement_review_attempts_sending_idx') IS NOT NULL
 AND EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('public.improvement_reviews') AND attname='artifact_sha256' AND NOT attisdropped)
 AND EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('public.improvement_review_attempts') AND attname='validated_guidance' AND NOT attisdropped)
 AND EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='project_analytics_review_privacy_guard' AND tgrelid=to_regclass('public.project_analytics_settings') AND tgenabled='O' AND NOT tgisinternal)
 AND EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='improvement_reviews_delete_guard' AND tgrelid=to_regclass('public.improvement_reviews') AND tgenabled='O' AND NOT tgisinternal)
 AND EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='projects_improvement_reviews_guard' AND tgrelid=to_regclass('public.projects') AND tgenabled='O' AND NOT tgisinternal)
 AND EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='organizations_improvement_reviews_guard' AND tgrelid=to_regclass('public.organizations') AND tgenabled='O' AND NOT tgisinternal)`;
export const IMPROVEMENT_REVIEW_MIGRATION = defineStorageSchemaMigration({
  id: "202611100003_add_weekly_improvement_reviews",
  description:
    "Add consented weekly project reviews with independent durable quota, paid intents and deletion fences.",
  statements: [
    ...IMPROVEMENT_REVIEW_BOOTSTRAP,
    `DO $$ BEGIN IF NOT (${readySql}) THEN RAISE EXCEPTION 'improvement_review_schema_incomplete'; END IF; END $$`
  ]
});
export async function improvementReviewSchemaAvailable(db: Queryable): Promise<boolean> {
  return (
    (await db.query<{ available: boolean }>(`SELECT (${readySql}) AS available`, [])).rows[0]
      ?.available === true
  );
}
