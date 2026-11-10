// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import {
  AnalyticsDimensionFields,
  ObservedAnalyticsSelect
} from "../../../apps/web/src/components/system/analytics-dimension-fields.js";
import { useAnalyticsFilterOptions } from "../../../apps/web/src/hooks/use-analytics-filter-options.js";
import {
  type AnalyticsFilterDraft,
  defaultAnalyticsFilters
} from "../../../apps/web/src/lib/analytics-filter-form.js";
import { createAnalyticsFilterOptions } from "../../helpers/analytics-filter-options.js";
import { chooseSelectOption } from "./helpers/management-ui.js";
import { jsonResponse, requestUrl } from "./web-test-helpers.js";
const projectId = "11111111-1111-4111-8111-111111111111";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("disables missing choices, preserves existing selections and distinguishes loading from empty", async () => {
  const onChange = vi.fn<(value: string | undefined) => void>();
  const { rerender } = render(
    <ObservedAnalyticsSelect
      id="browser"
      label="Browser"
      dimension="browser"
      selected="Safari"
      choices={undefined}
      status="loading"
      onChange={onChange}
    />
  );
  expect(screen.getByLabelText("Browser")).toBeDisabled();
  expect(screen.getByText(/Loading choices…/)).toBeInTheDocument();
  expect(screen.getByLabelText("Browser")).toHaveTextContent("Safari (Current selection)");
  rerender(
    <ObservedAnalyticsSelect
      id="browser"
      label="Browser"
      dimension="browser"
      selected="Safari"
      choices={{ values: [], truncated: false }}
      status="ready"
      onChange={onChange}
    />
  );
  expect(screen.getByLabelText("Browser")).toBeDisabled();
  expect(screen.getByText(/No available values in this window/)).toBeInTheDocument();
  expect(onChange).not.toHaveBeenCalled();
});

it("keeps literal all and empty custom choices distinct from clearing the filter", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn<(value: AnalyticsFilterDraft) => void>();
  const choices = {
    status: "ready" as const,
    data: createAnalyticsFilterOptions(projectId),
    retry: vi.fn()
  };
  choices.data.custom_dimensions = [{ key: "plan", values: ["", "all"], truncated: true }];
  const { rerender } = render(
    <AnalyticsDimensionFields
      id="test"
      value={defaultAnalyticsFilters}
      onChange={onChange}
      choices={choices}
    />
  );
  await chooseSelectOption(user, "Custom dimension: plan", "(Empty)");
  expect(JSON.parse(onChange.mock.calls.at(-1)![0].customDimensions)).toEqual({ plan: "" });
  rerender(
    <AnalyticsDimensionFields
      id="test"
      value={{ ...defaultAnalyticsFilters, customDimensions: '{"plan":""}' }}
      onChange={onChange}
      choices={choices}
    />
  );
  await chooseSelectOption(user, "Custom dimension: plan", "all");
  expect(JSON.parse(onChange.mock.calls.at(-1)![0].customDimensions)).toEqual({ plan: "all" });
  await chooseSelectOption(user, "Custom dimension: plan", "All values");
  expect(onChange.mock.calls.at(-1)![0].customDimensions).toBe("");
  expect(screen.getByText(/Some values omitted/)).toBeInTheDocument();
});

it("loads on opening, requests context only and retries unavailable choices explicitly", async () => {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(jsonResponse(503, { error: "unavailable" }))
    .mockImplementation(async () => jsonResponse(200, createAnalyticsFilterOptions(projectId)));
  vi.stubGlobal("fetch", fetchMock);
  const draft = {
    ...defaultAnalyticsFilters,
    dimensions: { browser: "Safari" },
    limit: "5",
    customDimensions: '{"plan":"team"}'
  };
  const { result, rerender } = renderHook(
    ({ open }) => useAnalyticsFilterOptions(projectId, draft, open),
    { initialProps: { open: false } }
  );
  expect(fetchMock).not.toHaveBeenCalled();
  rerender({ open: true });
  await waitFor(() => expect(result.current.status).toBe("unavailable"));
  expect(result.current.data).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const params = new URL(requestUrl(fetchMock.mock.calls[0]![0]), "http://localhost").searchParams;
  expect(params.get("project_id")).toBe(projectId);
  expect(params.get("last")).toBe("30d");
  expect(params.get("limit")).toBe("100");
  expect(params.has("browser")).toBe(false);
  expect(params.has("custom_dimension.plan")).toBe(false);
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.status).toBe("ready"));
  expect(result.current.data?.options.country.values).toEqual(["SI", "US"]);
});

it("aborts and ignores stale scope responses and rejects a wrong-project response", async () => {
  let completeFirst!: (value: Response) => void;
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          completeFirst = resolve;
        })
    )
    .mockImplementationOnce(async () => {
      const result = createAnalyticsFilterOptions(projectId);
      result.window.service = "api";
      return jsonResponse(200, result);
    })
    .mockImplementation(async () => jsonResponse(200, createAnalyticsFilterOptions(projectId)));
  vi.stubGlobal("fetch", fetchMock);
  const { result, rerender } = renderHook(
    ({ id, service }) =>
      useAnalyticsFilterOptions(id, { ...defaultAnalyticsFilters, service }, true),
    { initialProps: { id: projectId, service: "" } }
  );
  const signal = fetchMock.mock.calls[0]![1]!.signal as AbortSignal;
  rerender({ id: projectId, service: "api" });
  expect(signal.aborted).toBe(true);
  await waitFor(() => expect(result.current.status).toBe("ready"));
  await act(async () => completeFirst(jsonResponse(200, createAnalyticsFilterOptions(projectId))));
  expect(result.current.data?.window.service).toBe("api");
  rerender({ id: "22222222-2222-4222-8222-222222222222", service: "" });
  await waitFor(() => expect(result.current.status).toBe("unavailable"));
  expect(result.current.data).toBeNull();
});

it("does not read unscoped choices for an invalid custom window", () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  const { result } = renderHook(() =>
    useAnalyticsFilterOptions(
      projectId,
      { ...defaultAnalyticsFilters, last: "custom", from: "invalid" },
      true
    )
  );
  expect(result.current.status).toBe("invalid");
  expect(fetchMock).not.toHaveBeenCalled();
});

it("offers a retry action without enabling unavailable dimension controls", async () => {
  const retry = vi.fn();
  const user = userEvent.setup();
  render(
    <AnalyticsDimensionFields
      id="failed"
      value={defaultAnalyticsFilters}
      onChange={vi.fn()}
      choices={{ status: "unavailable", data: null, retry }}
    />
  );
  for (const label of [
    "Route",
    "Device type",
    "Browser",
    "Operating system",
    "Country",
    "Authentication state"
  ])
    expect(screen.getByLabelText(label)).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Retry filter choices" }));
  expect(retry).toHaveBeenCalledTimes(1);
});
