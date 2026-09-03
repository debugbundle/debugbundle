# Official OpenAI Plugin V1 Field-Level Data Map

Version: 1.0.0
Status: Frozen contract implemented in local source; privacy/legal approval and production evidence pending
Last updated: 2026-09-02

## Contract Use

This document is the privacy/output allowlist for the exact schemas in `tests/fixtures/openai-plugin-v1/schemas.json`. A field absent here and from the output schema is forbidden even if it exists in an API, database record, bundle, object-store object, or stdio MCP result. Existing DebugBundle redaction runs before this projection.

Every result also includes one compact MCP text item derived only from its structured status/count. The text item introduces no additional customer fields. Operational `_meta` is not a data escape hatch and may contain only transport metadata described in `SEC-35`.

Privacy categories:

- `PROJECT`: account/project/service metadata the linked user can already view;
- `INCIDENT`: production incident lifecycle and bounded diagnostic metadata;
- `ARTIFACT`: redacted bundle/reproduction/improvement evidence;
- `ANALYTICS`: aggregate product-usage, acquisition, funnel, transition, and incident-impact metrics;
- `HEALTH`: endpoint-health configuration and execution/aggregate results;
- `NAVIGATION`: authenticated DebugBundle or canonical setup URL;
- `CONTROL`: pagination, bounds, status, truncation, redaction, and empty-state metadata.

Globally omitted adjacent data: organization/user IDs, owner email, plan/billing metrics, member roles, tokens/auth headers/cookies, raw request/form bodies, object keys/signed URLs, database-only IDs, internal fingerprints/correlation/session/trace hashes, raw logs, individual analytics journey samples and their IDs, analytics bundle/opportunity records, webhook/alert/GitHub/Slack data, hidden debug objects, and custom dimensions.

## Tool Result Composition

| Tool                              | Exact output definition             | Shared field groups used                                                                |
| --------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------- |
| `list_projects`                   | `listProjectsOutput`                | Project, pagination, empty state                                                        |
| `list_services`                   | `listServicesOutput`                | Project ID, service, pagination                                                         |
| `list_incidents`                  | `listIncidentsOutput`               | Project ID, incident, pagination                                                        |
| `get_incident`                    | `getIncidentOutput`                 | Incident                                                                                |
| `get_incident_context`            | `getIncidentContextOutput`          | Incident, primary signal, artifact status, deploy, redaction, next checks, continuation |
| `get_bundle`                      | `getBundleOutput`                   | Artifact envelope, manifest, bounded bundle evidence                                    |
| `get_reproduction`                | `getReproductionOutput`             | Artifact envelope, manifest, bounded reproduction evidence                              |
| `list_improvements`               | `listImprovementsOutput`            | Project ID, improvement, pagination                                                     |
| `get_improvement`                 | `getImprovementOutput`              | Improvement, evidence summary, artifact status                                          |
| `get_improvement_bundle`          | `getImprovementBundleOutput`        | Artifact envelope, manifest, bounded improvement bundle evidence                        |
| `get_usage_summary`               | `getUsageSummaryOutput`             | Aggregate summary and standard breakdowns                                               |
| `get_route_metrics`               | `getRouteMetricsOutput`             | Aggregate route metrics and bounded window                                               |
| `get_journey_patterns`            | `getJourneyPatternsOutput`          | Aggregate transitions only; no retained sample IDs                                      |
| `get_device_breakdown`            | `getDeviceBreakdownOutput`          | Aggregate device, browser, OS, and language segments                                    |
| `get_referrer_metrics`            | `getReferrerMetricsOutput`          | Aggregate referrer and standard UTM segments                                             |
| `get_action_metrics`              | `getActionMetricsOutput`            | Aggregate action, conversion, and marker counts                                          |
| `list_funnel_metrics`             | `listFunnelMetricsOutput`           | Aggregate funnel entry, completion, dropoff, and conversion                              |
| `get_funnel_analysis`             | `getFunnelAnalysisOutput`           | Aggregate named-funnel summary and steps                                                 |
| `get_incident_impact`             | `getIncidentImpactOutput`           | Aggregate incident reach; no samples or bundle-generation state                          |
| `list_health_checks`              | `listHealthChecksOutput`            | Project ID, sanitized health check, pagination                                          |
| `get_health_check`                | `getHealthCheckOutput`              | Sanitized health check                                                                  |
| `list_health_check_results`       | `listHealthCheckResultsOutput`      | Project/check ID, bounded window, sanitized result, pagination                          |
| `list_health_check_daily_rollups` | `listHealthCheckDailyRollupsOutput` | Project/check ID, bounded days, daily aggregate, pagination                             |

## Root, Pagination, And Empty-State Fields

