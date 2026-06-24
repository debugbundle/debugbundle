// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../../../apps/web/src/app.tsx";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.ts";
import {
  CaptureRuleCreateForm,
  type CaptureRuleCreateDraft,
  buildProjectCaptureRuleCreate,
  createDefaultCaptureRuleCreateDraft,
  getCaptureRuleCreateDraftValidationError
} from "../../../apps/web/src/components/system/capture-rule-create-form.tsx";
import { createProject, createSession, jsonResponse, requestUrl } from "./web-test-helpers.js";

const captureRuleFixture = {
  id: "rule_1",
  project_id: "proj_123",
  name: "Demote analytics resource errors",
  description: "Known third-party browser resource noise.",
  enabled: true,
  action: "demote" as const,
  matcher: {
    event_types: ["frontend_exception"],
    browser_event_kind: "resource_error",
    resource_url: { host: "analytics.example.com" }
  },
  sample_rate: null,
  sample_event_class: null,
  created_by_user_id: null,
  created_from_incident_id: "inc_123",
  created_from_event_id: null,
  expires_at: null,
  hit_count: 12,
  last_matched_at: "2026-05-26T10:10:00.000Z",
  created_at: "2026-05-26T10:00:00.000Z",
  updated_at: "2026-05-26T10:00:00.000Z"
};

afterEach(() => {
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function expectSelectTrigger(element: HTMLElement): HTMLButtonElement {
  expect(element).toBeInstanceOf(HTMLButtonElement);
  return element as HTMLButtonElement;
}

async function openSelect(label: RegExp | string): Promise<HTMLButtonElement> {
  const trigger = expectSelectTrigger(await screen.findByLabelText(label));
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "ArrowDown", code: "ArrowDown" });
  return trigger;
}

