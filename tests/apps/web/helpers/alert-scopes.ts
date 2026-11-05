import { vi } from "vitest";
import type { AlertScope } from "../../../../packages/shared-types/src/alert-scope.js";
import type { AlertRecord, ServiceRecord } from "../../../../apps/web/src/lib/api.js";
import { createProject, createSession, jsonResponse, requestUrl } from "../web-test-helpers.js";
import { parseRequestBody } from "./request-body.js";

export const API_ORIGIN = "00000000-0000-4000-8000-000000000001";
export const APP_ORIGIN = "00000000-0000-4000-8000-000000000002";
export const SITE_ORIGIN = "00000000-0000-4000-8000-000000000003";
export const APP_PRODUCTION = "00000000-0000-4000-8000-000000000011";
export const APP_STAGING = "00000000-0000-4000-8000-000000000012";
export const SITE_PRODUCTION = "00000000-0000-4000-8000-000000000013";
export const APP_DEFINITION = "00000000-0000-4000-8000-000000000021";
export const SITE_DEFINITION = "00000000-0000-4000-8000-000000000022";
export const API_DEFINITION = "00000000-0000-4000-8000-000000000023";
export const scopeServices = [
  { service_definition_id: APP_DEFINITION, name: "App" },
  { service_definition_id: SITE_DEFINITION, name: "Site" },
  { service_definition_id: API_DEFINITION, name: "API" }
];
export function appScope(): AlertScope {
  return {
    origin_project_ids: [APP_ORIGIN],
    covers_current_project: false,
    services: [scopeServices[0]!],
    service_count: 1,
    service_filter: null
  };
}
export function globalScope(): AlertScope {
  return {
    origin_project_ids: [API_ORIGIN, APP_ORIGIN, SITE_ORIGIN],
    covers_current_project: true,
    services: scopeServices,
    service_count: 3,
    service_filter: null
  };
}
export const serviceInstances: ServiceRecord[] = [
  {
    service_id: APP_PRODUCTION,
    project_id: APP_ORIGIN,
    name: "App",
    environment: "production",
    runtime: "node",
    framework: null
  },
  {
    service_id: APP_STAGING,
    project_id: APP_ORIGIN,
    name: "App",
    environment: "staging",
    runtime: "node",
    framework: null
  },
  {
    service_id: SITE_PRODUCTION,
    project_id: SITE_ORIGIN,
    name: "Site",
    environment: "production",
    runtime: "node",
    framework: null
  }
];

export function mockScopedAlerts(
  initial: AlertRecord[],
  options: {
    legacy?: boolean;
    failRefresh?: boolean;
    failServices?: boolean;
    staleRefresh?: boolean;
  } = {}
) {
  let records = initial;
  const writes: Array<Record<string, unknown>> = [];
  const withoutScope = (record: AlertRecord): AlertRecord => {
    const result = { ...record };
    delete result.scope;
    return result;
  };
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(requestUrl(input), "http://localhost");
    if (url.pathname === "/v1/auth/session") return jsonResponse(200, { session: createSession() });
    if (url.pathname === "/v1/projects")
      return jsonResponse(200, { projects: [createProject({ organization_plan: "team" })] });
    if (url.pathname === "/v1/alerts") {
      if (options.legacy && url.searchParams.has("include_scope"))
        return jsonResponse(400, { error: "invalid_query" });
      if (options.failRefresh && writes.length) return jsonResponse(503, { error: "unavailable" });
      if (options.staleRefresh && writes.length) return jsonResponse(200, { alerts: initial });
      return jsonResponse(200, {
        alerts:
          url.searchParams.get("include_scope") === "true" ? records : records.map(withoutScope)
      });
    }
    if (url.pathname === "/v1/services")
      return options.failServices
        ? jsonResponse(503, { error: "unavailable" })
        : jsonResponse(200, { services: serviceInstances });
    if (url.pathname === "/v1/projects/proj_123/slack/destinations")
      return jsonResponse(200, { destinations: [] });
    if (url.pathname.startsWith("/v1/alerts/") && init?.method === "PATCH") {
      const payload = parseRequestBody(init.body);
      writes.push(payload);
      const id = url.pathname.split("/").at(-1);
      const existing = records.find((r) => r.alert_id === id)!;
      const next = { ...existing, ...payload, updated_at: "2026-11-05T10:00:00Z" };
      if (next.scope) {
        const selected = serviceInstances.find((s) => s.service_id === next.service_id);
        next.scope = {
          ...next.scope,
          service_filter: selected
            ? {
                service_id: selected.service_id,
                service_definition_id:
                  selected.project_id === APP_ORIGIN ? APP_DEFINITION : SITE_DEFINITION,
                name: selected.name,
                environment: selected.environment
              }
            : null
        };
      }
      records = records.map((r) => (r.alert_id === id ? next : r));
      return jsonResponse(200, { alert: withoutScope(next) });
    }
    return jsonResponse(404, { error: "not_found" });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { writes, fetchMock };
}
