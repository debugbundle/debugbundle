import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type { ProjectAccessRecord } from "../../../packages/storage/src/types.js";
import { ProjectProbeError } from "../../../packages/storage/src/project-probe-errors.js";

export function rejectConsolidatedProjectWrite(
  reply: FastifyReply,
  access: Pick<ProjectAccessRecord, "canonical_project_id">
): boolean {
  if (!access.canonical_project_id) return false;
  void reply.status(409).send({
    error: "project_consolidated",
    canonical_project_id: access.canonical_project_id,
    required_scope: "canonical_project"
  });
  return true;
}

export function isProjectConsolidationDatabaseError(
  error: unknown
): error is Error & { code: string } {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string" &&
    ["P0001", "40001"].includes(String(error.code)) &&
    [
      "project_consolidated",
      "project_merge_in_progress",
      "project_configuration_busy",
      "project_scope_changed_retry",
      "project_has_origins",
      "concurrent_activation_limit",
      "configuration_limit_exceeded"
    ].includes(error.message)
  );
}

/** Translate only the known database fences; other errors retain Fastify's handler. */
export function registerProjectConsolidationErrors(app: FastifyInstance): void {
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ProjectProbeError)
      return reply.status(error.status).send({ error: error.code });
    if (isProjectConsolidationDatabaseError(error)) {
      const detail = "detail" in error ? z.string().guid().safeParse(error.detail) : null;
      return reply.status(409).send({
        error: error.message,
        ...(detail?.success ? { canonical_project_id: detail.data } : {}),
        ...(error.message === "project_consolidated"
          ? { required_scope: "canonical_project" }
          : { retryable: error.code === "40001" })
      });
    }
    return reply.send(error);
  });
}
