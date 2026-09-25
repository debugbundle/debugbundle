# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog and this project follows Semantic Versioning once production is reached.

## [Unreleased]

## [1.13.3] - 2026-09-25

### Reliability

- Adopt JavaScript SDK 3.0.2 for API/worker/app dogfooding, including bounded browser lifecycle ownership, canonical direct acknowledgements, shared unload budgets, and bounded retry/flush handling.
- Clarify default SDK redaction and optional application-hook responsibility in browser delivery contracts and documentation.

### Added

- Add a native Gemini CLI extension with the published local-auth MCP server, shared investigation skill, deterministic standalone archive, disposable native smoke, and dedicated setup documentation. Public installation uses the separate `debugbundle/debugbundle-gemini` repository; gallery indexing remains an independently verified gate.

## [1.13.2] - 2026-09-25

### Reliability

- Keep monitor-internal health-check failures as operator signals without changing customer endpoint status, uptime, or incident thresholds; classify wrapped endpoint failures as real checks and aggregate monitor-fault reporting.
- Align the hosted API, worker, and app dogfooding installs with the published JavaScript SDK 3.0.0 release.

## [1.13.1] - 2026-09-25

### Reliability

- Fix the hosted guarded HTTP transport to use Undici's fetch with its matching dispatcher. The previous mixed implementation made health checks and guarded notification sends fail immediately in the Node 24 hosted runtime after the 1.13.0 rollout; private-address and redirect protections remain in place.

### Release tooling

- Use the packed MCP candidate version inside the disposable native Codex smoke while the public Codex plugin remains pinned to the last published MCP release. The corrected MCP and OpenClaw companion candidate is 1.12.1; the failed 1.12.0 tag remains immutable and unpublished.

### Distribution

- Advance the Codex and Claude Code repository plugins and portable ClawHub skill to published MCP 1.12.1, and pin the portable CLI install to published CLI 1.12.0. Existing local-auth and plugin settings remain unchanged.

## [1.13.0] - 2026-09-25

### Added

- Reconstruct bounded redirected Java stack traces before incident creation, so one exception produces one incident while unrelated failures remain separate.
- Add durable, project-scoped alert groups with API, CLI, and MCP inspection and stable group links for direct notifications. Slack, Discord, and alert webhooks coalesce related initial notifications without suppressing distinct failures or escalation.

### Reliability

- Preserve grouped alert delivery ownership and retry state across provider failures without consuming another notification quota or creating duplicate direct sends. Existing lifecycle webhook event identities remain intact.
- Require both additive alert migrations before starting the API or worker; migration and readiness checks fail closed when either is absent.

### Security

- Direct alert, signed lifecycle-webhook, weekly Slack report, connected-Slack test, and availability-check sends now validate the address used by the socket and reject private/reserved destinations and unsafe ports. Alert create/update also rejects unsafe literal targets; webhooks do not follow redirects, while availability checks revalidate each redirect. Previously configured blocked targets remain stored but delivery fails until the owner changes the URL to a direct public endpoint.
- Updated API, CLI, and MCP clients can opt into signed custom alert-webhook creation with `signing: "hmac_sha256_v1"`. The exact JSON body receives a per-rule HMAC-SHA256 signature, with its secret shown only on creation or explicit rotation. Every custom webhook is signed, including legacy rules upgraded atomically before delivery. Legacy clients keep their strict response/body shape until opted in or rotated; an explicit payload-version column and forward migration preserve that boundary without exposing keys in readable config.


## [1.12.0] - 2026-09-23

### Agent interface routing

- All generated and distributed skills share CLI-first routing with explicit user-choice and MCP-only fallbacks. Codex plugin 1.1.0 and Claude Code plugin 1.11.0 use MCP 1.11.0 after registry verification.
- A cross-agent contract and automatic skill parity gate carry this requirement into future Gemini, Muse, and other plugins.

### OpenAI plugin skill

- Plugin candidate 1.0.1 checks the independently authenticated local CLI before reporting an authorized change unavailable, verifies project/record scope, and confirms results after writes. Hosted MCP tools and OAuth permissions remain read-only and unchanged.

