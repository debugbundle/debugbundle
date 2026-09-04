# Official OpenAI Plugin V1 Threat Model Foundation

Status: Local implementation reviewed against the frozen controls; production and owner evidence pending
Date: 2026-08-30
Scope: Combined OpenAI skill plus remote MCP `1.0.0`

## Security Objective

Allow ChatGPT and Codex to read only the minimum authorized, redacted, bounded DebugBundle evidence a user requests, without exposing secrets or cross-tenant data, accepting the wrong credential, following captured instructions, mutating customer state, or endangering the primary same-host API/worker runtime.

This threat model freezes design controls and maps them to the local implementation. Unit/contract evidence is not production proof. Deployment, live-client, portal, publication, discovery, communication, and owner-approval states remain separate in `tests/fixtures/openai-plugin-v1/implementation-gaps.json`.

## Protected Assets

- DebugBundle users, organizations, memberships, and project authorization;
- OAuth codes, access tokens, refresh families, client assertions, signing keys, reviewer credentials, and grant state;
- incidents, redacted artifact content, improvement evidence, and endpoint-health configuration/results;
- raw logs, request bodies, headers, cookies, URLs, storage keys, internal identifiers, individual analytics journeys/sample IDs, custom dimensions, analytics opportunities/bundles, and raw analytics events that are explicitly outside v1;
- primary API ingestion/retrieval capacity, worker queue health, Postgres pool, Redis, host memory/CPU/disk, and Caddy routing;
- plugin metadata, package/release hashes, domain challenge, portal state, publisher identity, and public trust.

## Trust Boundaries

1. OpenAI client to public `mcp.debugbundle.com` over Streamable HTTP.
2. Browser/OpenAI client to `api.debugbundle.com` OAuth/OIDC endpoints.
3. Caddy to the shared Fastify process through a trusted surface marker and proxy chain.
4. OAuth provider/configuration to the project-owned Postgres adapter and hosted key material.
5. MCP admission to Redis rate/concurrency coordination and the shared Postgres pool.
6. OpenAI projection to dedicated domain readers and existing Postgres/S3 data.
7. Domain records/artifacts to redaction, field allowlist, schema validation, and result serialization.
8. Synthetic reviewer entry to an isolated reviewer tenant and grant.
9. Core repo product/package code to private hosted deployment/monitoring ownership in `.local-repos/debugbundle-cloud`.
10. Local package/evidence to OpenAI portal review, publication, and directory discovery.

## Assumed Attackers

- an unauthenticated internet client that knows all public source, routes, schemas, env names, and denial behavior;
- a valid DebugBundle user attempting cross-organization/project access or broader scopes;
- a malicious/compromised OAuth client metadata endpoint, key, assertion, code, refresh token, or access token;
- a customer-controlled incident/log/bundle/endpoint string containing secrets or prompt-injection instructions;
- a reviewer credential holder attempting to escape the synthetic tenant;
- shared OpenAI egress causing accidental or deliberate load concentration;
- a supply-chain/package or portal operator mistake that changes reviewed metadata or origin;
- an operator responding to an incident with an overly broad deploy, cleanup, announcement, or spending action.

## Threats, Controls, And Required Evidence

