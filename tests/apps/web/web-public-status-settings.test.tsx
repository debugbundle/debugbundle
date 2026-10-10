// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type {
  PublicStatusOptions,
  PublicStatusSettings
} from "../../../packages/shared-types/src/public-status.js";
import { PublicStatusSettingsDialog } from "../../../apps/web/src/components/system/public-status-settings.js";
import { TooltipProvider } from "../../../apps/web/src/components/ui/tooltip.js";
import { createProject, jsonResponse, requestUrl } from "./web-test-helpers.js";
import { createHealthCheck } from "./helpers/management-ui.js";
import { createDevMockApi } from "../../../scripts/dev-mock/api.js";
import {
  statusCheckId,
  statusPageFixture,
  statusProjectId,
  statusPublicId,
  statusSettings
} from "../../helpers/public-status.ts";
const secondId = "00000000-0000-4000-8000-000000000002",
  secondCheck = "22222222-2222-4222-8222-222222222222";
const options = {
  projects: [
    {
      project_id: statusProjectId,
      name: "Website",
      checks: [
        { check_id: statusCheckId, name: "Public service" },
        { check_id: "33333333-3333-4333-8333-333333333333", name: "New private service" }
      ],
      next_check_cursor: null
    },
    {
      project_id: secondId,
      name: "API",
      checks: [{ check_id: secondCheck, name: "API check" }],
      next_check_cursor: null
    }
  ],
  next_cursor: null
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function renderSettings(element: ReactElement): ReturnType<typeof render> {
  const view = render(element);
  fireEvent.click(screen.getByRole("button", { name: "Public status page" }));
  return view;
}
async function openChoices(label: string): Promise<void> {
  fireEvent.keyDown(
    await screen.findByRole("button", { name: (name) => name.startsWith(`${label}:`) }),
    { key: "Enter" }
  );
  await screen.findByRole("menu", { name: label });
}
async function closeChoices(): Promise<void> {
  fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
}
async function selectChoice(label: string, name: string): Promise<void> {
  await openChoices(label);
  fireEvent.click(await screen.findByRole("menuitemcheckbox", { name }));
  await closeChoices();
}
function renderManagedPanel(settings: PublicStatusSettings, choices: PublicStatusOptions): void {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: RequestInfo | URL) => {
      const parsed = new URL(requestUrl(url), "http://localhost");
      if (parsed.pathname.endsWith("/options")) {
        const projectId = parsed.searchParams.get("check_project_id");
        return jsonResponse(
          200,
          projectId
            ? {
                projects: choices.projects.filter((p) => p.project_id === projectId),
                next_cursor: null
              }
            : choices
        );
      }
      return jsonResponse(200, {
        settings,
        public_id: null,
        public_url: null,
        access_mode: "manage"
      });
    })
  );
  renderSettings(
    <PublicStatusSettingsDialog
      project={createProject({ project_id: statusProjectId, name: "Website" })}
      checks={null}
    />
  );
}
it("uses compact searchable selectors and a publication switch", async () => {
  const api = createDevMockApi();
  const projectId = "00000000-0000-4000-8000-000000000001";
  vi.stubGlobal(
    "fetch",
    vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const result = api.handle(
        init?.method ?? "GET",
        requestUrl(url),
        typeof init?.body === "string" ? JSON.parse(init.body) : undefined
      );
      return jsonResponse(result.status, result.body);
    })
  );
  renderSettings(
    <TooltipProvider>
      <PublicStatusSettingsDialog
        project={createProject({ project_id: projectId, name: "SayCheese" })}
        checks={null}
      />
    </TooltipProvider>
  );
  await screen.findByLabelText("Page status title");
  expect(screen.getByRole("switch", { name: "Enable public page" })).toHaveAttribute(
    "aria-checked",
    "false"
  );
  expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  expect(screen.getByRole("button", { name: /Other projects:/ })).toHaveTextContent(
    "Only this project"
  );
  const checksTrigger = screen.getByRole("button", { name: /SayCheese checks:/ });
  fireEvent.keyDown(checksTrigger, { key: "Enter" });
  const search = await screen.findByRole("searchbox", { name: "Search SayCheese checks" });
  fireEvent.change(search, { target: { value: "Web" } });
  expect(screen.queryByRole("menuitemcheckbox", { name: "API health" })).toBeNull();
  fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Web health" }));
  expect(screen.getByRole("menuitemcheckbox", { name: "Web health" })).toHaveAttribute(
    "aria-checked",
    "true"
  );
  fireEvent.keyDown(search, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  expect(checksTrigger).toHaveTextContent("Web health");
  expect(screen.getByText("1 check across 1 project")).toBeTruthy();
  fireEvent.keyDown(screen.getByRole("button", { name: /Other projects:/ }), { key: "Enter" });
  fireEvent.click(await screen.findByRole("menuitemcheckbox", { name: "TaskTime App" }));
  fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
  await screen.findByRole("button", { name: /TaskTime App checks:/ });
});
it("keeps the anchor fixed and removes only an excluded project's check selections", async () => {
  renderManagedPanel(
    {
      ...statusSettings,
      projects: [...statusSettings.projects, { project_id: secondId, check_ids: [secondCheck] }]
    },
    options
  );
  await openChoices("Other projects");
  expect(screen.queryByRole("menuitemcheckbox", { name: "Website" })).toBeNull();
  expect(screen.getByRole("menuitemcheckbox", { name: "API" })).toHaveAttribute(
    "aria-checked",
    "true"
  );
  fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "API" }));
  await closeChoices();
  expect(screen.queryByRole("button", { name: /^API checks:/ })).toBeNull();
  expect(screen.getByRole("button", { name: /^Website checks:/ })).toHaveTextContent(
    "Public service"
  );
  expect(screen.getByText("1 check across 1 project")).toBeInTheDocument();
  await selectChoice("Other projects", "API");
  expect(screen.getByRole("button", { name: /^API checks:/ })).toHaveTextContent("Select checks");
  expect(screen.getByText("1 check across 2 projects")).toBeInTheDocument();
});
it("explains why publication requires selected checks", async () => {
  renderManagedPanel(
    {
      ...statusSettings,
      enabled: false,
      projects: [{ project_id: statusProjectId, check_ids: [] }]
    },
    options
  );
  fireEvent.click(await screen.findByRole("switch", { name: "Enable public page" }));
  expect(
    screen.getByText("Select at least one health check before enabling the public page.")
  ).toBeInTheDocument();
  expect(screen.getByRole("switch", { name: "Enable public page" })).toHaveAttribute(
    "aria-checked",
    "false"
  );
  expect(vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);
  await selectChoice("Website checks", "Public service");
  expect(screen.getByRole("button", { name: "Save status settings" })).toBeEnabled();
});
it.each(["missing title", "unloaded checks"])(
  "does not create a page with %s on first enable",
  async (invalid) => {
    renderManagedPanel(
      {
        ...statusSettings,
        enabled: false,
        title: statusSettings.title
      },
      invalid === "unloaded checks"
        ? {
            projects: [{ ...options.projects[0]!, checks: [], next_check_cursor: statusCheckId }],
            next_cursor: null
          }
        : options
    );
    const toggle = await screen.findByRole("switch", { name: "Enable public page" });
    if (invalid === "missing title")
      fireEvent.change(screen.getByLabelText("Page status title"), { target: { value: "" } });
    fireEvent.click(toggle);
    expect(
      screen.getByText(
        "Enter a page title and review all selected projects and checks before enabling."
      )
    ).toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);
  }
);

