# SDK safety release train — 15 November 2026

Owner-authorised scope: commit, publish and deploy the completed DebugBundle SDK
hook-budget and internal-diagnostic corrections, including their own dependent
wrappers and the DebugBundle app/site. Consumer products and existing WordPress
sites are excluded. This record tracks progress; version definitions are not
publication or deployment receipts.

## Version decisions and eligibility

| Distribution                             | Decision                   | Version           | Reason                                                                                                                                |
| ---------------------------------------- | -------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Node / Browser                           | Publish                    | 3.2.4             | Hook replacement budget and local diagnostic containment/runtime corrections; aligned JS family.                                      |
| Python                                   | Publish                    | 3.0.0             | Hook-budget fixes plus a deliberate diagnostic callback thread/completion change; major version with `MIGRATION-3.0.md`.              |
| PHP                                      | Publish                    | 2.1.4             | Correct valid overflow reduction and malformed-return fallback.                                                                       |
| Java family                              | Publish                    | 3.1.4             | Correct hook-budget reduction and validation across the aligned Maven family.                                                         |
| Go                                       | Publish                    | 3.1.4             | Correct hook replacement handling and use bounded diagnostic codes.                                                                   |
| Ruby                                     | Publish                    | 2.1.4             | Preserve replacement redaction and complete malformed-evidence validation.                                                            |
| .NET family                              | Publish                    | 2.1.4             | Correct hook replacement and optional-evidence handling across the aligned NuGet family.                                              |
| Android family                           | Publish                    | 3.1.4             | Correct canonical hook budget handling while retaining bridge/native contracts.                                                       |
| Swift                                    | Publish                    | 3.1.5             | Correct hook reduction and safe local ACK diagnostics, including credential-shaped codes.                                             |
| Rust                                     | Publish                    | 1.0.2             | Correct hook-budget reduction and withhold unavailable whole-event validation.                                                        |
| React Native                             | Publish after native roots | 3.1.4             | Correct JS hook handling and adopt corrected Android/Swift implementations.                                                           |
| WordPress                                | Publish after PHP/Browser  | 2.1.4             | Adopt corrected bundled SDKs and repair local diagnostic nonce privacy.                                                               |
| Core / hosted app                        | Publish/deploy after JS    | 1.27.2            | Adopt the corrected Node/Browser packages; preserve existing configuration and data.                                                  |
| Site                                     | Publish/deploy after JS    | 1.10.4            | Adopt the corrected Browser package and ship reconciled SDK guidance.                                                                 |
| Shared types / redaction                 | Retain                     | 3.7.0 / 2.7.1     | No changed shipped implementation or required distribution repair; the JS SDKs retain their compatible shared-types 3.0.0 dependency. |
| CLI / MCP / OpenClaw / developer plugins | Retain                     | Existing versions | No changed installed behaviour; no package or marketplace cascade.                                                                    |

All SDK fixes except Python's optional diagnostic timing change are compatible
bug/privacy/reliability corrections and use patch increments. Python retains its
capture API and event protocol; the separate major protects clients relying on
inline diagnostic side effects or thread affinity. The migration guide is in
repository documentation and the source distribution.

## Qualification and order

The [deep audit](sdks/sdk-deep-audit-20261115.md), [hook-budget qualification](sdks/before-send-budget-audit.md)
and [diagnostic qualification](sdks/internal-diagnostics-qualification.md) retain
all thirteen surface dispositions, failing regressions, full source gates and
installed/native artifact evidence. Versioned release artifacts must pass their
own CI, staged-package checks and published-consumer gates as well.

The live CocoaPods provider schedule was refreshed on 15 November: the announced
permanent Trunk freeze remains 2 December 2026. Swift selects the existing SPM and
immutable Git-pod channels; public source, bare RN and Expo runtime checks remain
mandatory. Trunk publication is not selected for this train.

Publish independent roots first, then React Native and WordPress against their
verified public dependencies. Adopt the published JS family in DebugBundle core
and site only after registry readback. Use exact qualified core/site SHAs for the
hosted rollout, preserve existing activation/configuration and the verified
rollback pair, and verify served bytes and health independently. No migration,
new endpoint, event schema, infrastructure or consumer adoption is introduced.

Receipts: `.tmp/sdk-release-20261115/`. Initial inventory records all fifteen
repositories, clean remote ancestry and preserved pre-release local files.
Current status: version preparation and source qualification in progress.
