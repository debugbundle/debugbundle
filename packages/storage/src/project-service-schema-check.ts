import { PROJECT_SCOPED_RULE_TABLES } from "./project-rule-scope-schema.js";
import { SERVICE_OBSERVATION_TABLES } from "./service-observation-schema.js";
import type { Queryable } from "./types.js";

const configurationTables = [
  "capture_policies",
  "project_analytics_settings",
  "notification_preferences",
  "project_members",
  "project_invites",
  "project_github_repos",
  "capture_rules",
  "alert_rules",
  "agent_webhooks",
  "github_dispatch_rules",
  "weekly_report_channels",
  "analytics_funnel_definitions",
  "analytics_flow_definitions",
  "availability_checks"
];
const triggers = [
  ...["analytics_funnel_definitions", "analytics_bundle_generations"].map((table) => ({
    table_name: table,
    trigger_name: `${table}_scope_snapshot`,
    function_name: "snapshot_analytics_resource_scope()"
  })),
  {
    table_name: "availability_checks",
    trigger_name: "availability_checks_service_definition",
    function_name: "link_health_check_service()"
  },
  {
    table_name: "weekly_report_channel_aliases",
    trigger_name: "weekly_report_channel_alias_guard",
    function_name: "guard_weekly_report_channel_alias()"
  },
  {
    table_name: "weekly_report_deliveries",
    trigger_name: "weekly_report_delivery_scope_snapshot",
    function_name: "snapshot_weekly_report_scope()"
  },
  ...["agent_webhooks", "github_dispatch_rules"].map((table) => ({
    table_name: table,
    trigger_name: `${table}_configured_services`,
    function_name: "register_automation_rule_services()"
  })),
  ...PROJECT_SCOPED_RULE_TABLES.map((table) => ({
    table_name: table,
    trigger_name: `${table}_scope_snapshot`,
    function_name: "snapshot_project_rule_scope()"
  })),
  {
    table_name: "capture_rules",
    trigger_name: "capture_rules_configured_services",
    function_name: "register_capture_rule_services()"
  },
  {
    table_name: "probe_activations",
    trigger_name: "probe_activations_scope_guard",
    function_name: "guard_project_probe_scope()"
  },
  ...SERVICE_OBSERVATION_TABLES.map(([table]) => ({
    table_name: table,
    trigger_name: `${table}_service_observation`,
    function_name: "register_observed_service()"
  })),
  ...configurationTables.map((table) => ({
    table_name: table,
    trigger_name: `${table}_consolidation_guard`,
    function_name: "guard_project_configuration()"
  })),
  {
    table_name: "projects",
    trigger_name: "projects_consolidation_guard",
    function_name: "guard_project_configuration()"
  },
  {
    table_name: "projects",
    trigger_name: "project_origin_deletion_guard",
    function_name: "guard_project_origin_deletion()"
  },
  {
    table_name: "project_legacy_bindings",
    trigger_name: "project_binding_guard",
    function_name: "guard_project_binding()"
  },
  {
    table_name: "project_tokens",
    trigger_name: "project_token_scope_snapshot",
    function_name: "snapshot_project_credential_scope()"
  },
  {
    table_name: "agent_tokens",
    trigger_name: "agent_token_scope_snapshot",
    function_name: "snapshot_project_credential_scope()"
  },
  {
    table_name: "services",
    trigger_name: "service_definition_link",
    function_name: "link_service_definition()"
  },
  {
    table_name: "service_definitions",
    trigger_name: "service_definition_aliases",
    function_name: "register_service_input_aliases()"
  }
];
const functions = [
  "debugbundle_allow_user_cascade(oid,uuid,jsonb,jsonb,text)",
  "snapshot_analytics_resource_scope()",
  "debugbundle_service_matches(uuid,uuid,text,text)",
  "debugbundle_canonical_weekly_channel(uuid)",
  "debugbundle_canonical_project(uuid)",
  "debugbundle_project_origins(uuid)",
  "debugbundle_project_scope_contains(uuid,uuid)",
  "debugbundle_service_input_names(uuid,text)",
  "debugbundle_service_input_name(uuid,text)",
  "debugbundle_observe_service(uuid,text)",
  "debugbundle_rule_service_names(uuid,uuid,jsonb)",
  "debugbundle_rule_actor_allowed(uuid,uuid,uuid,boolean)",
  "debugbundle_rule_view_matcher(uuid,uuid,jsonb)",
  "debugbundle_rule_view_names(uuid,uuid,jsonb)",
  "debugbundle_rule_view_filters(uuid,uuid,jsonb)",
  "debugbundle_begin_project_rule_write(uuid)",
  "debugbundle_assert_canonical_project_write(uuid)",
  "debugbundle_assert_project_scope_current(uuid)",
  "debugbundle_assert_project_scope_write(uuid)"
];

/** A ledger alone cannot establish that an interrupted bootstrap installed the
 * scope fences. Readiness and baseline adoption both require enabled guards. */
export async function projectServiceSchemaAvailable(db: Queryable): Promise<boolean> {
  const result = await db.query<{ project_service_schema_available: boolean }>(
    `SELECT NOT EXISTS(SELECT 1 FROM unnest($1::text[]) signature WHERE to_regprocedure('public.'||signature) IS NULL)
      AND NOT EXISTS(SELECT 1 FROM jsonb_to_recordset($2::jsonb) expected(table_name text,trigger_name text,function_name text)
        WHERE NOT EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
          JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=expected.table_name
          AND t.tgname=expected.trigger_name AND t.tgenabled IN ('O','A') AND NOT t.tgisinternal
          AND t.tgfoid=to_regprocedure('public.'||expected.function_name)))
      AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public'
        AND table_name='projects' AND column_name='capture_rules_require_server' AND data_type='boolean' AND is_nullable='NO')
      AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public'
        AND table_name='service_project_aliases' AND column_name='is_current')
      AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public'
        AND table_name='service_definitions' AND column_name='repository_default_project_id')
      AND (SELECT count(*)=$3 FROM information_schema.columns WHERE table_schema='public' AND table_name=ANY($4::text[])
        AND column_name IN ('scope_origin_ids','filter_project_id'))
      AND (SELECT count(*)=3 FROM information_schema.columns WHERE table_schema='public' AND table_name='probe_activations'
        AND column_name IN ('trigger_token_hash','scope_origin_ids','service_definition_id'))
      AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='weekly_report_deliveries' AND column_name='scope_origin_ids')
      AND (SELECT count(*)=2 FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('analytics_funnel_definitions','analytics_bundle_generations') AND column_name='scope_origin_ids' AND udt_name='_uuid')
      AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='availability_checks' AND column_name='service_definition_id')
      AND EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('public.weekly_report_deliveries') AND conname='weekly_report_deliveries_weekly_report_channel_id_fkey' AND confdeltype='n') AS project_service_schema_available`,
    [
      functions,
      JSON.stringify(triggers),
      PROJECT_SCOPED_RULE_TABLES.length * 2,
      PROJECT_SCOPED_RULE_TABLES
    ]
  );
  return result.rows[0]?.project_service_schema_available === true;
}