### Package distribution

- MCP/OpenClaw 1.11.0 and shared-types/redaction 2.1.0 distribute the additive schemas and evidence behavior. SDK package versions remain unchanged; the shared redaction artifact stays behavior-compatible.

### Added

- Exact browser page visibility, document readiness, target tag and bounded link-attribute capture matchers, with server enforcement that preserves older SDK rule precedence.
- Resource burst alert coalescing with independent per-resource cooldowns, configurable project/recipient email digest windows, and opt-in project cooldowns per immediate-channel rule.
- Low-severity classification and reviewed demotion suggestions for hidden, incomplete speculative link failures; visible and ordinary first-party asset failures retain their existing treatment.
- Correlated failed refresh/retry/signed-URL requests and network breadcrumbs in resource diagnosis, including late context-only 404s that refresh an existing bundle without creating another incident.

### Fixed

- Serialize concurrent cooldown checks before their database read snapshot, retain distinct digest incidents, reject blank lifecycle matchers and malformed recovery methods, and display complete matcher scopes in CLI/dashboard summaries.
- Preserve API-configured digest/cooldown options when dashboard users edit an alert destination.

### CLI agent-aware setup

- CLI 1.11.0 adds explicit/repeatable agent selection and interactive defaults for Codex, Claude Code, and Gemini CLI. One canonical project skill backs native discovery; no separate skill package or installer dependency is added.
- Muse Code is a first-class setup target (`--agent muse-code`), reusing the canonical skill and Muse's native instruction precedence. Shared instruction ownership preserves guidance when another agent remains selected. A pinned, offline native Muse discovery check gates CI and CLI publication.
- Doctor/validate report per-agent discovery; safe repair, exact legacy-template upgrades, copy fallback, and removal use ownership hashes. Repeated setup preserves profiles, cloud connections, user instructions, and edited skills.
- Preserve user gitignore rules on repeat setup, reject unsafe/non-regular or invalid UTF-8 local files, retain unknown copy directories during removal, and return structured JSON diagnostics for malformed local state. The installed-package gate verifies upgrades from published CLI 1.10.0.
- Rollback: remove unchanged native integrations with `setup --agent none` before reverting the CLI if desired. Canonical skills/configuration remain compatible; older setup/repair lacks ownership protection. See `spec/agent-aware-cli-setup.md`.

### Deployment

- Apply additive migration `202609220001_add_browser_recovery_context` before starting the new API/worker. It adds an expiring, project-scoped correlation-reference index and an optional alert burst key; readiness rejects a missing migration. Existing rows, incident fingerprints, Bundle v1 artifacts, signed lifecycle webhook payloads and SDK installs remain compatible.
- Core runtime and site rollout, and independently versioned CLI/MCP/shared-package publication, remain separate release actions. No customer capture rules or historical incident data are changed automatically.

## [1.11.0] - 2026-09-21

### Fixed

- CLI 1.10.0 fixes compressed HTTP/2 response decoding on Node 26.0.0 by pairing fetch with its bundled Undici dispatcher. Existing Node 22–26 support is preserved and exact-version installed-consumer tests cover the regression.
- Incident and improvement lifecycle clients, CLI, and ordinary MCP distinguish unconfirmed mutation outcomes from definite rejections. Malformed success responses, transport loss, and server errors warn against automatic retries and require a read to check current state.
- Confirmed cloud lifecycle mutations remain successful when an optional local cache update fails; CLI/MCP show a fixed cache warning without exposing filesystem errors.
- CLI `doctor` now exits 1 for error reports and retains exit 0 for healthy/warning-only reports. It also accepts `--auth-file`; an invalid response is described as a client validation failure without assuming a cloud outage.

- Claude Code plugin 1.10.0 retains MCP's local-auth profile, allowing saved login and existing member-token settings to satisfy hosted tool authentication without per-call credentials.

### Added

