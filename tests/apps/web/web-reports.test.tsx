// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { App } from "../../../apps/web/src/app.js";
import { ReportApiError } from "../../../packages/report-client/src/index.js";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.js";
import { createSession, createProject, jsonResponse, requestUrl } from "./web-test-helpers.js";
import {
  reportDefinitionFixture,
  reportRunFixture,
  reportOrg,
  reportProject,
  reportRequest,
  reportEmailDeliveryFixture,
  reportAllowanceFixture
} from "../../helpers/smart-reports.js";
import { reportDocumentFixture } from "../../helpers/report-document.js";
import { ReportDocumentSchema } from "../../../packages/smart-reports/src/report-document.js";
import { ReportDefinitionFields } from "../../../apps/web/src/components/system/report-definition-fields.js";
import type { CreateReportDefinition } from "../../../packages/smart-reports/src/report-definition.js";
const calls = vi.hoisted(() => ({
  list: vi.fn(),
  allowance: vi.fn(),
  history: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  replace: vi.fn(),
  remove: vi.fn(),
  generate: vi.fn(),
  run: vi.fn(),
  content: vi.fn(),
  pdf: vi.fn(),
  deliveries: vi.fn(),
  prepare: vi.fn(),
  download: vi.fn(),
  cancel: vi.fn()
}));
vi.mock("../../../apps/web/src/lib/report-api.js", () => ({
  reportScope: (organizationId: string) => ({ organizationId, bearerToken: "browser-session" }),
  reportApi: {
    definitions: {
      list: calls.list,
      allowance: calls.allowance,
      get: calls.get,
      create: calls.create,
      replace: calls.replace,
      remove: calls.remove
    },
    runs: {
      list: calls.history,
      get: calls.run,
      content: calls.content,
      generate: calls.generate,
      cancel: calls.cancel,
      remove: calls.remove
    },
    pdf: { status: calls.pdf, request: calls.prepare, download: calls.download },
    deliveries: { list: calls.deliveries }
  },
  reportPdfFileUrl: (org: string, id: string) => `/v1/organizations/${org}/reports/${id}/pdf/file`,
  reportHtmlUrl: (org: string, id: string) => `/v1/organizations/${org}/reports/${id}/html`,
  reportErrorMessage: (error: unknown) => (error instanceof Error ? error.message : "Report failed")
}));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  resetBrowserSessionClientState();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});
function setup(
  plan: "business" | "team" | "solo" | "free" = "business",
  role: "owner" | "viewer" = "owner",
  selfHosted = false,
  emailVerified = true
) {
  const definition = reportDefinitionFixture(),
    run = {
      ...reportRunFixture(),
      status: "factual_only" as const,
      published_at: "2026-11-07T00:00:00.000Z",
      expires_at: "2027-02-05T00:00:00.000Z"
    };
  calls.list.mockResolvedValue([definition]);
  calls.allowance.mockResolvedValue(reportAllowanceFixture());
  calls.deliveries.mockResolvedValue([]);
  calls.history.mockResolvedValue({ runs: [run], next_cursor: null });
  calls.get.mockResolvedValue(definition);
  calls.run.mockResolvedValue(run);
  calls.content.mockResolvedValue({ document: reportDocumentFixture(), available_source_refs: [] });
  calls.pdf.mockResolvedValue({
    run_id: reportRequest,
    status: "not_requested",
    retry_after_seconds: null
  });
  calls.download.mockResolvedValue(new Uint8Array([1]));
  calls.prepare.mockResolvedValue({
    run_id: reportRequest,
    status: "queued",
    retry_after_seconds: 2
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.endsWith("/v1/auth/session"))
        return jsonResponse(200, {
          session: {
            ...createSession({
              user_id: reportProject,
              organization_id: reportOrg,
              organization_plan: plan,
              role: role === "viewer" ? "member" : "owner",
              email_verified_at: emailVerified ? "2026-11-07T00:00:00.000Z" : null
            }),
            self_hosted: selfHosted
          }
        });
      if (url.endsWith("/v1/projects"))
        return jsonResponse(200, {
          projects: [
            {
              ...createProject({
                project_id: reportProject,
                organization_id: reportOrg,
                name: "Production",
                organization_plan: plan
              }),
              effective_role: role
            }
          ]
        });
      if (url.endsWith("/v1/organizations")) return jsonResponse(200, { organizations: [] });
      if (url.endsWith("/people")) return jsonResponse(200, { people: [] });
      return jsonResponse(404, { error: "not_found" });
    })
  );
  return { definition, run };
}
it("shows report management for self-hosted Free while retaining project role checks", async () => {
  setup("free", "owner", true);
  render(<App initialEntries={["/reports"]} />);
  expect(await screen.findByRole("link", { name: "Create report" })).toBeVisible();
  expect(screen.queryByText(/New Smart Reports require Business/)).not.toBeInTheDocument();
});
it("puts report history before compact saved reports and distinguishes usable facts-only output", async () => {
  setup();
  render(<App initialEntries={["/reports"]} />);
  const history = await screen.findByRole("region", { name: "Report history" });
  const definitions = screen.getByRole("region", { name: "Saved reports" });
  expect(
    history.compareDocumentPosition(definitions) & Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy();
  expect(within(history).getByText("Facts only")).toBeVisible();
  expect(
    within(definitions).getByRole("link", { name: "Edit Monthly review settings" })
  ).toBeVisible();
  expect(screen.queryByText(/Off by default for manual generation/)).not.toBeInTheDocument();
});
it("shows scoped report history to a Viewer without generation or definition mutation controls", async () => {
  setup("business", "viewer");
  render(<App initialEntries={["/reports"]} />);
  expect(await screen.findByRole("heading", { name: "Reports", level: 1 })).toBeVisible();
  expect(await screen.findByRole("link", { name: "Open Monthly review" })).toHaveAttribute(
    "href",
    `/reports/${reportOrg}/${reportRequest}`
  );
  expect(screen.queryByRole("link", { name: "Create report" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Generate/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /Edit/ })).not.toBeInTheDocument();
});
it("defaults to full mode with explicit consent and retains the editor draft after a failed save", async () => {
  setup();
  const user = userEvent.setup();
  calls.create.mockRejectedValue(new ReportApiError(409, "organization_context_changed"));
  render(<App initialEntries={["/reports/definitions/new"]} />);
  const name = await screen.findByLabelText("Report name");
  expect(screen.getByLabelText("Generate reports automatically")).toBeChecked();
  expect(screen.getByRole("radio", { name: "Monthly" })).toBeChecked();
  expect(screen.getByLabelText("Delivery time")).toHaveValue("09:00");
  expect(screen.getByLabelText("Delivery timezone")).toHaveValue(
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  );
  await user.click(screen.getByRole("button", { name: /Email recipients:/ }));
  expect(
    await screen.findByRole("menuitemcheckbox", { name: createSession().email })
  ).toBeChecked();
  await user.keyboard("{Escape}");
  await user.type(name, "Reliability review");
  await user.click(screen.getByRole("button", { name: /Projects:/ }));
  await user.click(await screen.findByRole("menuitemcheckbox", { name: "Production" }));
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("button", { name: "Save report" }));
  expect(calls.create).not.toHaveBeenCalled();
  expect(await screen.findByRole("alert", { name: "Report settings error" })).toHaveTextContent(
    /consent|collection/i
  );
  await user.click(screen.getByLabelText(/I agree to collect/));
  await user.click(screen.getByRole("button", { name: "Save report" }));
  await waitFor(() => expect(calls.create).toHaveBeenCalledOnce());
  expect(await screen.findByRole("alert", { name: "Report settings error" })).toHaveTextContent(
    "organization_context_changed"
  );
  expect(name).toHaveValue("Reliability review");
  const input = calls.create.mock.calls[0]?.[0] as {
    definition: {
      privacy_mode: string;
      project_ids: string[];
      source_collection_consent: boolean;
      expected_organization_id: string;
      enabled: boolean;
      recipient_user_ids: string[];
      schedule: { time: string; timezone: string };
    };
  };
  expect(input.definition).toMatchObject({
    privacy_mode: "full",
    project_ids: [reportProject],
    source_collection_consent: true,
    expected_organization_id: reportOrg,
    enabled: true,
    recipient_user_ids: [reportProject],
    schedule: {
      time: "09:00",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
    }
  });
});

