import {
  AlertGroupListResponseSchema,
  AlertGroupResponseSchema,
  type AlertGroupListResponse,
  type AlertGroupResponse
} from "../../../../packages/alert-client/src/index.js";
import { API_BASE, readJson } from "./api-client.js";

function query(projectId: string, cursor?: string, limit = 20): string {
  const params = new URLSearchParams({ project_id: projectId, limit: String(limit) });
  if (cursor !== undefined) params.set("cursor", cursor);
  return params.toString();
}
export async function listAlertGroups(
  projectId: string,
  cursor?: string,
  limit = 20
): Promise<AlertGroupListResponse> {
  return AlertGroupListResponseSchema.parse(
    await readJson(
      await fetch(`${API_BASE}/v1/alert-groups?${query(projectId, cursor, limit)}`, {
        credentials: "include"
      })
    )
  );
}
export async function getAlertGroup(
  projectId: string,
  kind: "direct" | "email_digest",
  groupId: string,
  cursor?: string,
  limit = 20
): Promise<AlertGroupResponse> {
  return AlertGroupResponseSchema.parse(
    await readJson(
      await fetch(
        `${API_BASE}/v1/alert-groups/${kind}/${encodeURIComponent(groupId)}?${query(projectId, cursor, limit)}`,
        { credentials: "include" }
      )
    )
  );
}
