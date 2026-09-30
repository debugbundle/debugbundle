# @debugbundle/cli

Command-line interface for DebugBundle.

## Installation

```sh
npm install -g @debugbundle/cli
```

Supported Node.js versions: 22.x through 26.x.

An unreadable response, connection loss, or server error during an
incident/improvement lifecycle write reports `mutation_outcome_unconfirmed`.
JSON output includes `outcome: "unknown"` and `retry_safe: false`; exit code 1
means confirmation is unavailable, not that the write failed. Check the current
state with a read before retrying. The CLI does not automatically repeat writes.
A confirmed cloud result remains successful if only the local cache update fails;
the incident carries `cache_warning: "cloud_cache_update_unavailable"`.
`doctor` exits 1 when its report contains errors; warning-only reports still
exit 0. `doctor --auth-file <path>` can check an explicit saved login.

Check the installed CLI version with `debugbundle --version` or `debugbundle -v`.

Or install it as a project development dependency:

```sh
npm install --save-dev @debugbundle/cli
```

## Quick start

```sh
debugbundle setup --non-interactive
debugbundle doctor --privacy
debugbundle verify local
debugbundle verify cloud --project-id <id> --trigger-5xx
debugbundle verify cloud --project-id <id> --trigger-4xx 403
debugbundle process
debugbundle incidents
debugbundle explain <incident-id> --source cloud
```

## Agent-aware setup

```sh
debugbundle setup --agent codex --agent claude-code --agent gemini-cli --agent muse-code --non-interactive
debugbundle doctor --json
debugbundle validate --fix --json
```

Interactive setup offers detected agents as defaults. Repeat `--agent` to select integrations explicitly; JSON/non-interactive runs never prompt or infer new agents. Saved selections are reused. Codex, Gemini CLI, and Muse Code discover `.agents/skills/debugbundle/` directly. Claude Code receives a relative link under `.claude/skills/debugbundle/`, with an owned copy fallback when links are unavailable. Only selected native instruction files are managed; existing references/imports are preserved.

Keep `.debugbundle/agent-setup.json` with the canonical skill. It stores ownership hashes and selection, without credentials. Doctor and validate report canonical health separately from native discovery. Repair refreshes unchanged generated artifacts and preserves user edits for manual review. Repeated setup preserves the reviewed profile and cloud connection. Unknown legacy files are retained; exact known 1.10.0 templates can upgrade safely.

`debugbundle setup --agent none --non-interactive` removes only unchanged owned native integrations while retaining the canonical skill and configuration. Edited conflicts remain and require review. A stale `.debugbundle/agent-setup.lock` may be removed only after confirming no setup/repair is running.

Muse Code uses `--agent muse-code` (the agent executable is `muse`). It respects Muse's existing instruction precedence, creates `AGENTS.md` only when no supported instruction file exists, and shares owned blocks safely with other agents. Detection uses `.muse` project evidence; `AGENTS.md` alone does not select Muse. Trust the repository in Muse before expecting project skills to load, then check with `muse skills list --source project --json`.

Portable plugin skills complement the project's profile and workflows. Setup does not install plugins, configure MCP, or change authentication. Project plugin settings are hints; doctor does not prove a running agent loaded the skill. Restart/reload the agent after setup. See [the full contract and rollback guidance](https://github.com/debugbundle/debugbundle/blob/main/spec/agent-aware-cli-setup.md).

## Configuration

The CLI reads local project configuration from `.debugbundle/` and can use member-token authentication for connected cloud operations. Use `debugbundle connect` to configure cloud access, or pass `--auth-file` to commands that support explicit auth state.

## AnalyticsBundle

Analytics commands require connected member authentication and a project with AnalyticsBundle enabled. They query aggregate rollups or request an asynchronous analysis artifact; they do not read raw analytics events.

```sh
debugbundle analytics summary --project <project-id> --last 7d
debugbundle analytics devices --project <project-id> --last 7d
debugbundle analytics journeys --project <project-id> --last 7d
debugbundle analytics opportunities --project <project-id>
debugbundle analytics opportunities --all-projects
debugbundle analytics bundle create --project <project-id> --kind journey_friction --last 7d
debugbundle analytics bundle list --project <project-id>
debugbundle analytics bundle list --all-projects
debugbundle analytics saved-funnels list --project <project-id>
debugbundle analytics saved-funnels create --project <project-id> --key signup --name "Signup" --steps-json '[{"step_key":"landing","display_name":"Landing"},{"step_key":"complete","display_name":"Complete"}]'
```

Use `debugbundle analytics settings get --project <project-id>` to inspect availability and capture/retention settings. Owners and admins can enable it with `debugbundle analytics settings set --project <project-id> --enabled true`; Team projects can additionally manage approved custom dimensions. Saved funnels are reusable project definitions, not per-visit bundles; members can list them and owners/admins can create, update, or archive them. Active V1 saved funnels and new V2 project reports share the lower tier/project saved-report cap. Project tokens remain SDK-ingestion-only and cannot read analytics.