- OpenClaw companion 1.10.0 aligns the bundled MCP release while preserving its default tool and authentication contracts.
- MCP 1.10.0 projects the expanded bounded agent-evidence surface while preserving opt-in `--local-auth`, default MCP schemas, and OpenClaw contracts.
- Add agent-scoped, short-lived, revocable credentials for bounded evidence retrieval without exposing project ingestion tokens or unrestricted member credentials.
- Dedicated Codex developer plugin, repository marketplace, and setup guide using the existing MCP server and authentication.
- Codex package compatibility gates and isolated real-client installation/retrieval verification.

### Changed

- CLI 1.10.0 and agent skill updates explain scoped browser-resource noise handling, context versus drop, protected dependencies and cautious privacy-blocking diagnosis. Existing projects can refresh guidance without rerunning setup or replacing their profile/connection.
- Upgrade hosted dogfooding to the published 2.0.0 shared redaction, Node SDK, and browser SDK packages so local capture and hosted ingestion use the same privacy contract.
- Scrub sensitive values before durable event, analytics, artifact, notification, and runtime-log storage; keep bounded structural diagnostics while preventing raw secret-bearing payloads from reaching agent evidence.
- Add ordered storage migration and mixed-version rollout guards for agent-token support, preserving old API/worker compatibility throughout staged deployment.
- Coordinate MCP/Claude/OpenClaw 1.8.2 and portable skill 1.8.3 distribution. The OpenAI skill retains its read-only boundary; no SDK, bundle schema or hosted runtime upgrade is required.

## [1.10.0] - 2026-09-16

### Changed

- Group concrete browser resource failures across routes, with provider/asset titles and explicit possible-cause diagnosis. Preserve unrelated fingerprints and installed legacy fingerprint rules.
- Add reviewed resource/service/environment noise suggestions, readable resource details, and bounded affected-route evidence in optional Bundle v1 context. Authentication, app assets and unknown dependencies receive no automatic suppression recommendation.
- Add forward migration `202609160001_add_browser_resource_routes` so sampled-out occurrences retain sanitized route metadata. Run migrations before new API/worker code; historical incidents are not merged.
- Publish shared-types/redaction 1.8.0 and CLI 1.9.0 for the additive resource evidence and local grouping behavior. Bundle schema remains v1. Suggestions follow the primary incident resource even when its bundle contains related exceptions.

- Includes the earlier shared-types/redaction 1.7.2 alignment release and automatic SDK capture-filtering contract updates.
- Specify automatic SDK capture filtering and regression coverage for native suppression, logger levels, processor drops and lazy messages.

## [1.9.2] - 2026-09-14

### Fixed

- Route analytics bundle generation through the durable worker queue. Core 1.9.0 and 1.9.1 called an unavailable queue method on every analytics poll, generating repeated worker incidents and preventing analytics bundle jobs from running. The shared worker lane now owns adoption, completion and retry; a failed journal acknowledgement cannot mark a completed analytics generation failed.

## [1.9.1] - 2026-09-14

### Fixed

- Pass `WORKER_START_PAUSED` through environment parsing so hosted candidates wait for activation before processing. Core 1.9.0 failed this promotion guard; use 1.9.1 for the durable worker rollout.

## [1.9.0] - 2026-09-14

### Fixed

- Make worker processing markers and downstream intents transactional through an additive durable job journal; fence retries and keep outbound delivery from blocking incident processing.
- Retain reproduction jobs across missing/invalid input and storage failures until successful generation or bounded retry exhaustion.
- Retry incident/improvement builds when retained context is temporarily unreadable; continue allowing explicitly expired or missing source objects.
- Sanitize browser stack URL credentials/query/fragment before persistence, including older SDK submissions and URLs containing parentheses.
- Bound MCP admission waits and aggregate expected limit pressure without hiding real operational failures.
- Preserve truthful artifact/reproduction availability, canonicalize improvement timestamps, and keep latest detection evidence aligned during delayed arrivals.
- Scope customer deployment attribution to the workload, environment and occurrence time; never substitute the DebugBundle platform release.
- Normalize changing WildFly timer calendar diagnostics with fingerprint v2 while retaining installed v1 exact-match capture rules.

