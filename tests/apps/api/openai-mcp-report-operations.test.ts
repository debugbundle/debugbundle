import { expect, it, vi } from "vitest";
import { createOpenAiReportOperations } from "../../../apps/api/src/openai-mcp-report-operations.js";
import { createOpenAiHostedToolHandlers } from "../../../packages/mcp-core/src/index.js";
import {
  reportRunFixture,
  reportOrg,
  reportProject,
  reportRequest
} from "../../helpers/smart-reports.js";
import { reportDocumentFixture } from "../../helpers/report-document.js";
it("binds both saved-report tools to the actual linked OAuth reader and projects only canonical public fields", async () => {
  const run = reportRunFixture(),
    document = reportDocumentFixture(),
    grant = "55555555-5555-4555-8555-555555555555";
  const list = vi.fn().mockResolvedValue({ items: [run], next_cursor: null }),
    read = vi.fn().mockResolvedValue(document);
  const handlers = createOpenAiHostedToolHandlers({
    operations: createOpenAiReportOperations({ runs: { list }, content: { read } })
  });
  const principal = {
    userId: reportProject,
    organizationId: reportOrg,
    grantId: grant,
    scopes: ["debugbundle:reports:read"]
  };
  const result = await handlers.list_reports({ principal, input: { limit: 5 } });
  expect(result.structuredContent).toMatchObject({
    reports: [{ id: run.id, project_count: 1 }],
    next_cursor: null
  });
  const expected = {
    organization_id: reportOrg,
    initiator: {
      version: 1,
      kind: "openai_oauth",
      user_id: reportProject,
      grant_id: grant,
      organization_id: reportOrg
    }
  };
  expect(list).toHaveBeenCalledExactlyOnceWith({ ...expected, limit: 5 });
  const content = await handlers.get_report_content({
    principal,
    input: { reportId: reportRequest }
  });
  expect(read).toHaveBeenCalledExactlyOnceWith({ ...expected, id: reportRequest });
  expect(content.structuredContent).toMatchObject({
    report: {
      report_id: reportRequest,
      facts: document.report.facts,
      narrative: document.narrative
    }
  });
  expect(content.structuredContent).not.toHaveProperty("report.analysis.request_sha256");
  expect(content.structuredContent).not.toHaveProperty("report.scope");
  expect(content.structuredContent).not.toHaveProperty("report.sources");
});
it("never falls back to a broader identity or a generator when a reader rejects access or is unavailable", async () => {
  const read = vi.fn().mockRejectedValue(new Error("report_not_found"));
  const principal = {
    userId: reportProject,
    organizationId: reportOrg,
    grantId: reportRequest,
    scopes: ["debugbundle:reports:read"]
  };
  const operations = createOpenAiReportOperations({ runs: { list: vi.fn() }, content: { read } });
  await expect(
    operations.get_report_content!({ principal, input: { reportId: reportRequest } })
  ).rejects.toThrow("report_not_found");
  expect(read).toHaveBeenCalledOnce();
  await expect(
    createOpenAiReportOperations(undefined).list_reports!({ principal, input: {} })
  ).rejects.toThrow("operation_unavailable");
  expect(Object.keys(operations).sort()).toEqual(["get_report_content", "list_reports"]);
});
