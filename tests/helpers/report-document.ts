import cases from "../../evals/smart-reports/cases.json" with { type: "json" };
import {
  ReportDocumentSchema,
  type ReportDocument
} from "../../packages/smart-reports/src/report-document.js";
import { prepareReportModelInput } from "../../packages/smart-reports/src/model-evidence.js";
import { reportId, reportOrg, reportProject, reportRequest } from "./smart-reports.js";
export function reportDocumentFixture(): ReportDocument {
  const facts = prepareReportModelInput(
    structuredClone(cases.cases.find((item) => item.id === "quiet-complete")!.facts)
  );
  const previousRef = facts.projects[0]!.ref;
  facts.projects[0]!.ref = "p1";
  for (const metric of facts.metrics)
    if (metric.project_ref === previousRef) metric.project_ref = "p1";
  for (const source of facts.evidence)
    if (source.project_ref === previousRef) source.project_ref = "p1";
  return ReportDocumentSchema.parse({
    version: 1,
    template_version: 1,
    run_id: reportRequest,
    name: "Monthly review",
    report: {
      version: 1,
      organization_id: reportOrg,
      definition_id: reportId,
      scope: [{ project_id: reportProject, origin_project_ids: [reportProject] }],
      facts,
      sources: [],
      expires_at: new Date(Date.parse(facts.cutoff_at) + 90 * 86400000).toISOString()
    },
    narrative: null,
    analysis: {
      status: "unavailable",
      reason: "model_unavailable",
      model: null,
      request_sha256: null
    }
  });
}

export function maximumReportDocumentFixture(): ReportDocument {
  const facts = prepareReportModelInput(
    structuredClone(cases.cases.find((item) => item.id === "production-maximum-month")!.facts)
  );
  const mapping = new Map(
    facts.projects.map((project, index) => [
      project.ref,
      { ref: `p${index + 1}`, id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}` }
    ])
  );
  for (const project of facts.projects) project.ref = mapping.get(project.ref)!.ref;
  for (const metric of facts.metrics) metric.project_ref = mapping.get(metric.project_ref)!.ref;
  for (const source of facts.evidence) source.project_ref = mapping.get(source.project_ref)!.ref;
  const scope = [...mapping.values()].map((project) => ({
    project_id: project.id,
    origin_project_ids: [project.id]
  }));
  const expires_at = new Date(Date.parse(facts.cutoff_at) + 90 * 86400000).toISOString();
  return ReportDocumentSchema.parse({
    version: 1,
    template_version: 1,
    run_id: reportRequest,
    name: "Maximum monthly review",
    report: {
      version: 1,
      organization_id: reportOrg,
      definition_id: reportId,
      scope,
      facts,
      sources: facts.evidence.map((source, index) => ({
        ref: source.ref,
        project_id: scope[Number(source.project_ref.slice(1)) - 1]!.project_id,
        origin_project_id: scope[Number(source.project_ref.slice(1)) - 1]!.project_id,
        source_type: source.type,
        source_id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        retained: false,
        text_available: source.context !== null,
        text_expires_at: source.context === null ? null : expires_at
      })),
      expires_at
    },
    narrative: null,
    analysis: {
      status: "unavailable",
      reason: "model_unavailable",
      model: null,
      request_sha256: null
    }
  });
}

export function factualReportDocumentFixture(): ReportDocument {
  const doc = reportDocumentFixture();
  return ReportDocumentSchema.parse({
    ...doc,
    version: 2,
    analysis: { status: "not_requested", reason: null, model: null, request_sha256: null }
  });
}
