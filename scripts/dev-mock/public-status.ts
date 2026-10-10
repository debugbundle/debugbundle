import { randomBytes } from "node:crypto";
import { z } from "zod";
import {
  PublicStatusIdSchema,
  PublicStatusManagementSchema,
  PublicStatusOptionsQuerySchema,
  PublicStatusOptionsSchema,
  PublicStatusSettingsSchema,
  type PublicStatusSettings
} from "../../packages/shared-types/src/public-status.js";
import {
  projectPublicStatus,
  sanitizePublicStatusText,
  type PublicStatusSource
} from "../../packages/storage/src/public-status-projection.js";
import type { createDevMockFixtures, MockRecord } from "./fixtures.js";
import type { MockResponse } from "./api.js";

type Publication = {
  publicId: string;
  ownerId: unknown;
  organizationId: unknown;
  settings: PublicStatusSettings;
};
const rollupSchema = z.object({
  day: z.string(),
  state: z.enum(["unknown", "operational", "degraded", "down", "paused"]),
  total_checks: z.number(),
  successful_checks: z.number(),
  failed_checks: z.number(),
  degraded_checks: z.number(),
  downtime_seconds: z.number(),
  incident_ids: z.array(z.string()),
  last_checked_at: z.string().nullable()
});
const reply = (body: unknown, status = 200): MockResponse => ({
  status,
  body,
  headers: { "cache-control": "no-store" }
});
const missing = (): MockResponse => reply({ error: "status_page_not_found" }, 404);
const invalid = (): MockResponse => reply({ error: "invalid_status_input" }, 400);