| Source                     | User goal                       | Output                  | Transformation and maximum                               | Category   | Adjacent omission rationale                      |
| -------------------------- | ------------------------------- | ----------------------- | -------------------------------------------------------- | ---------- | ------------------------------------------------ |
| Authorized request project | Keep result scoped              | `project_id`            | Opaque public ID, 128 chars                              | PROJECT    | Organization/owner IDs add no tool value         |
| Authorized request check   | Keep health history scoped      | `check_id`              | Opaque public ID, 128 chars                              | HEALTH     | Internal claim/schedule IDs omitted              |
| Query window               | Explain applied result window   | `lookback_hours`        | Integer 1–168                                            | CONTROL    | Arbitrary/unbounded time ranges forbidden        |
| Query window               | Explain applied rollup window   | `days`                  | Integer 1–90                                             | CONTROL    | Arbitrary/unbounded time ranges forbidden        |
| Page cursor                | Continue a bounded list         | `next_cursor`           | Opaque 512 chars or null                                 | CONTROL    | Cursor internals never decoded/exposed           |
| Authorized project list    | Select a project                | `projects`              | At most 50 Project records                               | PROJECT    | Account/org/member inventory omitted             |
| No visible project         | Guide normal setup              | `empty_state`           | Object or null                                           | CONTROL    | Plugin never creates account/project state       |
| Fixed safe copy            | Explain empty list              | `empty_state.message`   | Fixed text, 4096 chars max                               | CONTROL    | No user/email/account detail                     |
| Canonical setup route      | Continue normal setup           | `empty_state.setup_url` | HTTPS URL, fixed `openai_plugin` attribution, 2048 chars | NAVIGATION | No token, email, or arbitrary redirect           |
| Authorized services        | Select service scope            | `services`              | At most 50 Service records                               | PROJECT    | Deploy/internal service configuration omitted    |
| Authorized incidents       | Select incident evidence        | `incidents`             | At most 50 Incident records                              | INCIDENT   | Raw events/logs and internal grouping omitted    |
| Authorized improvements    | Select improvement evidence     | `improvements`          | At most 50 Improvement records                           | ARTIFACT   | Raw evaluator payload/evidence object omitted    |
| Authorized health checks   | Select endpoint health evidence | `checks`                | At most 50 HealthCheck records                           | HEALTH     | Claims/scheduling/failure counters omitted       |
| Authorized health results  | Inspect recent outcomes         | `results`               | At most 50 result records                                | HEALTH     | Raw endpoint response/error message omitted      |
| Authorized daily history   | Inspect uptime trend            | `rollups`               | At most 90 rollup records                                | HEALTH     | Per-execution detail omitted from aggregate tool |

## Project And Service Fields

| Source                 | User goal                       | Output                  | Transformation and maximum            | Category   | Adjacent omission rationale                    |
| ---------------------- | ------------------------------- | ----------------------- | ------------------------------------- | ---------- | ---------------------------------------------- |
| `projects.id`          | Refer to project in later calls | `project.project_id`    | Opaque public ID, 128 chars           | PROJECT    | Organization/owner IDs omitted                 |
| `projects.name`        | Recognize project               | `project.name`          | Redacted/truncated to 256 chars       | PROJECT    | Slug/environment/plan not needed for selection |
| `projects.color_tag`   | Disambiguate projects           | `project.color`         | Frozen palette enum or null           | PROJECT    | Arbitrary styling metadata omitted             |
| App route builder      | Open project dashboard          | `project.dashboard_url` | Authenticated HTTPS route, 2048 chars | NAVIGATION | API/object URLs and tokens omitted             |
| `services.id`          | Refer to known service          | `service.service_id`    | Opaque public ID, 128 chars           | PROJECT    | Database row metadata omitted                  |
| `services.project_id`  | Confirm service scope           | `service.project_id`    | Opaque public ID, 128 chars           | PROJECT    | Organization ID omitted                        |
| `services.name`        | Select service                  | `service.name`          | Redacted/truncated to 256 chars       | PROJECT    | No config/env variables                        |
| `services.runtime`     | Interpret runtime evidence      | `service.runtime`       | 128 chars or null                     | PROJECT    | Package inventory omitted                      |
| `services.framework`   | Interpret runtime evidence      | `service.framework`     | 128 chars or null                     | PROJECT    | Framework config omitted                       |
| `services.environment` | Select environment              | `service.environment`   | 128 chars                             | PROJECT    | Deployment secrets/regions omitted             |

## Incident Fields

