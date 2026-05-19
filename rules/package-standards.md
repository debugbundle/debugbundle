# Package Standards — DebugBundle

Version: v1
Last updated: 2026-03-10

---

## 1. Package Naming & Registries

### npm (Node.js + Browser + CLI)

All npm packages use the `@debugbundle/` scope.

**SDK packages** (live in the JS SDK monorepo `github.com/debugbundle/debugbundle-js`):

| Package | npm Name | Description |
|---------|----------|-------------|
| Node SDK | `@debugbundle/sdk-node` | Server-side event capture |
| Browser SDK | `@debugbundle/sdk-browser` | Client-side event capture |
| Shared types | `@debugbundle/shared-types` | Zod schemas + TypeScript types |
| Redaction | `@debugbundle/redaction` | Sensitive data scrubbing |

**Core monorepo packages** (live in `debugbundle/debugbundle`):

| Package | npm Name | Description |
|---------|----------|-------------|
| CLI | `@debugbundle/cli` | Command-line interface |

### PyPI (Python)

| Package | PyPI Name | Description |
|---------|-----------|-------------|
| Python SDK | `debugbundle-python` | Server-side event capture for Django, Flask, FastAPI |

**Python conventions:**
- Package name: `debugbundle-python` (PyPI) / `debugbundle` (import name)
- Uses `pyproject.toml` (PEP 621) as the build configuration
- Requires Python ≥ 3.9
- Type hints required (PEP 484); ship `py.typed` marker
- Publish as wheel + sdist
- Dependencies kept minimal: `httpx` for HTTP, no framework deps in core

### Packagist (PHP)

| Package | Packagist Name | Description |
|---------|----------------|-------------|
| PHP SDK | `debugbundle/sdk-php` | Server-side event capture for Laravel, Symfony |

**PHP conventions:**
- Vendor namespace: `DebugBundle\`
- Uses `composer.json` as the build configuration
- Requires PHP ≥ 8.1
- PSR-4 autoloading
- Framework integrations ship as separate service providers / bundles within the same package
- Dependencies kept minimal: `guzzlehttp/guzzle` or PSR-18 HTTP client

### Future registries

| Language | Registry | Package Name |
|----------|----------|-------------|
| Go | Go modules | `github.com/debugbundle/debugbundle-go` |
| Ruby | RubyGems | `debugbundle` |
| Rust | crates.io | `debugbundle` |

---

## 2. Versioning

- Follow [Semantic Versioning 2.0.0](https://semver.org/).
- **Major**: Breaking changes to public API, SDK init signature, event schema, or CLI output format.
- **Minor**: New features, new event types, new CLI commands.
- **Patch**: Bug fixes, documentation corrections, internal refactors.
- Pre-release tags: `-alpha.N`, `-beta.N`, `-rc.N`.
- All packages in the monorepo share a single version number until a package needs independent versioning. Re-evaluate post-v1.

---

## 3. CHANGELOG Format

Each package with a publishable artifact maintains a CHANGELOG.md following [Keep a Changelog](https://keepachangelog.com/):

```markdown
## [Unreleased]

### Breaking
### Added
### Changed
### Deprecated
### Fixed
### Security
```

Root CHANGELOG.md aggregates cross-package release notes.

---

## 4. Package Metadata

### npm (`package.json`)

Every published `package.json` must include:

```json
{
  "name": "@debugbundle/<package>",
  "version": "0.1.0",
  "description": "<one-line description>",
  "license": "AGPL-3.0-only",
  "repository": { "type": "git", "url": "https://github.com/debugbundle/debugbundle", "directory": "packages/<name>" },
  "homepage": "https://debugbundle.com/docs/<package>",
  "bugs": "https://github.com/debugbundle/debugbundle/issues",
  "keywords": ["debugbundle", "debugging", "ai-agent", "<relevant-keywords>"],
  "engines": { "node": ">=18" },
  "types": "./dist/index.d.ts",
  "exports": { ".": { "import": "./dist/index.mjs", "require": "./dist/index.cjs", "types": "./dist/index.d.ts" } },
  "files": ["dist", "README.md", "CHANGELOG.md", "LICENSE"]
}
```

### PyPI (`pyproject.toml`)

```toml
[project]
name = "debugbundle-python"
description = "DebugBundle SDK for Python — production debugging bundles for AI agents"
license = "AGPL-3.0-only"
requires-python = ">=3.10"
keywords = ["debugbundle", "debugging", "ai-agent", "error-tracking"]
classifiers = [
    "Framework :: Django",
    "Framework :: Flask",
    "Framework :: FastAPI",
    "Typing :: Typed",
]

