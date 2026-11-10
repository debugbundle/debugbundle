import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { createDevMockFixtures } from "./fixtures.js";
import type { MockResponse } from "./api.js";
import {
  createReportPreviewFixtures,
  previewReportDocument,
  previewReportRun
} from "./report-fixtures.js";
import {
  CreateReportRequestSchema,
  DeleteReportDefinitionSchema
} from "../../packages/smart-reports/src/report-api-contract.js";
import {
  ReportDefinitionRecordSchema,
  ReplaceReportDefinitionSchema,
  type ReportDefinitionRecord
} from "../../packages/smart-reports/src/report-definition.js";
import {
  ReportRunCommandSchema,
  type ReportRunRecord
} from "../../packages/smart-reports/src/report-run.js";
import {
  ReportRunListQuerySchema,
  ReportRunMutationSchema
} from "../../packages/smart-reports/src/report-run-api-contract.js";
import {
  ReportContentViewSchema,
  type ReportContentView
} from "../../packages/smart-reports/src/report-content.js";
import {
  ReportAllowanceSchema,
  forecastRemainingReportRuns
} from "../../packages/smart-reports/src/report-allowance.js";
import { nextReportSchedule } from "../../packages/smart-reports/src/report-schedule.js";
import { renderReportHtml } from "../../packages/smart-reports/src/report-html.js";
import { renderReportPdfInChild } from "../../packages/smart-reports/src/report-pdf-process.js";
import { OrganizationPersonSchema } from "../../packages/shared-types/src/organization.js";

const reply = (body: unknown, status = 200): MockResponse => ({
  status,
  body: structuredClone(body)
});
const error = (code: string, status = 400): MockResponse => reply({ error: code }, status);
/** Local simulator only: maps hold all edits; no DB, queue, provider, receipt or
 * email client exists here. Production clients/schemas/renderers exercise the
 * real UI contracts without granting any production authority. */