### Added

- Add bounded optional browser source/resource evidence and explicit unavailable reasons to OpenAI incident projections.

## [1.8.0] - 2026-09-12

### Changed

- License the public core, shared libraries, CLI/MCP tools, agent skills, and plugins under Apache-2.0.
- Keep website implementation private while preserving public Apache-2.0 documentation, examples, and generated references.
- Document maintainer ownership of paired code and site documentation changes.

## [1.7.4] - 2026-09-10

### Added

- Added the local-source OpenAI Plugin `1.0.0` candidate: an independently versioned production-debugging and aggregate-analytics skill plus an OAuth-protected, exact twenty-three-tool read-only remote MCP projection, with dedicated no-side-effect readers, sample-free aggregate analytics, bounded privacy projections, owner-approved existing-app consent/reviewer/revocation surfaces, reviewer isolation, deterministic package/eval evidence, and same-Lightsail deployment/monitoring source.

### Changed

- Set the pre-launch Solo price to $4.99 per month, clarified that all paid prices exclude applicable VAT/taxes, and bounded hosted availability monitoring by tier: Free supports one check across up to three monitored projects, Solo supports three checks across up to ten monitored projects, and Team supports ten checks across up to ten monitored projects. Team checks now use a one-minute minimum interval, recommend two consecutive failures, and still allow one-failure alerting for critical endpoints.
- Moved OpenAI connection management below the primary Settings cards and collapsed retained expired/revoked grants into an accessible connection-history disclosure while preserving automatic security retention.

### Security

- Added OAuth/OIDC PKCE, RFC 9207 response issuer, CIMD `private_key_jwt`, resource/audience/scope binding, verified UserInfo, rotation/revocation/retention controls, canonical-host isolation, sanitized health-check URLs, MCP bulkheads, and secret-free structured telemetry for the candidate remote surface.

### Fixed

- Fixed idle worker memory growth caused by completed polls retaining shutdown promise reactions. Poll waits now release resources on timeout or shutdown; frequency snapshot caching is bounded, temporary S3 readiness clients are destroyed, and unused worker HTTP response bodies are released. Added an isolated retained-memory regression gate; no database migration or health-check cadence change is required.
- Prevented preserved health checks paused by a per-project limit after downgrade from consuming organization execution slots and unnecessarily pausing eligible checks in other projects.
- Prevented a revoked OpenAI connection's retained legacy OIDC Grant artifact from causing a server error during reconnection. New Grant artifacts are now indexed for atomic revocation, while legacy rows fail closed against the normalized grant lifecycle until bounded expiry.

The Developer Mode candidate is deployed and registered, but it is not submitted, approved by OpenAI, published, or directory-discoverable. Manual accessibility, reviewer, remaining live-client, portal, publication, communication, and spending gates remain separate.

## [1.7.3] - 2026-08-27

### Fixed

- Added an SDK-identity- and exact-shape-gated ingestion adapter for the legacy runtime-memory object emitted by installed Java SDK releases, preserving strict rejection for unrelated or extended malformed clients while mapping Java heap and JVM facts into the canonical event contract.
- Prepared Java SDK `1.3.1` to emit canonical runtime memory fields and validate `beforeSend` runtime mutations before queueing.
- Restored token-free local and self-host integration startup by pinning the final LocalStack Community image and waiting for infrastructure health before tests begin.

## [1.7.2] - 2026-07-29

### Fixed

- Enforced incident-derived exact-fingerprint capture rules during ingestion by deriving the canonical server fingerprint before rule evaluation, while keeping the normal ingestion path unchanged for projects without fingerprint rules.

## [1.7.1] - 2026-07-29

### Added

- Added an authenticated compatibility path for installed Android/Swift mobile event shapes, canonical mobile event normalization, and indexed ingestion acknowledgement handling across connected SDK transports.
- Added the universal safe `beforeSend` hook and object-wrapped arbitrary probe data across the maintained SDK family.

