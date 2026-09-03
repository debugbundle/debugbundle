# Official OpenAI Plugin OAuth/OIDC Implementation Decision

Status: Accepted and implemented in local source; production validation pending
Date: 2026-08-30; scope profile amended 2026-09-02
Owners: Security, platform, product

## Context

The official OpenAI Plugin reads private customer data through a public remote MCP resource. It therefore needs OAuth 2.1/OIDC, verified UserInfo for workspace domain restrictions, exact resource/audience binding, PKCE, RFC 9207 issuer identification, CIMD/client authentication, revocation, and a production storage adapter.

DebugBundle already owns first-party browser sessions, users, organizations, memberships, and hosted API authorization. Adding a paid identity service or another always-on runtime would change the approved cost and deployment shape. Implementing an authorization server from protocol primitives would create unacceptable security and conformance risk.

The former `spec/auth-architecture.md` hosted-MCP non-goal and `spec/hosted-remote-mcp-connector.md` token-first proposal conflicted with the approved OpenAI plan. The source-of-truth resolution is:

- local stdio MCP, CLI, OpenClaw, and existing APIs keep member-token authentication unchanged;
- a future arbitrary custom hosted-client profile may still be proposed as member-token-first; and
- only the official OpenAI profile adds the OAuth principal and schema frozen by this decision.

## Decision

Use `oidc-provider` v9 as the maintained OAuth 2.0/OIDC authorization-server implementation, initially pinned as `~9.11.2`, mounted in the existing Fastify API process through a focused adapter. Use the existing official `@modelcontextprotocol/sdk` for Streamable HTTP and resource-server token-verification/challenge primitives.

`oidc-provider` owns protocol behavior for discovery, authorization code, PKCE, OIDC/UserInfo, JWT access tokens, refresh rotation hooks, `private_key_jwt`, resource indicators, revocation, and RFC 9207. A project-owned adapter maps provider records to the Postgres contracts in `contracts/data-schemas.md`. Signing keys remain in hosted secret/config ownership. Library-provided `jose` primitives may be used through the provider/SDK; DebugBundle will not implement cryptographic algorithms or JWT verification from scratch.

The exact profile is:

- issuer `https://api.debugbundle.com`;
- resource/audience `https://mcp.debugbundle.com`;
- authorization code lifetime five minutes and PKCE S256 only;
- access JWT lifetime exactly 12 minutes;
- opaque rotating refresh-family lifetime 30 days with reuse detection;
- CIMD client ID exactly `https://chatgpt.com/oauth/client.json`;
- production redirect exactly `https://chatgpt.com/connector_platform_oauth_redirect`;
- `private_key_jwt` only for the approved production client;
- no unrestricted dynamic client registration;
- public-client `none` disabled unless a separately recorded OpenAI interoperability result requires it with PKCE;
- OIDC `openid email` with minimal verified UserInfo; and
- six independently selectable product scopes, including `debugbundle:analytics:read` for the frozen aggregate-only analytics tools; `get_incident_impact` additionally requires `debugbundle:incidents:read`; and
- physical retention of 24 hours for consumed/expired codes, 30 days for expired/revoked refresh history, and 90 days for expired/revoked grants.

Because CIMD is experimental in `oidc-provider` and the maintainer documents that experimental changes may ship in minor versions, use a tilde range and pin the resolved lockfile. Dependency updates require metadata/conformance fixture review, security advisory review, and the full OAuth negative suite before merge.

## Why This Choice

The maintained provider currently documents support for:

- OpenID Connect Core and discovery;
- RFC 7009 token revocation;
- RFC 7636 PKCE;
- RFC 8414 authorization-server metadata;
- RFC 8707 resource indicators;
- RFC 9207 authorization-response issuer identification;
- JWT access tokens;
- `private_key_jwt`; and
- experimental OAuth Client ID Metadata Documents.

It is OpenID Certified, runs on supported Node versions, can mount beside Fastify, and supplies adapter/configuration extension points. This leaves DebugBundle responsible for product policy, safe CIMD networking, storage correctness, consent/reviewer UX, key operations, host isolation, monitoring, and deployment—not protocol cryptography.

## Implemented Boundaries

