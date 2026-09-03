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
- [x] Immutable API image is deployed on the existing host at digest `sha256:145c958e79c88ce6404419951bad066e0ba84fcf5b9b87f0470942a0bfaa9570`.
- [ ] DNS/TLS/Caddy dual-host promotion, MCP-only gate, monitoring, retention, load, rollback, and outside-network checks pass.

## Reviewer and client

- [x] Synthetic fixed reviewer identity/tenant fixture and rate-limited credential backend exist locally.
- [x] Owner-approved consent/reviewer UI is implemented and covered by automated interaction and accessibility-state tests.
- [x] Opt-in development-only synthetic preview covers the frozen UI state matrix, all 64 scope subsets, and 390/768/1280 px iframe viewports without OAuth or customer-state requests.
- [ ] Consent, reviewer, and connection-management surfaces pass manual visual, keyboard, and screen-reader validation at mobile and desktop widths.
- [ ] Time-bounded reviewer credential is provisioned outside source control and outside-network smoke passes without MFA/email/SMS/private networking.
- [ ] ChatGPT Developer Mode registers the production endpoint and a real `.app.json` is added for local testing only.
- [ ] MCP Inspector and full retained corpus pass against production.
- [ ] Fresh Codex local install/reinstall and new-thread discovery pass.

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
