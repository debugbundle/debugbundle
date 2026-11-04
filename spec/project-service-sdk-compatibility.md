# Project/service consolidation SDK compatibility qualification

Status: local compatibility qualification passed, 4 November 2026. This is part of the single authorised
implementation phase, not a separate release or consumer adoption authorisation.
Inventory: `sdks.json`, `spec/sdk-language-targets.md`, and all eleven local SDK
repositories (twelve capture surfaces) were checked; their worktrees were clean.

## Executed source qualification

The existing configuration/probe/transport suites pass against unchanged SDK
checkouts: JavaScript (Node, browser and relays) 86 cases; Python 65; PHP 208;
WordPress 93; Ruby 27 examples; Java 16; .NET 11; Android 4 configuration cases;
Swift 4 configuration/probe cases; React Native 125 JavaScript cases with its
existing coverage gate. The complete Go package suite passes. All eleven SDK
worktrees remain clean after these checks. Swift used its committed resolved
dependencies with automatic resolution disabled. Android and Java ran in their
repo-owned Docker targets; no consumer/device runtime was touched.

Both React Native native bridge suites now pass; the iOS harness reports 97.14%
Swift and 100% Objective-C line coverage. No SDK code or distribution has changed.
The harness does not establish production React Native SPM support.

The installed runtime lane verifies retained Node SDK 3.2.0 against real
candidate API/worker processes before and after consolidation, with original
NULL-scope tokens and an explicitly new canonical credential. Retained CLI
1.18.2/MCP 1.18.3 archives are integrity-checked against their saved registry
manifests and exercised alongside packed candidate clients. Worker restart,
compatible API restart, six immutable S3 objects and canonical-origin cleanup
pass. Artifact hashes are retained in `.tmp/project-service-runtime/receipt.json`.

## Qualified source identities

| Repository | Unchanged commit |
| --- | --- |
| `sdks/debugbundle-js` | `4b3486578fcc3d8f41c44c2f8dbeaef32313ea36` |
| `sdks/debugbundle-python` | `d889945a76360dc9a910e0f30c6596de3f0ba11f` |
| `sdks/debugbundle-php` | `d0ffe46d9c7e72d3e11befae7b267cb46ea01ec4` |
| `sdks/debugbundle-wordpress` | `4f63edaae865f73c4cd4b1e92bd2d598247b66cd` |
| `sdks/debugbundle-java` | `5767ebb6057bef09597dc9cc258e74908960a0e1` |
| `sdks/debugbundle-go` | `12a4042209d0d2290a88f616cc3f70b44f657a5c` |
| `sdks/debugbundle-ruby` | `4e220a0d3c342e8909a4ee6c256a906c9e20dd2c` |
| `sdks/debugbundle-android` | `68fa6d12c0db17a9abd89d7e894f89175ef29370` |
| `sdks/debugbundle-swift` | `c027476f9cda008d40365af34675be98cc71067d` |
| `sdks/debugbundle-react-native` | `44ce6a67219f94e87d5fb9ecb38dd8b7146a752d` |
| `sdks/debugbundle-dotnet` | `6190edab686a4ee88e2696761c001e5d1048ec7d` |

## Shared candidate behaviour

The implementation is in API/storage. Installed credentials retain issuer IDs,
tokens, origin restrictions and probe HMAC keys. Envelopes, local capture safety,
retry/acknowledgement formats, relays and native bridge payloads are unchanged.
Canonical service renaming is projected server-side and never rewrites raw bytes.
Empty SDK capture-rule arrays use the established server-evaluation fallback.
Narrow probe wildcards expand into ordinary service directives with the same
activation ID; existing parsers retain directive arrays, rather than indexing
away alternate service names. Trigger defaulting preserves deployed names/keys;
explicit adoption can choose an exact deployed token snapshot and retained name.
New broader/restricted credentials use a domain-separated key bound to their saved
scope. Old wildcards cannot expand, so merging needs no trigger-expiry wait.

