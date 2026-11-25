# Browser resource controls and SDK privacy release

## Eligibility

| Distribution                                   | Decision              | Current → candidate     | Shipped change                                                                           |
| ---------------------------------------------- | --------------------- | ----------------------- | ---------------------------------------------------------------------------------------- |
| Shared types                                   | Publish               | 3.8.0 → 3.9.0           | Additive capture-rule schemas, evaluation and resource suggestions.                      |
| Redaction                                      | Publish               | 2.7.1 → 2.8.0           | Exact-key extensions and schema-aware protocol-field handling.                           |
| Core and dashboard                             | Publish               | 1.31.0 → 1.32.0         | Forward migration, hosted threshold enforcement, incident evidence and rule controls.    |
| CLI                                            | Publish               | 1.29.0 → 1.30.0         | Threshold management, local incident separation and installed skill guidance.            |
| Ordinary MCP and Official MCP Registry         | Publish               | 1.29.0 → 1.30.0         | Existing tools take new capture-rule inputs through the shared schemas.                  |
| ClawHub portable skill                         | Publish               | 1.29.0 → 1.30.0         | Installed rule selection and diagnosis guidance with verified npm pins.                  |
| ClawHub OpenClaw plugin                        | Publish               | 1.29.0 → 1.30.0         | Full MCP tool projection carries the new rule inputs.                                    |
| Smithery MCP and skill                         | Retain                | Existing listings       | The provider retired its publishing API and CLI.                                         |
| Claude Code plugin                             | Publish               | 1.25.0 → 1.25.1         | Installed incident diagnosis and capture-rule guidance.                                  |
| Codex plugin                                   | Publish               | 1.9.0 → 1.9.1           | Installed incident diagnosis and capture-rule guidance.                                  |
| Gemini extension                               | Publish               | 1.8.0 → 1.8.1           | Installed incident diagnosis and capture-rule guidance.                                  |
| OpenAI skill archive                           | Retain public version | 1.1.0 candidate refresh | Updated diagnosis and CLI handoff guidance. Keep the existing tool contracts and scopes. |
| OpenAI portal and listing                      | Retain                | Existing                | Candidate archive preparation is the selected distribution action.                       |
| Browser SDK                                    | Publish               | 3.2.4 → 3.3.0           | Teardown visibility and exact-key privacy before evidence retention.                     |
| Node SDK                                       | Publish               | 3.2.4 → 3.3.0           | Exact-key privacy in capture, probes and delivery hooks.                                 |
| PHP SDK                                        | Publish               | 2.1.4 → 2.2.0           | Exact-key privacy and allowlisted Laravel/Symfony rate-limit evidence.                   |
| Python SDK                                     | Publish               | 3.0.0 → 3.1.0           | Exact-key privacy in capture and Django, FastAPI and Flask relays.                       |
| Go SDK                                         | Publish               | 3.1.4 → 3.2.0           | Exact-key privacy in capture and relay evidence.                                         |
| Rust SDK                                       | Publish               | 1.0.2 → 1.1.1           | Exact-key privacy at the event and relay wire boundaries with patched dependencies.      |
| Ruby SDK                                       | Publish               | 2.1.4 → 2.2.1           | Exact-key privacy in capture, Rails and the relay handler, with bounded graph reuse.     |
| Java family                                    | Publish               | 3.1.4 → 3.2.0           | Exact-key privacy in capture, the Web relay and Spring Boot configuration.               |
| .NET family                                    | Publish               | 2.1.4 → 2.2.0           | Exact-key privacy in SDK capture and ASP.NET Core relay delivery.                        |
| Android family                                 | Publish               | 3.1.4 → 3.2.0           | Exact-key privacy in retained native evidence and capture.                               |
| Swift SDK                                      | Publish               | 3.1.5 → 3.2.0           | Exact-key privacy through native capture, runtime evidence and the crash reporter.       |
| WordPress plugin                               | Publish               | 2.1.4 → 2.2.0           | Bundles the released PHP and Browser privacy and evidence changes.                       |
| React Native SDK                               | Publish               | 3.1.4 → 3.2.0           | Exact-key privacy across JavaScript and both native bridges.                             |
| Public site                                    | Publish               | 1.12.0 → 1.13.0         | Capture controls, privacy guidance, generated API reference and released SDK versions.   |
| GitHub Action and other unchanged integrations | Retain                | Existing                | Existing public artifacts retain their installed behaviour.                              |
| CocoaPods Trunk                                | Retain                | Existing                | Swift selects immutable Git tags, SPM and Git pods.                                      |