| Source                       | User goal                       | Output                      | Transformation and maximum            | Category   | Adjacent omission rationale            |
| ---------------------------- | ------------------------------- | --------------------------- | ------------------------------------- | ---------- | -------------------------------------- |
| `incidents.id`               | Identify incident               | `incident.incident_id`      | Opaque public ID, 128 chars           | INCIDENT   | Event IDs omitted                      |
| `incidents.project_id`       | Confirm scope                   | `incident.project_id`       | Opaque public ID, 128 chars           | INCIDENT   | Organization ID omitted                |
| Service join                 | Understand affected service     | `incident.service_name`     | Redacted, 128 chars or null           | INCIDENT   | Internal service ID omitted            |
| `incidents.environment`      | Understand affected environment | `incident.environment`      | Redacted, 128 chars                   | INCIDENT   | Env vars/host details omitted          |
| `incidents.title`            | Recognize failure               | `incident.title`            | Redacted, untrusted data, 512 chars   | INCIDENT   | Raw exception/log payload omitted      |
| `incidents.severity`         | Prioritize                      | `incident.severity`         | Low/medium/high/critical enum         | INCIDENT   | Internal scoring inputs omitted        |
| `incidents.status`           | Know lifecycle state            | `incident.status`           | Open/resolved/regressed enum          | INCIDENT   | Mutation controls omitted              |
| `incidents.first_seen_at`    | Establish chronology            | `incident.first_seen_at`    | ISO timestamp, 64 chars               | INCIDENT   | Raw event chronology omitted           |
| `incidents.last_seen_at`     | Establish recency               | `incident.last_seen_at`     | ISO timestamp, 64 chars               | INCIDENT   | Raw occurrence list omitted            |
| `incidents.occurrence_count` | Understand frequency            | `incident.occurrence_count` | Non-negative integer                  | INCIDENT   | Frequency buckets/fingerprints omitted |
| `incidents.regressed_at`     | Explain regression              | `incident.regressed_at`     | ISO timestamp or null                 | INCIDENT   | Regression event payload omitted       |
| App route builder            | Continue investigation          | `incident.dashboard_url`    | Authenticated HTTPS route, 2048 chars | NAVIGATION | API/object/signed URLs omitted         |

Explicit incident omissions: `project_name`, `project_color_tag`, `service_id`, `latest_deployment_id`, `fingerprint`, `fingerprint_version`, `matched_fields`, raw `incident_reason`, raw events, and raw logs. They either duplicate selection context, expose internal grouping, or broaden sensitive evidence beyond the user goal.

## Incident Context And Bundle-Evidence Fields

| Source                             | User goal                                  | Output                                   | Transformation and maximum                       | Category   | Adjacent omission rationale                    |
| ---------------------------------- | ------------------------------------------ | ---------------------------------------- | ------------------------------------------------ | ---------- | ---------------------------------------------- |
| Existing bundle/context summary    | Explain primary failure                    | `primary_signal.description`             | Redacted untrusted string, 4096 chars            | ARTIFACT   | Raw payload/log text omitted                   |
| Existing bundle summary/error      | Name error class                           | `primary_signal.error_type`              | Redacted, 256 chars or null                      | ARTIFACT   | Exception object omitted                       |
| Existing bundle summary/error      | Explain failure                            | `primary_signal.error_message`           | Redacted untrusted string, 4096 chars or null    | ARTIFACT   | Stack/log/request body omitted                 |
| Existing bundle request context    | Identify request method                    | `primary_signal.request_method`          | 16 chars or null                                 | ARTIFACT   | Headers/body/query omitted                     |
| Existing bundle request context    | Identify safe path                         | `primary_signal.request_path`            | Redacted path, query removed, 2048 chars or null | ARTIFACT   | Origin/userinfo/query/fragment omitted         |
| Existing bundle request context    | Identify normalized route                  | `primary_signal.route_template`          | Redacted, 1024 chars or null                     | ARTIFACT   | Raw high-cardinality path omitted              |
| Existing bundle response context   | Identify response class                    | `primary_signal.response_status`         | Integer 100–599 or null                          | ARTIFACT   | Headers/body omitted                           |
| Existing bundle summary frame      | Locate application code                    | `primary_signal.first_application_frame` | One StackFrame or null                           | ARTIFACT   | Remaining/vendor stack frames omitted          |
| Existing bundle frame              | Locate file                                | `first_application_frame.file`           | Redacted, 1024 chars or null                     | ARTIFACT   | Absolute secret-bearing paths redacted/omitted |
| Existing bundle frame              | Locate line                                | `first_application_frame.line`           | Positive integer or null                         | ARTIFACT   | Columns/source contents omitted                |
| Existing bundle frame              | Locate function                            | `first_application_frame.function`       | Redacted, 512 chars or null                      | ARTIFACT   | Arguments/locals omitted                       |
| Existing bundle record state       | Explain evidence availability              | `bundle_status`                          | Ready/missing/stale/pending/failed/oversized     | CONTROL    | No regeneration started                        |
| Existing reproduction record state | Explain evidence availability              | `reproduction_status`                    | Same bounded status enum                         | CONTROL    | No regeneration started                        |
| Existing bundle deploy context     | Correlate deploy                           | `deploy.commit_sha`                      | 128 chars or null                                | ARTIFACT   | Repository credentials/URL omitted             |
| Existing bundle deploy context     | Correlate version                          | `deploy.deploy_version`                  | 128 chars or null                                | ARTIFACT   | Build env omitted                              |
| Existing bundle deploy context     | Correlate branch                           | `deploy.branch`                          | Redacted, 256 chars or null                      | ARTIFACT   | Remote/repo identity omitted                   |
| Existing bundle deploy context     | Correlate time                             | `deploy.deployed_at`                     | ISO timestamp or null                            | ARTIFACT   | Raw deployment object omitted                  |
| Existing bundle deploy context     | Explain suspected regression               | `deploy.regression_window`               | Boolean or null                                  | ARTIFACT   | Internal scoring detail omitted                |
| Existing artifact redaction block  | Disclose redaction                         | `redaction.redacted`                     | Boolean                                          | CONTROL    | No original value                              |
| Existing artifact redaction block  | Name removed field classes                 | `redaction.fields`                       | At most 100 names, 256 chars each                | CONTROL    | Never includes removed values                  |
| Existing artifact redaction block  | Explain redaction                          | `redaction.notes`                        | Fixed/redacted text, 2048 chars or null          | CONTROL    | No raw payload                                 |
| Deterministic context builder      | Guide safe next inspection                 | `suggested_next_checks`                  | At most 20 redacted strings, 1024 chars each     | ARTIFACT   | Treated as evidence, never executed            |
| App route builder                  | Continue when bounded data is insufficient | `continuation_url`                       | Authenticated HTTPS route, 2048 chars            | NAVIGATION | No signed object URL/token                     |

