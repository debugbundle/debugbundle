# SDK deep final audit — 15 November 2026

Subsequent authorised publication: all 13 capture surfaces have released corrected
artifacts. The [SDK safety release record](../sdk-safety-release-20261115.md)
contains the selected versions, published-consumer gates and hosted acceptance.
The local checkpoint and its original boundaries below remain historical evidence.

Status: deep audit complete; all four findings corrected and locally qualified.
No remaining release blocker was found in the audited changes.

Scope at this checkpoint: the `beforeSend` budget correction and optional internal
diagnostics remediation, across all 13 maintained capture surfaces, their
framework/relay owners, WordPress distribution and React Native native bridges.
This is local source and artifact qualification, not registry publication or
consumer adoption.

## Findings and corrections

The audit found four remaining gaps. Each was reproduced with a failing
regression before the correction; the original failures are retained.

| Finding                                                    | Impact                                                                                                                                                             | Correction and regression                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1 — Node/Browser console wrappers discarded return values | With console capture enabled, a custom console's Promise disappeared before the diagnostic owner could contain rejection or enforce its one-pending-Promise bound. | Preserve the original console result, synchronous failure and one native invocation. Parameterised console-capture controls and installed Node/Browser rejection canaries cover the interaction. Ordinary application capture remains enabled.                                                                                  |
| F2 — Swift accepted credential-shaped diagnostic codes     | A short lowercase `dbundle_proj_…`, `dbundle_mem_…` or `dbundle_probe_…` value satisfied the code grammar and remained in the local snapshot.                      | Exclude the credential prefix without changing ACK interpretation. Tests cover tokens, ordinary codes and the exact 64/65-byte boundary; the extracted distribution runs the regression.                                                                                                                                        |
| F3 — WordPress diagnostic privacy omitted its nonce fields | The generic mandatory policy did not include the extra WordPress/WooCommerce fields already configured for native capture.                                         | Share the existing field list with diagnostic writes and legacy reads. All five fields have write/read/nonmutation regressions and installed-ZIP write checks. Status keys, seven-day TTL and native capture configuration remain unchanged.                                                                                    |
| F4 — Rust reduced unvalidated optional hook data           | Above the whole-event ownership limit, optional-field removal could bypass validation and silently repair malformed evidence.                                      | Withhold replacements whose bounded ownership validation is unavailable, without restoring pre-hook content. Bounded malformed returns still use protected-original fallback; valid combined 32 KiB overflow still reduces normally. Regression cases cover all four removable optional fields and prove the hook actually ran. |

F1 is a diagnostic containment/worker-bound issue; F2/F3 are local diagnostic
privacy issues; F4 is a hook validation contract issue. None is a new diagnostic
network channel. The runtime corrections touch Node, Browser, Swift, WordPress
and Rust, in four independent repositories. Python adds a lifecycle regression
without a further runtime change.

## Compatibility and failure-path review

- Public capture signatures, configuration defaults and canonical event schemas
  remain unchanged. No dependency, endpoint, database or hosted runtime change
  was introduced by this audit.
- Receiving validators remain strict. The hook-only reduction decision preserves
  shape, scalar, event-kind and graph-topology checks. The shared 26-case corpus
  still covers exact UTF-8/escaped byte boundaries, typed versus legacy references,
  mixed fields, malformed context, immutable originals and owner redaction.
- Reviewed whole-event ownership exhaustion across every hook owner. Node,
  Browser, Python, PHP, Ruby, Go, .NET, Java, Android, Swift and React Native
  already withhold unavailable validation; Rust now follows that rule. Runtime
  ownership budgets remain language-specific and unchanged.
- Diagnostic failures do not change ACK selection, terminal/retryable reasons,
  retry ownership, valid hook replacement/drop, sampling or ordinary logger
  results. Node's async context remains scoped across clients; Browser's guard
  covers synchronous console output. Promise rejection remains contained through
  console wrappers.