it("does not preselect an unverified account email for a new report", async () => {
  setup("business", "owner", false, false);
  const user = userEvent.setup();
  render(<App initialEntries={["/reports/definitions/new"]} />);
  await screen.findByLabelText("Report name");
  await user.click(screen.getByRole("button", { name: /Email recipients:/ }));
  expect(
    await screen.findByRole("menuitemcheckbox", { name: createSession().email })
  ).not.toBeChecked();
});

it("preserves a saved manual report with no email recipients", async () => {
  const { definition } = setup();
  const user = userEvent.setup();
  render(<App initialEntries={[`/reports/definitions/${definition.id}/edit`]} />);
  await screen.findByLabelText("Report name");
  expect(screen.getByLabelText("Generate reports automatically")).not.toBeChecked();
  expect(screen.queryByLabelText("Delivery time")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /Email recipients:/ }));
  expect(
    await screen.findByRole("menuitemcheckbox", { name: createSession().email })
  ).not.toBeChecked();
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("button", { name: "Save report" }));
  await waitFor(() => expect(calls.replace).toHaveBeenCalledOnce());
  expect(calls.replace).toHaveBeenCalledWith(
    expect.objectContaining({
      definition: expect.objectContaining({
        enabled: false,
        schedule: null,
        recipient_user_ids: []
      })
    })
  );
});
it("loads a saved report's explicit scope and version, preserving a rejected edit for retry", async () => {
  const { definition } = setup(),
    user = userEvent.setup();
  definition.schedule = { time: "16:30", timezone: "America/New_York" };
  definition.enabled = true;
  calls.replace.mockRejectedValue(new ReportApiError(409, "report_version_conflict"));
  render(<App initialEntries={[`/reports/definitions/${definition.id}/edit`]} />);
  const name = await screen.findByLabelText("Report name");
  await waitFor(() => expect(name).toHaveValue(definition.name));
  expect(screen.getByLabelText("Delivery timezone")).toHaveValue("America/New_York");
  expect(screen.getByLabelText("Delivery time")).toHaveValue("16:30");
  await user.clear(name);
  await user.type(name, "Updated review");
  await user.click(screen.getByRole("button", { name: "Save report" }));
  await waitFor(() => expect(calls.replace).toHaveBeenCalledOnce());
  expect(calls.replace).toHaveBeenCalledWith(
    expect.objectContaining({
      definitionId: definition.id,
      definition: expect.objectContaining({
        name: "Updated review",
        expected_version: definition.version,
        project_ids: [reportProject],
        privacy_mode: "full",
        source_collection_consent: true
      })
    })
  );
  expect(await screen.findByRole("alert", { name: "Report settings error" })).toHaveTextContent(
    "report_version_conflict"
  );
  expect(name).toHaveValue("Updated review");
});

