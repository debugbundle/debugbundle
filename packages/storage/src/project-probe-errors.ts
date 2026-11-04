export class ProjectProbeError extends Error {
  constructor(
    public readonly code:
      | "probe_scope_invalid"
      | "probe_sdk_context_invalid"
      | "probe_scope_requires_service"
      | "probe_directive_limit_exceeded"
      | "probe_inventory_limit_exceeded"
      | "upgrade_required"
      | "shared_access_suspended",
    public readonly status: 400 | 403 | 409 | 503
  ) {
    super(code);
    this.name = "ProjectProbeError";
  }
}