`get_incident_context` never reads or returns `logs`, `logs.source`, `logs.items`, or `logs.next_cursor`, even though the general API/stdio `IncidentContextRecord` currently includes them. This is an OpenAI projection rule, not a breaking change to the existing context interface.

## Artifact Envelope And Manifest Fields

| Source                        | User goal                           | Output                    | Transformation and maximum                   | Category | Adjacent omission rationale                 |
| ----------------------------- | ----------------------------------- | ------------------------- | -------------------------------------------- | -------- | ------------------------------------------- |
| Authorized lookup             | Identify bundle/reproduction owner  | `incident_id`             | Opaque public ID, 128 chars                  | INCIDENT | Project is already input/authorized         |
| Authorized lookup             | Identify improvement artifact owner | `improvement_id`          | Opaque public ID, 128 chars                  | ARTIFACT | Internal generation ID omitted              |
| Existing artifact state/size  | Understand availability             | `status`                  | Ready/missing/stale/pending/failed/oversized | CONTROL  | No hidden regeneration                      |
| Existing allowlisted artifact | Inspect bounded evidence            | `artifact`                | Exact typed object or null, total ≤512 KiB   | ARTIFACT | Raw artifact object is never passed through |
| Existing artifact metadata    | Understand projection               | `manifest`                | Exact ArtifactManifest                       | CONTROL  | Object key/ETag/storage URL omitted         |
| Artifact kind                 | Identify evidence type              | `manifest.artifact_type`  | Bundle/reproduction/improvement_bundle enum  | CONTROL  | Internal job type omitted                   |
| Redaction result              | Know safety transform               | `manifest.redacted`       | Boolean                                      | CONTROL  | Original values unavailable                 |
| Bound enforcement             | Know result was reduced             | `manifest.truncated`      | Boolean                                      | CONTROL  | No overflow content                         |
| Serialized projection         | Understand size                     | `manifest.size_bytes`     | 0–524288                                     | CONTROL  | Storage object size/metadata omitted        |
| Projection omissions          | Know bounded gaps                   | `manifest.omitted_fields` | At most 50 paths, 256 chars each             | CONTROL  | Paths only, never values                    |
| Fixed status mapping          | Explain state                       | `message`                 | Fixed safe text, 4096 chars                  | CONTROL  | No internal exception/reason payload        |

## Bundle And Reproduction Artifact Fields

| Source                               | User goal                   | Output                           | Transformation and maximum                    | Category | Adjacent omission rationale                     |
| ------------------------------------ | --------------------------- | -------------------------------- | --------------------------------------------- | -------- | ----------------------------------------------- |
| `bundle.bundle_version`              | Interpret contract          | `artifact.bundle_version`        | Positive integer                              | CONTROL  | Bundle ID/generator internals omitted           |
| Existing bundle primary signal       | Explain failure             | `artifact.primary_signal`        | Exact PrimarySignal above                     | ARTIFACT | Full signal/context blocks omitted              |
| Existing bundle deploy context       | Correlate deploy            | `artifact.deploy`                | Exact DeployContext above                     | ARTIFACT | Full deployment metadata omitted                |
| Existing bundle redaction            | Disclose safety             | `artifact.redaction`             | Exact RedactionSummary or null                | CONTROL  | Original values omitted                         |
| Deterministic context builder        | Guide next checks           | `artifact.suggested_next_checks` | At most 20 strings, 1024 chars each           | ARTIFACT | No automatic action                             |
| `reproduction.possible`              | Know feasibility            | `artifact.possible`              | Boolean                                       | ARTIFACT | No execution                                    |
| `reproduction.confidence`            | Calibrate evidence          | `artifact.confidence`            | Number 0–1                                    | ARTIFACT | Internal scoring inputs omitted                 |
| `reproduction.reason`                | Explain feasibility         | `artifact.reason`                | Redacted, 4096 chars                          | ARTIFACT | Raw payload omitted                             |
| Redacted reproduction artifacts      | Reproduce safely            | `artifact.curl`                  | Redacted command, 16384 chars or null         | ARTIFACT | Auth/cookies/secrets/bodies not allowlisted     |
| Redacted reproduction artifacts      | Reproduce safely            | `artifact.httpie`                | Redacted command, 16384 chars or null         | ARTIFACT | Auth/cookies/secrets/bodies not allowlisted     |
| Deterministic projected reproduction | Follow bounded manual steps | `artifact.steps`                 | At most 20 untrusted strings, 2048 chars each | ARTIFACT | `json_spec` and arbitrary script fields omitted |