it("keeps report creation in the shared header and links child breadcrumbs back to Reports", async () => {
  const { definition } = setup();
  const user = userEvent.setup();
  render(<App initialEntries={["/reports"]} />);
  const create = await screen.findByRole("link", { name: "Create report" });
  expect(create.closest("header")).not.toBeNull();
  await user.click(create);
  await screen.findByLabelText("Report name");
  let breadcrumb = screen.getByRole("navigation", { name: "breadcrumb" });
  expect(within(breadcrumb).getByText("Create report")).toHaveAttribute("aria-current", "page");
  expect(
    document.querySelector("header")?.querySelector('a[href="/reports/definitions/new"]')
  ).toBeNull();
  await user.click(within(breadcrumb).getByRole("link", { name: "Reports" }));
  await user.click(await screen.findByRole("link", { name: `Edit ${definition.name} settings` }));
  await screen.findByLabelText("Report name");
  breadcrumb = screen.getByRole("navigation", { name: "breadcrumb" });
  expect(within(breadcrumb).getByText("Report settings")).toHaveAttribute("aria-current", "page");
  await user.click(within(breadcrumb).getByRole("link", { name: "Reports" }));
  await user.click(await screen.findByRole("link", { name: "Open Monthly review" }));
  breadcrumb = screen.getByRole("navigation", { name: "breadcrumb" });
  expect(within(breadcrumb).getByText("Report")).toHaveAttribute("aria-current", "page");
  expect(within(breadcrumb).getByRole("link", { name: "Reports" })).toHaveAttribute(
    "href",
    "/reports"
  );
});
it("keeps retained factual reports readable after downgrade and uses one PDF download action", async () => {
  setup("team");
  const user = userEvent.setup();
  render(<App initialEntries={[`/reports/${reportOrg}/${reportRequest}`]} />);
  expect(await screen.findByRole("heading", { name: "Monthly review", level: 2 })).toBeVisible();
  expect(await screen.findByText(/AI analysis is unavailable/i)).toBeVisible();
  expect(screen.queryByText(/\(model rejected\)|\(model unavailable\)/i)).not.toBeInTheDocument();
  expect(
    screen.getByText(/recorded facts, resolutions and selected outstanding work remain available/i)
  ).toBeVisible();
  expect(screen.getByRole("link", { name: "Open report in new tab" })).toHaveAttribute(
    "href",
    `/v1/organizations/${reportOrg}/reports/${reportRequest}/html`
  );
  expect(screen.queryByRole("link", { name: "Download PDF" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Download PDF" }));
  await waitFor(() => expect(calls.prepare).toHaveBeenCalledOnce());
  const downloading = screen.getByRole("button", { name: "Preparing PDF..." });
  expect(downloading).toBeDisabled();
  expect(downloading.querySelector("svg")).toHaveClass("animate-spin");
  expect(calls.generate).not.toHaveBeenCalled();
});

it("retries a lost generation acknowledgement with the same command and no implicit recipient email", async () => {
  const { run } = setup(),
    user = userEvent.setup();
  calls.generate
    .mockRejectedValueOnce(new Error("lost acknowledgement"))
    .mockResolvedValueOnce(run);
  render(<App initialEntries={["/reports"]} />);
  await user.click(await screen.findByRole("button", { name: "Generate report" }));
  expect(calls.generate).not.toHaveBeenCalled();
  const confirmation = await screen.findByRole("dialog", { name: "Generate report" });
  expect(confirmation).toHaveTextContent("Uses one report from your workspace allowance");
  await user.click(within(confirmation).getByRole("button", { name: "Generate report" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("lost acknowledgement");
  await user.click(screen.getByRole("button", { name: "Generate report" }));
  await waitFor(() => expect(calls.generate).toHaveBeenCalledTimes(2));
  expect(calls.generate.mock.calls[0]?.[0]).toEqual(calls.generate.mock.calls[1]?.[0]);
  expect(calls.generate.mock.calls[0]?.[0]).toMatchObject({
    organizationId: reportOrg,
    command: { send_email: false, expected_organization_id: reportOrg }
  });
});

it("requires confirmation before deleting a retained report and keeps Viewer deletion hidden", async () => {
  setup();
  const user = userEvent.setup();
  render(<App initialEntries={[`/reports/${reportOrg}/${reportRequest}`]} />);
  await screen.findByRole("heading", { name: "Monthly review", level: 2 });
  await user.click(screen.getByRole("button", { name: "Delete report" }));
  expect(calls.remove).not.toHaveBeenCalled();
  const dialog = await screen.findByRole("alertdialog", { name: "Delete report" });
  await user.click(within(dialog).getByRole("button", { name: "Delete report" }));
  await waitFor(() =>
    expect(calls.remove).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: reportOrg,
        runId: reportRequest,
        expectedOrganizationId: reportOrg
      })
    )
  );
});

it("keeps whole-report mutation controls hidden on a Viewer detail page", async () => {
  setup("business", "viewer");
  render(<App initialEntries={[`/reports/${reportOrg}/${reportRequest}`]} />);
  await screen.findByRole("heading", { name: "Monthly review", level: 2 });
  expect(screen.queryByRole("button", { name: "Delete report" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Regenerate report" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Cancel report" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Download PDF" })).toBeVisible();
});

it("does not navigate back to an old report after its delayed generation finishes on another page", async () => {
  const { run } = setup(),
    user = userEvent.setup();
  let finish: ((record: typeof run) => void) | undefined;
  calls.generate.mockImplementation(
    () =>
      new Promise<typeof run>((resolve) => {
        finish = resolve;
      })
  );
  render(<App initialEntries={["/reports"]} />);
  await user.click(await screen.findByRole("button", { name: "Generate report" }));
  const confirmation = await screen.findByRole("dialog", { name: "Generate report" });
  await user.click(within(confirmation).getByRole("button", { name: "Generate report" }));
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("link", { name: "Projects" }));
  await screen.findByRole("heading", { name: "Projects", level: 1 });
  await act(async () => {
    finish?.(run);
    await Promise.resolve();
  });
  expect(screen.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();
  expect(calls.run).not.toHaveBeenCalled();
});

it("shows safe recipient delivery states and explains an uncertain send without offering resend", async () => {
  const { run } = setup();
  calls.run.mockResolvedValue({ ...run, send_email: true });
  calls.deliveries.mockResolvedValue([reportEmailDeliveryFixture()]);
  render(<App initialEntries={[`/reports/${reportOrg}/${reportRequest}`]} />);
  expect(await screen.findByRole("heading", { name: "Email delivery" })).toBeVisible();
  expect(screen.getByText("Uncertain")).toBeVisible();
  expect(screen.getByText(/will not be sent again automatically/)).toBeVisible();
  expect(screen.queryByRole("button", { name: /resend/i })).not.toBeInTheDocument();
});
it("keeps canonical HTML facts readable when PDF cache status is temporarily unavailable", async () => {
  setup();
  calls.pdf.mockRejectedValueOnce(new Error("PDF cache unavailable"));
  render(<App initialEntries={[`/reports/${reportOrg}/${reportRequest}`]} />);
  expect(await screen.findByRole("heading", { name: "Monthly review", level: 2 })).toBeVisible();
  expect(screen.getByRole("link", { name: "Open report in new tab" })).toBeVisible();
  expect(screen.getByText(/PDF status could not be loaded/)).toBeVisible();
});
async function openGeneratingReport() {
  vi.useFakeTimers();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  let view!: ReturnType<typeof render>;
  await act(async () => {
    view = render(<App initialEntries={[`/reports/${reportOrg}/${reportRequest}`]} />);
  });
  return view;
}
it.each(["ready", "factual_only"] as const)(
  "shows generating progress then automatically opens %s content",
  async (status) => {
    const { run } = setup();
    const document = reportDocumentFixture();
    const ref = document.report.facts.projects[0]!.coverage_ref;
    const saved =
      status === "factual_only"
        ? document
        : ReportDocumentSchema.parse({
            ...document,
            narrative: {
              version: 1,
              overview: { text: "The available observations are quiet.", evidence_refs: [ref] },
              highlights: [],
              priorities: [],
              limitations: [
                {
                  text: "Use the recorded coverage when interpreting these observations.",
                  evidence_refs: [ref]
                }
              ]
            },
            analysis: { ...document.analysis, status: "available", reason: null }
          });
    calls.content.mockResolvedValue({ document: saved, available_source_refs: [] });
    calls.run
      .mockResolvedValueOnce({ ...run, status: "queued", published_at: null })
      .mockResolvedValueOnce({ ...run, status: "processing", published_at: null })
      .mockResolvedValue({ ...run, status });
    await openGeneratingReport();
    const progress = screen.getByRole("status", { name: "Report generation status" });
    expect(within(progress).getByText("Generating report...")).toBeVisible();
    expect(progress.querySelector("svg")).toHaveClass("animate-spin", "motion-reduce:animate-none");
    expect(progress).toHaveTextContent("appear here automatically");
    expect(calls.content).not.toHaveBeenCalled();
    for (let index = 0; index < 2; index++)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
    expect(calls.content).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole("status", { name: "Report generation status" })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Monthly review", level: 2 })).toBeVisible();
    expect(
      status === "ready"
        ? screen.getByText("The available observations are quiet.")
        : screen.getByText(/AI analysis is unavailable/)
    ).toBeVisible();
    expect(calls.generate).not.toHaveBeenCalled();
    expect(calls.prepare).not.toHaveBeenCalled();
  }
);

it("shows a failed generation as a failure with an explicit new-generation consequence", async () => {
  const { run } = setup();
  calls.run.mockResolvedValue({ ...run, status: "failed", published_at: null });
  render(<App initialEntries={[`/reports/${reportOrg}/${reportRequest}`]} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("could not be completed");
  expect(screen.getByRole("alert")).toHaveTextContent("uses another generation");
  expect(calls.content).not.toHaveBeenCalled();
  expect(calls.generate).not.toHaveBeenCalled();
});
it("keeps checking slow generation, pauses in hidden tabs and cleans up on unmount", async () => {
  const { run } = setup();
  calls.run.mockResolvedValue({ ...run, status: "queued", published_at: null });
  const view = await openGeneratingReport();
  for (let index = 0; index < 20; index++)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
  expect(calls.run.mock.calls.length).toBeGreaterThan(16);
  const before = calls.run.mock.calls.length;
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  fireEvent(document, new Event("visibilitychange"));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60000);
  });
  expect(calls.run).toHaveBeenCalledTimes(before);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  await act(async () => {
    fireEvent(document, new Event("visibilitychange"));
  });
  expect(calls.run).toHaveBeenCalledTimes(before + 1);
  let finish!: (value: typeof run) => void;
  calls.run.mockImplementationOnce(
    () =>
      new Promise<typeof run>((resolve) => {
        finish = resolve;
      })
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000);
  });
  const inFlight = calls.run.mock.calls.length;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60000);
  });
  expect(calls.run).toHaveBeenCalledTimes(inFlight);
  view.unmount();
  await act(async () => {
    finish(run);
    await vi.advanceTimersByTimeAsync(60000);
  });
  expect(calls.run).toHaveBeenCalledTimes(inFlight);
  expect(calls.content).not.toHaveBeenCalled();
  expect(calls.generate).not.toHaveBeenCalled();
});
it.each(["failed", "cancelled", "paused_access"] as const)(
  "stops the spinner when generation becomes %s",
  async (status) => {
    const { run } = setup();
    calls.run
      .mockResolvedValueOnce({ ...run, status: "queued", published_at: null })
      .mockResolvedValue({ ...run, status, published_at: null });
    await openGeneratingReport();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(
      screen.queryByRole("status", { name: "Report generation status" })
    ).not.toBeInTheDocument();
    const count = calls.run.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });
    expect(calls.run).toHaveBeenCalledTimes(count);
    expect(calls.content).not.toHaveBeenCalled();
    expect(calls.generate).not.toHaveBeenCalled();
  }
);
it("pauses offline and opens the report when the connection returns", async () => {
  const { run } = setup();
  calls.run
    .mockResolvedValueOnce({ ...run, status: "queued", published_at: null })
    .mockResolvedValue(run);
  await openGeneratingReport();
  const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  await act(async () => {
    fireEvent(window, new Event("offline"));
    await vi.advanceTimersByTimeAsync(60000);
  });
  expect(calls.run).toHaveBeenCalledTimes(1);
  expect(screen.getByText(/You're offline/)).toBeVisible();
  online.mockReturnValue(true);
  await act(async () => {
    fireEvent(window, new Event("online"));
  });
  expect(screen.getByText(/AI analysis is unavailable/)).toBeVisible();
  expect(calls.generate).not.toHaveBeenCalled();
});
it("recovers status and content reads automatically after a temporary interruption", async () => {
  const { run } = setup();
  calls.run
    .mockResolvedValueOnce({ ...run, status: "queued", published_at: null })
    .mockRejectedValueOnce(new Error("Offline"))
    .mockResolvedValue(run);
  calls.content
    .mockRejectedValueOnce(new Error("Storage warming up"))
    .mockResolvedValue({ document: reportDocumentFixture(), available_source_refs: [] });
  await openGeneratingReport();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(screen.getByText(/keep checking automatically/i)).toBeVisible();
  expect(screen.getByText("Generating report...")).toBeVisible();
  for (let index = 0; index < 3; index++)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
  expect(screen.getByText(/AI analysis is unavailable/)).toBeVisible();
  expect(screen.queryByText(/keep checking automatically/i)).not.toBeInTheDocument();
  expect(calls.generate).not.toHaveBeenCalled();
});
it("stops generation polling and clears the progress view when access is revoked", async () => {
  const { run } = setup();
  calls.run
    .mockResolvedValueOnce({ ...run, status: "queued", published_at: null })
    .mockRejectedValue(new ReportApiError(403, "forbidden"));
  await openGeneratingReport();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  const before = calls.run.mock.calls.length;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60000);
  });
  expect(calls.run).toHaveBeenCalledTimes(before);
  expect(screen.queryByText("Generating report...")).not.toBeInTheDocument();
  expect(calls.content).not.toHaveBeenCalled();
  expect(calls.generate).not.toHaveBeenCalled();
});