export function createReportMocks(
  data: ReturnType<typeof createDevMockFixtures>,
  isSignedIn: () => boolean
) {
  const seed = createReportPreviewFixtures(data);
  const definitions = new Map(seed.definitions.map((item) => [item.id, item]));
  const runs = new Map(seed.runs.map((item) => [item.id, item]));
  const charges = new Map(
    seed.runs.filter((item) => item.generation_counted).map((item) => [item.id, item.created_at])
  );
  const documents = new Map<string, ReportContentView>();
  const commands = new Map<string, { payload: string; id: string }>();
  const reads = new Map<string, number>();
  const pdfs = new Set<string>();
  const pdfBodies = new Map<string, Promise<Uint8Array>>();
  function content(run: ReportRunRecord): ReportContentView {
    let view = documents.get(run.id);
    if (!view) {
      view = ReportContentViewSchema.parse({
        document: previewReportDocument(data, run, run.definition_id === seed.definitions[3]!.id),
        available_source_refs: []
      });
      documents.set(run.id, view);
    }
    return view;
  }
  function usage() {
    const now = new Date(),
      start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
      end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const used = [...charges.values()].filter((at) => Date.parse(at) >= start.getTime()).length;
    const scheduled = forecastRemainingReportRuns({
      now: now.toISOString(),
      ends_at: end.toISOString(),
      definitions: [...definitions.values()]
        .filter((item) => item.enabled && item.schedule && item.next_due_at)
        .map((item) => ({
          cadence: item.cadence,
          schedule: item.schedule!,
          next_due_at: item.next_due_at!
        }))
    });
    return ReportAllowanceSchema.parse({
      organization_id: data.session.organization_id,
      as_of: now.toISOString(),
      window: { starts_at: start.toISOString(), ends_at: end.toISOString() },
      limit: 40,
      used,
      remaining: Math.max(0, 40 - used),
      scheduled_remaining: scheduled,
      scope_complete: true,
      schedule_exceeds_remaining: scheduled > Math.max(0, 40 - used)
    });
  }
  function scopeValid(input: { project_ids: string[]; recipient_user_ids: string[] }): boolean {
    return (
      input.project_ids.every((id) =>
        data.projects.some((project) => project["project_id"] === id)
      ) && input.recipient_user_ids.every((id) => id === data.session.user_id)
    );
  }
  function definitionRecord(
    input:
      | z.infer<typeof ReplaceReportDefinitionSchema>
      | z.infer<typeof CreateReportRequestSchema>["definition"],
    existing?: ReportDefinitionRecord
  ): ReportDefinitionRecord {
    const now = new Date().toISOString();
    const next =
      input.enabled && input.schedule
        ? nextReportSchedule({ cadence: input.cadence, schedule: input.schedule, after: now })
        : null;
    return ReportDefinitionRecordSchema.parse({
      id: existing?.id ?? randomUUID(),
      organization_id: data.session.organization_id,
      created_by_user_id: data.session.user_id,
      name: input.name,
      cadence: input.cadence,
      scope: input.project_ids.map((id) => ({ project_id: id, origin_project_ids: [id] })),
      recipient_user_ids: input.recipient_user_ids,
      privacy_mode: input.privacy_mode,
      source_collection_consent: input.source_collection_consent,
      schedule: input.schedule,
      enabled: input.enabled,
      version: (existing?.version ?? 0) + 1,
      next_due_at: next?.due_at ?? null,
      next_period_ends_at: next?.period.ends_at ?? null,
      requires_owner_review: false,
      pause_reason: null,
      paused_at: null,
      weekly_overlap: input.weekly_overlap ?? null,
      created_at: existing?.created_at ?? now,
      updated_at: now
    });
  }
  function removeRun(id: string): void {
    runs.delete(id);
    documents.delete(id);
    reads.delete(id);
    pdfs.delete(id);
    pdfBodies.delete(id);
  }
  return {
    handle(
      method: string,
      path: string,
      query: URLSearchParams,
      payload: unknown
    ): MockResponse | null {
      const match =
        /^\/v1\/organizations\/([^/]+)\/(report-definitions|reports|people)(?:\/([^/]+))?(?:\/(.*))?$/.exec(
          path
        );
      if (!match) return null;
      if (!isSignedIn()) return error("unauthorized", 401);
      if (match[1] !== data.session.organization_id) return error("report_not_found", 404);
      const [, , group, id, action] = match;
      if (group === "people") {
        if (method !== "GET" || id) return error("mock_route_not_implemented", 501);
        return reply({
          people: [
            OrganizationPersonSchema.parse({
              user_id: data.session.user_id,
              email: data.session.email,
              role: data.session.role,
              project_access: "all",
              default_project_role: "member",
              suspended_at: null,
              grants_paused_at: null,
              direct_project_count: data.projects.length
            })
          ]
        });
      }
      const expected = z
        .object({ expected_organization_id: z.string().optional() })
        .passthrough()
        .safeParse(payload);
      if (
        expected.success &&
        expected.data.expected_organization_id &&
        expected.data.expected_organization_id !== data.session.organization_id
      )
        return error("organization_context_changed");
      const admission =
        (group === "report-definitions" && ["POST", "PATCH"].includes(method)) ||
        (group === "reports" && !id && method === "POST");
      if (admission && data.session.organization_plan !== "business")
        return error("upgrade_required", 403);
      if (group === "report-definitions") {
        const saved = id ? definitions.get(id) : undefined;
        if (id && !saved) return error("report_not_found", 404);
        if (method === "GET" && action === "allowance") return reply({ allowance: usage() });
        if (method === "GET" && !action)
          return reply(id ? { definition: saved } : { definitions: [...definitions.values()] });
        if (action) return error("mock_route_not_implemented", 501);
        if (method === "POST" && !id) {
          const parsed = CreateReportRequestSchema.safeParse(payload);
          if (!parsed.success) return error("invalid_report_input");
          const input = parsed.data.definition;
          if (
            input.expected_organization_id &&
            input.expected_organization_id !== data.session.organization_id
          )
            return error("organization_context_changed");
          const prior = commands.get(parsed.data.request_id),
            encoded = JSON.stringify(parsed.data);
          if (prior)
            return prior.payload !== encoded
              ? error("invalid_report_input")
              : definitions.has(prior.id)
                ? reply({ definition: definitions.get(prior.id) })
                : error("report_not_found", 404);
          if (!scopeValid(input)) return error("forbidden", 403);
          if (definitions.size >= 100) return error("report_definition_limit_reached");
          const definition = definitionRecord(input);
          definitions.set(definition.id, definition);
          commands.set(parsed.data.request_id, { payload: encoded, id: definition.id });
          return reply({ definition });
        }
        if (method === "PATCH" && saved) {
          const parsed = ReplaceReportDefinitionSchema.safeParse(payload);
          if (!parsed.success) return error("invalid_report_input");
          if (parsed.data.expected_version !== saved.version)
            return error("report_version_conflict", 409);
          if (!scopeValid(parsed.data)) return error("forbidden", 403);
          const definition = definitionRecord(parsed.data, saved);
          if (saved.privacy_mode === "full" && definition.privacy_mode === "restricted")
            for (const run of runs.values())
              if (run.definition_id === saved.id && run.privacy_mode === "full") removeRun(run.id);
          definitions.set(saved.id, definition);
          return reply({ definition });
        }
        if (method === "DELETE" && saved) {
          const parsed = DeleteReportDefinitionSchema.safeParse(payload);
          if (!parsed.success) return error("invalid_report_input");
          if (parsed.data.expected_version !== saved.version)
            return error("report_version_conflict", 409);
          definitions.delete(saved.id);
          for (const run of runs.values()) if (run.definition_id === saved.id) removeRun(run.id);
          return reply({ deleted: true });
        }
      } else if (!id) {
        if (method === "GET") {
          const parsed = ReportRunListQuerySchema.safeParse(Object.fromEntries(query));
          if (!parsed.success) return error("invalid_mock_pagination");
          const all = [...runs.values()].sort(
            (a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)
          );
          const cursor = parsed.data.cursor
            ? (JSON.parse(Buffer.from(parsed.data.cursor, "base64url").toString()) as {
                at: string;
                id: string;
              })
            : null;
          const remaining = cursor
            ? all.filter(
                (run) =>
                  run.created_at < cursor.at || (run.created_at === cursor.at && run.id < cursor.id)
              )
            : all;
          const page = remaining.slice(0, parsed.data.limit),
            last = page.at(-1);
          return reply({
            runs: page,
            next_cursor:
              last && remaining.length > page.length
                ? Buffer.from(JSON.stringify({ at: last.created_at, id: last.id })).toString(
                    "base64url"
                  )
                : null
          });
        }
        if (method === "POST") {
          const parsed = ReportRunCommandSchema.safeParse(payload);
          if (!parsed.success) return error("invalid_report_input");
          const input = parsed.data,
            prior = commands.get(input.request_id),
            encoded = JSON.stringify(input);
          if (prior)
            return prior.payload !== encoded
              ? error("invalid_report_input")
              : runs.has(prior.id)
                ? reply({ run: runs.get(prior.id) })
                : error("report_not_found", 404);
          const definition = definitions.get(input.definition_id);
          if (!definition) return error("report_not_found", 404);
          if (input.expected_version !== definition.version)
            return error("report_version_conflict", 409);
          if (
            input.period.kind !== definition.cadence ||
            Date.parse(input.period.ends_at) > Date.now()
          )
            return error("invalid_report_input");
          if (
            input.regenerate_from_run_id &&
            runs.get(input.regenerate_from_run_id)?.definition_id !== definition.id
          )
            return error("report_not_found", 404);
          if (!usage().remaining) return error("report_quota_exhausted", 409);
          const run = previewReportRun(
            definition,
            randomUUID(),
            "queued",
            new Date().toISOString()
          );
          Object.assign(run, {
            period: input.period,
            kind: input.regenerate_from_run_id ? "regeneration" : "manual",
            send_email: input.send_email
          });
          runs.set(run.id, run);
          charges.set(run.id, run.created_at);
          commands.set(input.request_id, { payload: encoded, id: run.id });
          return reply({ run });
        }
      } else {
        const run = runs.get(id);
        if (!run) return error("report_not_found", 404);
        if (method === "DELETE" && !action) {
          if (!ReportRunMutationSchema.safeParse(payload).success)
            return error("invalid_report_input");
          removeRun(id);
          return reply({ deleted: true });
        }
        if (method === "POST" && action === "cancel") {
          if (!ReportRunMutationSchema.safeParse(payload).success)
            return error("invalid_report_input");
          if (["queued", "processing"].includes(run.status)) {
            charges.delete(run.id);
            Object.assign(run, {
              status: "cancelled",
              ai_status: "unavailable",
              generation_counted: false
            });
          }
          return reply({ run });
        }
        if (method === "GET" && !action) {
          if (["queued", "processing"].includes(run.status)) {
            const count = (reads.get(id) ?? 0) + 1;
            reads.set(id, count);
            if (count === 2) run.status = "processing";
            if (count >= 3) {
              Object.assign(run, {
                status: "ready",
                ai_status: "succeeded",
                published_at: new Date().toISOString(),
                expires_at: new Date(Date.now() + 90 * 86400000).toISOString()
              });
              content(run);
            }
          }
          return reply({ run });
        }
        if (!["ready", "factual_only"].includes(run.status)) return error("report_not_found", 404);
        if (method === "GET" && action === "document") return reply(content(run));
        if (method === "GET" && action === "deliveries")
          return reply({
            deliveries: run.send_email
              ? run.recipient_user_ids.map((recipient, i) => ({
                  id: `93000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
                  run_id: id,
                  recipient_user_id: recipient,
                  status: "suppressed",
                  reason: "preview_only",
                  created_at: run.created_at,
                  updated_at: run.updated_at,
                  accepted_at: null
                }))
              : []
          });
        if (method === "GET" && action === "html")
          return {
            status: 200,
            headers: {
              "content-type": "text/html; charset=utf-8",
              "content-security-policy":
                "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"
            },
            body: renderReportHtml(content(run).document)
          };
        if (action === "pdf" && ["GET", "POST"].includes(method)) {
          if (method === "POST") {
            if (!ReportRunMutationSchema.safeParse(payload).success)
              return error("invalid_report_input");
            pdfs.add(id);
          }
          return reply({
            pdf: {
              run_id: id,
              status: pdfs.has(id) ? "ready" : "not_requested",
              retry_after_seconds: null
            }
          });
        }
        if (method === "GET" && action === "pdf/file") {
          if (!pdfs.has(id)) return error("report_pdf_unavailable", 404);
          return {
            status: 200,
            headers: {
              "content-type": "application/pdf",
              "content-disposition": 'attachment; filename="sample-report.pdf"'
            },
            body: null,
            resolveBody: () => {
              let body = pdfBodies.get(id);
              if (!body) {
                body = renderReportPdfInChild(content(run)).catch((reason: unknown) => {
                  pdfBodies.delete(id);
                  throw reason;
                });
                pdfBodies.set(id, body);
              }
              return body;
            }
          };
        }
      }
      return error("mock_route_not_implemented", 501);
    }
  };
}
