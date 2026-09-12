# Apache 2.0 release tracking

Owner authorization: 2026-09-12, all first-party public releases Apache-2.0,
private website implementation, and WordPress retained as GPL-2.0-or-later.
See `spec/licensing.md`. Historical registry artifacts and release tags remain intact.

Owner approved minor versions and careful execution of the release train. Preparation is resumed; record each publication and verification below.

## Validation

- Updated existing licensing assertions first: 10 failures / 23 tests reproduced.
- Updated licenses and metadata: all 23 focused tests passed.
- Source/registry/build/deployed evidence is tracked separately below.
- Android checkout contained pre-existing untracked `*/bin/` directories; preserve them.

## Release plan

| Surface | Target | State |
| --- | --- | --- |
| Shared types and redaction | 1.7.0 | Preparing |
| Node and browser SDK | 1.7.0 | After shared packages |
| Python, PHP, Go, Ruby, .NET | 1.4.0 | Preparing |
| Java package family | 1.4.0 | Preparing |
| Android and Swift | 1.3.0 | Preparing |
| React Native | 1.3.0 | After native SDKs |
| WordPress | 1.4.2 | After PHP and browser SDKs |
| CLI and npm MCP | 1.8.0 | After JS packages |
| OpenClaw plugin | 1.8.0 | After npm MCP |
| MCP Registry, Smithery, ClawHub, Claude marketplace | New package versions | After npm MCP |
| Core GitHub release | 1.8.0 | After package releases |
| Public site | 1.3.0 | Private checkout access and current SDK prerequisite |
| GitHub Action / organization profile | 1.1.0 / Apache-2.0 commit | Preparing |
| OpenAI plugin source | Apache-2.0 | Independent candidate needs refreshed hashes |

## Documentation ownership

The paired site change keeps published documentation and examples Apache-2.0,
updates license wording and public security links, and runs cross-repository
documentation tests from private-site CI. Public core CI requires no private
checkout. Hosted site and stack deployment use a short-lived read-only GitHub App token scoped to the site.