The local semantic-analytics candidate adds space metadata management through `analytics spaces list --organization <uuid>`, `get <uuid>`, `preview [--space <uuid>] --change-json <json>`, and `apply` with the same change and `--preview-hash <hash>`. Omit `--space` only for creation. A change is `{ "action": "save", "mutation": { "organization_id": "<uuid>", "display_name": "Product", "mode": "portfolio", "expected_revision": 0, "idempotency_key": "<uuid>", "project_ids": ["<uuid>"] } }`; archive uses action `archive` and only organization, current revision and idempotency key in its mutation. Inspect preview before apply; a stale revision requires a new review. Reads require every source, and changes require the owning organization owner plus management access to every source. Archive releases membership without deleting projects. These commands do not activate V2 capture or connected identity. See [the control contract](../../contracts/analytics-semantic-control.md) for limits, response schemas and availability boundaries.

The same local candidate adds `analytics writers list --project <uuid>`, `preview --project <uuid> --change-json <json>` and `apply --project <uuid> --change-json <json> --preview-hash <hash>`. A create change is `{ "action": "create", "mutation": { "kind": "server", "display_name": "Billing worker", "expires_in_days": 30, "expected_revision": 0, "idempotency_key": "<uuid>" } }`; use `kind: "relay"` only for a browser relay. A revoke change uses `action: "revoke"` with `writer_id`, current positive `expected_revision` and a new `idempotency_key`. Preview is read-only. Apply rechecks project owner/admin access and returns a new write-only credential once; keep the output private. Replaying a create returns `secret_unavailable` and never recovers the credential. Listing returns active metadata only. These credentials are not yet accepted by V2 ingestion in this unfinished phase.

The project-owner identity namespace candidate adds `analytics identity-namespace get --project <uuid>`, `preview --project <uuid> --change-json '<json>'`, and `apply` with the same change plus `--preview-hash <hash>`. Configure uses `{ "action": "configure", "expected_revision": 0, "idempotency_key": "<uuid>", "key_fingerprint": "sha256:<64 lowercase hex>" }`; revoke omits the fingerprint and uses the current revision. The customer HMAC key stays on the backend and must never be passed to DebugBundle. Preview is read-only and shows whether existing contexts are fenced; apply rechecks the reviewed content and current owner authority. These commands currently receive `503` from default API composition and do not enable V2 identity capture.

Project owners/admins can manage local semantic declarations with `analytics plan get --project <uuid>`, `validate --project <uuid> --plan-json '<json>'`, `preview` with the same plan, then `apply --project <uuid> --plan-json '<same json>' --preview-hash <hash>`. The strict plan JSON includes a matching project scope, `expected_revision`, UUID `idempotency_key`, `enforcement: "strict"`, catalog entries and report definitions, plus optional `business_measurement_enabled` (omission means false). This project-only grant appears in preview and requires the reviewed apply; a catalog entry or server writer alone cannot authorize business events. Validation returns fixed issues without captured values; preview has no write and shows a report diff, catalog revision and shared saved-report capacity. Apply rechecks current access, catalog state and capacity, and starts changed report revisions prospectively. `get --json` additionally returns bounded retained observation counts and first/last observation dates for current catalog entry revisions and producers. Separate `producer_observations` rows show submitted SDK name/version with a `producer_observations_truncated` flag at the 300-row read cap; old producer totals are not backfilled into that list. Plain output shows the number of observed producer rows. An observation proves durable processing, not package authenticity, business success verification or a complete growth report. The local candidate `analytics reports query --project <uuid> --report-key <key> --from <ISO timestamp> --to <ISO timestamp> [--json]` reads only a current project ordered-funnel definition, returns partial or unavailable quality with unverified source coverage, and is disabled in default API composition. V2 SDK capture and complete growth reports remain unavailable. These commands are local candidates, not released interfaces.

Space owners can use `analytics space-plan get --space <uuid>`, `validate --space <uuid> --plan-json '<json>'`, `preview` with the same plan, then `apply --space <uuid> --plan-json '<same json>' --preview-hash <hash>`. The API rechecks current membership, source access and every source catalog revision. At this stage only zero-report declarations can be applied; a valid report definition is still rejected at preview with `analytics_space_plan_mode_unavailable`. No space report or capture becomes available.

The local ordered-funnel report JSON separates unprojected `pending_events`, its `failed_events` subset, retained `lost_events`, and current-authority `excluded_events`. A failed worker job with retained raw input is not counted as a completed fact or silently called lost. Plain CLI output includes the failed count; the default report gate remains disabled.

`analytics jobs retry --project <uuid> --event <uuid> [--json]` requests one owner/admin retry of a failed semantic worker job while its exact accepted raw receipt is active. At most three explicit retries are permitted. A queued response is asynchronous and does not guarantee projection; the default recovery service returns `503 analytics_job_recovery_unavailable` until the remaining quality gates pass.

The ordered-funnel query also accepts `analytics reports query --project <uuid> --report-key <key> --last 7d|30d|90d [--json]`. Use either `--last` or both `--from` and `--to`; they cannot be combined. Relative windows use PostgreSQL time and return `analytics_report_insufficient_history` if the requested start precedes the definition's `available_from`.

The local `analytics erasures status --project <uuid> --task <uuid> [--json]` command reads an asynchronous project subject-erasure task with current owner/admin authority. It returns task and project IDs, cutoff, pending/complete status and completion time without a subject reference. The default API composition returns `503 analytics_identity_unavailable`; requesting erasure still requires the separately authenticated relay writer route.

## Documentation

Full CLI documentation: https://debugbundle.com/docs/cli

## License

Apache-2.0
