/** Minimal paid receipts survive run deletion so an unknown provider outcome
 * cannot free money for another call. Narrative buffers never survive deletion. */
export const REPORT_MODEL_ATTEMPT_BOOTSTRAP = [
  `CREATE TABLE report_model_attempts (
   id uuid PRIMARY KEY,run_id uuid NOT NULL UNIQUE,
   organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,window_starts_at timestamptz NOT NULL,
   worker_lease_token uuid NOT NULL,request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[a-f0-9]{64}$'),
   facts_sha256 text NOT NULL CHECK(facts_sha256 ~ '^[a-f0-9]{64}$'),profile jsonb NOT NULL CHECK(jsonb_typeof(profile)='object'),
   input_tokens integer NOT NULL CHECK(input_tokens BETWEEN 1 AND 12000),principal_nano_usd bigint NOT NULL CHECK(principal_nano_usd BETWEEN 1 AND 25000000),
   state text NOT NULL DEFAULT 'sending' CHECK(state IN ('sending','uncertain','succeeded','rejected')),
   outcome_sha256 text CHECK(outcome_sha256 IS NULL OR outcome_sha256 ~ '^[a-f0-9]{64}$'),
   usage jsonb CHECK(usage IS NULL OR jsonb_typeof(usage)='object'),cost_nano_usd bigint CHECK(cost_nano_usd BETWEEN 0 AND principal_nano_usd),
   provider_response_id text UNIQUE CHECK(provider_response_id IS NULL OR provider_response_id ~ '^resp_[A-Za-z0-9_-]{1,200}$'),
   narrative_json jsonb CHECK(narrative_json IS NULL OR (jsonb_typeof(narrative_json)='object' AND octet_length(narrative_json::text)<=65536)),
   created_at timestamptz NOT NULL DEFAULT now(),settled_at timestamptz,
   FOREIGN KEY(organization_id,window_starts_at) REFERENCES report_allowance_windows(organization_id,starts_at),
   CHECK((state IN ('succeeded','rejected'))=(usage IS NOT NULL AND cost_nano_usd IS NOT NULL AND provider_response_id IS NOT NULL AND settled_at IS NOT NULL)),
   CHECK(narrative_json IS NULL OR state='succeeded'))`,
  `CREATE INDEX report_model_attempts_window_idx ON report_model_attempts(organization_id,window_starts_at,id)`,
  `CREATE INDEX report_model_attempts_created_idx ON report_model_attempts(created_at,id)`
] as const;
export const REPORT_MODEL_ATTEMPT_READY_SQL = `to_regclass('public.report_model_attempts') IS NOT NULL
 AND (SELECT count(*)=18 FROM information_schema.columns WHERE table_schema='public' AND table_name='report_model_attempts' AND column_name=ANY(ARRAY['id','run_id','organization_id','window_starts_at','worker_lease_token','request_sha256','facts_sha256','profile','input_tokens','principal_nano_usd','state','outcome_sha256','usage','cost_nano_usd','provider_response_id','narrative_json','created_at','settled_at']))
 AND to_regclass('public.report_model_attempts_window_idx') IS NOT NULL AND to_regclass('public.report_model_attempts_created_idx') IS NOT NULL
 AND EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('public.report_model_attempts') AND conname='report_model_attempts_run_id_key' AND contype='u')
 AND EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('public.report_model_attempts') AND conname='report_model_attempts_provider_response_id_key' AND contype='u')`;
