# Apache 2.0 release tracking

Owner authorization: 2026-09-12, public first-party releases use Apache-2.0,
website implementation becomes private, and WordPress retains GPL-2.0-or-later.
See `spec/licensing.md`. Historical registry artifacts and release tags remain intact.

The approved minor-version release train is in progress. No hosted deployment,
core 1.8.0 release, or site visibility change has occurred yet.

## Validation

- Licensing assertions initially reproduced 10 failures in 23 tests.
- Expanded licensing/package/MCP checks: 31 passed; documentation checks: 16 passed.
- Root lint and typecheck passed. Full public-core CI passed in run `34710232312`.
- Site behavior: 21 tests passed; production build and typecheck passed.
- OpenAI candidate: 16 local checks passed and hashes regenerated; portal untouched.
- GitHub recognizes Apache-2.0 on all public core, SDK, Action and organization-profile repositories. WordPress retains its GPL exception. Site cutover remains pending.
- Pre-existing untracked Android `*/bin/` directories are preserved.

## Publication ledger

| Surface | Target | State and evidence |
| --- | --- | --- |
| Shared types and redaction | 1.7.0 | Staged archives verified; npm rejected publishing credentials in run `34709092864` before either package published. |
| Node and browser SDK | 1.7.0 | Apache source pushed; CI `34709758523` passed. Version/dependency update and publication wait for shared packages. |
| Python | 1.4.0 | Published; release smoke `34709218570` passed; PyPI metadata plus wheel and sdist full licenses independently verified. |
| PHP | 1.4.0 | Published; release smoke `34709220066` passed; Packagist Apache metadata verified. |
| Go | 1.4.0 | Published; release smoke `34709223498` passed; tagged license verified. |
| Ruby | 1.4.0 | Published; release smoke `34709591621` passed; RubyGems metadata and full gem license verified. |
| .NET package family | 1.4.0 | All ten packages published and full licenses verified. Original post-publish check exceeded the indexing window; fresh .NET 8/10 registry smokes passed in `34710479246`. GitHub release points to exact published source `476709d3b6cf651fa1cd314689321ac594272932`. |
| Java package family | 1.4.0 | CI passed; Maven Central publishing run `34709278570` still awaiting completion. |
| Android | 1.3.0 | CI including API 23/36 device checks passed; publishing run `34709695368` awaiting registry smoke completion. |
| Swift | 1.3.0 | CocoaPods accepted publication in `34709281548`; Apache spec verified. Index refresh fixed installation discovery. Published simulator delivery verification still under investigation after timeouts. |
| React Native | 1.3.0 | Full compatibility matrix `34709699202` passed; publication waits for native registry verification and npm credentials. |
| WordPress | 1.4.2 | PHP lock updated to verified 1.4.0. Browser 1.7.0 dependency, rebuilt asset, ZIP and WordPress.org publication still pending. |
| CLI and npm MCP | 1.8.0 | Source prepared; publication blocked by npm credentials. |
| OpenClaw plugin | 1.8.0 | Source prepared; publication and ecosystem pipeline wait for npm MCP. |
| MCP Registry, Smithery, ClawHub | New package versions | Pending npm MCP publication and ecosystem pipeline. |
| Claude marketplace | 1.8.0 | Apache source in place. Catalog/install pin intentionally stays at published MCP 1.7.0 until 1.8.0 registry smoke succeeds. |
| Core GitHub release | 1.8.0 | Pending package releases and dogfooding dependency updates. |
| Public site | 1.3.0 | Local source/docs/build prepared; waiting for private checkout access and browser SDK 1.7.0. |
| GitHub Action | 1.1.0 | CI and release `34709497001` passed; floating `v1` points to the same source. |
| GitHub organization profile | Apache-2.0 | License and explanation pushed. |
| OpenAI plugin | Independent 1.0.0 candidate | Apache source and local hashes refreshed. No portal draft, submission or publication action. |

## Required account steps

1. Renew npm publishing credentials and update `NPM_TOKEN` in `debugbundle/debugbundle`, `debugbundle/debugbundle-js`, and `debugbundle/debugbundle-react-native`. The existing root secret dates from May 30 and was rejected; no npm target version was consumed.
2. Add `debugbundle/site` to the existing `debugbundle-automation` installation (`132962832`). GitHub rejected the change through the current CLI token; browser authentication is unavailable. The user has been asked to save this organization setting.

After step 2, rerun cloud `verify-private-site-checkout.yml` with the immutable site
SHA. Only after that passes, enable scoped read-only GitHub App checkout tokens in
the hosted site/stack workflows, make the site private, and repeat verification.
Current public checkout remains working while access is pending. Deploy keys are
disabled by organization policy; do not weaken that policy or store a broad PAT.

## Documentation and rollout ownership

Maintainers pair public code changes with private-site documentation updates before
release. Published docs, examples and generated references remain public and
Apache-2.0. Public core CI requires no site checkout; private-site CI runs paired
documentation contract checks.

Resume dependency-first: shared JS, JS SDKs, native wrappers, refreshed WordPress,
CLI/MCP and ecosystem targets, then dogfooding manifests, canonical core release,
and hosted/site deployment with immutable references. Verify registry metadata,
embedded licenses, clean installs, GitHub metadata and deployed HTML separately.