describe("web app — project capture rules", () => {
  it("renders capture rules between capture policy and improvement settings and lets managers pause a rule", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, { projects: [createProject({ organization_plan: "solo" })] });
      }

      if (url.endsWith("/v1/projects/proj_123/capture-policy") && init?.method === undefined) {
        return jsonResponse(200, {
          access_mode: "manage",
          policy: {
            preset: "balanced",
            capture_logs: "warning",
            capture_request_events: "failures_only",
            capture_breadcrumbs: "exception_only",
            capture_probe_events: "buffer_only",
            immediate_client_error_statuses: []
          },
          overrides: {
            capture_logs: null,
            capture_request_events: null,
            capture_breadcrumbs: null,
            capture_probe_events: null,
            immediate_client_error_statuses: null
          }
        });
      }

      if (url.endsWith("/v1/projects/proj_123/capture-rules") && init?.method === undefined) {
        return jsonResponse(200, {
          access_mode: "manage",
          rules: [captureRuleFixture]
        });
      }

      if (url.endsWith("/v1/projects/proj_123/capture-rules/rule_1") && init?.method === "PATCH") {
        expect(init.body).toBe(JSON.stringify({ enabled: false }));
        return jsonResponse(200, {
          rule: {
            ...captureRuleFixture,
            enabled: false
          }
        });
      }

      if (
        url.endsWith("/v1/projects/proj_123/improvement-settings") &&
        init?.method === undefined
      ) {
        return jsonResponse(200, {
          access_mode: "manage",
          cloud_automation_available: true,
          settings: {
            automated_improvement_bundles_enabled: true,
            improvement_bundle_sensitivity: "balanced"
          }
        });
      }

      if (url.includes("/v1/weekly-report-channels?")) {
        return jsonResponse(200, { channels: [] });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/settings"]} />);

    const capturePolicyHeading = await screen.findByRole("heading", {
      name: /capture policy/i,
      level: 3
    });
    const captureRulesHeading = await screen.findByRole("heading", {
      name: /capture rules/i,
      level: 3
    });
    const improvementHeading = await screen.findByRole("heading", {
      name: /automated improvement bundles/i,
      level: 3
    });

    expect(
      capturePolicyHeading.compareDocumentPosition(captureRulesHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      captureRulesHeading.compareDocumentPosition(improvementHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(screen.getByText(/demote analytics resource errors/i)).toBeInTheDocument();
    expect(screen.getByText(/known third-party browser resource noise/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^pause$/i }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) =>
            requestUrl(input).endsWith("/v1/projects/proj_123/capture-rules/rule_1") &&
            init?.method === "PATCH"
        )
      ).toBe(true);
    });

    expect(await screen.findByText(/^disabled$/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^enable$/i })).toBeInTheDocument();
  });

  it("shows capture rules in preview-only mode for shared members", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession({ role: "member" }) });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, {
          projects: [
            createProject({
              relationship: "shared",
              effective_role: "member",
              organization_plan: "team"
            })
          ]
        });
      }

      if (url.endsWith("/v1/projects/proj_123/capture-policy") && init?.method === undefined) {
        return jsonResponse(200, {
          access_mode: "preview",
          policy: {
            preset: "balanced",
            capture_logs: "warning",
            capture_request_events: "failures_only",
            capture_breadcrumbs: "exception_only",
            capture_probe_events: "buffer_only",
            immediate_client_error_statuses: []
          },
          overrides: {
            capture_logs: null,
            capture_request_events: null,
            capture_breadcrumbs: null,
            capture_probe_events: null,
            immediate_client_error_statuses: null
          }
        });
      }

      if (url.endsWith("/v1/projects/proj_123/capture-rules") && init?.method === undefined) {
        return jsonResponse(200, {
          access_mode: "preview",
          rules: [captureRuleFixture]
        });
      }

      if (
        url.endsWith("/v1/projects/proj_123/improvement-settings") &&
        init?.method === undefined
      ) {
        return jsonResponse(200, {
          access_mode: "preview",
          cloud_automation_available: true,
          settings: {
            automated_improvement_bundles_enabled: true,
            improvement_bundle_sensitivity: "balanced"
          }
        });
      }

      if (url.includes("/v1/weekly-report-channels?")) {
        return jsonResponse(200, { channels: [] });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/settings"]} />);

    expect(
      await screen.findByRole("heading", { name: /capture rules/i, level: 3 })
    ).toBeInTheDocument();
    expect(screen.getByText(/members can review project capture rules here/i)).toBeInTheDocument();
    expect(await screen.findByText(/demote analytics resource errors/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^pause$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^edit$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^delete$/i })).toBeNull();
  });

  it("paginates project settings capture rules after six rows", async () => {
    const user = userEvent.setup();
    const captureRules = Array.from({ length: 7 }, (_, index) => ({
      ...captureRuleFixture,
      id: `rule_${index + 1}`,
      name: `Capture rule ${String(index + 1).padStart(2, "0")}`,
      matcher: {
        ...captureRuleFixture.matcher,
        resource_url: { host: `cdn-${index + 1}.example.com` }
      }
    }));
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, { projects: [createProject({ organization_plan: "solo" })] });
      }

      if (url.endsWith("/v1/projects/proj_123/capture-policy") && init?.method === undefined) {
        return jsonResponse(200, {
          access_mode: "manage",
          policy: {
            preset: "balanced",
            capture_logs: "warning",
            capture_request_events: "failures_only",
            capture_breadcrumbs: "exception_only",
            capture_probe_events: "buffer_only",
            immediate_client_error_statuses: []
          },
          overrides: {
            capture_logs: null,
            capture_request_events: null,
            capture_breadcrumbs: null,
            capture_probe_events: null,
            immediate_client_error_statuses: null
          }
        });
      }

      if (url.endsWith("/v1/projects/proj_123/capture-rules") && init?.method === undefined) {
        return jsonResponse(200, {
          access_mode: "manage",
          rules: captureRules
        });
      }

      if (
        url.endsWith("/v1/projects/proj_123/improvement-settings") &&
        init?.method === undefined
      ) {
        return jsonResponse(200, {
          access_mode: "manage",
          cloud_automation_available: true,
          settings: {
            automated_improvement_bundles_enabled: true,
            improvement_bundle_sensitivity: "balanced"
          }
        });
      }

      if (url.includes("/v1/weekly-report-channels?")) {
        return jsonResponse(200, { channels: [] });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/settings"]} />);

    expect(await screen.findByText(/capture rule 01/i)).toBeInTheDocument();
    expect(screen.getByText(/capture rule 06/i)).toBeInTheDocument();
    expect(screen.queryByText(/capture rule 07/i)).toBeNull();
    expect(screen.getAllByRole("button", { name: /^pause$/i })).toHaveLength(6);

    await user.click(screen.getByRole("button", { name: /go to next page/i }));

    expect(await screen.findByText(/capture rule 07/i)).toBeInTheDocument();
    expect(screen.queryByText(/capture rule 01/i)).toBeNull();
    expect(screen.getByText(/^page 2$/i)).toBeInTheDocument();
  });

  it("lets managers create a manual capture rule from project settings", async () => {
    const user = userEvent.setup();
    const createdRule = {
      ...captureRuleFixture,
      id: "rule_manual",
      name: "Demote analytics script errors",
      description: "Known third-party browser resource noise.",
      hit_count: 0,
      last_matched_at: null,
      created_from_incident_id: null
    };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/v1/auth/session")) {
        return jsonResponse(200, { session: createSession() });
      }

      if (url.endsWith("/v1/projects") && init?.method === undefined) {
        return jsonResponse(200, { projects: [createProject({ organization_plan: "solo" })] });
      }

      if (url.endsWith("/v1/projects/proj_123/capture-policy") && init?.method === undefined) {
        return jsonResponse(200, {
          access_mode: "manage",
          policy: {
            preset: "balanced",
            capture_logs: "warning",
            capture_request_events: "failures_only",
            capture_breadcrumbs: "exception_only",
            capture_probe_events: "buffer_only",
            immediate_client_error_statuses: []
          },
          overrides: {
            capture_logs: null,
            capture_request_events: null,
            capture_breadcrumbs: null,
            capture_probe_events: null,
            immediate_client_error_statuses: null
          }
        });
      }

      if (url.endsWith("/v1/projects/proj_123/capture-rules") && init?.method === undefined) {
        return jsonResponse(200, {
          access_mode: "manage",
          rules: []
        });
      }

      if (url.endsWith("/v1/projects/proj_123/capture-rules") && init?.method === "POST") {
        expect(typeof init.body).toBe("string");
        expect(JSON.parse(init.body as string)).toMatchObject({
          name: "Demote analytics script errors",
          description: "Known third-party browser resource noise.",
          enabled: true,
          action: "demote",
          matcher: {
            event_types: ["frontend_exception"],
            resource_url: { host: "analytics.example.com" }
          },
          sample_rate: null,
          sample_event_class: null
        });
        return jsonResponse(201, { rule: createdRule });
      }

      if (
        url.endsWith("/v1/projects/proj_123/improvement-settings") &&
        init?.method === undefined
      ) {
        return jsonResponse(200, {
          access_mode: "manage",
          cloud_automation_available: true,
          settings: {
            automated_improvement_bundles_enabled: true,
            improvement_bundle_sensitivity: "balanced"
          }
        });
      }

      if (url.includes("/v1/weekly-report-channels?")) {
        return jsonResponse(200, { channels: [] });
      }

      return jsonResponse(404, { error: "not_found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App initialEntries={["/projects/proj_123/settings"]} />);

    expect(
      await screen.findByRole("heading", { name: /capture rules/i, level: 3 })
    ).toBeInTheDocument();
    await user.click(
      screen.getAllByRole("button", { name: /^create rule$/i })[0] as HTMLButtonElement
    );

    const dialog = await screen.findByRole("dialog");
    await user.type(
      within(dialog).getByLabelText(/^rule name$/i),
      "Demote analytics script errors"
    );
    await user.type(
      within(dialog).getByLabelText(/^description$/i),
      "Known third-party browser resource noise."
    );
    await user.type(within(dialog).getByLabelText(/^resource host$/i), "analytics.example.com");
    await user.click(within(dialog).getByRole("button", { name: /^create rule$/i }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) =>
            requestUrl(input).endsWith("/v1/projects/proj_123/capture-rules") &&
            init?.method === "POST"
        )
      ).toBe(true);
    });

    expect(await screen.findByText(/demote analytics script errors/i)).toBeInTheDocument();
    expect(screen.getByText(/analytics\.example\.com/i)).toBeInTheDocument();
  });

  it("builds manual rule payloads with advanced matcher overrides and normalized paths", () => {
    const draft = {
      ...createDefaultCaptureRuleCreateDraft(),
      name: "Sample repeated request failures",
      action: "sample" as const,
      eventType: "request_event" as const,
      requestPathEquals: "api/bootstrap",
      statusCodes: "429, 500, 429",
      sampleRatePercent: "25",
      sampleEventClass: "context" as const,
      expiresAt: "2026-06-19T12:34",
      advancedMatcherJson: '{"status_ranges":[{"start":500,"end":599}]}'
    };

    expect(getCaptureRuleCreateDraftValidationError(draft)).toBeNull();

    expect(buildProjectCaptureRuleCreate(draft)).toMatchObject({
      name: "Sample repeated request failures",
      action: "sample",
      matcher: {
        event_types: ["request_event"],
        request_url: { path_equals: "/api/bootstrap" },
        status_codes: [429, 500],
        status_ranges: [{ start: 500, end: 599 }]
      },
      sample_rate: 0.25,
      sample_event_class: "context",
      expires_at: new Date("2026-06-19T12:34").toISOString()
    });
  });

  it("drops invalid manual expiration values instead of emitting invalid timestamps", () => {
    const draft = {
      ...createDefaultCaptureRuleCreateDraft(),
      name: "Demote checkout resource errors",
      resourceHost: "cdn.example.com",
      resourcePathEquals: "assets/chunk.js",
      expiresAt: "not-a-date"
    };

    expect(getCaptureRuleCreateDraftValidationError(draft)).toBeNull();
    expect(buildProjectCaptureRuleCreate(draft)).toMatchObject({
      matcher: {
        event_types: ["frontend_exception"],
        resource_url: { host: "cdn.example.com", path_equals: "/assets/chunk.js" }
      },
      expires_at: null
    });
  });

  it("returns specific validation errors for invalid guided drafts", () => {
    expect(getCaptureRuleCreateDraftValidationError(createDefaultCaptureRuleCreateDraft())).toBe(
      "Rule name is required."
    );

    expect(
      getCaptureRuleCreateDraftValidationError({
        ...createDefaultCaptureRuleCreateDraft(),
        name: "Sample invalid rate",
        action: "sample",
        resourceHost: "analytics.example.com",
        sampleRatePercent: "0"
      })
    ).toBe("Sample rate must be greater than 0 and at most 100.");

    expect(
      getCaptureRuleCreateDraftValidationError({
        ...createDefaultCaptureRuleCreateDraft(),
        name: "Bad statuses",
        resourceHost: "analytics.example.com",
        statusCodes: "abc"
      })
    ).toBe("Status codes must be a comma-separated list of HTTP status codes.");

    expect(
      getCaptureRuleCreateDraftValidationError({
        ...createDefaultCaptureRuleCreateDraft(),
        name: "Missing fingerprint version",
        fingerprintValue: "fp_123"
      })
    ).toBe("Fingerprint version is required when matching a fingerprint value.");

    expect(
      getCaptureRuleCreateDraftValidationError({
        ...createDefaultCaptureRuleCreateDraft(),
        name: "Bad json",
        resourceHost: "analytics.example.com",
        advancedMatcherJson: "{"
      })
    ).toBe("Advanced matcher JSON must be valid JSON.");

    expect(
      getCaptureRuleCreateDraftValidationError({
        ...createDefaultCaptureRuleCreateDraft(),
        name: "Too broad"
      })
    ).toBe("Add at least one matcher field beyond event type.");

    expect(
      getCaptureRuleCreateDraftValidationError({
        ...createDefaultCaptureRuleCreateDraft(),
        name: "Resource error without constraint",
        browserEventKind: "resource_error"
      })
    ).toBe("Resource-error rules need a resource URL matcher or exact fingerprint.");
  });

  it("updates guided form controls across matcher and sampling fields", async () => {
    const setInputValue = (label: RegExp, value: string): void => {
      fireEvent.change(screen.getByLabelText(label), {
        target: {
          value
        }
      });
    };

    function Harness(): JSX.Element {
      const [draft, setDraft] = useState<CaptureRuleCreateDraft>({
        ...createDefaultCaptureRuleCreateDraft(),
        name: "Seed rule",
        action: "sample",
        resourceHost: "analytics.example.com"
      });

      return (
        <>
          <CaptureRuleCreateForm draft={draft} disabled={false} onDraftChange={setDraft} />
          <output data-testid="draft-state">{JSON.stringify(draft)}</output>
        </>
      );
    }

    const user = userEvent.setup();
    render(<Harness />);

    setInputValue(/^rule name$/i, "Bot request sampling");
    setInputValue(/^description$/i, "Sample recurring bot traffic.");

    await openSelect(/^event type$/i);
    await user.click(screen.getByRole("option", { name: /request event/i }));

    await openSelect(/^runtime$/i);
    await user.click(screen.getByRole("option", { name: /node\.js/i }));

    setInputValue(/^services$/i, "web, api");
    setInputValue(/^environments$/i, "production, staging");

    await openSelect(/^browser event kind$/i);
    await user.click(screen.getByRole("option", { name: /window error/i }));

    await openSelect(/^client kind$/i);
    await user.click(screen.getByRole("option", { name: /^bot$/i }));

    await openSelect(/^request scope$/i);
    await user.click(screen.getByRole("option", { name: /third-party allowed/i }));

    setInputValue(/^bot family$/i, "Googlebot");
    await user.click(screen.getByRole("switch", { name: /opaque browser event/i }));
    setInputValue(/^error name$/i, "NetworkError");
    setInputValue(/^message equals$/i, "Window error");
    setInputValue(/^message contains$/i, "chunk");
    setInputValue(/^resource path equals$/i, "assets/chunk.js");
    setInputValue(/^request path equals$/i, "api/bootstrap");
    setInputValue(/^status codes$/i, "429, 500");
    setInputValue(/^fingerprint version$/i, "v1");
    setInputValue(/^fingerprint value$/i, "fp_123");
    setInputValue(/^sample rate percent$/i, "30");

    await openSelect(/^sampled-in class$/i);
    await user.click(screen.getByRole("option", { name: /store as context only/i }));

    await user.click(screen.getByRole("switch", { name: /^enabled$/i }));
    setInputValue(/^expires at$/i, "2026-06-20T09:15");
    setInputValue(/^additional matcher json$/i, '{"status_ranges":[{"start":500,"end":599}]}');

    expect(screen.getByTestId("draft-state")).toHaveTextContent('"name":"Bot request sampling"');
    expect(screen.getByTestId("draft-state")).toHaveTextContent('"eventType":"request_event"');
    expect(screen.getByTestId("draft-state")).toHaveTextContent('"runtime":"node"');
    expect(screen.getByTestId("draft-state")).toHaveTextContent('"clientKind":"bot"');
    expect(screen.getByTestId("draft-state")).toHaveTextContent('"sampleEventClass":"context"');
    expect(screen.getByTestId("draft-state")).toHaveTextContent('"enabled":false');
    expect(screen.getByTestId("draft-state")).toHaveTextContent(
      '"advancedMatcherJson":"{\\"status_ranges\\"'
    );
  });
});