| Threat                                  | Frozen controls                                                                                                                                       | Required later evidence                                                                             |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| OAuth authorization-server mix-up       | Exact issuer in metadata/protected resource; RFC 9207 `iss` in every success/error; exact comparison                                                  | Conformance cases for success and every error mode, missing/mismatched/trailing-slash issuer        |
| Code interception/replay                | S256-only PKCE; five-minute hashed, single-use, fully bound codes; atomic consumption                                                                 | Parallel exchange/replay tests and previous-production migration path                               |
| Token substitution/confused deputy      | Exact `aud/resource`, `iss`, scopes, client, grant/account/org, and current project checks on every call                                              | Negative JWT/resource/scope/client/account/membership matrix                                        |
| Refresh theft/reuse                     | Opaque hashed 30-day rotating family, atomic replacement, reuse revokes family/grant                                                                  | Concurrent rotation, old-token replay, revocation-latency tests                                     |
| Client impersonation                    | CIMD exact URL, validated redirects/JWKS, `private_key_jwt`, exact assertion claims, trusted `kid`, short lifetime, Redis one-time `jti`              | Live OpenAI metadata fixture plus malformed/key/replay/timeout tests                                |
| CIMD SSRF/DNS rebinding/redirect abuse  | HTTPS only, public resolution on every hop, no userinfo, two redirects, five seconds, 128 KiB, schema allowlist, short cache, fail closed             | IPv4/IPv6/private/metadata/DNS-change/redirect/oversize fixtures                                    |
| Wildcard/unapproved client registration | One exact client/redirect; no unrestricted DCR; `none` disabled                                                                                       | Metadata and route tests proving no registration endpoint or wildcard acceptance                    |
| OIDC identity leakage/spoof             | UserInfo only `sub`, normalized email, verified true; no email in JWT/tools/logs; minimal optional ID token                                           | Claim snapshots, false/missing verification denial, log/result absence checks                       |
| Credential-type collapse                | OAuth accepted only by OpenAI resource; member/project tokens rejected there; OAuth rejected everywhere else                                          | Cross-product credential matrix covering API, CLI, stdio, OpenClaw, ingestion                       |
| Host-header/surface spoofing            | Exact host, trusted proxy chain and internal marker; route sets isolated by host                                                                      | Host/forwarded/direct-port/spoofed-marker tests and Caddy config test                               |
| Cross-tenant data access                | Grant bound to user/org; project ID required; record/project recheck; not-found non-enumeration                                                       | Synthetic two-org/two-project matrix for all twenty-three tools                                     |
| Hidden write behind read annotation     | Dedicated readers; zero regeneration/queue/last-access/audit-product writes; metadata telemetry outside transaction                                   | Injected fakes record zero calls for ready/missing/stale/pending/failed/oversized cases             |
| Raw log or adjacent-field disclosure    | Exact output schemas/data map; raw-log tool excluded; incident context has no logs field/query                                                        | Raw-log canary fixtures and output-key recursive allowlist tests                                    |
| Individual analytics journey disclosure | Nine analytics tools read aggregate ledgers only; sample/custom-dimension/bundle/opportunity tools excluded; sample and bundle-state queries disabled | Sample-ID/custom-dimension/generation canaries plus query-spy tests for journey and incident impact |
| Health URL secret disclosure            | HTTP(S) only; remove userinfo/query/fragment; redact secret-like path segments; sanitize final redirect URL too                                       | Credential/query/fragment/token-path/invalid-scheme fixtures                                        |
| Oversized/unbounded evidence            | 256 KiB request, strict inputs, bounded lists/windows/strings/arrays, 512 KiB artifact result, 25-second timeout                                      | Boundary/oversize/timeout/cancellation and schema-result tests                                      |
| Prompt injection from customer evidence | Treat every customer string as data; never execute/follow; tailored skill safety language; no automatic actions                                       | Direct tool and end-to-end indirect-injection evals                                                 |
| Operational log leakage                 | Metadata-only log allowlist and pseudonymous keys; no args/results/tokens/email/customer IDs/content                                                  | Log capture snapshots for success/error/auth/replay/oversize paths                                  |
| Shared-host resource exhaustion         | Identity-aware Redis limits; concurrent grant 2; global start 2; DB reserve ≥6 of default 10; immediate reject; fail closed without Redis             | Load test, DB pool metrics, Redis-loss test, primary API/worker regression proof                    |
| MCP failure takes down primary product  | MCP-only no-deploy Caddy gate; primary readiness independent unless shared dependency; atomic dual-host promotion/rollback                            | Rehearsed gate, partial verification failure, rollback, external readiness evidence                 |
| Reviewer bypass/cross-tenant access     | Dedicated POST credential, hash only, separate flag/rates/audit/expiry, deterministic synthetic tenant, no MFA/email/SMS/private network              | Outside-network smoke, expiry alert, revoke/rotate rehearsal, non-synthetic denial test             |
| Consent/session substitution            | API-scoped HttpOnly interaction cookie; opaque UID-only app URL; CSRF-safe API POST; exact client/resource/scope/session/membership recheck           | Browser/manual stale-session, cross-session, deny, and login-continuation validation                |
| Grant-management enumeration            | Current user+organization list scope; strict body UUID; owned atomic revoke; same bounded not-found; no grant ID in URL                               | Manual Settings state/accessibility and production revocation-latency validation                    |
| Credential data retained indefinitely   | Indexed 24h/30d/90d physical deletion; 500-row idempotent batches; audit evidence separate                                                            | Retention clock/batch/retry/current-family survival tests and metrics                               |
| Package/scan/version drift              | Independent semver/driver, deterministic hashes/digest/origin/app ID, placeholder/schema/annotation/scope checks                                      | Reproducible package/manifest/scan comparison from deployed immutable digest                        |
| Portal or publication overreach         | Separate approval for submission, Cancel Review, publication, directory edit, announcement, and spend                                                 | Exact packet approvals and post-action evidence without inferred authorization                      |

