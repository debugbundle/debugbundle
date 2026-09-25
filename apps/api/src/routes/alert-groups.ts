import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { AlertGroupCursor } from "../../../../packages/storage/src/index.js";
import type { ApiDependencies } from "../api-types.js";
import { requireRateLimitedProjectAccess } from "../api-helpers.js";

const GroupQuerySchema = z.object({
  project_id: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).max(256).regex(/^[A-Za-z0-9_-]+$/).optional()
}).strict();
const GroupParamsSchema = z.object({
  kind: z.enum(["direct", "email_digest"]),
  id: z.string().uuid()
}).strict();
const CursorSchema = z.object({ created_at: z.string().min(1).max(64), id: z.string().uuid() }).strict();

function encodeCursor(cursor: AlertGroupCursor | null): string | null {
  return cursor === null ? null : Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function decodeCursor(value: string | undefined): AlertGroupCursor | null | false {
  if (value === undefined) return null;
  try {
    const parsed = CursorSchema.safeParse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
    if (!parsed.success || !Number.isFinite(Date.parse(parsed.data.created_at))) return false;
    return parsed.data;
  } catch {
    return false;
  }
}

export function registerAlertGroupRoutes(app: FastifyInstance, dependencies: ApiDependencies): void {
  app.get("/v1/alert-groups", async (request, reply) => {
    const query = GroupQuerySchema.safeParse(request.query);
    if (!query.success) return reply.status(400).send({ error: "invalid_query" });
    const cursor = decodeCursor(query.data.cursor);
    if (cursor === false) return reply.status(400).send({ error: "invalid_cursor" });
    const auth = await requireRateLimitedProjectAccess(request, reply, dependencies, {
      bucket: "management-read", projectId: query.data.project_id
    });
    if (auth === null) return;
    if (dependencies.alertGroupInspection === undefined) {
      return reply.status(404).send({ error: "project_not_found" });
    }
    const result = await dependencies.alertGroupInspection.listGroupsForOrganization({
      organization_id: auth.access.organization_id,
      project_id: query.data.project_id,
      limit: query.data.limit,
      ...(cursor === null ? {} : { before: cursor })
    });
    if (result === null) return reply.status(404).send({ error: "project_not_found" });
    return reply.status(200).send({ groups: result.groups, next_cursor: encodeCursor(result.next_cursor) });
  });

  app.get("/v1/alert-groups/:kind/:id", async (request, reply) => {
    const params = GroupParamsSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "invalid_group_id" });
    const query = GroupQuerySchema.safeParse(request.query);
    if (!query.success) return reply.status(400).send({ error: "invalid_query" });
    const cursor = decodeCursor(query.data.cursor);
    if (cursor === false) return reply.status(400).send({ error: "invalid_cursor" });
    const auth = await requireRateLimitedProjectAccess(request, reply, dependencies, {
      bucket: "management-read", projectId: query.data.project_id
    });
    if (auth === null) return;
    if (dependencies.alertGroupInspection === undefined) {
      return reply.status(404).send({ error: "group_not_found" });
    }
    const result = await dependencies.alertGroupInspection.getGroupForOrganization({
      organization_id: auth.access.organization_id,
      project_id: query.data.project_id,
      kind: params.data.kind,
      group_id: params.data.id,
      limit: query.data.limit,
      ...(cursor === null ? {} : { after: cursor })
    });
    if (result === null) return reply.status(404).send({ error: "group_not_found" });
    return reply.status(200).send({
      group: result.group, members: result.members, next_cursor: encodeCursor(result.next_cursor)
    });
  });
}
