import {
  PublicStatusManagementSchema,
  PublicStatusOptionsSchema,
  PublicStatusPageSchema,
  PublicStatusSettingsSchema,
  type PublicStatusManagement,
  type PublicStatusOptions,
  type PublicStatusPage,
  type PublicStatusSettings,
  PublicStatusOptionsQuerySchema,
  type PublicStatusOptionsQuery
} from "../../../../packages/shared-types/src/public-status.js";
import { API_BASE, buildBrowserSessionHeaders, readJson } from "./api-client.js";
export async function getPublicStatusSettings(projectId: string): Promise<PublicStatusManagement> {
  return PublicStatusManagementSchema.parse(
    await readJson(
      await fetch(`${API_BASE}/v1/projects/${encodeURIComponent(projectId)}/status-page`, {
        credentials: "include",
        headers: buildBrowserSessionHeaders()
      })
    )
  );
}
export async function savePublicStatusSettings(
  projectId: string,
  settings: PublicStatusSettings
): Promise<PublicStatusManagement> {
  return PublicStatusManagementSchema.parse(
    await readJson(
      await fetch(`${API_BASE}/v1/projects/${encodeURIComponent(projectId)}/status-page`, {
        method: "PUT",
        credentials: "include",
        headers: buildBrowserSessionHeaders(true),
        body: JSON.stringify(PublicStatusSettingsSchema.parse(settings))
      })
    )
  );
}
export async function getPublicStatusOptions(
  projectId: string,
  query: PublicStatusOptionsQuery = {}
): Promise<PublicStatusOptions> {
  const params = new URLSearchParams(
    Object.entries(PublicStatusOptionsQuerySchema.parse(query)).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    )
  ).toString();
  return PublicStatusOptionsSchema.parse(
    await readJson(
      await fetch(
        `${API_BASE}/v1/projects/${encodeURIComponent(projectId)}/status-page/options${params ? `?${params}` : ""}`,
        { credentials: "include", headers: buildBrowserSessionHeaders() }
      )
    )
  );
}
export async function previewPublicStatus(projectId: string): Promise<PublicStatusPage> {
  return PublicStatusPageSchema.parse(
    await readJson(
      await fetch(`${API_BASE}/v1/projects/${encodeURIComponent(projectId)}/status-page/preview`, {
        credentials: "include",
        headers: buildBrowserSessionHeaders()
      })
    )
  );
}
