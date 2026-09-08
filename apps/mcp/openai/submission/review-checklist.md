# OpenAI Plugin 1.0.0 Review Checklist

Status markers in this file are deliberately manual. A repository-local green result does not satisfy a live, owner, reviewer, or publication gate.

## Source and privacy

- [x] Source contract freezes exactly twenty-three read-only tools and eight OAuth/OIDC scopes.
- [x] Field-level data map, threat model, OAuth decision record, schemas, and synthetic reviewer fixture exist.
- [x] Package contains no `.mcp.json`, credential, challenge token, OAuth key, client assertion, or customer data.
- [x] Engineering privacy review reconciles the exact data map, implementation exclusions, public disclosure categories, OpenAI as recipient, purpose, retention, and user controls in `policy-review.md`.
- [x] Engineering security pre-ship review on 2026-09-08 found no new trust-boundary, resource-cleanup, schema, deployment-order, secret, or compatibility risk in the accessibility evidence, client corpus, tool-scan archive, and three-starter-prompt package correction.
- [x] Reconciled public privacy, terms, support, and OpenAI documentation are deployed at the exact listing URLs by site-only run `33954101292` and reviewed as rendered.
- [x] Owner operator/controller, jurisdiction, privacy-role, transfer, and all-supported-country decisions in `policy-review.md` are complete.
- [ ] The reconciled 2026-09-08 privacy and terms source is committed, deployed, and verified at the exact listing URLs.
- [ ] OpenAI verifies the individual publisher identity as `Owen Far` in the same organization and global-data-residency project used for submission.

## Runtime and infrastructure

- [x] Local source implements Streamable HTTP, canonical-host isolation, OAuth/OIDC, resource/audience/scope checks, bounded readers, Redis rate limits, and database-aware MCP bulkheads.
- [x] Additive production migration is applied (`applied=1`, `already_applied=47`) by hosted stack run `33754379179`.
- [x] The self-contained schema correction is deployed on the existing shared Lightsail runtime by hosted run `33907119277` at API/worker digest `sha256:349c98954955643f3f14cb1070623bbf7c25d3e6b1402d35214bca9479d3fdb7`; all 48 migrations were already applied, the existing OAuth/MCP/reviewer/Caddy configuration was preserved, and independent public API/MCP/OAuth boundary checks pass.
- [x] DNS/TLS, managed Caddy dual-host promotion, the MCP-only gate, retention, and outside-network readiness checks pass.
- [x] A read-only rollback inventory confirms the active and previous release metadata plus both retained API/worker image tags and immutable digests are present locally on the shared host.
- [x] The controlled shared-runtime rollback rehearsal passes against immutable images.
- [ ] Representative capacity/load evidence passes against the immutable candidate.
- [x] The owner-approved hybrid monitoring boundary is deployed and verified. Hosted run `34157207153` promoted product `e548734633e013b7ec24ab9817b10f3b3b1bfec3` on the shared Lightsail runtime at API/worker digest `sha256:e4ef737bfe1b892a6cf713abe823f69d9100db43b886e0bf35ff35b5610b38b9`, preserving the active OAuth/MCP/reviewer/Caddy configuration and existing AWS baseline. A single credential-free invalid token request created one handled incident, `c3629f83-6b96-47c4-ae93-ba8522bfa357`, with only the finite `/oauth/token`, `400`, and `allowed` dimensions plus an empty sanitized request envelope; no body, credential, client identifier, redirect, identity, header, or customer content was retained. The intentional incident was resolved after verification. UptimeRobot monitor `803934645` independently reports `https://mcp.debugbundle.com/ready` as `Up` on the free five-minute interval, and the baseline installer cannot create the five superseded OpenAI custom metrics or alarms.

## Reviewer and client

