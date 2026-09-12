# Apache 2.0 release tracking

Owner authorization: 2026-09-12, public first-party releases use Apache-2.0,
website implementation becomes private, and WordPress retains GPL-2.0-or-later.
See `spec/licensing.md`. Historical registry artifacts and release tags remain intact.

The approved minor-version release train is in progress. The site repository is
now private and its deployment checkout is verified. No hosted deployment or
core 1.8.0 release has occurred yet.

## Validation

- Licensing assertions initially reproduced 10 failures in 23 tests.
- Expanded licensing/package/MCP checks: 31 passed; documentation checks: 16 passed.
- Trusted publishing workflow/metadata checks: 6 passed; staged shared archives independently verify matching repository metadata and full Apache text. Licensing regression checks: 31 passed after OIDC preparation.
- Root lint and typecheck passed. Full public-core CI passed in run `34710232312`.
- Site behavior: 21 tests passed; production build and typecheck passed.
- OpenAI candidate: 16 local checks passed and hashes regenerated; portal untouched.
- GitHub recognizes Apache-2.0 on all public core, SDK, Action and organization-profile repositories. WordPress retains its GPL exception. Site source is now private; deployed-site content refresh remains pending.
- Pre-existing untracked Android `*/bin/` directories are preserved.

## Publication ledger

| Surface | Target | State and evidence |
| --- | --- | --- |
| Shared types and redaction | 1.7.0 | Published through OIDC; release34721930586 and registry smoke passed. Downloaded tarballs independently verified for complete Apache text and repository metadata. |
| Node and browser SDK | 1.7.0 | Published through OIDC from c8f4afa; release34722263006 and registry smokes passed. Both downloaded tarballs and1.7.0 shared dependencies independently verified. Local lint/typecheck/build,293 tests and packed consumer smoke passed. |
| Python | 1.4.0 | Published; release smoke `34709218570` passed; PyPI metadata plus wheel and sdist full licenses independently verified. |
| PHP | 1.4.0 | Published; release smoke `34709220066` passed; Packagist Apache metadata verified. |
| Go | 1.4.0 | Published; release smoke `34709223498` passed; tagged license verified. |
| Ruby | 1.4.0 | Published; release smoke `34709591621` passed; RubyGems metadata and full gem license verified. |
| .NET package family | 1.4.0 | All ten packages published and full licenses verified. Original post-publish check exceeded the indexing window; fresh .NET 8/10 registry smokes passed in `34710479246`, and the subsequent complete release run `34710568729` passed. GitHub release points to exact published source `476709d3b6cf651fa1cd314689321ac594272932`. |
| Java package family | 1.4.0 | Published. Central diagnostic `34717533993` confirms `PUBLISHED`; the original release rerun `34709278570` passed, skipping upload and checking published installs. All eight code artifacts carry the full license and the parent POM declares Apache. Published source is `44fd7a3`; GitHub tag `4334aad` adds only the read-only Central diagnostic workflow. Future tags are pinned to the tested workflow commit. |
| Android | 1.3.1 correction | CI34718423566 and staged archive/consumer checks passed. Upload step in34721136022 succeeded; post-publish archive lookup remained404 through its waiting window and failed. Investigate accepted Central deployment before any re-upload. Historical1.3.0 remains intact. |
| Swift | 1.3.0 | Published; Apache spec and installed license verified. Published installation and event-delivery checks passed locally and in `34710663393`; GitHub v1.3.0 release published. Verification now refreshes the CocoaPods index and uses the same runner tooling as the staged release. |
| React Native | 1.3.0 | Full compatibility matrix `34709699202` passed; publication waits for native registry verification and npm credentials. |
| WordPress | 1.4.2 | Rebuilt against published PHP1.4.0 and Browser1.7.0; clean packaged WordPress smoke passed. First release caught stale version markers before publication. Correction9c43fc5 passes PHP tests/static analysis and repeated packaged smoke; retry34722824838 running. |
| CLI and npm MCP | 1.8.0 | Both published through OIDC; releases34722330720 and34722335426 passed with registry smokes. Both tarballs independently verified for full Apache licenses. |
| OpenClaw plugin | 1.8.0 | Source prepared; publication and ecosystem pipeline wait for npm MCP. |
| MCP Registry, Smithery, ClawHub | New package versions | Official Registry JWT expired; existing DNS signing-key path requested. Smithery MCP1.8.0 uploaded but public indexing check partial; Smithery skill found/indexed. ClawHub exact1.8.0/moderation and discovery need follow-up. OpenClaw plugin local validation hit host native dependency resolution; no plugin publication verified. |
| Claude marketplace | 1.8.0 | Local catalog/plugin/install pins advanced after npm MCP1.8.0 registry smoke passed. Awaiting this source commit/push. |
| Core GitHub release | 1.8.0 | Pending package releases and dogfooding dependency updates. |
| Public site | 1.3.0 | Private source13c4161 pushed; CI34722589798 passed. Public Apache docs, generated license, Browser1.7.0 dependency,21 site tests/build/typecheck verified. Hosted deployment still pending. |
| GitHub Action | 1.1.0 | CI and release `34709497001` passed; floating `v1` points to the same source. |
| GitHub organization profile | Apache-2.0 | License and explanation pushed. |
| OpenAI plugin | Independent 1.0.0 candidate | Apache source and local hashes refreshed. No portal draft, submission or publication action. |

## Required account steps

1. All seven npm trusted publishers are saved and verified in Edge, each scoped to the exact repository/workflow and direct npm publishing. Five OIDC workflows are pushed; six npm packages have successful token-free releases and registry smokes.
2. Automatic approval review rejected deleting the obsolete `NPM_TOKEN` secret; explicit approval requested for the three named repositories, each only after its OIDC release passes. No secrets deleted yet.
3. Official MCP Registry session renewal needs the existing debugbundle.com DNS signing-key file path; requested from owner without asking for key contents.

The GitHub access step is complete: a fine-grained token limited to `site` with
read-only Contents/Metadata permissions is saved as cloud `SITE_CHECKOUT_TOKEN`.
Its expiration is 2026-12-11. Both hosted deployment workflows use it only for
checkout with credential persistence disabled; the product GitHub App is unchanged.
The authenticated immutable checkout passed both before and after making the
repository private. Anonymous source access returns 404; website, docs, and
quickstart return 200. Deploy keys remain disabled and no broad PAT was created.

## Documentation and rollout ownership

Maintainers pair public code changes with private-site documentation updates before
release. Published docs, examples and generated references remain public and
Apache-2.0. Public core CI requires no site checkout; private-site CI runs paired
documentation contract checks.

Resume dependency-first: shared JS, JS SDKs, native wrappers, refreshed WordPress,
CLI/MCP and ecosystem targets, then dogfooding manifests, canonical core release,
and hosted/site deployment with immutable references. Verify registry metadata,
embedded licenses, clean installs, GitHub metadata and deployed HTML separately.

Six npm releases are verified. Android Central visibility still gates React Native.
Site source is committed and verified; hosted rollout waits for release completion.
WordPress corrected release is running. Registry renewal and old-secret deletion
remain pending the requested owner inputs.
