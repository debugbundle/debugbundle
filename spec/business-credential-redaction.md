# Invitation credential redaction

FR-BUS-02–03 / AC-BUS-02–03, SEC-23a and the mandatory
[SDK applicability rule](../rules/sdk-capability-parity.md).

Organisation invitations and accepted ownership transfer introduce opaque
`dbundle_org_invite_` and `dbundle_org_transfer_` secrets. The existing
`dbundle_invite_` project acceptance secret also needs standalone text protection.
Sensitive URL queries and named secret fields already have mandatory protection;
these fixed prefixes must additionally be removed from arbitrary free text before
SDK-owned retention and server persistence/egress. This extends recognised secret
formats without changing generic-helper override semantics, schemas, hooks,
transport, defaults or retention budgets.

All eleven SDK repositories were clean before this work. No consumer repository
is in scope. Source candidates, packaged distribution and published installation
are separate evidence: the current published packages retain their prior matcher.
No publication or consumer adoption is authorised by this implementation task.

| Surface      | Disposition / owning source                                                       | Qualification                                                                                                                         |
| ------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Node         | Implement through core `telemetry-text.ts`; SDK consumes shared redaction package | 614 Node/Browser tests, SDK lint/types/coverage and exact local package consumers on Node 24/26 pass                                  |
| Browser      | Same core package as Node, including framework/browser adapters                   | 614 Node/Browser tests, SDK lint/types/coverage and exact local package consumers on Node 24/26 pass                                  |
| Python       | Implement in `src/debugbundle/redaction.py`                                       | Shared conformance/mandatory privacy suite passes                                                                                     |
| PHP          | Implement in `src/TelemetryPrivacy.php`; framework relays reuse it                | Shared conformance/mandatory privacy suite passes                                                                                     |
| WordPress    | Implement through PHP dependency and bundled Browser dependency                   | Local PHP + Browser + redaction ZIP passes extracted-asset credential assertions, native/relay delivery, spool retry and revocation   |
| Java         | Implement in core `TelemetryPrivacy.java`; framework/logger adapters share core   | Shared conformance/mandatory privacy suite passes                                                                                     |
| Go           | Implement in `redaction/telemetry.go`; relays share the mandatory sanitizer       | Shared conformance/mandatory privacy suite passes                                                                                     |
| Ruby         | Implement in `lib/debugbundle/telemetry_privacy.rb`                               | Shared conformance/mandatory privacy suite passes                                                                                     |
| .NET         | Implement in `Redaction/TelemetryPrivacy.cs`; ASP.NET adapters share SDK          | Shared conformance/mandatory privacy suite passes                                                                                     |
| Android      | Implement in core `internal/TelemetryPrivacy.kt`; native adapters share core      | Shared conformance/mandatory privacy suite passes                                                                                     |
| Swift/iOS    | Implement in `DebugBundleTelemetryPrivacy.swift`; native adapters share core      | Exact local Swift archive passes the 27-case corpus and clean iOS-floor/SPM/CocoaPods consumers                                       |
| React Native | Implement in JS `privacy-text.ts` and both native dependencies above              | JS corpus and installed-package credential assertions pass; coordinated Android wrapper and exact Swift archive in bare/Expo iOS pass |

The language-neutral fixture adds each acceptance prefix in a non-sensitive-key
free-text field. The new cases fail on the original core matcher. Sync the same
fixture bytes/checksum to every maintained repository and run their functional
privacy suites. Native bridges and wrappers must use the qualified dependency
artifacts when packaged; source-only success cannot establish distribution parity.
Source qualification: core 42 tests; Python 3, PHP 4, Ruby 10, Java 5,
.NET 6, Swift 2, Android 4 and RN JS 7 functional tests pass, including the
same 27-case portable corpus. Go's full redaction package passes. Node/Browser
pass 36 conformance tests using locally built shared archives; SDK lint and types
also pass. WordPress's actual relay sanitizer passes with the local PHP dependency.
Swift/Android inventory assertions were advanced from 24 to 27 when the three
new portable cases were added; their existing cases and allocation checks remain.

Local wrapper/native qualification is complete. Node/Browser keep their existing
shared-types floor; `privacy-js-redaction-candidate-check` and
`privacy-js-local-smoke JS_SMOKE_ARGS=--redaction-only` override only the exact local
redaction archive during qualification and restore dependency links afterward.
The original candidate-lock floor check still fails closed when unrelated shared
schema versions differ. No SDK dependency or published version was silently changed.

WordPress uses the `redaction-candidate` staged mode to retain its published shared
types while consuming the exact local redaction/PHP/Browser archives. Its unchanged
published redaction dependency fails the new extracted-asset assertion; the local
candidate passes. The resulting ZIP is explicitly marked staged/nonpublishable.

Swift's retained deterministic source archive passes its two privacy tests (the
same 27 portable cases), iOS 15 build, clean SPM and CocoaPods consumers. React
Native's Android wrapper uses the coordinated local Maven artifact. Its iOS bridge
unit coverage is 97.14% Swift / 100% Objective-C, supplemented by real disposable
bare and Expo iOS consumers using that exact Swift archive. The published Git pin
and existing Trunk installs remain unchanged. CocoaPods' announced 2–6 November
test and 2 December 2026 read-only schedule was refreshed on 7 November from the
[provider announcement](https://blog.cocoapods.org/CocoaPods-Specs-Repo/).

Receipts are retained under `.tmp/business-implementation/` with the
`business-js-redaction-candidate`, `business-js-node26-installed`,
`business-wordpress-redaction-candidate`, `business-swift-source-artifact`,
`business-swift-archive-privacy-corrected`, `business-rn-packed`,
`business-rn-android-wrapper`, `business-rn-ios-candidate-runtime` and
`business-rn-expo-ios-candidate` names. Publication must select new versions and
pin the released redaction artifact, then pass exact published-artifact gates.
Local archives are unpublished source candidates, not evidence of adoption by
installed customer projects. No consumer was changed.
