# Browser resource controls and SDK privacy release

## Eligibility

| Distribution                                   | Decision               | Current → candidate     | Shipped change                                                                         |
| ---------------------------------------------- | ---------------------- | ----------------------- | -------------------------------------------------------------------------------------- |
| Shared types                                   | Publish                | 3.8.0 → 3.9.0           | Additive capture-rule schemas, evaluation and resource suggestions.                    |
| Redaction                                      | Publish                | 2.7.1 → 2.8.0           | Exact-key extensions and schema-aware protocol-field handling.                         |
| Core and dashboard                             | Publish                | 1.31.0 → 1.32.0         | Forward migration, hosted threshold enforcement, incident evidence and rule controls.  |
| CLI                                            | Publish                | 1.29.0 → 1.30.0         | Threshold management, local incident separation and installed skill guidance.          |
| Ordinary MCP and Official MCP Registry         | Publish                | 1.29.0 → 1.30.0         | Existing tools take new capture-rule inputs through the shared schemas.                |
| ClawHub portable skill                         | Publish                | 1.29.0 → 1.30.0         | Installed rule selection and diagnosis guidance with verified npm pins.                |
| ClawHub OpenClaw plugin                        | Publish                | 1.29.0 → 1.30.0         | Full MCP tool projection carries the new rule inputs.                                  |
| Smithery MCP and skill                         | Retain                 | Existing listings       | The provider retired its publishing API and CLI.                                       |
| Claude Code plugin                             | Publish                | 1.25.0 → 1.25.1         | Installed incident diagnosis and capture-rule guidance.                                |
| Codex plugin                                   | Publish                | 1.9.0 → 1.9.1           | Installed incident diagnosis and capture-rule guidance.                                |
| Gemini extension                               | Publish                | 1.8.0 → 1.8.1           | Installed incident diagnosis and capture-rule guidance.                                |
| OpenAI skill archive                           | Publish candidate only | 1.1.0 → 1.1.1 candidate | Updated diagnosis and CLI handoff guidance within the frozen 23-tool contract.         |
| OpenAI portal and listing                      | Retain                 | Existing                | Candidate archive preparation is the selected distribution action.                     |
| Browser SDK                                    | Publish                | 3.2.4 → 3.3.0           | Teardown visibility and exact-key privacy before evidence retention.                   |
| Node SDK                                       | Publish                | 3.2.4 → 3.3.0           | Exact-key privacy in capture, probes and delivery hooks.                               |
| PHP SDK                                        | Publish                | 2.1.4 → 2.2.0           | Exact-key privacy and allowlisted Laravel/Symfony rate-limit evidence.                 |
| Python SDK                                     | Publish                | 3.0.0 → 3.1.0           | Exact-key privacy in capture and Django, FastAPI and Flask relays.                     |
| Go SDK                                         | Publish                | 3.1.4 → 3.2.0           | Exact-key privacy in capture and relay evidence.                                       |
| Rust SDK                                       | Publish                | 1.0.2 → 1.1.0           | Exact-key privacy at the event and relay wire boundaries.                              |
| Ruby SDK                                       | Publish                | 2.1.4 → 2.2.0           | Exact-key privacy in capture, Rails and the relay handler.                             |
| Java family                                    | Publish                | 3.1.4 → 3.2.0           | Exact-key privacy in capture, the Web relay and Spring Boot configuration.             |
| .NET family                                    | Publish                | 2.1.4 → 2.2.0           | Exact-key privacy in SDK capture and ASP.NET Core relay delivery.                      |
| Android family                                 | Publish                | 3.1.4 → 3.2.0           | Exact-key privacy in retained native evidence and capture.                             |
| Swift SDK                                      | Publish                | 3.1.5 → 3.2.0           | Exact-key privacy through native capture, runtime evidence and the crash reporter.     |
| WordPress plugin                               | Publish                | 2.1.4 → 2.2.0           | Bundles the released PHP and Browser privacy and evidence changes.                     |
| React Native SDK                               | Publish                | 3.1.4 → 3.2.0           | Exact-key privacy across JavaScript and both native bridges.                           |
| Public site                                    | Publish                | 1.12.0 → 1.13.0         | Capture controls, privacy guidance, generated API reference and released SDK versions. |
| GitHub Action and other unchanged integrations | Retain                 | Existing                | Existing public artifacts retain their installed behaviour.                            |
| CocoaPods Trunk                                | Retain                 | Existing                | Swift selects immutable Git tags, SPM and Git pods.                                    |

