// @vitest-environment jsdom

import { render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../../../apps/web/src/app.tsx";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.ts";
import { createProject, createSession, jsonResponse, requestUrl } from "./web-test-helpers.js";

const PROJECT_ID = "proj_123";
const savedFunnel = {
  project_id: PROJECT_ID,
  funnel_key: "signup",
  display_name: "Signup",
  steps: [
    { step_key: "landing", display_name: "Landing" },
    { step_key: "complete", display_name: "Complete" }
  ],
  created_at: "2026-07-11T10:00:00.000Z",
  updated_at: "2026-07-11T10:00:00.000Z",
  archived_at: null
};

afterEach(() => {
  resetBrowserSessionClientState();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function installFetch(
  input: {
    role?: "owner" | "admin" | "member";
    maxSavedFunnels?: number;
    initialFunnels?: (typeof savedFunnel)[];
    failFirstList?: boolean;
    createErrors?: string[];
  } = {}
) {
  const requests: Array<{
    method: string;
    url: string;
    body: unknown;
    headers: Record<string, string>;
  }> = [];
  let listCount = 0;
  let funnels = [...(input.initialFunnels ?? [savedFunnel])];
  const createErrors = [...(input.createErrors ?? [])];
  const role = input.role ?? "owner";
  const collectionPath = `/v1/projects/${PROJECT_ID}/analytics/saved-funnels`;

  vi.stubGlobal(
    "fetch",
    vi.fn((request: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(request);
      const method = init?.method ?? "GET";

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession({ organization_plan: "team" }) });
      }
      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, {
          projects: [
            createProject({
              project_id: PROJECT_ID,
              organization_plan: "team",
              effective_role: role,
              relationship: role === "member" ? "shared" : "owned"
            })
          ]
        });
      }
      if (url.endsWith(`/v1/projects/${PROJECT_ID}/analytics-settings`)) {
        return jsonResponse(200, {
          access_mode: role === "member" ? "preview" : "manage",
          analytics_available: true,
          settings: {
            enabled: true,
            privacy_mode: "strict",
            consent_required: false,
            capture_page_views: true,
            capture_route_changes: true,
            capture_actions: false,
            capture_friction_signals: true,
            journey_sample_rate: 0.1,
            raw_retention_days: 7,
            sample_retention_days: 30,
            aggregate_retention_months: 24,
            max_saved_funnels: input.maxSavedFunnels ?? 10,
            max_custom_dimensions: 0,
            approved_custom_dimensions: []
          }
        });
      }
      if (url.endsWith(collectionPath) && method === "GET") {
        listCount += 1;
        if (input.failFirstList && listCount === 1) {
          return jsonResponse(503, { error: "unavailable" });
        }
        return jsonResponse(200, { funnels });
      }
      if (url.endsWith(collectionPath) && method === "POST") {
        const body = readBody(init);
        requests.push({ method, url, body, headers: readHeaders(init) });
        const createError = createErrors.shift();
        if (createError === "throw") {
          return Promise.reject(new Error("network_failure"));
        }
        if (createError !== undefined) {
          return jsonResponse(409, { error: createError });
        }
        const created = {
          ...savedFunnel,
          ...(body as object),
          updated_at: "2026-07-11T11:00:00.000Z"
        };
        funnels = [...funnels, created];
        return jsonResponse(201, { funnel: created });
      }
      if (url.endsWith(`${collectionPath}/signup`) && method === "PATCH") {
        const body = readBody(init);
        requests.push({ method, url, body, headers: readHeaders(init) });
        const updated = { ...savedFunnel, ...(body as object) };
        funnels = funnels.map((funnel) => (funnel.funnel_key === "signup" ? updated : funnel));
        return jsonResponse(200, { funnel: updated });
      }
      if (url.endsWith(`${collectionPath}/signup`) && method === "DELETE") {
        requests.push({ method, url, body: null, headers: readHeaders(init) });
        funnels = funnels.filter((funnel) => funnel.funnel_key !== "signup");
        return jsonResponse(200, {
          funnel: { ...savedFunnel, archived_at: "2026-07-11T12:00:00.000Z" }
        });
      }
      return jsonResponse(404, { error: "not_found" });
    })
  );

  return { requests, getListCount: () => listCount };
}

function readBody(init: RequestInit | undefined): unknown {
  if (typeof init?.body !== "string") throw new Error("expected_json_request_body");
  return JSON.parse(init.body) as unknown;
}

function readHeaders(init: RequestInit | undefined): Record<string, string> {
  return Object.fromEntries(new Headers(init?.headers).entries());
}

