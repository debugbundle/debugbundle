# SDK Capability, Safety and Reliability Parity

Status: mandatory engineering rule. Established 2026-10-25.

## Purpose

Every SDK improvement must be evaluated across the supported SDK family. Users
should receive equivalent diagnostic capabilities, privacy, safety and reliability
where the runtime permits them. Parity means equivalent observable behaviour and
honest limitations; it does not require identical APIs, implementation techniques,
or fabricated evidence on runtimes that cannot supply it.

Read this rule alongside [the universal SDK contract](../contracts/sdk-interface.md),
[the SDK testing strategy](sdk-testing-strategy.md),
[security hardening](security-hardening.md), and
[the supported runtime policy](../spec/sdk-language-targets.md).
Existing production contracts and documented runtime exceptions remain binding.

## When this rule applies

Apply it to every SDK feature, bug fix, safety or performance change, capture or
normalisation change, diagnostic field, public method, transport behaviour,
framework/logger adapter, lifecycle hook, relay, bridge and bundled distribution.
It also applies when core ingestion, redaction or bundle interpretation changes
the meaning or acceptance of SDK evidence.

Do the applicability review during planning, before implementation is confined to
the SDK that exposed the issue. Revisit it whenever implementation changes scope.

## Mandatory applicability record

Use `sdks.json`, `spec/sdk-language-targets.md` and the actual repositories to
inventory the maintained SDKs. At establishment the twelve capture surfaces are
Node.js, Browser, Python, PHP, WordPress, Java, Go, Ruby, .NET, Android, Swift/iOS
and React Native. Node and Browser share one repository. WordPress includes PHP,
its browser asset and relay; React Native includes JavaScript and both native
bridges. Review framework adapters and distributions as well as base packages.
Rust joined as the thirteenth maintained capture surface with stable 1.0.0 on
14 November 2026, including Tower/Axum, Actix, native logging and both relays.
Future SDKs inherit this obligation before their first release.

For each affected capability, record every surface with:

- Applicability and the language/runtime equivalent.
- Current source and released-package behaviour, distinguished explicitly.
- One disposition: `implement`, `already equivalent`, `runtime limited`,
  `not applicable`, or `deferred gap`.
- The implementation or verification slice, relevant tests, and package/docs
  affected. `Already equivalent` needs evidence, not an assumption.
- For a limitation: the exact runtime/version boundary, available fallback and
  user-visible unavailable state. A missing implementation is not a runtime limit.
- For a deferred gap: a linked follow-up, owner or owning surface, reason and
  remaining risk. A deferred applicable capability requires an explicit scope
  decision before the change may be described as parity-complete.

Keep the detailed matrix with the change's execution record. Promote changed
behaviour, shared limits and exceptions into tracked requirements, contracts,
acceptance criteria and per-SDK documentation; an ignored local proposal alone
cannot establish a shipped public contract. Do not claim unverified parity.

## Implementation rules

1. Implement applicable improvements across the family within the authorised
   scope. Do not stop after the reporting SDK merely because its tests pass.
2. Reuse shared schemas, privacy rules and language-neutral conformance fixtures.
   Use idiomatic runtime mechanisms; do not force browser-only APIs into servers
   or imitate a native crash stack where no stack is available.
3. Preserve the full capability at relay, wrapper and native bridge boundaries.
   Document and test any negotiated downgrade; do not silently strip new evidence
   while advertising support.
4. Keep existing host-safety guarantees, bounded work/memory/queues, redaction
   before SDK-owned retention, post-hook protection, token isolation, native error
   propagation, acknowledgement semantics and delivery/lifecycle guarantees.
   Preserve explicit runtime exceptions such as PHP's documented request-end
   delivery tradeoff. Do not lower the family baseline to achieve parity.
5. Treat limits and unavailable reasons as contract semantics. SDKs may use safer
   smaller budgets only with documented, tested differences; exhaustion must not
   fabricate complete evidence or throw into application code.
6. Keep debug capture independent of product analytics, remote-probe activation
   and optional diagnostics. New evidence must not require those features to be
   enabled unless that dependency is explicitly part of its existing contract.
7. Preserve installed versions, defaults, schemas, fingerprints and capture rules.
   Test old/new combinations and define reader/relay/producer rollout order.
   Breaking changes need the existing versioned migration process; new optional
   methods must not change existing method signatures or return semantics.

## Completion and release gates

- Every matrix row has a disposition and evidence; no unexamined SDK remains.
- Applicable implementations pass their language/runtime tests and shared
  conformance fixtures. Changed relay/bridge/wrapper paths pass installed-artifact
  tests, including both React Native platforms and the actual WordPress ZIP when
  those paths are affected.
- Regression controls cover existing successful capture, privacy, filtering,
  sampling, overload, retry, shutdown and local/connected modes as applicable.
- API, CLI, ordinary MCP and dashboard retain their separate interface-parity
  obligations. Restricted OpenAI projections retain their own allowlists and
  authority; SDK parity does not authorise widening them.
- Documentation names supported versions, runtime limitations and adoption needs.
  Distinguish source tests, packaged-artifact tests, device/framework tests,
  publication, hosted rollout and consumer adoption.

Review parity as part of pre-ship review and record it in the release handoff.
Missing evidence keeps the relevant gate open; it is not a passing result.

## Authority and scope

This rule requires evaluation; it does not grant cross-product mutation or release
authority. It never authorises updating consumer products, committing, pushing,
publishing, deploying or running production canaries. Record necessary adoption
separately and follow the product-specific consent rules in `AGENTS.md`.