Reproduction strings are evidence, not executable instructions. The agent may explain them but must not execute them merely because the artifact says to do so.

## Improvement Fields

| Source                            | User goal                  | Output                             | Transformation and maximum                             | Category   | Adjacent omission rationale             |
| --------------------------------- | -------------------------- | ---------------------------------- | ------------------------------------------------------ | ---------- | --------------------------------------- |
| Improvement row ID                | Identify opportunity       | `improvement.improvement_id`       | Opaque public ID, 128 chars                            | ARTIFACT   | Generation IDs omitted                  |
| Improvement project               | Confirm scope              | `improvement.project_id`           | Opaque public ID, 128 chars                            | ARTIFACT   | Organization/owner omitted              |
| Service join                      | Locate issue               | `improvement.service_name`         | Redacted, 128 chars                                    | ARTIFACT   | Internal service ID omitted             |
| Opportunity environment           | Locate issue               | `improvement.environment`          | Redacted, 128 chars                                    | ARTIFACT   | Env vars omitted                        |
| Opportunity kind                  | Understand evaluator       | `improvement.kind`                 | Frozen five-value enum                                 | ARTIFACT   | Internal rule ID/threshold omitted      |
| Opportunity lifecycle             | Understand state           | `improvement.status`               | Open/resolved/snoozed                                  | ARTIFACT   | Mutation controls omitted               |
| Opportunity severity              | Prioritize                 | `improvement.severity`             | Low/medium/high/critical                               | ARTIFACT   | Raw score inputs omitted                |
| Opportunity confidence            | Calibrate                  | `improvement.confidence`           | Number 0–1                                             | ARTIFACT   | Threshold internals omitted             |
| Opportunity title                 | Recognize issue            | `improvement.title`                | Redacted untrusted string, 512 chars                   | ARTIFACT   | Raw evidence object omitted             |
| Opportunity summary               | Understand issue           | `improvement.summary`              | Redacted untrusted string, 4096 chars                  | ARTIFACT   | Raw logs/requests omitted               |
| Opportunity count                 | Understand recurrence      | `improvement.occurrence_count`     | Non-negative integer                                   | ARTIFACT   | Event IDs omitted                       |
| Related authorized incidents      | Navigate evidence          | `improvement.related_incident_ids` | At most 20 public IDs                                  | ARTIFACT   | Cross-project/inaccessible IDs filtered |
| Detection time                    | Establish chronology       | `improvement.first_detected_at`    | ISO timestamp                                          | ARTIFACT   | Raw event timeline omitted              |
| Detection time                    | Establish recency          | `improvement.last_detected_at`     | ISO timestamp                                          | ARTIFACT   | Raw event timeline omitted              |
| App route builder                 | Continue investigation     | `improvement.dashboard_url`        | Authenticated HTTPS route                              | NAVIGATION | API/object URL omitted                  |
| Allowlisted current evidence      | Explain opportunity        | `evidence_summary`                 | At most 20 redacted untrusted strings, 2048 chars each | ARTIFACT   | Raw `evidence` record is forbidden      |
| Existing improvement bundle state | Know evidence availability | `artifact_status`                  | Bounded status enum                                    | CONTROL    | No regeneration started                 |

## Improvement Bundle Fields

