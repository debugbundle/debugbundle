# Licensing and documentation ownership

The owner approved this policy on 2026-09-12.

## Public product

All first-party public product code, SDKs, shared libraries, CLI/MCP tools,
portable agent skills, plugins, GitHub Action, examples, schemas, and generated
reference artifacts use the unmodified Apache License, Version 2.0 (`Apache-2.0`).
Published packages must carry consistent license metadata and the full license
text wherever the artifact format supports it. Third-party notices are retained.

The WordPress plugin remains `GPL-2.0-or-later`; its bundled dependencies must
retain their own compatible license notices. This is the only first-party public
package exception. Apache-2.0 dependencies may be combined under GPLv3, which the
plugin's "or later" grant permits; they do not grant a GPLv2-only distribution path.

Existing release artifacts and recipients' previously granted rights remain
unchanged. Publish fresh versions instead of replacing immutable registry
artifacts or rewriting release tags.

## Private repositories

`debugbundle-cloud` owns proprietary hosted deployment and operations source.
`debugbundle/site` owns the proprietary website implementation and branding.
Its published documentation, code examples, and vendored product reference
artifacts remain Apache-2.0. Repository privacy does not restrict public access
to the deployed website, documentation, examples, or machine-readable artifacts.

The product dashboard and self-host deployment assets remain in the public core.
Public builds and tests must not require access to either private repository.
Hosted workflows use a short-lived GitHub App token scoped to the site with read-only contents access.

## Documentation changes

This policy implements FR-DOC-01 through FR-DOC-07 and AC-DOC-01 through
AC-DOC-10. Public interface changes are incomplete until their documentation
impact is recorded and the corresponding documentation is updated.

- Core and SDK repositories retain their public contracts, READMEs, examples,
  docstrings, and generated-interface sources.
- Core's `scripts/public-site-artifacts.ts` generates reference artifacts from
  the product source. Hosted site releases regenerate them from an explicit
  product commit and combine them with an explicit site commit.
- Maintainers with site access update handwritten `site/content/docs/` pages
  alongside related core/SDK changes, and record the paired commit or PR in the
  change's documentation checklist. A code change with no docs impact says why.
- Public contributors describe documentation changes in the public core/SDK
  issue or PR. Maintainers apply those changes in the private site repository;
  contributors are never required to obtain private-repository access.
- Package README and public contract updates ship with the code. Maintainers
  coordinate the public docs release with the affected package/product release.

## Verification

Before publication, inspect package manifests and final archives for the full
Apache-2.0 text, correct SPDX identifier, preserved dependency notices, and a
dependency tree using the newly licensed first-party releases. Publish dependency
roots before wrappers. Verify current registry metadata, GitHub default branches,
the deployed site, and ecosystem listings independently after publication.
