# Contributing

## Development Workflow

1. Create a feature branch from `main`.
2. Implement using Red/Green TDD.
3. Run local checks:
   - `pnpm lint`
   - `pnpm typecheck`
   - `pnpm test`
   - `pnpm build`
4. Update docs and contracts when behavior/interfaces change.
5. Open a pull request with test evidence.

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