### Changed

- Expanded standalone SDK release assurance with mandatory per-file coverage across JavaScript, Python, PHP, WordPress, Java, Go, Ruby, .NET, Android, Swift, and React Native TypeScript, Android Java, Swift, and Objective-C++ wrapper sources.
- Published the coordinated Android, Swift, and React Native `1.2.0` lines after React Native clean apps compiled against the published native `1.2` artifacts.
- Published `@debugbundle/shared-types`, `@debugbundle/redaction`, `@debugbundle/sdk-node`, and `@debugbundle/sdk-browser` at `1.6.0`, then pinned core, hosted web, and public-site dogfooding to those exact registry versions.

### Fixed

- Prevented malformed legacy mobile events and partial ingestion acknowledgements from being silently dequeued, and preserved React Native identity, JavaScript error fidelity, capture policy, probes, native configuration, and canonical integer fields across the platform bridge.
- Reworked the deterministic CLI privacy-preview sample so the bundled OpenClaw plugin no longer contains a synthetic bearer-token literal that ClawHub's static scanner mistakes for a hardcoded credential.

## [1.7.0] - 2026-07-17

### Added

- Added the production-ready AnalyticsBundle product lane across browser capture, direct and relay ingestion, aggregate usage/routes/devices/referrers/actions/funnels, retained structured journeys, deterministic opportunities, generated analytics bundles, project/workspace web surfaces, and matching API, CLI, and MCP interfaces.
- Added a bounded Free analytics preview plus fixed tier capabilities for saved funnels, controlled custom dimensions, and hourly retention; paid monthly event, session, retained-journey, and generated-bundle allowances scale with purchased capacity units.
- Documented the AnalyticsBundle release surface across the repository README, CLI and MCP package READMEs, public interface contract, self-host operating guide, and documentation source tree. The release guidance covers aggregate metrics, bounded structured journey evidence, privacy/retention controls, exact incident-impact correlation, migration order, and the leased bounded scheduled evaluator.

### Changed

- Corrected the public semantic-release classification for AnalyticsBundle. Version `1.6.3` remains published for compatibility, but this `1.7.0` release is the canonical backward-compatible minor release for the new product lane and its API, CLI, MCP, OpenClaw, and SDK capabilities.

## [1.6.3] - 2026-07-16

### Changed

- Extended maintained server SDK relays to accept strict credential-free analytics envelopes and attach configured project credentials only on authenticated upstream forwarding, while preserving existing debug relay behavior.
- Added bounded analytics worker scheduling, independent raw/hourly/daily/journey/bundle retention, stable opportunity lifecycle evaluation, deterministic failed-generation retry, and complete opportunity-to-bundle incident/deploy linkage.
- Bumped `@debugbundle/cli` to `1.6.4` for the alert severity lifecycle-scope release.
- Bumped `@debugbundle/mcp` and `@debugbundle/openclaw-plugin` to `1.6.2` for the coordinated MCP alert lifecycle-scope release.
- Added official MCP Registry availability documentation for `com.debugbundle/mcp` and noted the registry listing milestone for the published `@debugbundle/mcp` package.
- Expanded MCP distribution documentation with official package, registry, marketplace, skill, auth-scope, and trust-channel guidance; added PulseMCP and MCP.so discovery checks to the local ecosystem release verifier.
- Bumped `@debugbundle/mcp` and `@debugbundle/openclaw-plugin` to `1.6.1` for the coordinated MCP distribution discovery release.

### Fixed

- Hardened analytics aggregation against session/dimension overcount, incomplete funnel accounting, project-token persistence, auth-state leakage, stale remote settings races, shared browser transport interference, partial quota-claim leakage, duplicate journey/bundle work, incomplete pagination, and API/CLI/MCP filter drift.
- Updated the local MCP ecosystem verifier to prefer the official registry entry matching the release version when registry search returns multiple active versions.

## [1.6.2] - 2026-06-21

### Added