- Python's single diagnostic lane remains outside SDK locks, with no replacement
  worker for a stalled callback. A new controlled regression proves disposal
  cancels pending output, the idle lane exits and a new lifetime can emit again.
  Existing callback, reinitialisation, fork and capture-safety controls pass.
- WordPress's diagnostic writes stay reentrancy-guarded and best effort; legacy
  reads apply protection without rewriting installation state. Native/browser
  event delivery, relay credentials, spool/retry and revocation pass through the
  actual staged ZIP.
- Source review found only configured ingestion/configuration/relay destinations,
  explicit test-event actions and independently enabled analytics. The diagnostic
  owners add no outbound sender. This is not packet capture of every published
  SDK or arbitrary application callback.

Python's previously documented asynchronous diagnostic callback timing remains
the one deliberate timing change from the remediation: `flush()` does not await
optional diagnostics. JavaScript callbacks must return promptly. Browser code
has no portable async-context guard for asynchronous forwarding explicitly
started by an application console; the contract/README now state that boundary
instead of implying transparent control over arbitrary application work.

## SDK applicability and evidence

All starting SDK source identities matched the previous qualification; all
12 repository HEADs were unchanged. Unchanged runtime paths retain their earlier
full-suite/artifact evidence rather than claiming a fresh run on every platform.

| Surface      | Deep-audit disposition                                                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node         | F1 corrected; full 681-test shared JS suite, lint/types/coverage/build and installed diagnostic/delivery canaries.                                                  |
| Browser      | F1 corrected; same JS gates, console capture on/off tests, installed console rejection and WordPress bundled asset.                                                 |
| Python       | No further runtime finding; 440 tests, lint/types/coverage/wheel/sdist, including new disposal/idle/reinitialisation regression.                                    |
| PHP          | Existing silent diagnostics and bounded hook validation verified by source identity; prior full/installed checks retained, candidate used in final WordPress ZIP.   |
| WordPress    | F3 corrected; 99 tests/501 assertions, static checks, 19-file coverage gate and exact staged-ZIP runtime qualification.                                             |
| Java         | Existing silent diagnostics and ownership handling verified; runtime unchanged, prior full/native/installed and recent safety controls retained.                    |
| Go           | Fixed diagnostic codes and unavailable-validation withholding verified; runtime unchanged, prior full/race/installed checks retained.                               |
| Ruby         | Existing silent diagnostics and exhausted-ownership handling verified; runtime unchanged, prior full/artifact and recent safety controls retained.                  |
| .NET         | Existing silent diagnostics and exhausted-ownership handling verified; runtime unchanged, prior full/artifact and recent safety controls retained.                  |
| Android      | Existing silent diagnostics, strict bridge validation and unavailable-ownership handling verified; runtime unchanged, prior full/native/RN Android checks retained. |
| Swift        | F2 corrected; 170 tests, 48-file coverage gate, exact extracted regression and SPM/CocoaPods iOS consumers.                                                         |
| React Native | JavaScript/native bridge implementation unchanged; existing facade/bridge evidence retained, corrected Swift source requalified in bare and Expo iOS consumers.     |
| Rust         | F4 corrected; 183 tests plus format/lint/types/features/package, extracted-package tests and standalone/Axum/Actix consumers; 53-module per-file coverage passed.   |

The preceding qualification and original findings remain in
[the diagnostics record](internal-diagnostics-qualification.md) and
[the hook-budget audit](before-send-budget-audit.md). This audit supersedes their
final-source identities where the corrections above apply.

## Receipts

Receipts are under `.tmp/sdk-deep-audit/`:

| Evidence                                         | Receipt                                                                                                                              |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Initial source identity and repository state     | `initial-state.json`                                                                                                                 |
| Failure before correction                        | `js-console-red.log`, `swift-privacy-red.log`, `wordpress-privacy-red.log`, `rust-ownership-red.log`                                 |
| Focused corrected regressions                    | `js-console-green.log`, `swift-privacy-green.log`, `wordpress-privacy-green.log`, `rust-ownership-green.log`, `python-lifecycle.log` |
| JS source and exact installed archives           | `js-full.log`, `js-final.log`, `js-installed.log`                                                                                    |
| Python source/package gates                      | `python-full.log`                                                                                                                    |
| Swift source/archive/native consumers            | `swift-full.log`, `swift-installed.log`, `swift-extracted-tests.log`                                                                 |
| WordPress unit/static/coverage/installed ZIP     | `wordpress-full.log`, `wordpress-coverage.log`, `wordpress-installed.log`                                                            |
| React Native real iOS delivery                   | `rn-bare-ios.log`, `rn-expo-ios-qualified.log`                                                                                       |
| Rust source/package/coverage                     | `rust-full.log`, `rust-installed.log`, `rust-coverage.log`                                                                           |
| Core receiving contract and SDK documentation    | `core-hook-contract.log`, `core-fixtures.log`, `core-docs.log`                                                                       |
| Final source/archive identities and preservation | `source-inventory.json`, `artifact-identities.json`, `artifact-content-checks.json`, `final-preservation-check.json`                 |

An initial Expo attempt reused the bare React Native fixture and failed before
native qualification. `rn-expo-ios.log` retains that setup failure; the qualified
run recreates only the disposable fixture with the pinned Expo 57 template.
Three local test launches encountered automatic approval-review timeouts; the
allowed retries succeeded. No gate was waived and no consumer product was used.

## Documentation reconciliation

The follow-up documentation pass aligns the public universal SDK guide, Node,
Browser and Python configuration guides, capture-policy guidance and redaction
guide with the qualified hook-budget and diagnostic behaviour. The shared guide
records the local diagnostic bounds and runtime limitations for every applicable
surface; the existing SDK READMEs and changelogs retain their detailed coverage.
Public prose describes the released behaviour without future-release qualifiers.

The shared guide's canonical event example now uses the actual envelope fields
and a valid `log_event` payload. Its loop checkpoint and bounded retry wording
also match the SDK contract. Historical qualification records distinguish the
completed deep audit from earlier evidence and the remaining publication gates.

Documentation receipts are under `.tmp/sdk-doc-readiness/`; they are separate
from the runtime and installed-artifact evidence above. This pass changes no SDK
runtime, dependency, public schema or generated API reference.

- `sdk-documentation.log`: all 51 strict cross-SDK documentation checks pass.
- `envelope-schema.log`: the public JSON example passes `EventEnvelopeSchema`.
- `site-check.log`: 98 site tests, the isolated production build and typecheck pass.
- `export-verification.json`: all six edited pages, new shared-section links and
  refreshed search content are present in the static export.
- `sdk-source-preservation.json`: all 12 SDK repository HEADs and 127 recorded
  local files match the completed deep audit; SDK diff checks pass.
- `docs-format.log`: the changed qualification records pass formatting.

Final version labels, dated release entries, dependent-package pins and registry
receipts are reconciled against the selected artifacts during the release train.

## Release boundary

Final runtime bytes in the retained Node/Browser, Swift, Rust and WordPress
archives match the audited source/build outputs. All modified source/test files
remain below the 1,000-line hard ceiling. The disposable WordPress Compose
project has no remaining containers.

Candidate archives still carry checkout versions and are not registry releases.
Publishing requires selecting new SDK versions, updating the React Native Swift
pin and WordPress PHP/Browser dependencies to those selected releases, qualifying
the final versioned artifacts and reading them back from the selected registries.
The previous native/platform release gates and immutable Git-pod distribution
requirements still apply. Local macOS/Linux/simulator evidence is not a claim of
new qualification on every supported OS, compiler or physical device.

No commit, push, publication, deployment, existing-site installation or consumer
adoption is part of this audit. No unrelated local work or Docker resources were
removed.
