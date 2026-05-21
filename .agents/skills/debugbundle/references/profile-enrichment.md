# Profile Enrichment

The setup profile is generated from static analysis and must be reviewed before agents rely on it for architecture decisions.

Checklist:
- verify `project.primary_languages`, `project.package_managers`, and `project.deployment_targets`
- verify each service `kind`, `runtime`, `framework`, `paths`, `owns_routes`, and `depends_on` value against the repository
- add critical paths for ingestion, processing, retrieval, SDK capture, auth, billing, and any project-specific high-risk workflows
- confirm `repo.generated_paths` and `repo.do_not_edit_paths` match the local scaffold
- confirm build, test, lint, and install workflows in `developer_workflows`
- update `debugbundle.last_reviewed_at` and set `debugbundle.validation_status` to `agent-validated` when complete
