# OpenAI Plugin 1.0.0 Review Checklist

Status markers in this file are deliberately manual. A repository-local green result does not satisfy a live, owner, reviewer, or publication gate.

## Source and privacy

- [x] Source contract freezes exactly twenty-three read-only tools and eight OAuth/OIDC scopes.
- [x] Field-level data map, threat model, OAuth decision record, schemas, and synthetic reviewer fixture exist.
- [x] Package contains no `.mcp.json`, credential, challenge token, OAuth key, client assertion, or customer data.
- [ ] Owner/privacy/legal review signs off the exact data map and live policies.

## Runtime and infrastructure

- [x] Local source implements Streamable HTTP, canonical-host isolation, OAuth/OIDC, resource/audience/scope checks, bounded readers, Redis rate limits, and database-aware MCP bulkheads.
- [x] Additive production migration is applied (`applied=1`, `already_applied=47`) by hosted stack run `33754379179`.
- [x] The self-contained schema correction is deployed on the existing shared Lightsail runtime by hosted run `33907119277` at API/worker digest `sha256:349c98954955643f3f14cb1070623bbf7c25d3e6b1402d35214bca9479d3fdb7`; all 48 migrations were already applied, the existing OAuth/MCP/reviewer/Caddy configuration was preserved, and independent public API/MCP/OAuth boundary checks pass.
- [x] DNS/TLS, managed Caddy dual-host promotion, the MCP-only gate, retention, and outside-network readiness checks pass.
- [x] A read-only rollback inventory confirms the active and previous release metadata plus both retained API/worker image tags and immutable digests are present locally on the shared host.
- [ ] Representative capacity/load and shared-runtime rollback evidence passes against the immutable candidate.
- [ ] Install the five source-defined OpenAI MCP/OAuth/reviewer CloudWatch metric filters and alarms after explicit recurring-spend approval. A 2026-09-04 read-only inventory found only the seven pre-existing hosted alarms/metric streams in Frankfurt and the primary API health alarm in Virginia; none of the OpenAI-specific filters or alarms is live. Existing alarm checks therefore prove only that the installed baseline alarms are not active.

## Reviewer and client

- [x] Synthetic fixed reviewer identity/tenant fixture and rate-limited credential backend exist locally.
- [x] Owner-approved consent/reviewer UI is implemented and covered by automated interaction and accessibility-state tests.
- [x] Opt-in development-only synthetic preview covers the frozen UI state matrix, all 64 scope subsets, and 390/768/1280 px iframe viewports without OAuth or customer-state requests.
- [x] Owner manual visual validation of the consent, reviewer, and connection-management surfaces passes at mobile, tablet, and desktop widths.
- [ ] Consent, reviewer, and connection-management surfaces pass keyboard and screen-reader validation.
- [x] Reviewer access is enabled with a credential hash present outside source control and a valid expiry outside the 14-day warning horizon; the bounded runtime check exposed no hash or timestamp value.
- [ ] Reviewer outside-network smoke passes without MFA/email/SMS/private networking and proves synthetic-tenant isolation.
- [x] ChatGPT Developer Mode registered the production endpoint, the owner reconnected successfully, and the real non-secret `.app.json` mapping is captured for local testing only.
- [x] MCP Inspector 2.5.0 reaches the production Streamable HTTP endpoint headlessly and receives the exact bounded RFC 9728 `auth_required` challenge. Metadata-only production telemetry independently records the unauthenticated `initialize` rejection. Authenticated Inspector use is intentionally unavailable because production accepts only OpenAI's exact CIMD client with `private_key_jwt`; no bearer token was extracted and no public-client exception was added. The equivalent authenticated `initialize` and `tools/list` path already passes through ChatGPT.
- [x] The data-free local Inspector harness scans the exact 23-tool candidate catalog in strict mode with no schema errors or portability warnings. Every advertised local reference is self-contained, nullable type unions use portable `anyOf` serialization, and the catalog remains below the 512 KiB response bound. Hosted run `33907119277` deployed the correction; post-deploy authenticated catalog refresh remains a separate live-client check.
- [ ] The remaining ChatGPT/Codex retained corpus passes against production.
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

- [ ] Official OpenAI requirements are revalidated against primary documentation within seven days of submission.
- [ ] Live category and country/region availability decisions are recorded and owner-approved.
- [ ] Tool scan matches the release manifest exactly and non-secret scan output is archived.
- [ ] Owner explicitly approves the exact candidate digest and submission packet.
- [ ] Portal submission is performed manually from the production MCP URL, not the Developer Mode connection ID.
- [ ] Approval is independently recorded.
- [ ] Owner separately authorizes publication of the unchanged approved snapshot.
- [ ] Exact listing search/install and capability-oriented discovery are independently verified in ChatGPT and Codex.
- [ ] Directory edits and public communications receive separate explicit approval.
- [ ] No recurring spend is created without explicit owner approval.
