# Contributing

## Development Workflow

1. Create a feature branch from `main`.
2. Implement using Red/Green TDD.
3. Run local checks through the Docker-backed Make targets:
   - `make lint`
   - `make typecheck`
   - `make test`
   - `make build`
4. Update docs and contracts when behavior/interfaces change.
5. Open a pull request with test evidence.

## Frontend tooling

For synthetic OpenAI Plugin consent, reviewer, and Settings previews, run
`make dev-openai-plugin-preview` and open <http://localhost:5291/__dev/openai-plugin>.
The development-only route uses production UI components with synthetic data;
actions stay in browser memory and do not call provider or account APIs. It does
not replace deployed or provider validation. See the [OpenAI Plugin guide](https://debugbundle.com/docs/mcp/openai-plugin).

### Local billing review

Run `make dev-mock` and open <http://localhost:5291/billing>. Expand **Local billing
preview**, select Free/Solo/Team/Business, monthly/yearly billing and a paid,
complimentary or trial state, then **Apply preview**. Trial day 1 preserves the
purchase lock; trial day 8 lets you review conversion. Extra-unit counts can also
be changed. Use the ordinary **Change plan or billing interval** dialog for quotes,
upgrades and scheduled downgrades. **Advance to renewal** applies a scheduled
change; **Manage subscription** opens the local portal simulation, where
**Cancel at renewal** lets you review returning to Free.

All data and amounts are synthetic, with zero provider calls, emails or database
writes. Restart `make dev-mock` to reset; `make dev-mock-off` restores the real local
account/API. Use `make dev-tier TIER=free|solo|team|business` separately when testing
real local feature access; it does not emulate a paid subscription. Provider-hosted
payment, tax, authentication and portal acceptance remain separate release checks.

### Shared shadcn styles

The web app vendors the unchanged shadcn 4.1.2 Tailwind stylesheet in
`apps/web/src/styles/shadcn.css`, including its upstream MIT license. This preserves
the current component animations and data variants without installing the component
generator and its unused vulnerable glob-parser dependency in the app. Existing
shadcn components and `components.json` remain the source of the UI. Inspect component docs with `make ui-component-docs UI_COMPONENTS='dialog input-group'` and preview registry changes with `make ui-component-add UI_COMPONENTS=input-group UI_COMPONENT_FLAGS='--dry-run'`. Review existing component differences before applying changes; preserve local primitives and shared utilities. Run the
component generator separately through its package runner when needed, and review
any generated dependency/import changes against the dependency audit before adoption.

`make audit` checks the installed dependency graph for high and critical advisories;
core CI and core publication enforce the same threshold. Dependency refreshes use
bounded vulnerable-version overrides and preserve independently published SDK pins.

## Documentation and licensing

Public product code and contributions use Apache-2.0. See [LICENSE](LICENSE).
Update public README examples, contracts, and docstrings with related code.
For changes to published docs, describe the affected pages and proposed copy in
your issue or PR. Maintainers update the private website repository and record
the paired documentation change before releasing the affected interface.
Private-site access is not required to contribute or build the public product.
Published docs, examples, and generated references remain Apache-2.0.
See [licensing and documentation ownership](spec/licensing.md).

## Rules

- Follow `AGENTS.md` and all files in `rules/`.
- Keep apps/package boundaries strict (`apps` may import `packages`; reverse is forbidden).
- Preserve compatibility for installed projects and public interfaces. Breaking changes require the production policy in `AGENTS.md` and `rules/release-governance.md`: versioning, migration guidance, tests, changelog coverage, and documentation.