/** In-memory publication only; projection is shared with production and never executes checks. */
export function createPublicStatusMocks(
  data: ReturnType<typeof createDevMockFixtures>,
  isSignedIn: () => boolean
) {
  const pages = new Map<string, Publication>();
  const findProject = (id: string): MockRecord | undefined =>
    data.projects.find((p) => p["project_id"] === id);
  const sameScope = (p: MockRecord, ownerId: unknown, organizationId: unknown): boolean =>
    p["owner_user_id"] === ownerId && p["organization_id"] === organizationId;
  const checksFor = (id: string): MockRecord[] =>
    data.checks
      .filter((c) => c["project_id"] === id && !c["deleted_at"])
      .sort((a, b) => String(a["check_id"]).localeCompare(String(b["check_id"])));
  function currentSettings(anchorId: string, page: Publication): PublicStatusSettings {
    const projects = page.settings.projects.flatMap((selection) => {
      const project = findProject(selection.project_id);
      if (!project || !sameScope(project, page.ownerId, page.organizationId)) return [];
      const present = new Set(checksFor(selection.project_id).map((c) => c["check_id"]));
      return [{ ...selection, check_ids: selection.check_ids.filter((id) => present.has(id)) }];
    });
    if (!projects.some((p) => p.project_id === anchorId))
      projects.unshift({ project_id: anchorId, check_ids: [] });
    return { ...page.settings, projects };
  }
  function projection(anchorId: string, page: Publication): MockResponse {
    const anchor = findProject(anchorId);
    if (!anchor || !sameScope(anchor, page.ownerId, page.organizationId)) return missing();
    const source: PublicStatusSource[] = currentSettings(anchorId, page).projects.map((p) => ({
      project_id: p.project_id,
      name: String(findProject(p.project_id)!["name"]),
      checks: checksFor(p.project_id)
        .filter((c) => p.check_ids.includes(String(c["check_id"])))
        .map((c) => ({
          check_id: String(c["check_id"]),
          name: String(c["name"]),
          status:
            c["enabled"] === false || c["paused_reason"]
              ? "paused"
              : z.enum(["unknown", "passing", "failing", "paused"]).parse(c["status"]),
          interval_seconds: Number(c["interval_seconds"]),
          failure_threshold: Number(c["failure_threshold"]),
          rollups: data.rollups
            .filter((r) => r["project_id"] === p.project_id && r["check_id"] === c["check_id"])
            .map((r) => rollupSchema.parse(r))
        }))
    }));
    return reply(projectPublicStatus(page.settings.title, source, new Date()));
  }
  function handle(
    method: string,
    path: string,
    query: URLSearchParams,
    payload: unknown,
    origin: string
  ): MockResponse | undefined {
    const publicMatch = /^\/v1\/public\/status\/([^/]+)$/.exec(path);
    if (publicMatch) {
      if (method !== "GET") return reply({ error: "method_not_allowed" }, 405);
      if (!PublicStatusIdSchema.safeParse(publicMatch[1]).success) return missing();
      const entry = Array.from(pages).find(
        ([, p]) => p.publicId === publicMatch[1] && p.settings.enabled
      );
      return entry ? projection(entry[0], entry[1]) : missing();
    }
    const match = /^\/v1\/projects\/([^/]+)\/status-page(?:\/(options|preview))?$/.exec(path);
    if (!match) return undefined;
    if (!isSignedIn()) return reply({ error: "authentication_required" }, 401);
    const anchorId = match[1]!;
    const project = findProject(anchorId);
    if (!project) return missing();
    const owner = sameScope(project, data.session.user_id, data.session.organization_id);
    const stored = pages.get(anchorId);
    const page =
      stored && sameScope(project, stored.ownerId, stored.organizationId) ? stored : undefined;
    const defaults: PublicStatusSettings = {
      title: sanitizePublicStatusText(`${String(project["name"])} status`),
      enabled: false,
      projects: [{ project_id: anchorId, check_ids: [] }]
    };
    function managementResponse(): MockResponse {
      const settings = page ? currentSettings(anchorId, page) : defaults;
      const shared = owner || page?.settings.enabled;
      return reply(
        PublicStatusManagementSchema.parse({
          settings: owner
            ? settings
            : {
                ...defaults,
                title: shared ? settings.title : defaults.title,
                enabled: shared ? settings.enabled : false
              },
          public_id: shared ? (page?.publicId ?? null) : null,
          public_url: shared && page ? `${origin}/status/${page.publicId}` : null,
          access_mode: owner ? "manage" : "preview"
        })
      );
    }
    if (method === "GET" && !match[2]) return managementResponse();
    if (!owner) return reply({ error: "owner_required" }, 403);
    if (match[2] === "preview" && method === "GET")
      return page ? projection(anchorId, page) : missing();
    if (match[2] === "options" && method === "GET") {
      const parsed = PublicStatusOptionsQuerySchema.safeParse(Object.fromEntries(query));
      if (!parsed.success) return invalid();
      const q = parsed.data;
      const projects = data.projects
        .filter((p) => sameScope(p, project["owner_user_id"], project["organization_id"]))
        .filter((p) => !q.cursor || String(p["project_id"]) > q.cursor)
        .filter((p) => !q.check_project_id || p["project_id"] === q.check_project_id)
        .sort((a, b) => String(a["project_id"]).localeCompare(String(b["project_id"])));
      if (q.check_project_id && projects.length === 0) return invalid();
      return reply(
        PublicStatusOptionsSchema.parse({
          projects: projects.slice(0, 50).map((p) => {
            const checks = checksFor(String(p["project_id"])).filter(
              (c) => !q.check_cursor || String(c["check_id"]) > q.check_cursor
            );
            return {
              project_id: p["project_id"],
              name: p["name"],
              checks: checks
                .slice(0, 50)
                .map((c) => ({ check_id: c["check_id"], name: c["name"] })),
              next_check_cursor: checks.length > 50 ? checks[49]!["check_id"] : null
            };
          }),
          next_cursor: projects.length > 50 ? projects[49]!["project_id"] : null
        })
      );
    }
    if (method === "PUT" && !match[2]) {
      const parsed = PublicStatusSettingsSchema.safeParse(payload);
      if (!parsed.success) return invalid();
      const settings = parsed.data;
      if (
        settings.projects[0]!.project_id !== anchorId ||
        (settings.enabled && settings.projects.every((p) => p.check_ids.length === 0))
      )
        return invalid();
      for (const selection of settings.projects) {
        const p = findProject(selection.project_id);
        const checks = checksFor(selection.project_id);
        if (
          !p ||
          !sameScope(p, project["owner_user_id"], project["organization_id"]) ||
          selection.check_ids.some((id) => !checks.some((c) => c["check_id"] === id))
        )
          return invalid();
      }
      const saved: Publication = {
        publicId: page?.publicId ?? randomBytes(12).toString("hex"),
        ownerId: project["owner_user_id"],
        organizationId: project["organization_id"],
        settings: { ...settings, title: sanitizePublicStatusText(settings.title) }
      };
      pages.set(anchorId, saved);
      return reply(
        PublicStatusManagementSchema.parse({
          settings: saved.settings,
          public_id: saved.publicId,
          public_url: `${origin}/status/${saved.publicId}`,
          access_mode: "manage"
        })
      );
    }
    return reply({ error: "method_not_allowed" }, 405);
  }
  return { handle };
}