- Added a public managing-noise documentation page plus linked agent-workflow guidance, and updated the CLI local scaffold validation so the new doc and skill-file handling ship together.

### Changed

- Replaced the dashboard and project-overview opened-this-month card with a linked health-status-today card that reuses retained health-check uptime semantics from the main Health Status page, while keeping unset and no-data states explicit.
- Aligned project-settings action rows with the existing product UX by anchoring primary actions to the bottom right and placing secondary actions to their left in the capture-policy, automated-improvement, weekly-report, and destructive-action surfaces.
- Tightened worker availability-capacity dogfood warnings so non-saturated due-check lag stays informational instead of opening false-positive capacity incidents, and bumped `@debugbundle/cli` to `1.6.2` for the coordinated release train.

## [1.6.1] - 2026-06-20

### Changed

- Promoted the hosted dogfooding manifests to `@debugbundle/shared-types@1.4.0`, `@debugbundle/redaction@1.4.0`, `@debugbundle/sdk-node@1.4.0`, and `@debugbundle/sdk-browser@1.4.0` after the coordinated shared and JS SDK release train completed.

## [1.6.0] - 2026-06-20

### Added

- Capture-rule suggestions now surface existing matching project rules and make repeated suggestion application idempotent across API, CLI, MCP, and the hosted web app, so operators do not create duplicate demote/sample/drop rules for the same noisy pattern.
- Added manual project capture-rule creation in the hosted settings UI so owners and admins can define targeted structured matchers without waiting for an incident-derived suggestion first.

### Changed

- Failure and hosted improvement bundles now preserve the originating SDK name and version from the source event instead of stamping worker placeholder metadata, so downstream analysis and fixture artifacts reflect the real capture runtime.
- Bumped the canonical core release to `1.6.0`, `@debugbundle/cli` to `1.6.0`, `@debugbundle/mcp` to `1.6.0`, and the coordinated shared JS packages to `@debugbundle/shared-types@1.4.0` plus `@debugbundle/redaction@1.4.0`.

## [1.5.4] - 2026-06-19

### Added

- Added incident `attention_after` filtering across the hosted retrieval API, CLI retrieval commands, MCP retrieval tools, local retrieval, and the shared retrieval client so dashboard and automation views can page through incidents opened or regressed after a chosen timestamp.

### Changed

- Updated the hosted dashboard incidents-today table to keep the new shared pagination controls while using the existing incidents cursor API in a mixed-version-safe way, so stale local API processes do not fail on the additive `attention_after` filter rollout.
- Bumped the canonical core release to `1.5.4`, `@debugbundle/cli` to `1.5.4`, and `@debugbundle/mcp` to `1.5.4` for the coordinated incident-attention retrieval release train.

## [1.5.3] - 2026-06-19

### Changed

- Exposed linked availability-incident status through the shared health-check response contract so CLI, API, and web clients can distinguish active incidents from resolved ones without breaking existing consumers.
- Updated availability health surfaces to stop treating resolved linked incidents as active, so project health badges and aggregate status counts clear correctly after incident resolution.
- Promoted the hosted dogfooding manifests to `@debugbundle/shared-types@1.3.1`, `@debugbundle/redaction@1.3.1`, `@debugbundle/sdk-node@1.3.1`, and `@debugbundle/sdk-browser@1.3.1` after the coordinated shared and JS SDK release train completed.
- Published the coordinated server-SDK patch line at `debugbundle-python@1.1.2`, `debugbundle/sdk-php@1.1.2`, `debugbundle@1.1.2`, `github.com/debugbundle/debugbundle-go@v1.1.1`, the `com.debugbundle` Java SDK family at `1.1.1`, and the NuGet `DebugBundle.*` package family at `1.1.1`, followed by `debugbundle-wordpress@1.2.3`.

### Fixed

- Normalized hosted ingestion and event normalization to tolerate installed SDK envelope drift while the patched SDK releases move custom app context into envelope `context`, remove legacy request payload extras, and preserve redaction on the canonical event path.

## [1.5.0] - 2026-06-15

### Added

