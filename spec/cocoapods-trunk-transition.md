# CocoaPods distribution — qualified Git transition

Recorded: 2026-11-02; provider schedule refreshed: 2026-11-06
Status: complete for Swift 3.1.2 and React Native 3.1.1. Public SPM, Git-pod,
bare RN and Expo runtime gates pass; Trunk remains an explicitly separate channel.

## Trigger and scope

Read this before planning the next DebugBundle release. Apply the checklist when
Swift, React Native iOS, or a release train containing either is in scope. Track
this separately when releasing unrelated packages; it does not block an independent
core, CLI, MCP, browser, backend or Android release.

This preserves FR-SDK-37 / FR-SDK-38 and AC-SDK-19 / AC-SDK-21, the
[universal SDK contract](../contracts/sdk-interface.md), and the
[SDK parity rule](../rules/sdk-capability-parity.md). Distribution changes must
preserve installed consumers and the existing native SDK reuse boundary.

## Provider announcement

The [official Trunk read-only plan](https://blog.cocoapods.org/CocoaPods-Specs-Repo/)
announces a test window on **2–6 November 2026** and permanent read-only on
**2 December 2026**. New pods and new versions will be rejected; existing specs
remain available. CocoaPods clients, Git-based pods and independent specs repos
are separate from Trunk publication. See also the
[maintenance plan](https://blog.cocoapods.org/CocoaPods-Support-Plans/).

Recheck the official schedule at release preparation. These are announced dates,
not evidence that a particular publication attempt has failed. Do not use a real
Trunk push as a diagnostic probe. An optional final Trunk publication requires an
authorised release and does not replace the transition work.

## Verified repository baseline on 2 November 2026

- Native Swift already has full Swift Package Manager products in
  `sdks/debugbundle-swift/Package.swift`. SPM remains the preferred native install.
- The tracked [1 November release evidence](bundle-evidence-quality-release-20261101.md)
  records Swift **3.1.1** delivered through SPM/CocoaPods and React Native **3.1.0**
  delivered through npm with published-native iOS/Android checks. This is a release
  record, not a fresh registry lookup in this handoff.
- Swift's `.github/workflows/publish-cocoapods.yml` runs tests, simulator/build and
  delivery checks before `make pod-publish`, which executes `pod trunk push`.
  Retrying a provider read-only rejection cannot publish a new version.
- React Native's `DebugBundleReactNative.podspec` requires `DebugBundle ~> 3.0`
  and `>= 3.1.1`. Its own podspec ships through npm, but the native dependency
  currently resolves through the public CocoaPods catalogue. A future native
  version absent from Trunk therefore needs another resolution path.
- React Native's `Package.swift` is a native-wrapper **test harness with stubs**;
  it does not establish production SPM installation or replace pod autolinking.
- `sdks/debugbundle-react-native/.github/workflows/release.yml` gates npm publication
  on clean published-native iOS build and runtime delivery checks. Keep those gates.

## Required next-release checklist

Complete transition preparation before the next affected mobile SDK release,
targeting completion before the announced permanent freeze. Keep each item open
until its implementation and evidence exist.

- [x] **Refresh the candidate inventory.** Record the release date, exact Swift/RN
      versions, native dependency floors, provider schedule and supported install
      modes. Determine whether the candidate needs a Swift version absent from
      Trunk. Existing published versions and immutable tags must remain intact.
- [x] **Qualify an installation path independent of new Trunk writes.** Start by
      evaluating a consumer Podfile declaration for `DebugBundle` from an immutable
      Swift Git release tag or commit. CocoaPods documents
      [Git-tag/commit dependencies](https://guides.cocoapods.org/using/the-podfile.html).
      This must also satisfy the RN podspec's version constraints. Changing only
      the Swift podspec's `s.source` does not resolve the transitive catalogue
      dependency. If bare RN or Expo needs a different supported integration,
      evaluate an [independent specs repository](https://guides.cocoapods.org/making/private-cocoapods.html)
      and record the selected approach. Do not fork Swift internals into RN or
      assume a native-app SPM snippet solves RN autolinking.
- [x] **Adapt Swift release automation.** Separate supported-channel success from
      Trunk publication. SPM/tag delivery must not depend on a new Trunk write
      during read-only periods. Retain tests, coverage, iOS deployment-target and
      simulator checks, podspec validation, and clean public-artifact delivery
      checks. Explicitly report the frozen Trunk channel; do not hide unexpected
      publisher errors with unconditional success or remove verification gates.
- [x] **Qualify the exact consumer artifacts.** Use clean consumers without cached
      DebugBundle pods or unpublished sibling SDK checkouts. Verify SPM native
      installation and the chosen pod path, then bare RN and supported Expo
      development-build/prebuild installation, compilation and actual event
      delivery to a mock ingestion endpoint. Cover supported bridge modes and
      native version constraints. An existing Trunk-only version is insufficient
      proof of the new path. Preserve legacy installation compatibility checks
      and the independent Android gates.
- [x] **Update matching documentation and release order.** Coordinate Swift/RN
      READMEs, migration notes, install/config-plugin instructions where applicable,
      `site/content/docs/sdks/swift.mdx`, `site/content/docs/sdks/react-native.mdx`,
      the SDK plans, package standards and release governance. Publish the native
      artifact to the selected supported source and verify it before publishing a
      dependent RN release. Existing consumers must have clear upgrade steps.
- [x] **Record closure.** Replace the pending status in this document and
      `STATUS.md` only after exact source/artifact identities, clean-install and
      runtime results, supported channels and remaining limitations are recorded
      in tracked release evidence. Retain a link from the release rules so future
      releases use the supported path.

## Boundaries

The original handoff was guidance only. The authorised implementation and public
qualification progress are recorded below. Consumer-product migrations need
separate product-specific consent.

## 6 November implementation and qualification

The owner authorised the full DebugBundle release train. Swift 3.1.2 retains SPM
and adds clean Git-tag pod consumers; its release automation separates supported
Git distribution from an explicitly selected Trunk publishing job. React Native
3.1.1 retains Swift >=3.1.1 compatibility and requires Android 3.1.1. The selected Git native path uses Swift 3.1.2. Bare apps declare the immutable
Swift Git source inside their Podfile target; the packaged Expo plugin inserts it
idempotently and preserves explicit consumer sources. An advanced manual-source
option retains consumer ownership. Native sources are not copied into the wrapper.

Swift public SPM/Git-pod consumers pass at source
`439c156ff05a772d8092316cc5029f18ad0555c6` (release 42224083049). RN
source `28de60bd4ce0520be875b6565a709afdfaa8fb39` passes all shared CI,
public Android/Swift native build and runtime, and Expo prebuild/runtime checks
(release 42239861849). Its npm 3.1.1 registry smoke passes, and the downloaded
artifact integrity/native files match the reviewed source. RN remains a native
pod wrapper; its SPM test harness is not production SPM support. Exact identities,
consumer guidance and remaining physical-device limitations are recorded in
[multiline-exception-release-20261106.md](multiline-exception-release-20261106.md).
Existing Trunk installations remain supported; no consumer product is updated.