- `apps/api` owns the mounted provider, OAuth routes, trusted-host checks, request-scoped principal, and provider adapter composition.
- `packages/storage` owns Postgres persistence, the encrypted `oidc-provider` adapter, and bounded cleanup.
- Shared packages/API-owned services own dedicated read-only domain readers.
- `apps/api` must never import `apps/mcp`; the OpenAI catalog is a separate projection.
- `.local-repos/debugbundle-cloud` owns production secrets, env rendering, Caddy/two-slot rollout, monitoring, and emergency route gates.
- Consent UI was owner-approved on 2026-08-30 through `spec/openai-plugin-consent-design-proposal.md` and is implemented locally with the existing app design system. The API-origin interaction cookie remains API-scoped; app consent/reviewer routes carry only the opaque interaction UID and submit decisions/credentials back to API-origin interaction endpoints.
- The owner approved the separate aggregate-only analytics scope on 2026-09-02. It changes neither the OAuth library/flow nor storage shape: grant scope arrays remain normalized text values, while per-tool security schemes and runtime checks enforce the new scope. Individual analytics journeys, custom dimensions, analytics opportunities/bundles, and mutations remain outside the grant.
- The additive migration, provider composition, hosted readers, and routes are source changes only. No production migration, secret, route, or deployment state was mutated.

The frozen issuer JWKS path is `https://api.debugbundle.com/oauth/jwks.json`. An initial runtime draft used `/oauth/jwks`; reconciliation found that both the approved proposal and `contracts/public-interfaces.md` already froze the `.json` path, so runtime configuration, metadata, and tests were corrected to the source-of-truth path rather than changing the public contract.

### Source-owned provider artifact table

Implementation proved that the library adapter needs durable provider model records beyond the normalized product grant/code/refresh tables. The source-of-truth schema therefore adds `oauth_provider_artifacts` in the same ordered migration. This resolves a proposal omission rather than changing the approved auth model:

- lookup identifiers are HMAC-SHA-256 values, never provider IDs in plaintext;
- provider payloads are encrypted with the existing integration-secret envelope before `jsonb` persistence;
- grant/session/user-code lookup columns are separately hashed;
- expiry/consumption indexes support library lookups and bounded cleanup; and
- normalized grant, code, and refresh records remain the authorization/revocation/audit contract used by the resource server.

## Compatibility And Security Spike Gate

The focused implementation tests must continue to prove the pinned provider supports all of the following without a fork or substantial custom protocol implementation:

1. exact RFC 9207 `iss` on every successful and error authorization response;
2. exact resource propagation and single-audience JWT access tokens;
3. S256-only PKCE and single-use five-minute codes;
4. CIMD resolution/validation for the exact OpenAI document and redirect;
5. `private_key_jwt` with trusted JWKS/`kid`, exact claims, and external one-time `jti` enforcement;
6. minimal OIDC UserInfo and optional minimal ID token/`id_token_hint` handling;
7. Postgres adapter atomicity for code use and refresh rotation/reuse detection;
8. revocation that takes effect through the backing grant on every MCP request; and
9. compatible mounting behind the exact two-host trusted-proxy boundary.

If any item requires forking the provider, bypassing its security model, or implementing material protocol cryptography, stop for owner review. Compare an established hosted identity provider with a launch tier that adds no immediate cost. No provider selection, account creation, or paid plan is authorized by this fallback.

## Rejected Alternatives

- Hand-written OAuth/OIDC server: rejected because conformance, mix-up, replay, key, metadata, and lifecycle risk are disproportionate.
- Existing member tokens in OpenAI tool arguments: rejected because it bypasses managed linking, scopes, workspace domain restrictions, resource binding, and secret isolation.
- Unrestricted DCR: rejected because v1 has one known OpenAI client and does not need arbitrary registration.
- New authorization-server container/service: rejected for the first release because the approved deployment is the existing API process and same Lightsail host.
- Paid hosted identity provider now: rejected absent a demonstrated library blocker and explicit spending approval.

## Consequences

- Production enablement requires applying the implemented ordered forward migration and passing fail-closed schema readiness before OAuth code is enabled.
- The provider adapter and consent/reviewer interaction are security-critical and require focused conformance, integration, and incident/key-rotation runbooks.
- The provider is a single-maintainer dependency; update discipline and a documented fallback are mandatory.
- The official plugin version and auth contract evolve independently from npm MCP and existing member-token clients.

## Primary References Checked On 2026-08-30

- OpenAI plugin authentication: https://developers.openai.com/plugins/build/auth
- OpenAI MCP server requirements: https://developers.openai.com/plugins/build/mcp-server
- OpenAI plugin submission: https://developers.openai.com/plugins/deploy/submission
- OpenAI MCP review requirements: https://developers.openai.com/plugins/deploy/app-review
- `oidc-provider` project and supported specifications: https://github.com/panva/node-oidc-provider
- `oidc-provider` security model: https://github.com/panva/node-oidc-provider/security

The 2026-09-02 scope amendment also rechecked OpenAI's official tool-definition and plugin-guideline documentation for focused tools, minimal inputs, accurate read-only annotations, transparent permissions, and no hidden side effects:

- https://developers.openai.com/plugins/plan/tools
- https://developers.openai.com/plugins/app-guidelines
