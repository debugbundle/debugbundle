# Business and UI release — 9 November 2026

Status: authorised; audit and exact-candidate preparation in progress. Nothing has
been committed, published, deployed or activated by this release run yet.

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