## Qualification

The requirements and acceptance mapping is in [browser resource incidents](browser-resource-incidents.md#acceptance-mapping). The [SDK contract](../contracts/sdk-interface.md) defines exact-key matching, mandatory credential redaction and the supported relay and bridge boundaries. The privacy fixture is synchronized to each of the twelve companion repositories. Verify source tests, installable artifacts and public delivery for each eligible surface independently.

Qualify the forward migration against real Postgres, including readiness, ledger and replay. The deployed source used by the mixed-version test is `f4f5029f813049e65a3fdea6b050ebf7938fbcb7`, confirmed by the live dashboard build identifier and the preceding hosted rollout. Preserve the active runtime and one previous stable release. Keep the migration applied across a runtime rollback.

Publish the shared packages first and verify clean registry installs. Promote core and dashboard before publishing the agent clients. Verify the JS SDK registry installs before qualifying the WordPress ZIP. Verify Swift and Android public artifacts before qualifying the React Native wrapper. Reconcile release banners after registry readback.

Hosted core uses the approved two-step rollout. First apply the forward migration and promote Core 1.32.0 with new capture-rule writes paused. Verify the API, active worker and retained release. Promote the same source with writes enabled only when the Cloud guard has verified compatible active and rollback image pairs. Deploy the dashboard separately after runtime activation. The public site follows SDK publication.

The [CocoaPods schedule](https://blog.cocoapods.org/CocoaPods-Specs-Repo/) refreshed on 25 November 2026 still lists 2 December 2026 for permanent Trunk read-only mode. Use immutable Swift Git refs and qualify public SPM, Git pods, bare React Native and Expo before publishing the dependent wrapper. The [Smithery retirement notice](https://www.smithery.ai/future) confirms the 31 October shutdown. The public directory remains available.

## Release receipts

The standalone privacy update shipped from site commit `9fb3271cb0d0cd7c4bab9894ec229d06907995a4`. The site passed 137 local tests, typecheck, static export and GitHub CI. CloudFront invalidation passed and the public policy was read back with both requested report disclosures. [Site pull request](https://github.com/debugbundle/site/pull/12) · [Hosted site workflow](https://github.com/debugbundle/debugbundle-cloud/actions/runs/45647393786) · [Public privacy policy](https://debugbundle.com/privacy/)

Shared types 3.9.0 and redaction 2.8.0 were published from `bccd0ca408da5c68f93a7b92c7dbd9aa874c0f8f` using `shared-js-v3.9.0`. The release workflow installed both exact npm versions into a clean consumer. A second clean install exercised the threshold and allow actions and exact-key redaction. [Shared JS release workflow](https://github.com/debugbundle/debugbundle/actions/runs/45659545974)

Core lint, typecheck, agent guidance and plugin checks passed. The full unit run completed all 146 test groups. The local site projection exposed a stale OpenAPI export. Regenerating the references and rerunning the full contract group passed. The combined coverage check passed for all 52 changed source files. The real-storage run passed 186 tests across 40 files with one test skipped. A focused Postgres rerun passed all seven browser-resource tests after fixing the threshold receipt-order regression. The updated mixed-version gate passes credential isolation, legacy capture-rule reads, and the compatible new API response after the additive migration.

Once a new rule is saved, the deployed predecessor samples out threshold and allow matches and can broaden a multi-URL drop. This was reproduced with synthetic events using the exact deployed source. The two-step rehearsal verified that the paused bridge refuses new threshold writes and can read rows created by the enabled runtime. Cloud deployment tests verify the active and retained image gate.

The tested bridge automation was merged into DebugBundle Cloud at `f9284e357ea1af6668cadb13f444e5f44b633860`. [Cloud pull request](https://github.com/debugbundle/debugbundle-cloud/pull/12)

Core 1.32.0 was released from `99f4301aeae59c504937707208061e6af1546ba8`. The paused bridge applied migration `202611240001_add_capture_rule_thresholds` before promoting its API and worker. The activation rollout verified all 97 applied migrations, enabled advanced writes, and retained the bridge as the rollback release. Both rollouts activated processing on the worker and passed public API and MCP readiness. [Core release](https://github.com/debugbundle/debugbundle/releases/tag/v1.32.0) · [Paused bridge](https://github.com/debugbundle/debugbundle-cloud/actions/runs/45663024494) · [Activation](https://github.com/debugbundle/debugbundle-cloud/actions/runs/45664256572)

| Hosted release                 | Release ID                    | API and worker manifest digest                                            |
| ------------------------------ | ----------------------------- | ------------------------------------------------------------------------- |
| Active, writes enabled         | `20261125172652-f29b359385df` | `sha256:b4de06110940e496f7b6551b2b94ddcec1262f9bd1b8f4396e1ce035b17c2e4e` |
| Retained bridge, writes paused | `20261125171952-383ddf66cc5c` | `sha256:490ef1f3d64b6de9cd0013cd299c90507b43929fad2c606816618481ade6a2a1` |

The dashboard serves build `99f4301aeae59c504937707208061e6af1546ba8` after CloudFront invalidation. Its referenced JavaScript returned HTTP 200. [Dashboard workflow](https://github.com/debugbundle/debugbundle-cloud/actions/runs/45665384875)

### Agent distributions

CLI and MCP 1.30.0 were published from `d3505b12d3413e5ba11e048620b93b4283f45bf6`. Exact public npm installs passed on Node 22, 24 and 26. The official MCP Registry serves `com.debugbundle/mcp` 1.30.0. [CLI workflow](https://github.com/debugbundle/debugbundle/actions/runs/45666347848) · [MCP workflow](https://github.com/debugbundle/debugbundle/actions/runs/45666347355)

The ClawHub skill and OpenClaw plugin resolve at 1.30.0 and passed final ClawScan review. The skill passed moderation and six of seven discovery queries. The exact public plugin installed normally on OpenClaw 2026.11.10, matched the qualified entry bytes and passed scoped runtime checks. The local archive also passed installed checks on the minimum OpenClaw 2026.6.9. [Skill](https://clawhub.ai/debugbundle/skills/debugbundle) · [Plugin audit](https://clawhub.ai/debugbundle/plugins/openclaw-plugin/security-audit?version=1.30.0)

Codex 1.9.1 and Claude Code 1.25.1 were promoted at `f035d08ba45e046954da0963f3b66c7f69062241`. Gemini 1.8.1 was published at `c24d04a3e3bd817cf284cc514efbe6cb8ba15c0d` with a byte-matched ZIP. All three passed public native install, synthetic read and removal checks against MCP 1.30.0. Codex and Gemini also passed public update checks. [Core marketplace PR](https://github.com/debugbundle/debugbundle/pull/25) · [Gemini Release](https://github.com/debugbundle/debugbundle-gemini/releases/tag/v1.8.1)

The OpenAI 1.1.0 candidate refresh uses the active API digest with the existing registered connection and the exact frozen 23-tool catalog and scopes. See [the distribution ledger](agent-distribution-ledger.md) for the eligibility and platform limits.

### SDKs

| Local candidate   | Verification                                                                                                                                         |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node and Browser  | 716 source tests, per-file coverage and packed runtime smoke with published shared-types 3.9.0 and redaction 2.8.0.                                   |
| PHP, Python, Ruby | Language test suites and their local static or packaging checks pass.                                                                                |
| Go                | Tests, vet, lint and the per-file coverage gate pass with invalid resource-observation cases.                                                        |
| Rust              | Formatting, lint, typecheck, feature checks, tests and local crate packaging pass.                                                                   |
| Java and .NET     | Maven verification and .NET build and tests pass.                                                                                                    |
| Android and Swift | Per-file coverage and native source tests pass. Swift passes 176 iOS simulator tests and the Git-pod workflow tests.                                 |
| React Native      | JavaScript and iOS bridge harness pass. Public Maven and Swift artifacts are prerequisites for installed wrapper, bare React Native and Expo checks. |
| WordPress         | The PHP and Browser releases are prerequisites for the final ZIP and installed runtime checks.                                                       |

Node and Browser 3.3.0 were published from `191f222084e8ca30fdb24fd559b7a3dec6001f6a`. The release runner passed the exact registry install, delivery and privacy smoke. An independent fresh Docker install confirmed both package versions and their two shared pins after npm propagation. A second workflow attempt completed the interrupted GitHub asset upload without republishing npm packages. [GitHub release](https://github.com/debugbundle/debugbundle-js/releases/tag/v3.3.0) · [Release workflow](https://github.com/debugbundle/debugbundle-js/actions/runs/45675617683)

| Public distribution | Published source SHA | Registry or tag | Installed verification |
| ------------------- | -------------------- | --------------- | ---------------------- |
| .NET 2.2.0 | `aac02164a7c0458cb3f14a5cee7cd14194af7af0` | [NuGet](https://www.nuget.org/packages/DebugBundle.Sdk/2.2.0) | All ten binaries resolved publicly. The release runner and independent fresh containers passed the exact NuGet consumer smoke on .NET 8 and 10. [Workflow](https://github.com/debugbundle/debugbundle-dotnet/actions/runs/45676864669) |
| Android 3.2.0 | `0ecd1f353a8a4d64fc9288faf17392cca33d52e9` | [Maven Central](https://repo.maven.apache.org/maven2/com/debugbundle/debugbundle-android/3.2.0/) | Connected tests passed on API 23, 36 and 37.0. The published consumer smoke passed, and independent checks resolved all nine POMs and the public native AAR. [Workflow](https://github.com/debugbundle/debugbundle-android/actions/runs/45676864739) |
| Go 3.2.0 | `c3a876ad523b1d78afcc2f19503064bfa8e72627` | [Go module proxy](https://proxy.golang.org/github.com/debugbundle/debugbundle-go/v3/@v/v3.2.0.info) | Clean public module smoke and independent exact source readback. [Workflow](https://github.com/debugbundle/debugbundle-go/actions/runs/45676866435) |
| Java 3.2.0 | `10551fc072127abd9aa0d9866dc9117fd2e5418f` | [Maven Central](https://repo.maven.apache.org/maven2/com/debugbundle/debugbundle-java-core/3.2.0/) | All nine Maven POMs resolved publicly, and a clean public Maven consumer passed on Java 21. [Workflow](https://github.com/debugbundle/debugbundle-java/actions/runs/45676870371) |
| PHP 2.2.0 | `65492e053e4587d74ba936a087d3373f90c4d4df` | [Packagist](https://packagist.org/packages/debugbundle/sdk-php#v2.2.0) | PHP-FPM and exact Composer install passed. The original coverage run found two files below 80%. Packagist indexed the tag automatically. Test-only follow-up `669af825c13f2e6fa9098f8c31e56254f5c62614` passed with unchanged shipped source and package metadata. [Workflow](https://github.com/debugbundle/debugbundle-php/actions/runs/45677934855) |
| Python 3.1.0 | `dc009fc1960691f4908f77cc38ac7286a03966d5` | [PyPI](https://pypi.org/project/debugbundle-python/3.1.0/) | Wheel, source distribution and clean PyPI install passed. [Workflow](https://github.com/debugbundle/debugbundle-python/actions/runs/45676868524) |
| React Native 3.2.0 | `988faca27a77cecde51b60962c8b2634c360bd72` | [npm](https://www.npmjs.com/package/@debugbundle/sdk-react-native/v/3.2.0) | The exact published Android Maven and Swift Git-pod dependencies passed bare Android, bare iOS and Expo iOS runtime delivery before npm publication. Clean npm installs passed on the release runner and independently, with both native pins confirmed. [Workflow](https://github.com/debugbundle/debugbundle-react-native/actions/runs/45681811581) |
| Ruby 2.2.1 | `aa1bc6769ab4ecc6a519dd06e75e071b5ddc1139` | [RubyGems](https://rubygems.org/gems/debugbundle/versions/2.2.1) | Host-safety budget, compatibility matrix and exact public gem smoke passed. The 2.2.0 tag stopped at the performance gate and its gem was never published. [Workflow](https://github.com/debugbundle/debugbundle-ruby/actions/runs/45678561046) |
| Rust 1.1.1 | `295a475c801e50d1dcabd17c3774e4fc4cf0c4e7` | [crates.io](https://crates.io/crates/debugbundle/1.1.1) | All eight platform and qualification jobs passed. The downloaded crate SHA-256 `cd4d5c7bf6e6fb2dfff0059723b96b477efc2218ba06b83d6d2b797b9800c631` matches the public index and the source commit matches the qualified artifact. Clean registry-installed apps passed. [Workflow](https://github.com/debugbundle/debugbundle-rust/actions/runs/45684317069) |
| Swift 3.2.0 | `e2d6441908d9c3f48cff7c834a929adb58d99559` | [Immutable Git release](https://github.com/debugbundle/debugbundle-swift/releases/tag/v3.2.0) | Exact public SPM and Git-pod consumers, iOS deployment target and simulator suite passed. The independent Trunk gate was skipped. [Workflow](https://github.com/debugbundle/debugbundle-swift/actions/runs/45676863179) |
| WordPress 2.2.0 | `26c76981530b6dbe65f3a4dda2384fb4e089f176` | [WordPress.org](https://wordpress.org/plugins/debugbundle/) · [GitHub ZIP](https://github.com/debugbundle/debugbundle-wordpress/releases/tag/v2.2.0) | Exact installed ZIP passed on local WordPress 7.1.1 and both publication runs. The directory ZIP matches all 239 GitHub distribution files and bundles PHP 2.2.0 and Browser 3.3.0. [Directory workflow](https://github.com/debugbundle/debugbundle-wordpress/actions/runs/45678500707) |

The Rust 1.1.0 tag stopped before crate publication. The release audit found advisories in URL and Actix dependencies and reported Chrono as unmaintained. The 1.1.1 correction selects patched `url` 2.5.9 and `actix-http` 3.21.3. It also removes redundant graph copies. All 22 performance cases pass locally and on the exact release CI run. The affected case allocated 39,380,316 bytes over 512 calls on the hosted runner against the 41,612,797-byte budget. The approved temporary audit exception applies only to Chrono’s maintenance advisory because the public field `RecoveryObservation.occurred_at` uses `chrono::DateTime<Utc>`. The exception ends when that public dependency is replaced. [Rust audit advisory](https://rustsec.org/advisories/RUSTSEC-2026-0543.html) · [Original qualification](https://github.com/debugbundle/debugbundle-rust/actions/runs/45676862476) · [Corrected qualification](https://github.com/debugbundle/debugbundle-rust/actions/runs/45684317008)

### Public documentation

Site 1.13.0 was qualified from `faa5692151f8bd59d7fdd0aee1753fcf86f6ab80` after the final SDK appeared on its registry. The generated API and machine-readable reference artifacts were refreshed. All 51 SDK documentation contract tests and 137 site tests passed, as did the webpack static export and typecheck. The deployment and CDN readback are recorded separately below after publication.

### Consumer adoption

- Upgrade the relevant SDKs and refresh lockfiles in each separately authorised consumer. Re-run that application's build and local synthetic capture, privacy and delivery checks before release.
- React Native 3.2.0 uses Android 3.2.0 and the Swift 3.2.0 Git pod. Bare iOS apps add the immutable Swift source before installing pods. Expo development builds rerun prebuild and rebuild the native app.
- Existing WordPress sites adopt the directory’s 2.2.0 plugin through a separately approved site update. The ZIP bundles PHP 2.2.0 and Browser 3.3.0.
- Review the exact scope and effect before authorising any live threshold, allow or drop rule. This release's validation used isolated synthetic rules.