it("shows actual shared monthly allowance and warns when configured demand exceeds what remains", async () => {
  setup();
  window.history.pushState({}, "", "/reports");
  render(<App />);
  const allowance = await screen.findByRole("region", { name: "Shared report allowance" });
  expect(within(allowance).getByText("33 of 40 reports remaining")).toBeTruthy();
  expect(within(allowance).getByText(/90 scheduled before the reset/)).toBeTruthy();
  expect(within(allowance).getByText(/Runs beyond the allowance will be skipped/)).toBeTruthy();
});
it("keeps report definitions visible when the separate allowance forecast is unavailable", async () => {
  setup();
  calls.allowance.mockRejectedValueOnce(new Error("offline"));
  window.history.pushState({}, "", "/reports");
  render(<App />);
  expect(await screen.findByRole("heading", { name: "Monthly review" })).toBeTruthy();
  expect(
    await screen.findByText("The shared allowance could not be loaded. Refresh to try again.")
  ).toBeTruthy();
});

it("keeps schedule, recipients and weekly overlap explicit and resets consent when privacy changes", async () => {
  vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
    ...new Intl.DateTimeFormat().resolvedOptions(),
    timeZone: "Europe/Ljubljana"
  });
  const user = userEvent.setup(),
    changes = vi.fn<(value: CreateReportDefinition) => void>();
  function Editor({ disabled = false }: { disabled?: boolean }) {
    const [value, setValue] = useState<CreateReportDefinition>({
      name: "Weekly reliability",
      cadence: "weekly",
      project_ids: [reportProject],
      recipient_user_ids: [],
      privacy_mode: "full",
      source_collection_consent: true,
      enabled: false,
      schedule: null
    });
    return (
      <ReportDefinitionFields
        value={value}
        onChange={(next) => {
          changes(next);
          setValue(next);
        }}
        projects={[{ value: reportProject, label: "Production" }]}
        recipients={[{ value: reportOrg, label: "Verified owner" }]}
        disabled={disabled}
      />
    );
  }
  const view = render(<Editor />);
  await user.click(screen.getByLabelText("Generate reports automatically"));
  expect(screen.getByLabelText("Delivery time")).toHaveValue("09:00");
  expect(screen.getByLabelText("Delivery timezone")).toHaveValue("Europe/Ljubljana");
  fireEvent.change(screen.getByLabelText("Delivery time"), { target: { value: "14:30" } });
  fireEvent.change(screen.getByLabelText("Delivery timezone"), {
    target: { value: "America/New_York" }
  });
  await user.click(screen.getByRole("button", { name: /Email recipients:/ }));
  await user.click(await screen.findByRole("menuitemcheckbox", { name: "Verified owner" }));
  await user.keyboard("{Escape}");
  await user.click(screen.getByLabelText("Keep the existing weekly digest alongside this report"));
  expect(changes).toHaveBeenLastCalledWith(
    expect.objectContaining({
      schedule: { time: "14:30", timezone: "America/New_York" },
      recipient_user_ids: [reportOrg],
      weekly_overlap: "keep_existing"
    })
  );
  await user.click(screen.getByLabelText("Keep the existing weekly digest alongside this report"));
  expect(changes.mock.lastCall?.[0]).not.toHaveProperty("weekly_overlap");
  await user.click(screen.getByRole("radio", { name: "Restricted" }));
  expect(screen.queryByLabelText(/I agree to collect/)).not.toBeInTheDocument();
  expect(changes.mock.lastCall?.[0].source_collection_consent).toBe(false);
  await user.click(screen.getByRole("radio", { name: "Full" }));
  expect(screen.getByLabelText(/I agree to collect/)).not.toBeChecked();
  await user.click(screen.getByRole("radio", { name: "Monthly" }));
  expect(screen.queryByLabelText(/Keep the existing weekly digest/)).not.toBeInTheDocument();
  await user.click(screen.getByLabelText("Generate reports automatically"));
  expect(screen.queryByLabelText("Delivery time")).not.toBeInTheDocument();
  expect(changes.mock.lastCall?.[0].schedule).toEqual({
    time: "14:30",
    timezone: "America/New_York"
  });
  await user.click(screen.getByLabelText("Generate reports automatically"));
  expect(screen.getByLabelText("Delivery timezone")).toHaveValue("America/New_York");
  expect(screen.getByLabelText("Delivery time")).toHaveValue("14:30");
  view.rerender(<Editor disabled />);
  expect(screen.getByLabelText("Report name")).toBeDisabled();
  expect(screen.getByLabelText("Generate reports automatically")).toBeDisabled();
});

