# @debugbundle/openclaw-plugin

## Local artifact safety in 1.19.4

Retained bundle and reproduction paths must stay in their canonical local artifact
directories. Unsafe metadata returns `invalid_local_artifact_path` without reading,
rewriting or deleting unrelated files. Symlinked files/directories fail closed.
Normal local stores and their existing size allowance are preserved; local state
and processing writes use guarded atomic replacement. This supersedes earlier clients.

## Cloud cache safety in 1.19.3

Upgrade to 1.19.3 for incident-ID validation before cloud requests and cache writes.
Unsafe IDs return `invalid_incident_id`; UUIDs and existing opaque IDs remain supported.
Cloud cache reads, writes and retention reject symbolic links; writes use guarded
atomic replacement. This corrects a path traversal present in earlier clients.

## Installation guidance in 1.19.2

Prefer one project per system across service repositories, reuse existing connections, and keep separate projects for different access or privacy policies. Inspect existing projects before first-time connect; name matching does not infer system membership.

## Local correlation safety in 1.19.1

Trace correlation crosses services only within the same project and environment.
If an older cache contains mixed retained source events, reads and incremental
processing fail with `local_incident_scope_mismatch`. Preserve the local store,
then explicitly rebuild from its retained event files using
`debugbundle process --preset <minimal|balanced|investigative>` with the desired
capture preset. This rebuild regenerates local incident/artifact state; it does
not change cloud records or the retained event files.

## Project/service consolidation 1.19.1

Add logical service context and checked project-merge preview, apply, status,
verification, resume and cancellation. Existing identities, credentials and
restricted scopes remain compatible. Merge apply requires a qualified compatible
core 1.21.0 runtime and remains disabled by default.

Connected `doctor` diagnostics check API health and saved access-token authentication with a one-incident probe restricted to `cloud_project_id`. Missing or blank connected project scope fails before any request. Incident contents are discarded and are not included in the report. Local-only diagnostics make no cloud request.

OpenClaw tools for runtime error reporting, crash reporting, incident response, live app monitoring, endpoint health checks, debug bundles, and product analytics. Monitoring is scoped to runtime failures, customer-facing incidents, and endpoint health; DebugBundle is not a generic infrastructure-monitoring platform.

## Corrective update 1.18.3

This update fixes native ESM loading of the bundled HTTP client and preserves the
connected project's filter on incident requests and pagination. It retains the
existing tool catalog, authentication and native per-call approval policy.