## Qualification

The requirements and acceptance mapping is in [browser resource incidents](browser-resource-incidents.md#acceptance-mapping). The [SDK contract](../contracts/sdk-interface.md) defines exact-key matching, mandatory credential redaction and the supported relay and bridge boundaries. The privacy fixture is synchronized to each of the twelve companion repositories. Verify source tests, installable artifacts and public delivery for each eligible surface independently.

Qualify the forward migration against real Postgres, including readiness, ledger and replay. The deployed source used by the mixed-version test is `f4f5029f813049e65a3fdea6b050ebf7938fbcb7`, confirmed by the live dashboard build identifier and the preceding hosted rollout. Preserve the active runtime and one previous stable release. Keep the migration applied across a runtime rollback.

Publish the shared packages first and verify clean registry installs. Promote core and dashboard before publishing the agent clients. Verify the JS SDK registry installs before qualifying the WordPress ZIP. Verify Swift and Android public artifacts before qualifying the React Native wrapper. Reconcile release banners after registry readback.

Hosted core uses the approved two-step rollout. First apply the forward migration and promote Core 1.32.0 with new capture-rule writes paused. Verify the API, active worker and retained release. Promote the same source with writes enabled only when the Cloud guard has verified compatible active and rollback image pairs. Deploy the dashboard separately after runtime activation. The public site follows SDK publication.

The [CocoaPods schedule](https://blog.cocoapods.org/CocoaPods-Specs-Repo/) refreshed on 25 November 2026 still lists 2 December 2026 for permanent Trunk read-only mode. Use immutable Swift Git refs and qualify public SPM, Git pods, bare React Native and Expo before publishing the dependent wrapper. The [Smithery retirement notice](https://www.smithery.ai/future) confirms the 31 October shutdown. The public directory remains available.

## Release receipts

The standalone privacy update shipped from site commit `9fb3271cb0d0cd7c4bab9894ec229d06907995a4`. The site passed 137 local tests, typecheck, static export and GitHub CI. CloudFront invalidation passed and the public policy was read back with both requested report disclosures. [Site pull request](https://github.com/debugbundle/site/pull/12) · [Hosted site workflow](https://github.com/debugbundle/debugbundle-cloud/actions/runs/45647393786) · [Public privacy policy](https://debugbundle.com/privacy/)

Candidate qualification is in progress. Shared package source and versions are committed locally at `bccd0ca4`. The local package builds and publication preflight pass. Core lint, typecheck, guidance and plugin checks passed during preflight. The real-storage run passed 186 tests across 40 files with one test skipped. A focused Postgres rerun passed all seven browser-resource tests after fixing the threshold receipt-order regression. The updated mixed-version gate passes credential isolation, legacy capture-rule reads, and the compatible new API response after the additive migration.

Once a new rule is saved, the deployed predecessor samples out threshold and allow matches and can broaden a multi-URL drop. This was reproduced with synthetic events using the exact deployed source. The hosted rollout needs a rollback-compatible activation sequence before new-rule writes are enabled.

| Local candidate   | Verification                                                                                                                                         |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node and Browser  | 698 source tests against the packed shared candidates.                                                                                               |
| PHP, Python, Ruby | Language test suites and their local static or packaging checks pass.                                                                                |
| Go                | Tests, vet, lint and the per-file coverage gate pass with invalid resource-observation cases.                                                        |
| Rust              | Formatting, lint, typecheck, feature checks, tests and local crate packaging pass.                                                                   |
| Java and .NET     | Maven verification and .NET build and tests pass.                                                                                                    |
| Android and Swift | Per-file coverage and native source tests pass. Swift Git-pod workflow tests pass.                                                                   |
| React Native      | JavaScript and iOS bridge harness pass. Public Maven and Swift artifacts are prerequisites for installed wrapper, bare React Native and Expo checks. |
| WordPress         | The PHP and Browser releases are prerequisites for the final ZIP and installed runtime checks.                                                       |

The packed CLI candidate passes clean local installs on Node 22, 24 and 26. Candidate site artifacts, SDK documentation checks, tests, static build and typecheck pass. Public SDK installs and the broader site rollout follow publication.