it("uses standard empty cards and permitted actions for Business reports", async () => {
  setup("business");
  calls.list.mockResolvedValue([]);
  calls.history.mockResolvedValue({ runs: [], next_cursor: null });
  render(<App initialEntries={["/reports"]} />);
  const definitions = await screen.findByText("No report definitions");
  const history = screen.getByText("No retained reports");
  expect(screen.getByRole("region", { name: "Report history" })).toBeVisible();
  for (const title of [definitions, history]) {
    const card = title.closest('[data-slot="card"]');
    expect(card).not.toBeNull();
    expect(card!.querySelector('[data-slot="empty-icon"]')).not.toBeNull();
  }
  expect(
    within(screen.getByRole("region", { name: "Saved reports" })).getByRole("link", {
      name: "Create report"
    })
  ).toHaveAttribute("href", "/reports/definitions/new");
});

it.each(["free", "solo", "team"] as const)(
  "uses the shared upgrade callout rather than empty report inventories on %s",
  async (plan) => {
    setup(plan);
    calls.list.mockResolvedValue([]);
    calls.history.mockResolvedValue({ runs: [], next_cursor: null });
    render(<App initialEntries={["/reports"]} />);
    expect(await screen.findByText("Upgrade to unlock Smart Reports")).toBeVisible();
    expect(screen.getByRole("link", { name: "Open billing" })).toHaveAttribute("href", "/billing");
    await waitFor(() => expect(calls.history).toHaveBeenCalled());
    expect(screen.queryByText("No report definitions")).not.toBeInTheDocument();
    expect(screen.queryByText("No retained reports")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Create report" })).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    const links = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
    const improvements = links.indexOf("/improvements");
    expect(links[improvements + 1]).toBe("/projects");
  }
);

it("keeps authorised saved definitions and report history visible below the upgrade callout", async () => {
  setup("team");
  render(<App initialEntries={["/reports"]} />);
  expect(await screen.findByText("Upgrade to unlock Smart Reports")).toBeVisible();
  expect(await screen.findByRole("link", { name: "Open Monthly review" })).toBeVisible();
  expect(screen.getByRole("region", { name: "Report history" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Generate report" })).not.toBeInTheDocument();
});

it("keeps genuine archive failures retryable alongside the upgrade callout", async () => {
  setup("free");
  calls.history.mockRejectedValueOnce(new Error("Archive service offline"));
  render(<App initialEntries={["/reports"]} />);
  expect(await screen.findByText("Upgrade to unlock Smart Reports")).toBeVisible();
  expect(await screen.findByText("Archive service offline")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByRole("link", { name: "Open Monthly review" })).toBeVisible();
});