Every row below has disposition **already equivalent at the unchanged SDK wire
boundary**, implemented through the shared API/storage projection. Source
inspection and family tests establish the unchanged parser/transport equivalents.
The installed Node/client lane separately proves real legacy and canonical flows;
it is not installed-artifact or device proof for every language. No unverified
platform is being presented as device proof.

| Surface      | Source boundary reviewed                                                                                                          | Qualification to retain                                                                                                                                    |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node.js      | `sdks/debugbundle-js/packages/sdk-node/src/remote-probes.ts`, `capture-rules.ts`; directive map/filter and exact service matching | Existing remote-probe, capture-rule and delivery tests; old/new package through canonical/legacy credentials; Express/Fastify/Nest/Next and relay adapters |
| Browser      | `sdks/debugbundle-js/packages/sdk-browser/src/probes.ts`, `capture-rules.ts`; array directives and piggyback                      | Session-start/piggyback, empty-rule fallback, relay credential isolation and old browser artifact                                                          |
| Python       | `sdks/debugbundle-python/src/debugbundle/config.py`, `trigger_token.py`; directive list and issuer-key signature                  | Remote-config/trigger tests, original signing key and framework/relay transport                                                                            |
| PHP          | `sdks/debugbundle-php/src/RemoteConfig.php`, `DebugBundleSdkPolicySupport.php`                                                    | Config/policy/trigger and framework relay tests; installed Composer artifact                                                                               |
| WordPress    | `sdks/debugbundle-wordpress/src/CachedConfigFetcher.php`; endpoint/token-hash cache, original PHP transport and browser relay     | Cached-config tests, PHP/browser/relay paths through the actual plugin ZIP; no existing site installation authorised                                       |
| Java         | `sdks/debugbundle-java/debugbundle-java-core/src/main/java/com/debugbundle/sdk/RemoteConfigParser.java`                           | Parser, remote-probe, trigger-request scope and HTTP transport tests; framework adapters and installed artifact                                            |
| Go           | `sdks/debugbundle-go/remote_config.go`; directive slice                                                                           | Remote-config tests, trigger scope, framework relay and clean installed consumer                                                                           |
| Ruby         | `sdks/debugbundle-ruby/lib/debugbundle/remote_config.rb`, `trigger_token.rb`                                                      | Config/trigger tests and unchanged sender/Rack/relay safety through installed gem                                                                          |
| .NET         | `sdks/debugbundle-dotnet/src/DebugBundle.Sdk/RemoteConfig.cs`                                                                     | Configuration/trigger matching, ASP.NET/relay and installed NuGet consumer                                                                                 |
| Android      | `sdks/debugbundle-android/debugbundle-android-core/src/main/kotlin/com/debugbundle/android/DebugBundleRemoteConfig.kt`            | Config/HTTP tests, offline/lifecycle preservation and installed native consumer; device proof separate                                                     |
| Swift/iOS    | `sdks/debugbundle-swift/Sources/DebugBundle/DebugBundleRemoteConfig.swift`                                                        | Config/HTTP/queue tests and installed native consumer; simulator/device/distribution proof separate                                                        |
| React Native | `sdks/debugbundle-react-native/src/client.ts`, `probes.ts`, iOS Swift and Android Java bridge modules                             | JavaScript plus both native bridges preserve original token/service/environment; installed package/native consumer checks remain open                      |

## Current proof and remaining gates

Core real-Postgres cases cover original credentials, wildcard projection, unchanged
HMAC issuer keys, explicit new issuer selection, five-probe combined admission,
canonical membership, wildcard signature isolation and alias evidence isolation.
API/CLI/ordinary MCP tests cover the shared optional issuer field and server-only
multi-origin capture rules. Optional refresh failure preserves durable ingestion.

The family source tests, native bridge harnesses and shared config cases have
run. This change requires no new SDK wire fields, SDK release or consumer upgrade;
server-side projections preserve the existing equivalents. Release activation
still requires the actual served fleet, rollback and cache/origin checks. Actual
consumer/device acceptance remains separate from local source and retained
Node-artifact evidence. Mobile distribution preparation must follow
`spec/cocoapods-trunk-transition.md` if a Swift/React Native release becomes needed.
No SDK package, marketplace, consumer repository or deployed runtime was changed.