- Added hosted availability checks across API, CLI, MCP, worker scheduling/execution, web project health views, storage, and public contracts, including side-effect-free target tests, retained recent results, and retained daily rollups.

### Changed

- Added the production schema migration, startup migration assertions, tier-capability limits, and SSRF/outbound-request hardening required for the new availability-check path.
- Bumped the canonical core release to `1.5.0`, `@debugbundle/cli` to `1.5.0`, `@debugbundle/mcp` to `1.5.0`, and `@debugbundle/shared-types` plus `@debugbundle/redaction` to `1.3.0` for the coordinated availability-check release train.

## [1.4.0] - 2026-06-11

### Added

- Added incident `first_seen_after` filtering across the hosted retrieval API, CLI retrieval commands, MCP retrieval tools, and the shared retrieval client so automation can scope incident queries to recent windows more precisely.
- Added project incident dashboard metrics for open incidents, regressed incidents, incidents opened today, and incidents opened this month, including the new dashboard incidents-today table and project-listing metric fields.

### Changed

- Updated the hosted web dashboard and project overview surfaces to prioritize current incident health over bundle-volume counters, while preserving the existing project metrics payload as an additive-compatible contract.
- Bumped the canonical core release to `1.4.0`, `@debugbundle/cli` to `1.4.0`, and `@debugbundle/mcp` to `1.4.0` for the coordinated incident-visibility and retrieval-filter release train.

## [1.3.0] - 2026-06-09

### Added

- Added browser-noise capture-rule support for opaque browser events and user-agent-derived bot signals, including richer incident context guidance for repeated low-value frontend noise.
- Added generated skill guidance for capture-rule suggestions and path-scoped client-error capture-policy review so agent workflows can suppress recurring operational noise more safely.

### Changed

- Expanded the browser SDK contract documentation around `beforeSend`, opaque browser failures, and bounded unhandled-rejection reason capture so the release train documents the new JS SDK behavior end to end.
- Bumped `@debugbundle/shared-types` and `@debugbundle/redaction` to `1.2.0`, and `@debugbundle/cli` and `@debugbundle/mcp` to `1.3.0` for the coordinated browser-noise and agent-workflow release train.

## [1.2.0] - 2026-06-08

### Added

- Added explicit client-error incident promotion controls across capture policy, including path-scoped `immediate_client_error_path_rules` for real application routes that should open incidents on selected `4xx` responses without promoting the status globally.

### Changed

- Prevented unpromoted client-error request telemetry from opening normal incidents through hosted ingestion, worker anomaly thresholds, or local `debugbundle process`, while preserving `5xx` handling and explicitly promoted `4xx` behavior.
- Bumped `@debugbundle/shared-types` and `@debugbundle/redaction` to `1.1.0`, `@debugbundle/cli` to `1.2.0`, and `@debugbundle/mcp` to `1.2.0` for the synchronized capture-policy and client-error release train.

## [1.1.1] - 2026-06-06

### Added

- Added hosted bulk incident lifecycle routes for resolve and reopen so one request can update up to 1000 cloud incident ids at once while preserving request order and duplicate-id deduplication.

### Changed

- Updated the web incident inventory, project overview incident actions, CLI retrieval commands, MCP retrieval tools, shared retrieval client, and public reference artifacts so bulk incident resolve/reopen is documented and available across the supported automation surfaces.

## [1.1.0] - 2026-06-04

### Added

- Added no-card 30-day Solo and Team trial onboarding across signup, billing, CLI, MCP, worker lifecycle scheduling, operational email delivery, and public documentation.
- Added trial state visibility to billing interfaces, including remaining-trial-day messaging in the hosted billing UI and normalized trial metadata in the API, CLI, and MCP surfaces.

### Changed

- Strengthened the production migration path for no-card trials with ordered forward migrations, clean-install bootstrap parity, API/worker readiness guards, and self-host deploy guidance that requires migrations before runtime startup.
- Split oversized API, CLI, web, and storage modules as part of the trial slice so the new billing and signup behavior ships without violating repo file-size limits.
- Bumped `@debugbundle/cli` to `1.1.0` and `@debugbundle/mcp` to `1.1.0` for the new trial-management commands, trial-aware billing output, and MCP billing tool additions.

