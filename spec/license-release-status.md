# Apache 2.0 release tracking

Owner authorization: 2026-09-12, public first-party releases use Apache-2.0,
website implementation becomes private, and WordPress retains GPL-2.0-or-later.
On 2026-09-13 the owner also approved scoped licenses required by distribution services, including MIT-0 for the portable ClawHub/Smithery instruction skill. See `spec/licensing.md`. Historical registry artifacts and release tags remain intact.

The approved package release train and hosted rollout have shipped. Core 1.8.0
and site 1.3.0 are live. The site repository is private. The final service-license correction, follow-up CI audit, and external discovery checks are tracked below.

## Validation

- Licensing assertions initially reproduced 10 failures in 23 tests.
- Expanded licensing/package/MCP checks: 31 passed; documentation checks: 16 passed.
- Trusted publishing workflow/metadata checks: 6 passed; staged shared archives independently verify matching repository metadata and full Apache text. Licensing regression checks: 31 passed after OIDC preparation.
- Root lint and typecheck passed. Full public-core CI passed in run `34724625082`; canonical release gates passed in `34725140794`.
- Site behavior: 21 tests passed; production build and typecheck passed.
- OpenAI candidate: 16 local checks passed and hashes regenerated; portal untouched.
- GitHub recognizes Apache-2.0 on all public core, SDK, Action and organization-profile repositories. WordPress retains its GPL exception. Site source is private; deployed Apache documentation and license text are verified.
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
| Android | 1.3.1 correction | Published; all nine Central artifacts independently verified for full licenses. Release 34721136022 rerun passed published registry checks without re-upload. GitHub v1.3.1 points to 6994542. Historical 1.3.0 remains intact. |
| Swift | 1.3.0 | Published; Apache spec and installed license verified. Published installation and event-delivery checks passed locally and in `34710663393`; GitHub v1.3.0 release published. Verification now refreshes the CocoaPods index and uses the same runner tooling as the staged release. |
| React Native | 1.3.0 | Published through OIDC from 68e7710; full compatibility, native runtime, published Android/Swift application builds and registry smoke passed in 34723866051. Downloaded npm archive verifies full Apache text and Android 1.3.1. npm page and GitHub v1.3.0 verified. |
| WordPress | 1.4.2 | Published to GitHub and WordPress.org from 9c43fc5. Releases 34722824838 and 34722944393 passed. WordPress.org API reports 1.4.2; downloaded ZIP independently verifies Browser 1.7.0, PHP 1.4.0 full Apache license, and GPL plugin metadata. |
| CLI and npm MCP | 1.8.0 | Both published through OIDC; releases34722330720 and34722335426 passed with registry smokes. Both tarballs independently verified for full Apache licenses. |
| OpenClaw plugin | 1.8.0 | Published and verified as latest 1.8.0 from 6c579f1; complete Apache LICENSE hash verified in the public archive file record. Moderation is clean. Initial provider memory-limit failure resolved on retry. |
| MCP Registry, Smithery, ClawHub | New package versions | Official Registry 1.8.0 published and verified after renewal using the existing local DNS key. Smithery MCPB release 7811bb75-4e55-42e9-a187-d134786436ab reports SUCCESS; corrected Apache listing metadata is publicly indexed. Smithery skill is indexed. ClawHub portable skill 1.8.0 exists with clean moderation, but discovery ranks remain partial and the owner-approved MIT-0 source correction is prepared for skill-only 1.8.1 publication. |
| Claude marketplace | 1.8.0 | Catalog/plugin/install pins advanced and pushed in 95265e6 after npm MCP 1.8.0 registry smoke passed. |
| Core GitHub release | 1.8.0 | Published v1.8.0 at 81ddbef1244063ae3634c19093bf43bb04e21284 in 34725140794 after full CI 34724625082. Hosted rollout 34725269542 passed. Running API and worker report 1.8.0 and Apache-2.0; full license hashes verified. |
| Public site | 1.3.0 | Private source 13c4161; CI 34722589798 and v1.3.0 release 34724752761 passed. Hosted rollout 34725269542 passed. Live docs/licensing/quickstart return200 after canonical redirects, no old-license references on checked pages; public Apache text hash matches source and reference data reports core1.8.0. |
| GitHub Action | 1.1.0 | CI and release `34709497001` passed; floating `v1` points to the same source. |
| GitHub organization profile | Apache-2.0 | License and explanation pushed. |
| OpenAI plugin | Independent 1.0.0 candidate | Apache source and local hashes refreshed. No portal draft, submission or publication action. |

## Required account steps

1. All seven npm trusted publishers are saved and verified in Edge, each scoped to the exact repository/workflow and direct npm publishing. Five OIDC workflows are pushed; all seven npm packages have successful token-free releases and registry smokes.
2. With explicit owner approval, obsolete `NPM_TOKEN` secrets were deleted and verified absent in `debugbundle/debugbundle`, `debugbundle/debugbundle-js`, and `debugbundle/debugbundle-react-native` after their OIDC releases passed. Unrelated credentials were preserved.
3. Official MCP Registry session renewed using the existing local DNS signing key. Its verified location is saved in private operator memory; no key material is committed.
4. The owner approved the service-required MIT-0 license for the portable instruction skill. Source policy, bundled license, frontmatter, and regression checks are corrected; skill-only 1.8.1 publication and deployed documentation verification remain pending.

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

All seven npm releases, backend/native SDKs, WordPress.org, the official MCP
Registry, Smithery MCP/skill, OpenClaw, core1.8.0, and private-site1.3.0 are
published and verified. Hosted run34725269542 deployed product81ddbef and
site13c4161 with MCP gate preserved. API/MCP readiness, unauthenticated MCP401
challenge, OAuth discovery, exact SPA build marker, and public Apache docs pass.
The active runtime is20260912232654-6c7dd6ec7381; previous stable
20260910205503-ab844e56ce15 is retained. Both containers are healthy with zero
restarts; complete Apache license hashes match and the host has46GB free.

Old-secret deletion is complete. ClawHub license correction publication and discovery remain tracked above. Glama's public README shows Apache; its unauthenticated API now returns401.
PulseMCP and MCP.so listings are present; LobeHub remains a manual discovery
follow-up. These pull-based directory checks are distinct from registry releases.

## Final audit follow-ups

All 20 recorded release, CI and deployment runs were independently rechecked as successful on 2026-09-13. A broader recent-workflow audit also found:

- React Native tag-triggered run `34725054762` attempted to upload already-published 1.3.0 after successful run `34723866051`. Release recovery now verifies matching npm archive integrity before skipping an existing immutable version; 71 local tests and packed smoke pass. Recovery workflow verification is pending.
- Swift CI `34710663321` exposed asynchronous real network-monitor callbacks in fixed-batch acknowledgement and CocoaPods test fixtures. Test-only dependency isolation is prepared; published package verification `34710663393` already passed. Fresh source CI is pending.
- Service-license regression reproduced the bundled-license conflict before correction; all 32 licensing checks then passed.