| Source                                   | User goal            | Output                                     | Transformation and maximum                    | Category | Adjacent omission rationale            |
| ---------------------------------------- | -------------------- | ------------------------------------------ | --------------------------------------------- | -------- | -------------------------------------- |
| Improvement bundle version               | Interpret contract   | `artifact.bundle_version`                  | Positive integer                              | CONTROL  | Bundle ID/generator metadata omitted   |
| `bundle.summary.title`                   | Recognize finding    | `artifact.summary.title`                   | Redacted, 512 chars                           | ARTIFACT | Raw signal omitted                     |
| `bundle.summary.description`             | Understand finding   | `artifact.summary.description`             | Redacted, 4096 chars                          | ARTIFACT | Raw log/request evidence omitted       |
| `bundle.summary.likely_cause`            | Review inference     | `artifact.summary.likely_cause`            | Redacted, 4096 chars or null                  | ARTIFACT | Marked as evidence/inference, not fact |
| `bundle.summary.confidence`              | Calibrate inference  | `artifact.summary.confidence`              | Number 0–1                                    | ARTIFACT | Threshold internals omitted            |
| `bundle.summary.recommended_action`      | Plan human follow-up | `artifact.summary.recommended_action`      | Redacted untrusted string, 4096 chars or null | ARTIFACT | Never executed automatically           |
| `bundle.summary.severity`                | Prioritize           | `artifact.summary.severity`                | Low/medium/high/critical                      | ARTIFACT | Internal score omitted                 |
| `bundle.summary.error_type`              | Classify pattern     | `artifact.summary.error_type`              | Redacted, 256 chars or null                   | ARTIFACT | Raw exception/log object omitted       |
| `bundle.summary.error_message`           | Understand pattern   | `artifact.summary.error_message`           | Redacted untrusted string, 4096 chars or null | ARTIFACT | Raw logs/bodies omitted                |
| `bundle.summary.first_application_frame` | Locate code          | `artifact.summary.first_application_frame` | One StackFrame or null                        | ARTIFACT | Remaining/vendor frames omitted        |
| Improvement bundle redaction             | Disclose safety      | `artifact.redaction`                       | Exact RedactionSummary or null                | CONTROL  | Original values omitted                |

All other BundleV1 blocks—including raw context, SDK inventory, signal fingerprint, impact detail, links, metadata/generation, verification, reproduction, breadcrumbs, logs, environment variables, and arbitrary extensions—are omitted from the improvement artifact projection.

## Aggregate Analytics Fields

The nine analytics tools query existing aggregate ledgers only. Inputs are limited to `projectId`, the fixed `last` values 24 hours/7 days/30 days/90 days, `granularity`, optional `service`, `environment`, normalized `route` without query or fragment, and `limit` at most 25. `get_funnel_analysis` additionally accepts `funnelKey`; `get_incident_impact` additionally accepts `incidentId` and requires both analytics and incident scopes. No input accepts a custom dimension, sample ID, generation ID, arbitrary date range, or account identifier.

| Source | User goal | Output | Transformation and maximum | Category | Adjacent omission rationale |
| --- | --- | --- | --- | --- | --- |
| Authorized aggregate window | Understand applied scope | `window`, `project_id`, `from`, `to`, `granularity`, `service`, `environment` | Fixed lookback at most 90 days; nullable service/environment; no custom dimensions | ANALYTICS | Bucket internals, dimension hashes, and customer identifiers omitted |
| Aggregate usage totals | Understand adoption | `summary`, `sessions`, `pageviews`, `active_visitors`, `new_visitors`, `returning_visitors`, `exits`, `conversions` | Non-negative integer totals in the authorized window | ANALYTICS | Individual subjects, session hashes, event rows, and raw paths omitted |
| Standard aggregate segments | Understand audience mix | `breakdowns`, `device_types`, `browsers`, `os`, `languages`, `referrers`, `auth_states` | At most 25 `analyticsSegment` rows per list | ANALYTICS | Country/region and arbitrary custom-dimension expansion omitted from v1 output |
| Aggregate segment ledger | Compare a standard segment | `value`, `sessions`, `pageviews` | Redacted value at most 255 chars plus non-negative counts | ANALYTICS | Underlying subjects and event payloads omitted |
| Aggregate route ledger | Find used or problematic routes | `routes`, `route_key`, `unique_sessions`, `entrances`, `bounces`, `linked_incident_sessions` | At most 25 normalized route rows; counts only | ANALYTICS | Raw URLs, query strings, fragments, subject hashes, and event rows omitted |
| Aggregate transition ledger | Understand common navigation | `patterns`, `from_route_key`, `to_route_key`, `transition_count`, `transition_share` | At most 25 transition rows; share bounded 0–1 | ANALYTICS | `sample_ids`, retained journey records/artifacts, session hashes, and raw events forbidden; the reader does not query the sample table |
| Standard acquisition ledgers | Understand acquisition | `utm_sources`, `utm_mediums`, `utm_campaigns` | At most 25 aggregate segment rows per list | ANALYTICS | Full referrer URLs, click identifiers, custom dimensions, and individual visits omitted |
| Aggregate action ledger | Understand feature usage | `actions`, `action_key`, `kind`, `event_count` | At most 25 rows; kind is action/conversion/marker | ANALYTICS | Event payloads, subject hashes, and arbitrary properties omitted |
| Aggregate funnel ledgers | Understand conversion | `funnels`, `funnel`, `funnel_key`, `sessions_entered`, `sessions_completed`, `dropoffs`, `conversion_rate` | At most 25 funnels; rate bounded 0–1 | ANALYTICS | Saved-funnel settings, mutation controls, subjects, and raw events omitted |
| Aggregate funnel steps | Locate dropoff | `steps`, `step_key`, `step_order` | At most 25 ordered step rows using the same bounded counts/rate | ANALYTICS | Per-session progress and sample journeys omitted |
| Aggregate incident links | Quantify incident reach | `incident_id`, `affected_sessions`, `affected_routes`, `affected_funnels`, `top_device_types`, `top_browsers`, `journey_patterns` | Authorized incident rechecked; each list at most 25; counts only | ANALYTICS | Correlation/session hashes, individual journeys, and cross-project incidents omitted |
| Aggregate impacted transition | Understand affected navigation | `affected_sessions`, `from_route_key`, `to_route_key` | At most 25 route-transition count rows | ANALYTICS | Retained `sample_ids` forbidden; the reader does not query the sample table |
| Correlation-safe conversion comparison | State whether a baseline exists | `conversion_delta`, `availability`, `value`, `unit` | Availability enum; nullable finite value; percentage-points unit | ANALYTICS | No inferred number from unrelated aggregates; unavailable remains explicit |

