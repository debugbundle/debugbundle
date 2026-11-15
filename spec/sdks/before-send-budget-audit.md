# SDK owner-hook byte-budget audit

Subsequent authorised publication is complete across all 13 capture surfaces.
See the [SDK safety release record](../sdk-safety-release-20261115.md) for selected
versions, published-consumer gates and hosted acceptance. The original local
checkpoint and its receipts below are retained as historical evidence.

The subsequent [deep final audit](sdk-deep-audit-20261115.md) records additional
corrections and superseding source/artifact qualification. Earlier receipts below
remain historical evidence.

Date: 15 November 2026. Scope: local DebugBundle SDK fixes and qualification.
No commits, tags, registry publication, deployment or consumer changes were
performed for this task. Candidate archives retain checkout version numbers;
they are local test artifacts, not new published versions.

## Finding and required behaviour

The [Rust audit follow-up](rust-sdk-audit.md#cross-sdk-follow-up-from-the-combined-budget-review)
is confirmed. Go and .NET classified an otherwise valid owner-hook replacement
as invalid when its optional exception evidence exceeded the combined 32 KiB
budget. They then restored the protected original, including text the hook had
removed. Runtime regressions reproduced the same failure in Node, Browser,
Python, PHP, Ruby, Java, Android, Swift and React Native. WordPress inherits the
PHP and Browser implementations. Rust already handled valid aggregate overflow.
The requested second audit found that malformed evidence combined with overflow
could also be silently repaired in the reducers, including Rust. The final
correction preserves invalid-return fallback across those paths; Node and Browser
already rejected these combined failures.

The defect is a local policy/privacy correctness issue, not evidence of a
production incident. A sanitized original can still contain content an owner's
hook intentionally removed. Generic invalid-return fallback must not be used
merely because optional evidence crosses a byte budget.

The changes implement FR-SDK-13a, AC-SDK-13a, the
[hook contract](../../contracts/sdk-interface.md#11-local-beforesend-hook), and
the SDK capability-parity rule:

1. Own or inspect the replacement through the existing bounded validation path.
2. At aggregate overflow, validate the complete shape and semantic constraints
   with only the aggregate byte refinements disabled. Malformed structures,
   illegal fields/event kinds, scalar limits and graph topology still reject.
   For an otherwise valid replacement, remove optional exception evidence, its
   related typed reference, and record `context.evidence_limits`.
3. Keep the replacement primary and ordinary custom context, including legacy
   arbitrary values stored under `evidence_reference`.
4. Validate the resulting complete envelope, then use the existing mandatory
   sanitization, policy and delivery path. Remaining malformed fields retain the
   existing invalid-return fallback. Unreducible ownership/transport exhaustion
   withholds the replacement instead of restoring pre-hook content.

The canonical limit and ingress validators are unchanged. UTF-8 JSON field
names, wrappers, escaped characters and valid typed references count towards
the combined limit. Exactly 32,768 bytes remains accepted; 32,769 is reduced.
The fix adds no callbacks, retry loops, queues, public options or wire fields.

## Maintained-surface disposition

Paths below are relative to each repository under `sdks/`.

| Surface      | Local correction or verified equivalence                                                                                                  | Verification                                                                                                                                                                                                            |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node         | `debugbundle-js/packages/sdk-node/src/before-send.ts`: recognise only shared-schema aggregate byte errors, reduce and strictly revalidate | Expanded shared boundary corpus, full JS suite, lint/typecheck/build/coverage, installed packed Node smoke                                                                                                              |
| Browser      | `debugbundle-js/packages/sdk-browser/src/before-send.ts`: same narrow change, preserving malformed-return fallback                        | Same corpus and JS gates; installed browser package and exact WordPress browser asset                                                                                                                                   |
| Python       | `before_send.py` opts into `evidence_wire.fit_hook_evidence`; ordinary validators remain strict                                           | Full lint/typecheck/test/coverage, wheel/sdist build, clean installed framework smoke                                                                                                                                   |
| PHP          | `BeforeSend.php` reduces projected optional bytes through `EvidenceWire` only after non-budget semantic checks                            | Full tests, PHPStan, per-file coverage, installed app-driven smoke                                                                                                                                                      |
| WordPress    | Inherits corrected PHP and Browser packages; no independent hook implementation or production plugin-code change                          | Staged plugin ZIP built with both local candidates; installed PHP filter and exact bundled browser asset both preserve hook replacement under overflow                                                                  |
| Java         | `BeforeSendProcessor` calls `EvidenceWire.fitHookEvidence` on bounded owned JSON                                                          | All-module Maven verify/Jacoco, shared fixtures, installed core/framework/evidence smoke                                                                                                                                |
| Go           | `before_send.go` calls `internal/evidence.FitHookEvidence` after bounded ownership                                                        | Full verify-docker tests/coverage/vet; extracted module install, backend and relay smoke                                                                                                                                |
| Ruby         | Hook-only reduction in `BeforeSend.normalization_result` through `EvidenceWire`                                                           | Full lint/test/coverage, gem build and installed runtime smoke                                                                                                                                                          |
| .NET         | `BeforeSendProcessor` checks `EvidenceWire.OptionalEvidenceFits` and uses the existing optional reducer                                   | 197 tests across eight projects, build, 66-file coverage gate, installed app-driven smoke                                                                                                                               |
| Android      | `DebugBundleBeforeSend` fits the owned envelope through `DebugBundleEvidenceWire`                                                         | Full verify, canonical fixtures, 74-file coverage and Kotlin metadata compatibility; React Native Android bridge tests                                                                                                  |
| Swift        | `DebugBundleBeforeSend` fits the authored envelope through `DebugBundleEvidenceWire`                                                      | 168 tests, 47-file coverage; exact source-distribution SPM and CocoaPods consumers on iOS 15 simulator                                                                                                                  |
| React Native | JS `before-send.ts` fits owned canonical JSON via `evidence-wire.ts`, preserving non-budget canonical checks                              | Full tests, coverage/typecheck/build; actual client JSON/object/legacy carriers; packed install smoke; iOS and Android native bridge tests                                                                              |
| Rust         | `wire::hook_replacement` retains valid aggregate reduction and now rejects bounded malformed evidence before reduction                    | Shared corpus through the public client with explicit capability proof; full ordinary tests, lint/format, coverage and extracted package checks. The dedicated disk-full test remains excluded from the ordinary target |

Framework, logger and web adapters use their SDK's shared capture/hook owner;
they do not implement independent fallback policy. Their existing suites and
installed framework smokes above were run. React Native's three JS-to-native
carriers additionally assert one hook invocation, retained replacement text,
removed secret/original text and optional evidence removal. Native bridge
validation and ingress stay strict. Browser relays validate received envelopes;
the Rust relay's optional owner hook uses the corrected common helper.

Fatal/signal paths that deliberately skip application callbacks retain their
documented restriction. Safe replay uses the ordinary owner-hook path. No
attempt was made to execute owner hooks in unsafe crash contexts. Diagnostic
context events are not exception envelopes; their separately bounded payloads
retain their existing strict validation. Shared schema, API/CLI/MCP ingestion,
redaction packages and consumer applications need no source change for this fix.

## Regression design

`scripts/sync-hook-budget-fixtures.py` derives 26 deterministic cases from the
existing canonical evidence corpus and writes identical fixtures into core and
eleven SDK repositories. Node and Browser run the same JS copy. Rust now runs
the same corpus as well as its existing regressions; WordPress tests the actual
packaged SDKs.

- Frontend/backend envelopes at 32,768 and 32,769 bytes.
- No reference, a valid typed reference, and arbitrary legacy reference context.
- Escaped newlines and multibyte UTF-8, with graph bytes individually within the
  limit while the enclosing additions cross it.
- Invalid primary and invalid under-budget graph controls.
- Malformed evidence together with overflow: missing root, cycle, unknown field,
  wrong scalar type, excessive scalar length, wrong event-kind field and invalid
  graph shape. A malformed primary remains invalid after optional reduction.
- Combined graph/execution and graph/resource fields at both byte boundaries.
- SDK-specific malformed-context controls ensure reduction cannot silently
  repair an invalid top-level envelope. Typed native APIs constrain this field
  at construction; PHP/JS validate it before reduction.
- Existing drop, throw/panic, mutation isolation, foreign/accessor values,
  ownership exhaustion, privacy and strict receiving-corpus tests remain active.

`tests/contracts/sdk-hook-budget.test.ts` independently checks the generator's
byte counts against JavaScript serialization and the canonical Zod validator.
Run `make sdk-hook-budget-fixtures-check` to detect corpus drift. Existing strict
evidence fixtures continue to reject overflow at receiving boundaries.

Node and Browser deliberately use the aggregate error messages from their pinned
shared-types schema. The new common corpus exercises that contract in both
packages. This avoids broadening acceptance of other schema failures or forcing
an unrelated shared-package release.

## Evidence and review

### Requested second audit

Status: local correction and final verification complete. All final gates below
pass; no publication or consumer adoption occurred.

The second audit was deliberately adversarial, testing invalid shape and byte
overflow together. It reproduced a remaining compatibility gap in ten hook
owners: Go, .NET, Python, PHP, Ruby, Java, Android, Swift, React Native and Rust.
Removing optional data before checking its shape accepted replacements that should
have selected the protected original. Node and Browser already distinguished
aggregate byte issues from other schema errors.

The fix reuses each language's existing schema and semantic validators. Only the
combined/graph byte refinements may be bypassed for the local reduction decision;
receiving validators default to their existing strict path. Existing bounded
ownership, exhausted-validation and post-hook privacy behaviour is preserved.
Go additionally tests the reducer's input preservation and markers for every
removed field directly, closing its per-package coverage gap.

Second-audit receipts are under `.tmp/before-send-reaudit/`. `*-red.log` and
`rust-red-confirmed.log` retain the failures. `*-focused.log` records the expanded
regressions; `*-full.log`, `go-final.log` and `java-final.log` hold the final quality
and package runs. Final native/wrapper and core checks are recorded there too.
The original receipts below describe the first pass and must not be mistaken for
qualification of the subsequent correction.

The audit also corrected two test/qualification issues without weakening gates.
The Go reducer needed direct internal-package tests to satisfy its per-file
coverage floor; it now has 87.90% statement coverage. A Java native-evidence test
mocked ingestion but still raced live configuration discovery, whose failure
correctly revokes the pinned capability. Its discovery response is now synthetic
and retains all original native cause/frame assertions. `java-full.log` preserves
the initial failure, `java-evidence-recheck.log` and `java-final.log` the unchanged
successful reruns, and `java-hermetic-final.log` the final controlled run.

Rust's package target expanded every retained `.crate` into a single-argument
preparation command. It now selects the current manifest version explicitly,
preserving old archives. `rust-package-final.log` verifies extraction and actual
standalone/Axum/Actix consumers, packaged tests and release tools. This is local
artifact evidence, not registry publication or a complete native release matrix.

Final verification includes 666 Node/Browser tests, 431 Python tests, 365 Ruby
examples, 212 PHP tests, 197 .NET tests, 168 Swift tests, 164 React Native tests
and 182 Rust ordinary tests, plus the full Go, Java and Android suites and their
per-file coverage gates. Rust's packaged suite runs the same 182 ordinary tests.
The shared core validator passes 27 cases; strict SDK documentation passes 51
checks. Full installed-package smokes, the final WordPress ZIP and both React
Native native bridges pass. These counts describe the local tools and runtimes
recorded in the receipts, not every supported release platform.

Local receipts are retained under `.tmp/before-send-audit/`. They are ignored
runtime evidence, not durable published release receipts.

| Evidence                                       | Receipt                                                                                                                                                                                                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Original bug reproduced before each correction | `*-red.log`, `android-red-confirmed.log`, `swift-red-confirmed.log`                                                                                                                                                                                     |
| Full language checks                           | `go-verified.log`, `dotnet-verified.log`, `python-verified.log`, `php-verified-final.log`, `ruby-verified.log`, `java-verified.log`, `js-verified.log`, `android-verified.log`, `swift-verified.log`, `react-native-package-check.log`, `rust-full.log` |
| Package/installed checks                       | `*-package-check.log`, `*-installed.log`, `php-installed-final.log`, `js-installed-final.log`                                                                                                                                                           |
| Native bridge checks                           | `rn-ios-bridge.log`, `rn-android-bridge.log`                                                                                                                                                                                                            |
| Packaged WordPress                             | `wordpress-staged.log`; `sdks/debugbundle-wordpress/.tmp/staged-release/qualification.json`                                                                                                                                                             |
| Core contracts and static checks               | `core-final.log`, `core-docs-strict.log`, `core-lint.log`, `core-typecheck.log`                                                                                                                                                                         |
| Final malformed-context correction             | `python-context-red.log`, `ruby-context-red.log`, `java-context-red.log`, `react-native-context-red.log`; full quality and installed-package reruns in corresponding `*-final.log` files                                                                |

The staged WordPress qualification uses the existing published redaction 2.7.1
and shared-types 3.0.0 dependencies. Its local Browser archive SHA-256 is
`5f467806649d5bf6e0cca9c7ebffdaaf30d43dfbc746d36cfe54244aad4f5d75`;
the final second-audit staged plugin ZIP is
`898d5808ee1c71800c4da42a7fea10e62f50c2708113b422cae9a3f42ece7eee`.
Both packaged hook paths exercise valid overflow and malformed-plus-oversized
fallback. The final PHP candidate hash is
`08ea9f25bbfc023276da8a10a9d758dd8773c3e93e06b15a4ab3c86d8d1dd1bc`.
The disposable Compose stack cleans itself up. No existing WordPress site was
used or updated.

The final review covers every changed hook/reducer, malformed envelopes,
bounded ownership, immutable originals, reference handling, retained custom
context, privacy after replacement and unchanged ingress trust boundaries.
No connections, files, workers or database schema are added by the runtime fix.
All changed source files remain below the 800-line target. Documentation and
Unreleased changelogs accompany every affected SDK and the staged plugin path.

Final review also reproduced accidental repair of malformed top-level context
while reducing oversized evidence in Python, Ruby, Java and React Native. These
helpers now leave invalid context for strict rejection. Regression cases cover
null, string and array context; valid custom objects remain preserved. This is
part of the hook correction, not a relaxation of the closed envelope contract.

Some early harness failures were corrected without weakening product checks:
Swift fixture decoding migrated evidence before the hook, so tests now restore
the exact authored payload; an invalid-graph control unintentionally crossed the
byte boundary and was made explicitly under-budget; .NET needed the new fixture
copied to test output. PHP's installed hook smoke now distinguishes reducible
aggregate overflow from malformed input, while ingress still rejects overflow.

## Release boundary

This closes the local reproduction, implementation and SDK-audit work. Published
installations do not receive these changes until the affected independent SDK
packages are released. WordPress must then bundle the corrected PHP and Browser
releases and qualify its exact ZIP. Its checked-in dependency pins are unchanged
by this local staged test. Rust also needs a patch for the second-audit finding;
the initial conclusion that Rust needed no change was limited to valid evidence
overflow. Documentation alone does not justify unrelated package releases.

This task is not a replacement for future release qualification on every
supported OS/runtime or a physical-device run. A future authorised release must
refresh the applicable exact-artifact/platform gates and immutable Git-pod
distribution checks. Consumer adoption and installation on any existing
WordPress site remain separately authorised actions.
