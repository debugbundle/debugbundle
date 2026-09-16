import {
  browserResourceDiagnosis,
  describeBrowserResource,
  summarizeResourceRoutes,
  type BundleV1,
  type EventEnvelope
} from "../../shared-types/src/index.js";
import type { BundleBuildContext } from "../../storage/src/index.js";

export function buildBrowserResourceContext(
  browserEvent: unknown,
  incident: BundleBuildContext,
  events: EventEnvelope[]
): BundleV1["context"]["resource_failure"] {
  const resource = describeBrowserResource(browserEvent);
  if (resource === null) return undefined;
  const routes: Array<string | null> = [];
  for (const event of events) {
    if (
      event.event_type !== "frontend_exception" ||
      event.service.name !== incident.service_name ||
      event.service.environment !== incident.environment
    )
      continue;
    const candidate = describeBrowserResource(event.payload.browser_event);
    if (
      candidate !== null &&
      candidate.host === resource.host &&
      candidate.path === resource.path &&
      candidate.type === resource.type
    ) {
      routes.push(event.payload.route ?? null);
    }
  }
  return {
    version: 1,
    ...resource,
    diagnosis: browserResourceDiagnosis(resource),
    routes: incident.resource_routes ?? summarizeResourceRoutes(routes, incident.occurrence_count)
  };
}