describe("web app - project analytics saved funnels", () => {
  it("lets owners create, update, and archive ordered definitions", async () => {
    const state = installFetch({ initialFunnels: [] });
    const user = userEvent.setup();
    render(<App initialEntries={[`/projects/${PROJECT_ID}/settings`]} />);

    expect(await screen.findByRole("heading", { name: "Saved funnels" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add funnel" }));
    const createDialog = screen.getByRole("dialog", { name: "Create saved funnel" });
    await user.type(within(createDialog).getByLabelText("Funnel key"), "signup");
    await user.type(within(createDialog).getByLabelText("Funnel name"), "Signup");
    await user.type(within(createDialog).getByLabelText("Step 1 key"), "landing");
    await user.type(within(createDialog).getByLabelText("Step 1 name"), "Landing");
    await user.type(within(createDialog).getByLabelText("Step 2 key"), "complete");
    await user.type(within(createDialog).getByLabelText("Step 2 name"), "Complete");
    await user.click(within(createDialog).getByRole("button", { name: "Move step 2 up" }));
    await user.click(within(createDialog).getByRole("button", { name: "Create funnel" }));

    const reorderedSteps = [savedFunnel.steps[1], savedFunnel.steps[0]];
    expect(await screen.findByText("Signup")).toBeInTheDocument();
    expect(state.requests[0]).toMatchObject({
      method: "POST",
      body: {
        funnel_key: "signup",
        display_name: "Signup",
        steps: reorderedSteps
      },
      headers: { "content-type": "application/json", "x-csrf-token": "csrf-token-123" }
    });

    await user.click(screen.getByRole("button", { name: "Edit Signup" }));
    const editDialog = screen.getByRole("dialog", { name: "Edit saved funnel" });
    expect(within(editDialog).getByLabelText("Funnel key")).toBeDisabled();
    await user.clear(within(editDialog).getByLabelText("Funnel name"));
    await user.type(within(editDialog).getByLabelText("Funnel name"), "Onboarding");
    await user.click(within(editDialog).getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("Onboarding")).toBeInTheDocument();
    expect(state.requests[1]).toMatchObject({
      method: "PATCH",
      body: { display_name: "Onboarding", steps: reorderedSteps },
      headers: { "content-type": "application/json", "x-csrf-token": "csrf-token-123" }
    });

    await user.click(screen.getByRole("button", { name: "Archive Onboarding" }));
    const archiveDialog = screen.getByRole("alertdialog");
    await user.click(within(archiveDialog).getByRole("button", { name: "Archive funnel" }));
    await waitFor(() => expect(screen.queryByText("Onboarding")).toBeNull());
    expect(state.requests[2]).toMatchObject({
      method: "DELETE",
      headers: { "x-csrf-token": "csrf-token-123" }
    });
    expect(state.requests[2]?.headers["content-type"]).toBeUndefined();
  });

  it("shows members definitions without mutation controls", async () => {
    installFetch({ role: "member" });
    render(<App initialEntries={[`/projects/${PROJECT_ID}/settings`]} />);

    expect(await screen.findByText("Signup")).toBeInTheDocument();
    expect(screen.getByText("landing to complete")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add funnel" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit Signup" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Archive Signup" })).toBeNull();
  });

  it("enforces the active limit and validates unique ordered steps", async () => {
    const state = installFetch({ maxSavedFunnels: 1 });
    const user = userEvent.setup();
    render(<App initialEntries={[`/projects/${PROJECT_ID}/settings`]} />);

    expect(await screen.findByText("1 of 1 active funnels")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add funnel" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Edit Signup" }));
    const dialog = screen.getByRole("dialog", { name: "Edit saved funnel" });
    await user.clear(within(dialog).getByLabelText("Step 2 key"));
    await user.type(within(dialog).getByLabelText("Step 2 key"), "landing");
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));

    expect(within(dialog).getByText(/step keys must be unique/i)).toBeInTheDocument();
    expect(state.requests).toHaveLength(0);
  });

  it("retries a failed saved-funnel list independently", async () => {
    const state = installFetch({ failFirstList: true });
    const user = userEvent.setup();
    render(<App initialEntries={[`/projects/${PROJECT_ID}/settings`]} />);

    expect(await screen.findByText(/could not load saved funnels/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry saved funnels" }));

    expect(await screen.findByText("Signup")).toBeInTheDocument();
    expect(state.getListCount()).toBe(2);
  });

  it("preserves a valid draft and explains server-side create failures", async () => {
    const state = installFetch({
      initialFunnels: [],
      createErrors: [
        "analytics_saved_funnel_limit_reached",
        "analytics_saved_funnel_funnel_key_taken",
        "invalid_payload",
        "throw"
      ]
    });
    const user = userEvent.setup();
    render(<App initialEntries={[`/projects/${PROJECT_ID}/settings`]} />);

    await screen.findByRole("heading", { name: "Saved funnels" });
    await user.click(screen.getByRole("button", { name: "Add funnel" }));
    const dialog = screen.getByRole("dialog", { name: "Create saved funnel" });
    await user.type(within(dialog).getByLabelText("Funnel key"), "signup");
    await user.type(within(dialog).getByLabelText("Funnel name"), "Signup");
    await user.type(within(dialog).getByLabelText("Step 1 key"), "landing");
    await user.type(within(dialog).getByLabelText("Step 1 name"), "Landing");
    await user.type(within(dialog).getByLabelText("Step 2 key"), "complete");
    await user.type(within(dialog).getByLabelText("Step 2 name"), "Complete");

    await user.click(within(dialog).getByRole("button", { name: "Create funnel" }));
    expect(
      await within(dialog).findByText("The active saved funnel limit has been reached.")
    ).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Create funnel" }));
    expect(
      await within(dialog).findByText("That funnel key is already in use.")
    ).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Create funnel" }));
    expect(
      await within(dialog).findByText("Could not save the funnel definition.")
    ).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Create funnel" }));
    await waitFor(() => expect(state.requests).toHaveLength(4));
    expect(within(dialog).getByLabelText("Funnel name")).toHaveValue("Signup");
  });
});