ClawHub recovered unchanged versions 1.18.0 and 1.18.1, but reported these separate
runtime and scope defects in [issue #4214](https://github.com/openclaw/clawhub/issues/4214#issuecomment-6588056002).
Published artifacts remain immutable; corrective release acceptance still requires
exact-version security review and verification in an installed OpenClaw host.

## Install

Requires OpenClaw 2026.6.9 or newer, the supported host baseline for native plugin approvals. Upgrade older hosts before installing the corrective release.

```bash
openclaw plugins install clawhub:@debugbundle/openclaw-plugin
```

Current OpenClaw hosts ask third-party plugin operators to review declared
capabilities. For noninteractive installation, review this plugin's tool catalog
and approval policy first, then repeat the same ClawHub command with
`--accept-capabilities` if requested. Capability consent does not bypass install
security policy or grant approval for individual optional tool calls. Normal
ClawHub installs do not need the local-source `--force` acknowledgement. See
[OpenClaw capability consent](https://docs.openclaw.ai/plugins/manage-plugins#capability-consent).

## Authentication

The plugin reuses the same auth precedence as the DebugBundle MCP server:

- Explicit `bearerToken` tool input when the user provides one.
- `DEBUGBUNDLE_MEMBER_TOKEN` in the OpenClaw plugin runtime environment.
- Existing DebugBundle CLI auth state from `debugbundle login`.

Use `DEBUGBUNDLE_API_URL` for self-hosted or non-production API hosts.

In a connected workspace, incident lists default to `cloud_project_id` from
`.debugbundle/local/connection.json`, including `source: "cloud"` and all cloud
pages. An explicit `projectId` selects that project instead. Local evidence keeps
its existing selection. A missing or empty connected cloud project returns
`invalid_local_connection_config` before making an incident-list request; supply
the intended `projectId` explicitly or repair the connection. Outside a connected
workspace, authenticated account-wide incident listings remain available.

`make openclaw-plugin-check` now imports the emitted ESM with native Node and
executes a synthetic loopback read, in addition to manifest validation.
`make openclaw-runtime-check` repeats that proof across Node 22, 24 and 26. These
checks do not contact production or publish packages.
`make openclaw-installed-check` packs the candidate, installs a fresh pinned
OpenClaw host in Docker, uses the normal plugin installer and verifies runtime
loading plus scoped requests from the installed artifact.

## Tools

The plugin exposes the DebugBundle MCP tool catalog with a `debugbundle_` prefix. For example:

- `debugbundle_list_incidents`
- `debugbundle_get_incident_context`
- `debugbundle_get_bundle`
- `debugbundle_get_reproduction`
- `debugbundle_resolve_incident`
- `debugbundle_list_analytics_flows`
- `debugbundle_save_analytics_flow`
- `debugbundle_archive_analytics_flow`
- `debugbundle_get_analytics_flow_report`
- `debugbundle_get_usage_summary`
- `debugbundle_get_funnel_analysis`
- `debugbundle_list_analytics_journey_samples`
- `debugbundle_generate_analytics_bundle`
- `debugbundle_activate_probe`
- `debugbundle_list_health_checks`
- `debugbundle_get_public_status_page`
- `debugbundle_list_public_status_page_options`
- `debugbundle_save_public_status_page`
- `debugbundle_preview_public_status_page`

Public status publication requires the project owner's access-token authentication and
explicit check selection. The save tool is an optional mutation: publish or
unpublish only on the owner's instruction. Selected names and aggregate health
become public; endpoint URLs and diagnostics remain private.

For product-usage questions, start with aggregate reads such as `debugbundle_get_usage_summary`, then narrow to routes, actions, funnels, or bounded journey samples. Generate an analytics bundle only when a specific analysis question needs a durable artifact; DebugBundle does not create one per visit.

The prepared candidate also provides `debugbundle_get_analytics_filter_options`
for observed choices within an authorised project, time window and scope. It uses
no generation quota. It remains optional under the existing new-tool policy;
enable it explicitly when configuring this capability. Requires a compatible API.

Mutation tools are marked optional in OpenClaw metadata and should be explicitly allowlisted by the operator before use. Analytics bundle generation, settings updates, and saved-funnel create/update/archive operations are mutations. Read the current analytics settings and funnel definitions first, explain the intended change, and proceed only when the user asks.

This is a full DebugBundle integration, including optional administration tools for project deletion, billing/trials/capacity, membership, project/member/agent token creation and revocation, alert signing-secret rotation, webhook/Slack/GitHub automation, capture rules, probes, and public status publication. Those tools are disabled by default. Allow only the specific tools needed; allowing the entire `debugbundle` plugin enables all its optional tools. New capabilities default to optional until reviewed.

After opt-in, every optional tool also requests native OpenClaw approval for the current call. Denial, timeout, cancellation, or an unavailable approval route prevents execution. Configure an approval-capable OpenClaw client or `approvals.plugin` route; no persistent approval is granted. Approval text contains the tool name, never token values or raw input payloads. See [OpenClaw plugin permission requests](https://docs.openclaw.ai/plugins/plugin-permission-requests).

Local evidence tools may read/write `.debugbundle` artifacts and caches. Authentication reads the configured DebugBundle credential environment variable or the existing `~/.debugbundle/auth.json` file only for the documented API workflow. The plugin has no bundled instruction skill; the portable ClawHub `debugbundle` skill is a separate distribution.

Release acceptance requires the exact published skill and plugin versions to have completed, clean ClawHub security outcomes. Pending, missing, blocked, or Review outcomes fail acceptance. Scanner details remain in the release report even when ClawHub's final review determines that a heuristic finding is benign. For example, the bearer/basic-token redaction regular expression is a sanitizer, not an embedded credential; authenticated API calls intentionally combine credential reads and network access. Do not remove redaction or disguise authentication to suppress scanner warnings.

Use access-token authentication for analytics reads and management. Project tokens remain write-only SDK ingestion credentials. Keep analytics requests privacy-safe: do not request raw form values, raw click text, credentials, direct identifiers, or high-cardinality custom values.

## Documentation

Full DebugBundle MCP and agent workflow documentation:

- https://debugbundle.com/docs/mcp
- https://debugbundle.com/docs/mcp/workflows
- https://debugbundle.com/docs/analytics

## License

Apache-2.0.