Explicit analytics omissions: individual journey sample inventory/detail/artifacts and `sample_ids`; arbitrary/custom dimensions; country/region output; raw analytic events, URLs, queries, fragments, subjects, session/correlation/dimension hashes, and high-cardinality identifiers; analytics opportunities; AnalyticsBundle inventory/detail/generation and generation/failure state; saved-funnel/settings writes; and every other mutation. The OpenAI journey and incident-impact readers disable the retained-sample query, and incident impact also disables the analytics-bundle-state query, before projection.

## Health-Check Fields

| Source                   | User goal                | Output                          | Transformation and maximum                                                                       | Category   | Adjacent omission rationale                       |
| ------------------------ | ------------------------ | ------------------------------- | ------------------------------------------------------------------------------------------------ | ---------- | ------------------------------------------------- |
| `availability_checks.id` | Identify check           | `check.check_id`                | Opaque public ID, 128 chars                                                                      | HEALTH     | Claim IDs omitted                                 |
| Check project            | Confirm scope            | `check.project_id`              | Opaque public ID, 128 chars                                                                      | HEALTH     | Organization ID omitted                           |
| Check name               | Recognize endpoint       | `check.name`                    | Redacted, 256 chars                                                                              | HEALTH     | No arbitrary description                          |
| Stored check URL         | Identify endpoint safely | `check.display_url`             | HTTP(S); normalized host; userinfo/query/fragment removed; secret-like path replaced; 2048 chars | HEALTH     | Stored raw URL is forbidden                       |
| Check method             | Understand request       | `check.method`                  | GET/HEAD                                                                                         | HEALTH     | Headers/body forbidden                            |
| Expected status config   | Understand pass range    | `check.expected_status_min`     | Integer 100–599                                                                                  | HEALTH     | Matcher internals omitted                         |
| Expected status config   | Understand pass range    | `check.expected_status_max`     | Integer 100–599                                                                                  | HEALTH     | Matcher internals omitted                         |
| Timeout config           | Understand behavior      | `check.timeout_ms`              | Integer 1–30000                                                                                  | HEALTH     | Worker claim timeout omitted                      |
| Interval config          | Understand cadence       | `check.interval_seconds`        | Positive integer                                                                                 | HEALTH     | `next_check_at` omitted                           |
| Check environment        | Understand scope         | `check.environment`             | Redacted, 128 chars                                                                              | HEALTH     | Env vars omitted                                  |
| Check service            | Understand scope         | `check.service_name`            | Redacted, 128 chars or null                                                                      | HEALTH     | Internal service ID omitted                       |
| Check enabled state      | Know configured behavior | `check.enabled`                 | Boolean                                                                                          | HEALTH     | No mutation capability                            |
| Derived health state     | Know current state       | `check.status`                  | Unknown/passing/failing/paused                                                                   | HEALTH     | Failure/success counters and pause reason omitted |
| Last retained result     | Know recency             | `check.last_checked_at`         | ISO timestamp or null                                                                            | HEALTH     | Next schedule/claim omitted                       |
| Last retained result     | Know outcome class       | `check.last_result_status`      | Bounded status enum or null                                                                      | HEALTH     | Raw error message omitted                         |
| Last retained result     | Know HTTP outcome        | `check.last_result_http_status` | Integer 100–599 or null                                                                          | HEALTH     | Response headers/body omitted                     |
| Last retained result     | Know latency             | `check.last_result_duration_ms` | Non-negative integer or null                                                                     | HEALTH     | Timing trace omitted                              |
| App route builder        | Continue in dashboard    | `check.dashboard_url`           | Authenticated HTTPS route                                                                        | NAVIGATION | No test/mutation URL                              |

