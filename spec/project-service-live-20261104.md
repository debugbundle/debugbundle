# DebugBundle's three-project consolidation — server merge complete

4 November 2026. FR-PJS-01–04 / AC-PJS-01–03. The owner approved the narrow
activation and merge after clarification of the existing analytics model.

## Installation guidance follow-up — 5 November

The owner authorised and published the installation follow-up: CLI/MCP/OpenClaw
and skill 1.19.4, Codex 1.5.1, Claude Code 1.19.4, Gemini 1.4.4 and site 1.7.2.
The default is one project per system across service repositories, preserving
existing connections and separate access/privacy policies. Current name-based
`connect` and binding a known project ID are explicit. Generated skills, live
setup/API/CLI guides, the shared install prompt and llms.txt agree. The prompt is
236 words; the shared project/service section is four bullets/232 words.

Publication qualification also fixed pre-existing cloud/local artifact path
boundaries in the clients. The actual hosted llms.txt generator was corrected
and redeployed after a live mismatch was caught. No server-merge data, SDK,
credential, API/worker deployment or consumer installation changed. Exact client
source CI, normal public native installs and post-deploy health checks pass.
The merged release branch is removed locally/remotely. Corrected-source main CI passes
5,175 tests. Current ClawHub antivirus acceptance remains open; see
[the current release receipt](project-guidance-release-20261105.md).
OpenAI portal submission remains separate. The successful server merge below
and its original evidence/limits are unchanged.

## Final receipt

- Canonical **DebugBundle**, slug `debugbundle`, retains API project ID
  `bd9e7adf-31a4-4bb7-a0af-2f079cab2e3b`. App
  `34a4642f-3b2c-4b09-a5f9-845f39bc4eaf` and Site
  `8e6f8ccb-e0fc-4c33-9c1a-69077717db40` are retained aliases with original read
  scopes. All five service definitions/environment instances survive, including
  API, Worker and the historical verification entry. Imported logical names are
  App and Site; every deployed input name remains unchanged.
- Operation `f38fb964-4cce-4eca-9a73-e3528998b253` completed, committed at
  `2026-11-04T20:50:35.776Z`, verified at `20:50:35.962Z`. Independent verification
  returns true/no failures. Digest:
  `91f389341c3538bf8abf040f1e22fcde79e168416f5aab16d6d46d7f99ceea2f`.
  Fixed idempotency key: `debugbundle-owner-three-projects-20261104-v1`.
- Fresh managed snapshot `debugbundle-db-pre-owner-merge-20261104-203601` from
  `debugbundle-db` reached available before policy changes and activation. This
  verifies provider snapshot availability, not a newly performed restore.