## Data Categories And Exclusions

Permitted categories are project/service metadata, incident metadata, redacted deterministic artifacts, runtime improvement evidence, aggregate product analytics, sanitized endpoint-health configuration/results, and verified identity only for workspace domain restrictions. Exact fields and bounds are in `contracts/openai-plugin-v1-data-map.md` and `tests/fixtures/openai-plugin-v1/schemas.json`.

Raw logs, individual analytics journey samples/sample IDs, raw analytics events, custom dimensions, analytics opportunities/bundles/generation state, auth material, email in MCP, write actions, local files/setup, object-storage keys/signed URLs, database-only IDs, internal hashes, raw health URLs, request bodies/form values/cookies, and custom MCP UI are outside v1.

## Availability And Capacity Stop Conditions

Public enablement fails if the stricter of 30%/512 MiB free memory, sustained CPU below 65% (bursts below 85%), event-loop p95 below 100 ms, normal free disk above 12 GiB, existing 6 GiB deploy floor, metadata p95 below two seconds, artifact p95 below five seconds, 99% expected tool success, 95% invited-user OAuth completion, or no-primary-regression gates are not met.

Mitigation order is reduce bounds, tighten expensive-tool limits, lower concurrency, disable optional improvement tools, limit availability, then disable MCP. Use the no-deploy Caddy gate for an urgent MCP-only incident. A larger host, separate instance, paid identity provider, or paid monitor requires owner approval.

## Reviewer And Release Lifecycle

Review credentials and fixtures must remain valid and monitored for the complete review window. Cancel Review or packet change requires fresh approval. Approval does not publish. Publication does not prove capability-oriented directory discovery. Discovery does not authorize communication. Removal/cancellation/completed publication verification revokes reviewer credentials and grants.

## Evidence Boundary

Implemented in local source and covered by focused automated evidence:

- additive OAuth grant/code/refresh/provider-artifact migration and empty-schema bootstrap;
- `oidc-provider` adapter/configuration, PKCE/resource/client profile, UserInfo, access verification, refresh/revoke backing state, retention cleanup, and feature-gated API composition;
- dedicated hosted readers, exact twenty-three-tool catalog/projection, aggregate-only analytics query suppression, health URL sanitization, and zero hidden regeneration/queue/customer-state mutation;
- stateless Streamable HTTP method/auth/host/surface/limit/bulkhead behavior and metadata-only telemetry;
- synthetic reviewer tenant/credential backend, expiry monitoring, package, submission/eval corpus, deterministic release artifacts, and public candidate documentation; and
- owner-approved existing-app consent/reviewer UI, exact disclosure/scope controls, API-origin interaction handoff, owned Settings inventory/revocation, and focused accessibility/HTTP tests; and
- repository-owned Caddy/deployment/monitoring/capacity source in `.local-repos/debugbundle-cloud`.

Production evidence now includes the additive migration, same-Lightsail immutable image deployment, managed Caddy and DNS/TLS activation, OAuth/reviewer/MCP configuration, OAuth and MCP metadata, the bounded live ChatGPT discovery challenge, successful owner reconnect, the captured non-secret Developer Mode connection mapping, and passing project/service plus incident/context/existing-artifact ChatGPT cases. The deployed API digest is frozen in `apps/mcp/openai/release-manifest.json`.

Not claimed or performed:

- no completed production Inspector/ChatGPT/Codex corpus, external reviewer smoke, accessibility review, or representative load/rollback evidence;
- no privacy/legal/security/owner sign-off; and
- no portal submission, Cancel Review, approval, publication, directory edit/discovery, announcement, or spend change.

These gaps remain release blockers, not reasons to weaken the controls or mark unavailable evidence green.