Explicit health-check omissions: raw `url`, `paused_reason`, `organization_plan`, `consecutive_failures`, `consecutive_successes`, `linked_incident_id/status`, `next_check_at`, `last_result_error_message`, creation/update metadata, claim/lease state, request headers/body, and secrets.

## Health-Check Result Fields

| Source                | User goal                  | Output                     | Transformation and maximum             | Category | Adjacent omission rationale                               |
| --------------------- | -------------------------- | -------------------------- | -------------------------------------- | -------- | --------------------------------------------------------- |
| Result ID             | Order/reference result     | `result.result_id`         | Opaque public ID, 128 chars            | HEALTH   | Internal claim ID omitted                                 |
| Result check          | Confirm scope              | `result.check_id`          | Opaque public ID, 128 chars            | HEALTH   | Project repeated only at root                             |
| Result time           | Establish start            | `result.started_at`        | ISO timestamp                          | HEALTH   | Scheduler claim time omitted                              |
| Result time           | Establish completion       | `result.completed_at`      | ISO timestamp                          | HEALTH   | Worker internals omitted                                  |
| Result duration       | Diagnose latency           | `result.duration_ms`       | Non-negative integer                   | HEALTH   | Network trace omitted                                     |
| Result status         | Diagnose class             | `result.status`            | Frozen execution-status enum           | HEALTH   | Raw exception omitted                                     |
| Result HTTP status    | Diagnose response          | `result.http_status`       | Integer 100–599 or null                | HEALTH   | Headers/body omitted                                      |
| Result error category | Diagnose failure           | `result.error_kind`        | Bounded code, 128 chars or null        | HEALTH   | `error_message` omitted to avoid endpoint content/secrets |
| Result redirect count | Diagnose redirects         | `result.redirect_count`    | Integer 0–3                            | HEALTH   | Redirect chain omitted                                    |
| Checked host          | Identify endpoint          | `result.checked_host`      | Normalized hostname, 253 chars         | HEALTH   | Path/query/userinfo omitted                               |
| Result final URL      | Identify safe final target | `result.final_display_url` | Same sanitization as check display URL | HEALTH   | Raw final URL/query/fragment forbidden                    |

## Daily Rollup Fields

| Source                      | User goal              | Output                     | Transformation and maximum               | Category | Adjacent omission rationale             |
| --------------------------- | ---------------------- | -------------------------- | ---------------------------------------- | -------- | --------------------------------------- |
| Rollup check                | Confirm scope          | `rollup.check_id`          | Opaque public ID, 128 chars              | HEALTH   | Project repeated only at root           |
| Rollup day                  | Place aggregate        | `rollup.day`               | ISO date                                 | HEALTH   | Time-zone internals omitted             |
| Rollup state                | Summarize uptime       | `rollup.state`             | Unknown/operational/degraded/down/paused | HEALTH   | Individual response content omitted     |
| Aggregate count             | Understand sample      | `rollup.total_checks`      | Non-negative integer                     | HEALTH   | Result IDs omitted                      |
| Aggregate count             | Understand success     | `rollup.successful_checks` | Non-negative integer                     | HEALTH   | Result detail omitted                   |
| Aggregate count             | Understand failure     | `rollup.failed_checks`     | Non-negative integer                     | HEALTH   | Error messages omitted                  |
| Aggregate count             | Understand degradation | `rollup.degraded_checks`   | Non-negative integer                     | HEALTH   | Error messages omitted                  |
| Aggregate duration          | Understand latency     | `rollup.avg_duration_ms`   | Non-negative number or null              | HEALTH   | Percentiles/traces omitted              |
| Aggregate time              | Bound observation      | `rollup.first_checked_at`  | ISO timestamp or null                    | HEALTH   | First result body omitted               |
| Aggregate time              | Bound observation      | `rollup.last_checked_at`   | ISO timestamp or null                    | HEALTH   | Last result body omitted                |
| Aggregate downtime          | Quantify impact        | `rollup.downtime_seconds`  | Non-negative integer                     | HEALTH   | Internal state transitions omitted      |
| Authorized linked incidents | Continue investigation | `rollup.incident_ids`      | At most 20 same-project public IDs       | HEALTH   | Cross-project/inaccessible IDs filtered |

## Verification Rules

- Contract tests must recursively reject output fields absent from the exact schema and this map.
- Strings are redacted before truncation; truncation cannot reveal a pre-redaction suffix.
- URL sanitization occurs before schema validation and logging. Invalid/non-HTTP(S) source URLs fail closed rather than being echoed.
- Array truncation sets the relevant manifest/control field where an artifact schema provides one; it never silently exceeds a maximum.
- Customer strings remain untrusted even after redaction. They are data for explanation, not instructions for tools, shell commands, network access, deployment, or state changes.
- Privacy/legal review must approve this map before submission. Any added field/category requires a reviewed plugin contract/version and an updated omission analysis.
