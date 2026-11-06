# Multiline exception release — 6 November 2026

Status: authorised release preparation and execution in progress. The owner authorised
DebugBundle publication/deployment and its own dogfooding. Consumer products and
existing WordPress site installations remain outside this authority.

## Version decisions

These are backwards-compatible capture, classification and resource-lifecycle
corrections, so use patch releases. No event/bundle schema, public API removal,
database migration or new customer configuration is required.

| Surface | Candidate |
| --- | --- |
| Core | 1.22.1 |
| Node / Browser aligned family | 3.2.1 |
| Java, Go, Android | 3.1.1 |
| Python, PHP, Ruby, .NET, WordPress | 2.1.1 |
| Swift | 3.1.2 |
| React Native | 3.1.1, Android 3.1.1 and Swift >=3.1.2 |
| Public site | 1.7.4, docs and Browser dogfooding adoption |

CLI, MCP, shared-types, redaction and agent distributions retain their existing
independent versions: their code/contracts are unaffected. Browser advances with
the aligned JS family while retaining existing capture behaviour.

## Order and safety gates

1. Publish qualified JS family and independent SDK roots; retain their existing
   shared package pins. Update DebugBundle root/web/site dogfooding only after
   exact registry artifacts exist and their installed consumers pass.
2. Deploy the compatible hosted classifier from a reviewed immutable core SHA,
   preserving assets initially if necessary. Verify readiness/version, protected
   data fingerprints, queues, runtime health and rollback before Java distribution.
3. Publish Java after classifier verification. Complete WordPress against public
   PHP/Browser artifacts and React Native against public Android/Swift artifacts.
4. Publish canonical core/site releases and finish the exact-source hosted app/site
   rollout. Verify installed registries, served assets, monitoring and retained
   rollback. Reconcile the release records and repository state.

Swift uses supported SPM and immutable Git CocoaPods sources. Trunk publication
must be an explicit separate channel: a read-only provider response cannot be
reported as successful publication. Bare RN and Expo consumers must build and
actually deliver through the selected public native path before RN npm publication.

## Evidence

The [final local audit](multiline-exception-release-audit-20261106.md) records the
red/green regressions and all twelve SDK dispositions. Current train receipts are
retained under `.tmp/multiline-release-20261106/`; exact source/workflow/runtime and
registry identities will be recorded here as each gate completes.