it.each(["project", "publication"] as const)(
  "enforces the %s check limit while keeping selected checks removable",
  async (scope) => {
    const projectCount = scope === "project" ? 1 : 10;
    const projects = Array.from({ length: projectCount }, (_, projectIndex) => ({
      project_id:
        projectIndex === 0
          ? statusProjectId
          : `00000000-0000-4000-8000-${String(projectIndex + 10).padStart(12, "0")}`,
      name: projectIndex === 0 ? "Website" : `Project ${projectIndex}`,
      checks: Array.from({ length: 50 }, (_, checkIndex) => ({
        check_id: `10000000-0000-4000-8000-${String(projectIndex * 50 + checkIndex + 1).padStart(12, "0")}`,
        name: `Selected check ${checkIndex}`
      })),
      next_check_cursor: scope === "project" && projectIndex === 0 ? statusCheckId : null
    }));
    const extra = { check_id: secondCheck, name: "Extra check" };
    if (scope === "publication") projects.push({ ...options.projects[1]!, checks: [extra] });
    const settings = {
      ...statusSettings,
      projects: projects.map((p) => ({
        project_id: p.project_id,
        check_ids: p.project_id === secondId ? [] : p.checks.map((c) => c.check_id)
      }))
    };
    vi.stubGlobal(
      "fetch",
      vi.fn((url: RequestInfo | URL) => {
        const parsed = new URL(requestUrl(url), "http://localhost");
        if (parsed.searchParams.has("check_cursor"))
          return jsonResponse(200, {
            projects: [{ ...projects[0], checks: [extra], next_check_cursor: null }],
            next_cursor: null
          });
        if (parsed.pathname.endsWith("/options"))
          return jsonResponse(200, {
            projects: parsed.searchParams.has("check_project_id") ? [projects[0]] : projects,
            next_cursor: null
          });
        return jsonResponse(200, {
          settings,
          public_id: null,
          public_url: null,
          access_mode: "manage"
        });
      })
    );
    renderSettings(
      <PublicStatusSettingsDialog
        project={createProject({ project_id: statusProjectId, name: "Website" })}
        checks={null}
      />
    );
    if (scope === "project") {
      await openChoices("Website checks");
      fireEvent.click(screen.getByRole("menuitem", { name: "Load more Website checks" }));
      await screen.findByRole("menuitemcheckbox", { name: "Extra check" });
    } else await openChoices("API checks");
    expect(screen.getByRole("menuitemcheckbox", { name: "Extra check" })).toHaveAttribute(
      "aria-disabled",
      "true"
    );
    if (scope === "publication") {
      await closeChoices();
      await openChoices("Website checks");
    }
    expect(screen.getByRole("menuitemcheckbox", { name: "Selected check 0" })).not.toHaveAttribute(
      "aria-disabled",
      "true"
    );
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Selected check 0" }));
    if (scope === "publication") {
      await closeChoices();
      await openChoices("API checks");
    }
    expect(screen.getByRole("menuitemcheckbox", { name: "Extra check" })).not.toHaveAttribute(
      "aria-disabled",
      "true"
    );
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Extra check" }));
    expect(screen.getByRole("menuitemcheckbox", { name: "Extra check" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
  }
);
it("enforces the project limit while preserving the anchor and permitting removal", async () => {
  const projects = Array.from({ length: 50 }, (_, index) => ({
    project_id:
      index === 0
        ? statusProjectId
        : `00000000-0000-4000-8000-${String(index + 10).padStart(12, "0")}`,
    name: index === 0 ? "Website" : `Project ${index}`,
    checks: index === 0 ? options.projects[0]!.checks : [],
    next_check_cursor: null
  }));
  const settings = {
    ...statusSettings,
    enabled: false,
    projects: projects.map((p) => ({ project_id: p.project_id, check_ids: [] }))
  };
  vi.stubGlobal(
    "fetch",
    vi.fn((url: RequestInfo | URL) => {
      const parsed = new URL(requestUrl(url), "http://localhost");
      if (parsed.searchParams.has("cursor"))
        return jsonResponse(200, { projects: [options.projects[1]], next_cursor: null });
      if (parsed.pathname.endsWith("/options"))
        return jsonResponse(200, {
          projects: parsed.searchParams.has("check_project_id") ? [projects[0]] : projects,
          next_cursor: parsed.searchParams.has("check_project_id") ? null : statusProjectId
        });
      return jsonResponse(200, {
        settings,
        public_id: null,
        public_url: null,
        access_mode: "manage"
      });
    })
  );
  renderSettings(
    <PublicStatusSettingsDialog
      project={createProject({ project_id: statusProjectId, name: "Website" })}
      checks={null}
    />
  );
  await openChoices("Other projects");
  expect(screen.queryByRole("menuitemcheckbox", { name: "Website" })).toBeNull();
  fireEvent.click(screen.getByRole("menuitem", { name: "Load more projects" }));
  expect(await screen.findByRole("menuitemcheckbox", { name: "API" })).toHaveAttribute(
    "aria-disabled",
    "true"
  );
  expect(
    screen.getByText("50-project limit reached. Remove a project to include another.")
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Project 1" }));
  expect(screen.getByRole("menuitemcheckbox", { name: "API" })).not.toHaveAttribute(
    "aria-disabled",
    "true"
  );
  fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "API" }));
  await closeChoices();
  expect(screen.getByText("0 checks across 50 projects")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /^Website checks:/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /^API checks:/ })).toHaveTextContent("Select checks");
});
it("loads, publishes and previews through the actual local mock API", async () => {
  const api = createDevMockApi();
  const { projects } = api.handle("GET", "/v1/projects").body as {
    projects: Array<{ project_id: string; name: string }>;
  };
  const anchor = projects[0]!;
  const { checks } = api.handle("GET", `/v1/projects/${anchor.project_id}/availability-checks`)
    .body as {
    checks: Array<{ check_id: string; name: string }>;
  };
  vi.stubGlobal(
    "fetch",
    vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const result = api.handle(
        init?.method ?? "GET",
        requestUrl(url),
        typeof init?.body === "string" ? JSON.parse(init.body) : undefined
      );
      return jsonResponse(result.status, result.body);
    })
  );
  renderSettings(
    <TooltipProvider>
      <PublicStatusSettingsDialog
        project={createProject(anchor)}
        checks={checks.map((c) => createHealthCheck({ ...c, project_id: anchor.project_id }))}
      />
    </TooltipProvider>
  );
  await screen.findByLabelText("Page status title");
  fireEvent.change(screen.getByLabelText("Page status title"), {
    target: { value: "Demo service status" }
  });
  await selectChoice("SayCheese checks", "Web health");
  fireEvent.click(screen.getByLabelText("Enable public page"));
  await waitFor(() =>
    expect(screen.getByRole("link", { name: "Open status page" }).getAttribute("href")).toMatch(
      /^http:\/\/localhost:5291\/status\/[a-f0-9]{24}$/
    )
  );
  fireEvent.click(screen.getByRole("button", { name: "Preview status page" }));
  await screen.findByRole("dialog", { name: "Demo service status" });
  expect(screen.queryByText("Status settings unavailable")).toBeNull();
});
it("refreshes check choices after health edits while preserving the publication draft", async () => {
  const project = createProject({ project_id: statusProjectId, name: "Website" });
  let available = [options.projects[0]!.checks[0]!];
  const saves = vi.fn();
  const fetchMock = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
    if (requestUrl(url).includes("/options"))
      return jsonResponse(200, {
        projects: [{ ...options.projects[0], checks: available }],
        next_cursor: null
      });
    let settings = statusSettings;
    if (init?.method === "PUT") {
      if (typeof init.body !== "string") throw new Error("Expected a JSON settings body");
      settings = JSON.parse(init.body);
      saves(settings);
    }
    return jsonResponse(200, {
      settings,
      public_id: statusPublicId,
      public_url: `https://status.example.com/${statusPublicId}`,
      access_mode: "manage"
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  const checks = () =>
    available.map((c) => createHealthCheck({ ...c, project_id: statusProjectId }));
  const view = renderSettings(<PublicStatusSettingsDialog project={project} checks={checks()} />);
  await openChoices("Website checks");
  await screen.findByRole("menuitemcheckbox", { name: "Public service" });
  fireEvent.change(screen.getByLabelText("Page status title"), {
    target: { value: "Unsaved title" }
  });
  available = [...available, options.projects[0]!.checks[1]!];
  view.rerender(<PublicStatusSettingsDialog project={project} checks={checks()} />);
  expect(
    await screen.findByRole("menuitemcheckbox", { name: "New private service" })
  ).toHaveAttribute("aria-checked", "false");
  expect(screen.getByDisplayValue("Unsaved title")).toBeTruthy();
  fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "New private service" }));
  available = [{ ...available[1]!, name: "Renamed service" }];
  view.rerender(<PublicStatusSettingsDialog project={project} checks={checks()} />);
  expect(await screen.findByRole("menuitemcheckbox", { name: "Renamed service" })).toHaveAttribute(
    "aria-checked",
    "true"
  );
  expect(screen.queryByRole("menuitemcheckbox", { name: "Public service" })).toBeNull();
  await closeChoices();
  fireEvent.click(screen.getByRole("button", { name: "Save status settings" }));
  await waitFor(() =>
    expect(saves).toHaveBeenCalledWith({
      ...statusSettings,
      title: "Unsaved title",
      projects: [{ project_id: statusProjectId, check_ids: [available[0]!.check_id] }]
    })
  );
  const calls = fetchMock.mock.calls.length;
  view.rerender(
    <PublicStatusSettingsDialog
      project={project}
      checks={checks().map((c) => ({ ...c, status: "failing" }))}
    />
  );
  expect(fetchMock).toHaveBeenCalledTimes(calls);
});
it("publishes explicit multi-project selections, copies the URL, previews and unpublishes", async () => {
  const saved = vi.fn(),
    writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  vi.stubGlobal(
    "fetch",
    vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const path = requestUrl(url);
      if (path.includes("/options"))
        return jsonResponse(
          200,
          path.includes("check_project_id=")
            ? { projects: [options.projects[0]], next_cursor: null }
            : options
        );
      if (path.endsWith("/preview")) return jsonResponse(200, statusPageFixture());
      if (init?.method === "PUT") {
        if (typeof init.body !== "string") throw new Error("Expected a JSON settings body");
        const settings = JSON.parse(init.body);
        saved(settings);
        expect(init.credentials).toBe("include");
        return jsonResponse(200, {
          settings,
          public_id: statusPublicId,
          public_url: `https://status.example.com/${statusPublicId}`,
          access_mode: "manage"
        });
      }
      return jsonResponse(200, {
        settings: {
          ...statusSettings,
          enabled: false,
          projects: [{ project_id: statusProjectId, check_ids: [] }]
        },
        public_id: null,
        public_url: null,
        access_mode: "manage"
      });
    })
  );
  renderSettings(
    <TooltipProvider>
      <PublicStatusSettingsDialog
        project={createProject({ project_id: statusProjectId, name: "Website" })}
        checks={null}
      />
    </TooltipProvider>
  );
  await openChoices("Website checks");
  expect(screen.getByRole("menuitemcheckbox", { name: "Public service" })).toHaveAttribute(
    "aria-checked",
    "false"
  );
  fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Public service" }));
  expect(screen.getByRole("menuitemcheckbox", { name: "New private service" })).toHaveAttribute(
    "aria-checked",
    "false"
  );
  await closeChoices();
  fireEvent.change(screen.getByLabelText("Page status title"), {
    target: { value: "Customer status" }
  });
  await selectChoice("Other projects", "API");
  await selectChoice("API checks", "API check");
  fireEvent.click(screen.getByLabelText("Enable public page"));
  await waitFor(() =>
    expect(saved).toHaveBeenCalledWith({
      title: "Customer status",
      enabled: true,
      projects: [
        { project_id: statusProjectId, check_ids: [statusCheckId] },
        { project_id: secondId, check_ids: [secondCheck] }
      ]
    })
  );
  fireEvent.click(await screen.findByRole("button", { name: "Copy link" }));
  expect(writeText).toHaveBeenCalledWith(`https://status.example.com/${statusPublicId}`);
  fireEvent.click(screen.getByRole("button", { name: "Preview status page" }));
  await screen.findByRole("dialog", { name: "Product status" });
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Product status" })).toBeNull());
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Preview status page" })).toHaveFocus()
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Save status settings" }).hasAttribute("disabled")
    ).toBe(false)
  );
  fireEvent.click(screen.getByLabelText("Enable public page"));
  await waitFor(() => expect(saved.mock.lastCall?.[0].enabled).toBe(false));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Copy link" })).toBeNull());
});
it("loads all selected projects/checks for review and preserves saved publication after save failure", async () => {
  const management = {
    settings: {
      ...statusSettings,
      projects: [...statusSettings.projects, { project_id: secondId, check_ids: [secondCheck] }]
    },
    public_id: statusPublicId,
    public_url: `https://status.example.com/${statusPublicId}`,
    access_mode: "manage"
  };
  const first = { projects: [options.projects[0]], next_cursor: statusProjectId };
  vi.stubGlobal(
    "fetch",
    vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const path = requestUrl(url);
      if (init?.method === "PUT" || path.endsWith("/preview"))
        return jsonResponse(503, { error: "unavailable" });
      if (path.includes(`check_cursor=${secondCheck}`))
        return jsonResponse(200, { projects: [options.projects[1]], next_cursor: null });
      if (path.includes("cursor=") && !path.includes("check_project_id="))
        return jsonResponse(200, {
          projects: [{ ...options.projects[1], checks: [], next_check_cursor: secondCheck }],
          next_cursor: null
        });
      if (path.includes("check_project_id="))
        return jsonResponse(200, { projects: [options.projects[0]], next_cursor: null });
      if (path.includes("/options")) return jsonResponse(200, first);
      return jsonResponse(200, management);
    })
  );
  renderSettings(
    <PublicStatusSettingsDialog
      project={createProject({ project_id: statusProjectId, name: "Website" })}
      checks={null}
    />
  );
  const save = await screen.findByRole("button", { name: "Save status settings" });
  await openChoices("Other projects");
  expect(save.hasAttribute("disabled")).toBe(true);
  fireEvent.click(screen.getByRole("menuitem", { name: "Load more projects" }));
  await screen.findByRole("menuitemcheckbox", { name: "API" });
  await closeChoices();
  await openChoices("API checks");
  fireEvent.click(await screen.findByRole("menuitem", { name: "Load more API checks" }));
  await screen.findByRole("menuitemcheckbox", { name: "API check" });
  await closeChoices();
  await waitFor(() => expect(save.hasAttribute("disabled")).toBe(false));
  fireEvent.click(save);
  await screen.findByText(
    "Could not save status settings. Check the title, project ownership, and selected checks."
  );
  expect(screen.getByRole("link", { name: "Open status page" }).getAttribute("href")).toBe(
    management.public_url
  );
  fireEvent.click(screen.getByRole("button", { name: "Preview status page" }));
  await screen.findByText("The saved status page could not be previewed.");
});
it("keeps drafts and unloaded selections through failed pagination and permits retry", async () => {
  let failProjects = true,
    failChecks = true;
  vi.stubGlobal(
    "fetch",
    vi.fn((url: RequestInfo | URL) => {
      const parsed = new URL(requestUrl(url), "http://localhost");
      const query = parsed.searchParams;
      if (query.has("check_cursor"))
        return failChecks
          ? jsonResponse(503, { error: "private-diagnostics" })
          : jsonResponse(200, { projects: [options.projects[1]], next_cursor: null });
      if (query.has("check_project_id"))
        return jsonResponse(200, { projects: [options.projects[0]], next_cursor: null });
      if (query.has("cursor"))
        return failProjects
          ? jsonResponse(503, { error: "private-diagnostics" })
          : jsonResponse(200, {
              projects: [{ ...options.projects[1], checks: [], next_check_cursor: secondCheck }],
              next_cursor: null
            });
      if (parsed.pathname.endsWith("/options"))
        return jsonResponse(200, { projects: [options.projects[0]], next_cursor: statusProjectId });
      return jsonResponse(200, {
        settings: {
          ...statusSettings,
          projects: [...statusSettings.projects, { project_id: secondId, check_ids: [secondCheck] }]
        },
        public_id: statusPublicId,
        public_url: `https://status.example.com/${statusPublicId}`,
        access_mode: "manage"
      });
    })
  );
  renderSettings(
    <PublicStatusSettingsDialog
      project={createProject({ project_id: statusProjectId, name: "Website" })}
      checks={null}
    />
  );
  fireEvent.change(await screen.findByLabelText("Page status title"), {
    target: { value: "Keep this draft" }
  });
  await openChoices("Other projects");
  fireEvent.click(screen.getByRole("menuitem", { name: "Load more projects" }));
  await screen.findByText("More projects could not be loaded.");
  expect(screen.getByRole("searchbox")).toHaveFocus();
  expect(screen.getByDisplayValue("Keep this draft")).toBeInTheDocument();
  expect(screen.getByText("2 checks across 2 projects")).toBeInTheDocument();
  failProjects = false;
  fireEvent.click(screen.getByRole("menuitem", { name: "Load more projects" }));
  expect(await screen.findByRole("menuitemcheckbox", { name: "API" })).toHaveAttribute(
    "aria-checked",
    "true"
  );
  await closeChoices();
  await openChoices("API checks");
  fireEvent.click(screen.getByRole("menuitem", { name: "Load more API checks" }));
  await screen.findByText("More checks could not be loaded.");
  expect(screen.getByRole("searchbox")).toHaveFocus();
  expect(screen.getByRole("button", { name: "Save status settings" })).toBeDisabled();
  failChecks = false;
  fireEvent.click(screen.getByRole("menuitem", { name: "Load more API checks" }));
  expect(await screen.findByRole("menuitemcheckbox", { name: "API check" })).toHaveAttribute(
    "aria-checked",
    "true"
  );
  await closeChoices();
  expect(screen.getByDisplayValue("Keep this draft")).toBeInTheDocument();
  expect(screen.getByText("2 checks across 2 projects")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Save status settings" })).toBeEnabled();
  expect(screen.queryByText("private-diagnostics")).toBeNull();
  expect(screen.queryByText("More checks could not be loaded.")).toBeNull();
});
it("reports loading failure without exposing diagnostics", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => jsonResponse(503, { error: "private-diagnostics" }))
  );
  renderSettings(
    <PublicStatusSettingsDialog
      project={createProject({ project_id: statusProjectId })}
      checks={null}
    />
  );
  await screen.findByText("Public status settings could not be loaded.");
  expect(screen.queryByText("private-diagnostics")).toBeNull();
  expect(screen.queryByRole("button", { name: "Save status settings" })).toBeNull();
});
it("gives collaborators only the published link with no editor or owner-option reads", async () => {
  const fetchMock = vi.fn(() =>
    jsonResponse(200, {
      settings: statusSettings,
      public_id: statusPublicId,
      public_url: `https://status.example.com/${statusPublicId}`,
      access_mode: "preview"
    })
  );
  vi.stubGlobal("fetch", fetchMock);
  renderSettings(
    <PublicStatusSettingsDialog
      project={createProject({ project_id: statusProjectId })}
      checks={null}
    />
  );
  await screen.findByRole("button", { name: "Copy link" });
  expect(screen.queryByLabelText("Page status title")).toBeNull();
  expect(screen.queryByRole("button", { name: "Save status settings" })).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