[project.urls]
Homepage = "https://debugbundle.com/docs/sdks/python"
Repository = "https://github.com/debugbundle/debugbundle-python"
Issues = "https://github.com/debugbundle/debugbundle-python/issues"
```

### Packagist (`composer.json`)

```json
{
  "name": "debugbundle/sdk-php",
  "description": "DebugBundle SDK for PHP — production debugging bundles for AI agents",
  "license": "AGPL-3.0-only",
  "type": "library",
  "require": { "php": ">=8.2" },
  "autoload": { "psr-4": { "DebugBundle\\": "src/" } },
  "keywords": ["debugbundle", "debugging", "ai-agent", "error-tracking", "laravel", "symfony"]
}
```

---

## 5. Per-Package README

Every published package must have a README.md containing:

1. **Badge row** — version badge (npm/PyPI/Packagist), build status, license
2. **One-line description** — what this package does
3. **Installation** — language-appropriate (`npm install`, `pip install`, `composer require`)
4. **Quick start** — minimal working example (< 10 lines)
5. **Configuration** — all options with defaults
6. **Link to full docs** — `https://debugbundle.com/docs/<package>`
7. **License** — AGPL-3.0-only

---

## 6. Type Safety Distribution

### TypeScript (npm packages)
- All packages ship `.d.ts` type definitions.
- `types` field in `package.json` must point to the entry declaration file.
- Strict TypeScript — `strict: true` in tsconfig.
- No `any` in public API surfaces.

### Python
- Full type hints (PEP 484) on all public APIs.
- Ship `py.typed` marker file (PEP 561).
- Validated with `mypy --strict` or `pyright`.

### PHP
- PHPDoc blocks on all public methods.
- Compatible with PHPStan level 8 or Psalm level 1.
- Use PHP 8.1+ typed properties and return types.

---

## 7. License

- All packages: `AGPL-3.0-only`.
- Each package directory contains a `LICENSE` file (copy of root).
- Enterprise extensions in `packages/ee-*` may use a separate commercial license (documented per-package).

---

## 8. Error Message Conventions

All user/agent-facing error messages must:

- Include a unique error code: `DBE_<CATEGORY>_<NAME>` (e.g., `DBE_AUTH_INVALID_TOKEN`, `DBE_SDK_INIT_FAILED`).
- Include a one-line human-readable explanation.
- Include a documentation link: `https://debugbundle.com/docs/errors/<code>`.
- Be deterministic for the same root cause (agents rely on stable error messages).

Error code categories: `AUTH`, `SDK`, `CLI`, `ING` (ingestion), `BND` (bundle), `WH` (webhook), `CFG` (config), `NET` (network).

---

## 9. Pre-Production Removal Policy

- Before first public release, remove obsolete features outright instead of adding deprecation scaffolding.
- Do not add `@deprecated` markers, compatibility shims, or warning-only fallback paths for internal cleanups unless a source-of-truth spec explicitly requires a temporary public bridge.
- If a pre-release public surface is intentionally retained, document the reason in the relevant spec or contract rather than relying on ad hoc deprecation comments.
- After first public release, adopt an explicit deprecation policy before removing supported public interfaces.

---

## 10. Publishing Workflow

- Releases are triggered via GitHub Actions on tagged commits (`v*`).
- CI runs full test suite before publishing.
- npm packages published with `--provenance` for supply chain transparency.
- GitHub Release created with auto-generated notes from CHANGELOG.
- Docker images tagged with version + `latest`.
