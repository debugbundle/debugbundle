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

## Rules

- Follow `AGENTS.md` and all files in `rules/`.
- Keep apps/package boundaries strict (`apps` may import `packages`; reverse is forbidden).
- Preserve compatibility for installed projects and public interfaces. Breaking changes require the production policy in `AGENTS.md` and `rules/release-governance.md`: versioning, migration guidance, tests, changelog coverage, and documentation.