- Cloud commit `b0daa14141cb3d4bf81964c2f255a699546ae030` passed 29 deployment
  and three image-gate tests and was published. Activation-only
  [workflow 41909113370](https://github.com/debugbundle/debugbundle-cloud/actions/runs/41909113370)
  succeeded with exact released core `3292618b`, `deploy_assets=false`, MCP
  preserve and explicit merge enablement. Hosted environment changes are only
  `PROJECT_MERGES_ENABLED` and the normal `DEBUGBUNDLE_DEPLOYED_AT` timestamp.
- Active release `20261104204536-e78a4c215cb7` uses API/worker digest
  `sha256:6fb7afe9e94d894fe0e3e97d19fc6119ca89243a65646d32050f0f27d3b2918c`.
  Verified previous stable `20261104132432-cf5eedc22dbe` retains
  `sha256:4776feced637f813c7a48d381a153e4c446dc1fc7b462ed81e5359fcad6b97b4`.
  The refreshed six-image gate passes. Both actual containers are healthy with
  zero restarts/OOMs; the worker is processing. Exactly these two releases remain.
- All 78 incident IDs, services, physical origins, environments, fingerprints,
  lifecycle timestamps/status and occurrence counts match the baseline. No
  incident was created/resolved/deleted. All nine tokens' immutable fields,
  including hashes, scopes, expiry and revocation, are unchanged. Normal
  `last_used_at` updates are excluded from immutable comparison, as required by
  `token-usage-store.ts`'s five-minute usage recording.
- All 66 migration IDs/checksums/application timestamps and enabled guards are
  unchanged. Six notification/check/schedule/rule identity/scope hashes match.
  Exactly one merge operation and two source bindings exist. No expired running
  job lease or pending/running expired job exists. All three endpoint checks ran
  after cutover and pass; all eight production alarms are OK.
- Thirty-four served app/site/OAuth/MCP resources are unchanged. Four existing
  browser credential/origin pairs return valid private/no-store configuration,
  credential/origin Vary and correct CORS. Three historical bundle responses
  retain exact served-byte hashes. The authenticated hosted connection discovers
  all five canonical services; an old App-ID read still returns only its original
  service/input name. Legacy histories remain 19 App and 15 Site incidents;
  canonical history is their union with 44 API incidents.
- Fixed-window analytics reconcile exactly: App 77 + Site 33 = 110 pageviews;
  20 + 21 = 41 sessions; API contributes zero. Service filters match the original
  metrics and incident sets, with explicit origin-scoped unique-count semantics.
  API's shared project policy was aligned to enabled/standard/10% sampling;
  App/Site SDK opt-in and API/Worker error reporting remain unchanged.

| Completion gate      | Result                                                                                                                                                         |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server consolidation | Completed and independently verified                                                                                                                           |
| Repository adoption  | Not requested; no application/profile/token/SDK changes                                                                                                        |
| Deployed runtime     | Existing-token configuration, retained data, public resources, health, queues and monitoring verified; no fresh post-merge SDK event was triggered or observed |

No synthetic canary, notification test/retry, consumer change, frontend deployment
or service repository/naming tidy-up was performed. Local receipt updates are
retained without an unrelated core push. Exact requests, receipts, hashes and
verification logs are in `.tmp/project-service-live-20261104/execution/`.
The earlier CLI GitHub-status limitation for unassigned repositories remains a
separate known client issue; direct member API inventory succeeded.

## Initial preparation history

The following is the original preparation/proposal, superseded by the accepted
narrow scope and final receipt above. Its optional adoption/canary/tidy-up items
were not approved or executed.

## Accepted execution scope

The owner subsequently accepted the existing analytics model and asked to enable
merging and merge the three projects. Execute the narrow server workflow:
preserve App/Site SDK opt-in and API/Worker error reporting, align the shared
project analytics settings, publish only the cloud activation control needed by
the normal rollout, take a fresh backup, activate, apply the checked merge and
verify retained credentials/history plus actual ongoing reporting. Repository
adoption, SDK/token changes, synthetic canaries and service repository/naming
tidy-up from the original broader proposal below are outside this execution.
Renaming the final canonical project DebugBundle is part of the original
consolidation outcome. Keep this receipt current without an unrelated core push.

## Exact server scope

| Role            | Current project  | Project ID                             |
| --------------- | ---------------- | -------------------------------------- |
| Retained target | DebugBundle API  | `bd9e7adf-31a4-4bb7-a0af-2f079cab2e3b` |
| Source          | DebugBundle App  | `34a4642f-3b2c-4b09-a5f9-845f39bc4eaf` |
| Source          | DebugBundle Site | `8e6f8ccb-e0fc-4c33-9c1a-69077717db40` |

All belong to account `d8f25196-f703-4941-8437-b9f6c60a11df`, owner
`fed59684-906c-4b9d-9aaf-d4f0687d9214`. Current access is owner-only; no pending
invitations exist. Historical invite rows are retained. All environments are
`production`. No consumer project or the separate debugbundle-wordpress project
is included. Recommend renaming the retained target to **DebugBundle** (slug
`debugbundle`) after successful merge verification.

## Explicit mappings and repository context

| Logical service | Definition ID                          | Retained deployed input | Proposed repository context              |
| --------------- | -------------------------------------- | ----------------------- | ---------------------------------------- |
| API             | `ade2ff3e-eca0-4f56-9d1f-784b9e45f48a` | `debugbundle-api`       | `debugbundle/debugbundle`, `apps/api`    |
| Worker          | `9ad94cd2-141d-4835-b29c-010b54cb7e56` | `debugbundle-worker`    | `debugbundle/debugbundle`, `apps/worker` |
| App             | `d956a20d-0915-410d-8720-9646d7ce0952` | `debugbundle-app`       | `debugbundle/debugbundle`, `apps/web`    |
| Site            | `30d9b2db-a286-4128-a691-63285b9e3d9e` | `debugbundle-site`      | `debugbundle/site`, repository root      |

Merge mappings explicitly name imported services App and Site. API and Worker
keep their existing names during cutover; subsequent catalogue updates give them
the short names/context above. Keep the historical verification definition
`ca6e3b3d-a87d-451e-bbfd-457e5b1ca416` and input
`debugbundle-verify-cloud-20260526180349` unchanged. Preserve all five environment
instance IDs. Existing GitHub project bindings are null; the account's GitHub App
installation is active. Service repository context grants no new automation
authority and does not require assigning project repositories or creating rules.

The explicit read-only preview digest is
`f4ca3af89ea70409b165f7f37f8ac7195923375fbafa024411a93cda0bc310c4`.
It is **not ready**: its only two blockers are App/Site `settings_conflict` in
`analytics`. It has no access, mapping, inventory or combined-limit blocker.
Observed catalogue/lineage rows: 18; services: five; health checks: three of ten;
alerts: five; capture rules: 15; weekly channels: six; saved flows: two; active
probes/webhooks/GitHub rules: zero. Preview/configuration must be refreshed after
any policy change; this digest must never be applied after alignment.

## Analytics policy decision

| Setting             | API    | App and Site | Proposed shared setting |
| ------------------- | ------ | ------------ | ----------------------- |
| Enabled             | false  | true         | true                    |
| Privacy mode        | strict | standard     | standard                |
| Journey sample rate | 0      | 0.1          | 0.1                     |

All other effective analytics settings match: consent-required false, page/route
and friction capture true, action capture false, raw/sample/hourly retention
1/7/90 days, aggregate retention 12 months, no approved custom dimensions.
Recommend changing only API's three differing fields to preserve existing
App/Site analytics. This broadens API's configured analytics policy and needs
explicit approval; it has not been done. Capture policies, improvement settings,
personal/shared notification preferences and equivalent weekly schedules match.

## Executed checks and baseline

- Current host CLI is 1.19.1 with normal saved member auth at api.debugbundle.com.
  Full scoped incident inventories have 44 API, 19 App and 15 Site records.
  Existing open counts are 3/0/8; no record was resolved, suppressed or deleted.
  The two known migration-boundary worker incidents remain single occurrences.
- `make project-service-runtime` passes against isolated real API/worker,
  Postgres, Redis and S3 with current CLI/MCP archives byte-identical to public
  1.19.1. Retained CLI 1.18.2/MCP 1.18.3 and Node SDK 3.2.0, original credentials,
  new scope isolation, worker/API restarts, six immutable objects and complete
  origin cleanup pass. Owned containers/volumes are removed; the old release
  rehearsal receipt was preserved before running.
- Live core remains 1.21.0 at source `3292618b`, immutable image
  `sha256:4776feced637f813c7a48d381a153e4c446dc1fc7b462ed81e5359fcad6b97b4`.
  Retained stable is `20261104113833-1630bfff8c29`, image
  `sha256:bb44f1e2a03fca201e0721923b5e46246cb8be9c5f9c173ce7208c9996da94c2`.
  All six exact API/worker references pass the read-only contract gate. Both
  actual containers are healthy with zero restarts/OOMs; the worker is processing.
- All 66 migration IDs/checksums/timestamps exactly match the final release
  ledger. Required schema guards are enabled. Merge operations/bindings remain
  zero. Current database connections come from one observed runtime-host address;
  Docker inventory shows only the compatible API/worker and Redis. Refresh this
  point-in-time participant inventory immediately before activation.
- There are no expired running-job leases or pending/running expired jobs. All
  three selected endpoint checks pass and all eight DebugBundle alarms are OK.
  API SDK config returns private/no-store with credential/origin Vary. Distinct
  served App/Site credentials are checked separately in the local receipts.
- Managed snapshot `debugbundle-db-pre-project-services-20261104` is available.
  A fresh pre-merge backup remains required after approval; the old snapshot is
  not presented as a fresh backup or a newly tested restore.
- CLI `github status --project-id` rejects valid `200 {repo:null}` responses.
  Ordinary member API reads establish the actual unassigned repository state.
  This client limitation is recorded separately; it does not bypass any access
  check or prevent the checked merge workflow.

Local receipts: `.tmp/project-service-live-20261104/`. No secret values are
embedded in the checked plans, reports or configuration summaries.

## Concrete approval scope and remaining sequence

1. Approve the exact three IDs, App/Site mappings, canonical name/slug and
   subsequent API/Worker catalogue names/repository context above. Approve the
   three API analytics changes explicitly. Apply those through ordinary member
   management, then refresh and require a ready checked preview with no blocker.
2. Approve committing/pushing the prepared cloud workflow/script/tests/runbook
   and core receipt/documentation. The cloud input `project_merges_enabled`
   defaults to preserve and accepts only preserve/true/false. Its tests first
   reproduced five failures, then all 29 deployment and three image tests pass.
   The patch is local only. Publish it, retain immutable source provenance, then
   activate using normal `deploy-hosted-stack.yml`, exact released core source,
   `deploy_assets=false`, `mcp_caddy_gate=preserve`, and explicit true selection.
3. Before activation/apply, create and verify a fresh DebugBundle database backup;
   recheck participants, ledger/guards, compatible images, SDK cache/CORS/signing
   and MCP routing. Wait out predecessor cache lifetime. No hand-edited hosted env.
4. Retain the fresh ready request/digest and fixed idempotency key
   `debugbundle-owner-three-projects-20261104-v1`. Apply once; unknown transport
   outcomes require status by the same key. Verify/resume committed work; never
   attempt an unmerge, destructive schema reversal or pre-contract rollback.
5. Approve adoption limited to `/Users/owenfar/Developer/debugbundle` and its
   `site` clone, plus the prepared cloud deployment control. The receipt-based
   helper must preview before apply. Core local profile names api/worker/web do
   not match retained runtime inputs and cli/mcp have no cloud service, so expect
   `adoption_service_mapping_required` and use an explicit reviewed metadata-only
   profile update preserving those names, dependencies, custom data and caches.
   Site and cloud have no existing scaffold; do not run setup or create tokens.
   Preserve deployed input names, existing credentials and existing build secrets.
6. Approve at most one tagged synthetic exception per API/Worker/App/Site from
   their actual runtimes, including bounded unauthenticated App/Site browser
   canaries. Preserve unrelated incident evidence and delivery scopes. Check old
   tokens/links, unchanged historical artifact bytes, correct canonical/legacy
   scope, services/environments, queues, health, monitoring and notification
   histories. No integration test sends/retries, credential rotation or new
   cross-product instrumentation is included. No frontend source or asset
   deployment is currently required because retained credentials/input names work.

Server consolidation, authorised repository adoption and deployed-runtime
verification are all **pending**. Stop on new blockers; never force a plan ready.