## [1.0.1] - 2026-06-03

### Added

- Alert rules now support notification cooldown suppression across API, CLI, MCP, and the web app without changing incident grouping, including broader notification keys for low-information opaque browser-native `window_error` alerts.
- Browser bundle assembly now consumes inline exception breadcrumbs and preserves additional browser-native opaque error metadata for better failure context.

### Changed

- Worker severity inference now treats opaque browser-native `window_error` captures as `low` and opaque `resource_error` captures as `medium`, while preserving `high` for backend exceptions, non-opaque frontend exceptions, and immediate request-failure incident signals.
- Promoted the core monorepo and hosted web app dogfooding manifests to `@debugbundle/shared-types@1.0.1`, `@debugbundle/redaction@1.0.1`, `@debugbundle/sdk-node@1.0.1`, and `@debugbundle/sdk-browser@1.0.1`.
- Bumped `@debugbundle/cli` to `1.0.3` and `@debugbundle/mcp` to `1.0.2` for the alert cooldown, severity, and MCP registry metadata sync changes in this release train.

## [0.1.3] - 2026-05-22

### Added

- Canonical root-repository GitHub Releases on `v*` tags so the core monorepo now has a public product-level release surface alongside the package-specific CLI, MCP, and shared-package releases.

### Changed

- Defined the root `debugbundle` repository version as the canonical public DebugBundle product release number, while keeping `cli-v*`, `mcp-v*`, and `shared-js-v*` as package-specific distribution tags.

### Security

- Hardened OAuth state validation by switching the GitHub install and web-session callback comparisons to constant-time checks.
- Hardened browser trace propagation matching by dropping caller-provided regular expressions from the allowlist path and allowing string-only matching.

## [0.1.2] - 2026-05-13

### Added

- Interactive CLI auth selection when `debugbundle login` runs without an explicit auth mode, including GitHub auto mode, explicit GitHub device flow, and existing member-token entry.
- Connect-time auth recovery so `debugbundle connect` can prompt for login first when local member auth is missing, then resume automatically after authentication succeeds.

### Changed

- Updated CLI guidance, source-of-truth specs, and public auth/cloud workflow docs to document the new interactive login and connect recovery behavior.

### Fixed

- Cleared remaining repo-wide typecheck and lint blockers in the API, web, worker, and auth test harnesses so the release path is green again.

## [0.1.1] - 2026-05-11

### Changed

- Promoted `request_event` payloads with `response_status >= 500` to incident signals across ingestion, normalization, worker grouping, SDK capture policy, and public contracts.
- Updated the canonical minimal/balanced capture-policy defaults so 5xx request failures are captured by default while non-5xx request events remain context-only unless policy is widened.

### Fixed

- Prevented non-incident signals that reach the worker grouping queue from creating or updating incidents.

## [0.1.0] - 2026-05-07

### Added

- Initial public core repository baseline for `debugbundle/debugbundle`, including the API, worker, CLI, MCP server, web app, self-host tooling, and public-site artifact generation pipeline.
- Stable public release workflows for `@debugbundle/cli`, `@debugbundle/mcp`, and the core-owned shared JavaScript packages, plus the dedicated public-repo export manifest and SDK bootstrap metadata.

### Changed

- Moved JavaScript, Python, and PHP SDK source ownership to dedicated public repositories managed through `sdks.json` and `scripts/bootstrap-sdks.sh` instead of tracked source snapshots in the core repo.
- Moved public-site machine-readable artifact generation into the core-owned `scripts/public-site-artifacts.ts` pipeline so the standalone site repo consumes vendored static artifacts rather than importing core packages.

### Fixed

- Hardened the public core CI/export contract after repository cutover by repairing runtime-start storage fixtures, web-management timing drift, constructor-compatible SES mocks, and the changed-file coverage script's Docker git assumption.
