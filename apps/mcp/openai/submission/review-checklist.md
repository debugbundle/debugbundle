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
- [x] Immutable API image is deployed on the existing host at digest `sha256:ba3194f4e22902f90034fdb14d88eb624b62dd594371759af0eff314847be2e5`.
- [x] DNS/TLS, managed Caddy dual-host promotion, the MCP-only gate, monitoring, retention, and outside-network readiness checks pass.
- [ ] Representative capacity/load and shared-runtime rollback evidence passes against the immutable candidate.

## Reviewer and client

- [x] Synthetic fixed reviewer identity/tenant fixture and rate-limited credential backend exist locally.
- [x] Owner-approved consent/reviewer UI is implemented and covered by automated interaction and accessibility-state tests.
- [x] Opt-in development-only synthetic preview covers the frozen UI state matrix, all 64 scope subsets, and 390/768/1280 px iframe viewports without OAuth or customer-state requests.
- [x] Owner manual visual validation of the consent, reviewer, and connection-management surfaces passes at mobile, tablet, and desktop widths.
- [ ] Consent, reviewer, and connection-management surfaces pass keyboard and screen-reader validation.
- [ ] Time-bounded reviewer credential is provisioned outside source control and outside-network smoke passes without MFA/email/SMS/private networking.
- [x] ChatGPT Developer Mode registered the production endpoint, the owner reconnected successfully, and the real non-secret `.app.json` mapping is captured for local testing only.
- [ ] MCP Inspector and the remaining ChatGPT/Codex retained corpus pass against production.
- [x] The validated personal Codex package is installed and enabled through the supported cachebuster/reinstall workflow.
- [x] Fresh-thread Codex discovery and the aggregate product-analytics corpus case pass.
- [x] The owner-client endpoint-health case passes its primary read-only sequence with a sanitized URL, recent results, daily rollups, bounded linked-incident context, and no endpoint mutation or raw-log access.
- [x] Older health-result pagination passes with the exact opaque `next_cursor` against hosted run `33868241338`. After the 10:55 UTC failure exposed the order-sensitive comparison, the structural-equality correction was deployed at API/worker digest `sha256:990f8fe5bb1ddac48d9edf30174586f4d21d07d67ba9643b9c81c4e557e64c48`. At 12:05 UTC on 2026-09-04, the owner repeated the same project/check/lookback/limit request: page one returned two HTTP `200` results and cursor `eyJvZmZzZXQiOjJ9`; page two returned the next two HTTP `200` results and cursor `eyJvZmZzZXQiOjR9`. Metadata-only production telemetry independently recorded both tool calls as admitted successes without timeout or cancellation.
- [x] The owner-client improvement inventory preserves an explicit empty result. At 12:28 UTC on 2026-09-04, a DebugBundle API request returned `improvements: []` with `next_cursor: null`; ChatGPT did not broaden to another project, inspect any artifact, or claim a mutation. Metadata-only production telemetry recorded one admitted successful `list_improvements` call in 28 ms within `le_4_kib`, without timeout or cancellation.
- [x] The negative mutation-request case preserves the read-only boundary. At 12:54 UTC on 2026-09-04, ChatGPT stated that no authorized incident-resolution or health-check-deletion action existed and that it made no changes. The bounded 12:50-12:56:30 UTC production telemetry window contained zero `openai_mcp_request` events, independently confirming that the refusal made no hidden read call or mutation attempt; no `debugbundle-*` alarm was active in either hosted region.

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
