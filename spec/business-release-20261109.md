# Business and UI release — 9 November 2026

Status: authorised; package publication and exact-candidate qualification in progress.
Core candidate is committed on `release/business-20261109`; no hosted runtime or
public asset rollout has occurred, and Business activation switches remain off.

The owner explicitly authorised the final cross-repository audit, production
rollout, Stripe pricing/configuration completion, appropriate version upgrades and
all affected DebugBundle package releases. Scope is DebugBundle and its own
distribution repositories. Consumer applications, installations and credentials
remain unchanged. The earlier explicit temporary shared report-key approval still
applies; the key is staged in DebugBundle's protected configuration and deployment
secret. No key is reproduced in release records.

## Inventory and starting state

- Core starts at `e113414540aa00ebbbac12ea0783ee0c16eacbaf`, site at
  `320f4929bcbe55de14aaf4bda4d08e265ece6ed6`, cloud at
  `eae140f4d47f42943ea77438ee6d3eb5c36ab488`.
- All three and eleven SDK repositories match their fetched remote main refs.
  Their pending implementation/UI/SDK privacy changes are within this release.
  Source inventories and untouched initial patches/status are private receipts
  under `.tmp/release-20261109/`.
- The SDK changes implement invitation/transfer-token privacy on all twelve
  maintained capture surfaces. [The qualification record](business-credential-redaction.md)
  owns the existing corpus and wrapper/native applicability evidence.
- Other-thread site changes include owner-supplied/approved testimonials and
  responsive carousel refinements, recorded in `site/docs/testimonials.md`.
- Existing live API/worker are healthy, zero restarts, from core 1.22.1 revision
  `8daab4acf3ca36c0c425aab455959c1bb7ae9a0d`. They lack the Business runtime label;
  activation flags are absent/off. The protected environment has the staged report
  key, but the old running process has not loaded it.
- Existing runtime is `20261106135043-10e2d35f45d0`, previous stable is
  `20261105152155-110ee3183dd3`. Initial disk headroom is about 44 GiB; available
  memory is 728,544 KiB against the unchanged 30%-or-512-MiB rollout floor.
- All twelve live Stripe prices match the approved USD amounts, licensed
  month/year intervals and exclusive tax. There are zero nonterminal
  subscriptions, open checkouts and active payment links. No referral coupon
  exists yet. The default portal permits end-of-term cancellation and payment
  method updates; provider-side subscription updates are already disabled.

## Version and ordering decisions

Planned versions, subject to exact manifest/registry validation:

- Core 1.23.0, shared types 3.3.0, redaction 2.7.1.
- CLI/MCP/OpenClaw/related skill 1.21.0; update developer-plugin pins with their
  own semver (current Codex 1.5.1, Gemini 1.4.4, Claude 1.19.4).
- Site 1.8.0; OpenAI package 1.1.0 remains its independently qualified candidate.
- Patch each changed SDK: JS 3.2.2; Java/Android/Go/RN 3.1.2; Swift 3.1.3;
  Python/PHP/Ruby/.NET/WordPress 2.1.2. Preserve unchanged package contracts and
  native deployment floors. Validate every exact current manifest before editing.

Publish shared dependency roots before dependent SDKs; publish native Android and
Swift artifacts before RN, and PHP/Browser before WordPress. New CLI/MCP clients
and public frontend distribution follow a verified Business-aware backend.
The first runtime rollout keeps sales/reports/referrals dark and retains existing
assets. The final rollout can enable the approved features only after its selected
previous runtime is Business-aware and verified. Migrations precede new code.
Retain exact active/previous immutable image pairs and protected data/backup proof.
Do not use broad image cleanup or reset any database.