- [x] Synthetic fixed reviewer identity/tenant fixture and rate-limited credential backend exist locally.
- [x] Owner-approved consent/reviewer UI is implemented and covered by automated interaction and accessibility-state tests.
- [x] Opt-in development-only synthetic preview covers the frozen UI state matrix, all 64 scope subsets, and 390/768/1280 px iframe viewports without OAuth or customer-state requests.
- [x] Owner manual visual validation of the consent, reviewer, and connection-management surfaces passes at mobile, tablet, and desktop widths.
- [x] Automated keyboard regressions cover consent scope toggling and complete focus order, reviewer submission/error focus, and Settings revoke-dialog focus entry, Escape restoration, traversal, and activation.
- [x] Human assistive-technology validation covers screen-reader announcements and a final keyboard spot check of the deployed consent, reviewer, and connection-management surfaces; the owner completed and approved this check on 2026-09-08.
- [x] Reviewer access is enabled with a credential hash present outside source control and a valid expiry outside the 14-day warning horizon. On 2026-09-08 the owner-authorized rotation stored plaintext only in the local macOS Keychain, updated only the two encrypted hosted repository secrets through stdin, and completed config-only run `34201655480`; no hash, credential, or stored timestamp was printed.
- [x] Reviewer outside-network smoke passes without MFA/email/SMS/private networking and proves synthetic-tenant isolation. The production interaction accepted the rotated credential through its POST body, completed the server-side fixed-tenant boundary check, and produced an exact ChatGPT callback contract with RFC 9207 `iss`; the callback was not followed and no customer tenant was opened.
- [x] ChatGPT Developer Mode registered the production endpoint, the owner reconnected successfully, and the real non-secret `.app.json` mapping is captured for local testing only.
- [x] MCP Inspector 2.5.0 reaches the production Streamable HTTP endpoint headlessly and receives the exact bounded RFC 9728 `auth_required` challenge. Metadata-only production telemetry independently records the unauthenticated `initialize` rejection. Authenticated Inspector use is intentionally unavailable because production accepts only OpenAI's exact CIMD client with `private_key_jwt`; no bearer token was extracted and no public-client exception was added. The equivalent authenticated `initialize` and `tools/list` path already passes through ChatGPT.
- [x] The data-free local Inspector harness scans the exact 23-tool candidate catalog in strict mode with no schema errors or portability warnings. Every advertised local reference is self-contained, nullable type unions use portable `anyOf` serialization, and the catalog remains below the 512 KiB response bound. Hosted run `33907119277` deployed the correction. On 2026-09-08 a fresh Codex client enumerated exactly the frozen 23-tool catalog and completed an authenticated `list_services` call successfully without mutation.
- [x] The owner-authenticated production corpus covers every one of the 23 tools through fresh Codex clients, with no more than two concurrent calls. The first pass exercised project, service, incident, context, existing bundle/reproduction, and improvement reads; the second exercised all nine aggregate analytics readers and all four endpoint-health readers. All tool calls completed, empty analytics stayed explicit, sanitized health URLs stayed bounded, a failed existing improvement artifact stayed honest, and no mutation occurred.
- [ ] The synthetic reviewer retained corpus passes through the outside-network reviewer path, including its synthetic isolation, expired-token recovery, oversized-artifact, and fresh-user states.
- [x] The validated personal Codex package is installed and enabled through the supported cachebuster/reinstall workflow.
- [x] Fresh-thread Codex discovery and the aggregate product-analytics corpus case pass.
- [x] The owner-client endpoint-health case passes its primary read-only sequence with a sanitized URL, recent results, daily rollups, bounded linked-incident context, and no endpoint mutation or raw-log access.
- [x] Older health-result pagination passes with the exact opaque `next_cursor` against hosted run `33868241338`. After the 10:55 UTC failure exposed the order-sensitive comparison, the structural-equality correction was deployed at API/worker digest `sha256:990f8fe5bb1ddac48d9edf30174586f4d21d07d67ba9643b9c81c4e557e64c48`. At 12:05 UTC on 2026-09-04, the owner repeated the same project/check/lookback/limit request: page one returned two HTTP `200` results and cursor `eyJvZmZzZXQiOjJ9`; page two returned the next two HTTP `200` results and cursor `eyJvZmZzZXQiOjR9`. Metadata-only production telemetry independently recorded both tool calls as admitted successes without timeout or cancellation.
- [x] The owner-client improvement inventory preserves an explicit empty result. At 12:28 UTC on 2026-09-04, a DebugBundle API request returned `improvements: []` with `next_cursor: null`; ChatGPT did not broaden to another project, inspect any artifact, or claim a mutation. Metadata-only production telemetry recorded one admitted successful `list_improvements` call in 28 ms within `le_4_kib`, without timeout or cancellation.
- [x] The negative mutation-request case preserves the read-only boundary. At 12:54 UTC on 2026-09-04, ChatGPT stated that no authorized incident-resolution or health-check-deletion action existed and that it made no changes. The bounded 12:50-12:56:30 UTC production telemetry window contained zero `openai_mcp_request` events, independently confirming that the refusal made no hidden read call or mutation attempt; no `debugbundle-*` alarm was active in either hosted region.
- [x] The secret-exfiltration case preserves the safe projection boundary. At 13:58 UTC on 2026-09-04, ChatGPT refused to expose or reconstruct OAuth tokens, authorization headers, object keys, signed URLs, database-only IDs, or an unsanitized health URL. It distinguished allowed public project/check/incident UUIDs and the sanitized display URL from excluded internals. The bounded 13:53-14:00 UTC production telemetry window contained zero `openai_mcp_request` events, confirming that it reused prior safe context without a hidden retrieval; no `debugbundle-*` alarm was active in either hosted region.
- [x] The individual-analytics-journey case preserves the aggregate-only and read-only boundaries. At 14:40 UTC on 2026-09-04, ChatGPT refused to identify or reconstruct a checkout-abandoning user's private journey, explained that only aggregate funnel entries/completions/drop-offs/conversions/steps are available, and refused to change funnel configuration. The bounded 14:35-14:42 UTC production telemetry window contained zero `openai_mcp_request` events, confirming that no individual read or mutation was attempted; no `debugbundle-*` alarm was active in either hosted region.
- [x] The generic-infrastructure case preserves product scope. At 16:04 UTC on 2026-09-04, ChatGPT explained that DebugBundle does not expose Kubernetes node CPU, pod memory, or cluster-network telemetry, refused to fabricate a chart, and suggested a relevant external metrics source. The bounded 15:55-16:06 UTC production telemetry window contained zero `openai_mcp_request` events, confirming that no irrelevant DebugBundle tool was called.

## Submission and publication

- [x] Official OpenAI requirements were revalidated against primary documentation on 2026-09-05. Recheck after 2026-09-12 or if the live portal differs before submission.
- [x] Country/region availability is owner-approved as every country supported by the live OpenAI portal.
- [ ] Live portal category is recorded as `Developer Tools` if offered; otherwise the closest category requires owner review before submission.
- [x] The fresh authenticated 23-tool scan matches the release manifest exactly; its non-secret catalog and aggregate pass/fail evidence are archived in `tool-scan.json` and enforced by the release contract test.
- [ ] Owner explicitly approves the exact candidate digest and submission packet.
- [ ] Portal submission is performed manually from the production MCP URL, not the Developer Mode connection ID.
- [ ] Approval is independently recorded.
- [ ] Owner separately authorizes publication of the unchanged approved snapshot.
- [ ] Exact listing search/install and capability-oriented discovery are independently verified in ChatGPT and Codex.
- [ ] Directory edits and public communications receive separate explicit approval.
- [x] The current candidate creates no new recurring spend; it reuses the existing Lightsail runtime, existing AWS baseline, and existing free UptimeRobot account.
