import {
  AnalyticsFlowReportSchema,
  AnalyticsFlowResponseSchema,
  AnalyticsFlowsResponseSchema,
  type AnalyticsFlowDefinition,
  type AnalyticsFlowReport,
  type AnalyticsFlowDefinitionInput
} from "../../../../packages/shared-types/src/index.js";
import { API_BASE, buildBrowserSessionHeaders, readJson } from "./api-client.js";
const path = (projectId: string): string =>
  `${API_BASE}/v1/projects/${encodeURIComponent(projectId)}/analytics/flows`;
export async function listProjectAnalyticsFlows(
  projectId: string
): Promise<AnalyticsFlowDefinition[]> {
  return AnalyticsFlowsResponseSchema.parse(
    await readJson(await fetch(path(projectId), { credentials: "include" }))
  ).flows;
}
export async function saveProjectAnalyticsFlow(
  projectId: string,
  definition: AnalyticsFlowDefinitionInput
): Promise<AnalyticsFlowDefinition> {
  return AnalyticsFlowResponseSchema.parse(
    await readJson(
      await fetch(`${path(projectId)}/${encodeURIComponent(definition.flow_key)}`, {
        method: "PUT",
        credentials: "include",
        headers: buildBrowserSessionHeaders(true),
        body: JSON.stringify(definition)
      })
    )
  ).flow;
}
export async function archiveProjectAnalyticsFlow(projectId: string, key: string): Promise<void> {
  await readJson(
    await fetch(`${path(projectId)}/${encodeURIComponent(key)}`, {
      method: "DELETE",
      credentials: "include",
      headers: buildBrowserSessionHeaders()
    })
  );
}
export async function getProjectAnalyticsFlowReport(
  projectId: string,
  key: string,
  window: "7d" | "30d" | "90d"
): Promise<AnalyticsFlowReport> {
  return AnalyticsFlowReportSchema.parse(
    await readJson(
      await fetch(`${path(projectId)}/${encodeURIComponent(key)}/report?window=${window}`, {
        credentials: "include"
      })
    )
  );
}