Swift/RN use the previously supported immutable Git/SPM/CocoaPods path, preserving
legacy installations and the native floor. The official CocoaPods schedule was
refreshed on 9 November: [read-only rehearsal 2–6 November and permanent read-only
on 2 December](https://blog.cocoapods.org/CocoaPods-Specs-Repo/).

MCP publication is followed by the repo-owned ecosystem pipeline; retired Smithery
publication channels stay excluded. Exact Registry/ClawHub artifacts, native
clients and discovery are separate checks. OpenAI package/source/runtime evidence
is regenerated from the final committed inputs; portal/store acceptance is never
inferred from hosting or package preparation.

## Audit progress

- Full core lint/types pass; dependency audit has zero high/critical advisories.
- Initial complete unit run: 5,866 passed, 563 integration/optional tests skipped,
  two failures. Both are outdated expectations against approved behaviour:
  invitations now support Team or Business, and Projects precedes Analytics.
  Assertions are corrected against the authoritative contract/new sidebar order;
  no production behaviour was weakened. All 23 focused checks now pass.
- Private cloud deployment/image/Business rollback and asset-publication checks
  pass. Full integration passes: 559 tests in 85 files, with one optional installed-SDK
  check skipped. Its disposable Compose project was removed; existing local
  services and volumes are preserved.
- Fresh package/native/browser/production acceptance, final versions/source SHAs,
  backup/migration proof, provider configuration, publications and live rollout
  receipts remain to be completed and recorded below.

## Release-time findings and gates

- Core candidate `d9326b8e` and source-evidence commit `ead399d7` are on the
  isolated release branch; PR #14 runs full CI. Developer-plugin native Gemini
  checks require the prepared MCP version to exist and will be rerun after its
  published-artifact gates. The main CI unit/build job remains independent.
- Shared types 3.3.0 / redaction 2.7.1 published with registry-consumer checks.
  The JS SDK 3.2.2 patch adopts redaction 2.7.1 while retaining its existing
  shared-types 3.0.0 contract; the root test dependency must use the same redactor.
- Live-provider audit found Stripe omits coupon `applies_to` without expansion.
  The regression reproduced the failure; the narrow explicit expansion passes
  all 143 referral/checkout checks. The real 10-percent once coupon is verified
  against only the Business base product, excluding capacity. Secrets are staged
  and all four feature switches are explicitly off for the bridge rollout.
- Ruby's separate frozen compatibility locks retained an old path-gem identity;
  update only that identity/checksum metadata. The published gem's framework
  matrix passed; no third-party version changes or replacement publication.
- Old and new API rehearsal passes against one forward-migrated isolated DB,
  including credential compatibility and application rollback.
- Fresh site tests/types/static build pass. Headless Chromium and WebKit review
  passes the 320–1440px matrix with no page overflow or browser errors.
- Managed PostgreSQL is private, healthy and continuously recoverable. Snapshot `debugbundle-db-pre-business-20261109` is verified available before
  production migration. Existing tokens/alerts/services receive aggregate hash
  baselines, without exposing row contents or credentials.

- Final runtime dependency adoption is registry-backed: shared-types 3.3.0,
  redaction 2.7.1 and Node/Browser 3.2.2. Candidate build passes. Report resource
  checks retain serial PDF generation and pass their existing budgets; all eleven
  companion privacy corpora match. The post-adoption audit has no high/critical
  advisories. The default-off backend bridge can proceed independently of the
  unpublished Gemini pin; that separate native client gate must pass after MCP
  publication before public catalog promotion.

- Final public-core CI exposed three release-integration expectations rather than
  runtime failures: the developer inventory still listed old versions, private
  pricing integration assumed an ignored companion checkout existed, and the
  OpenAI archive test retained the pre-report 23-tool count. Reconcile the ledger,
  use the established explicit-site-checkout guard and run pricing parity in
  private site CI, and require all 25 tools including the two saved-report reads.
  The final complete CI rerun remains required before launch activation.
- Real Stripe test-mode Business monthly and annual subscriptions with two extra
  capacity units pass exact paid totals, base-only ten-percent coupon validation,
  complete cash receipts and referral-benefit projections through production
  adapters. All recorded test fixtures cleaned up with zero errors; no live charges.
