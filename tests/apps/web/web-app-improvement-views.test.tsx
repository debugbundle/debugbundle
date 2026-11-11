// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, expect, it, vi, type Mock } from "vitest";
import { App } from "../../../apps/web/src/app.js";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.js";
import { createSession, jsonResponse, requestUrl } from "./web-test-helpers.js";
import { reviewFactsFixture } from "../../helpers/improvement-reviews.js";

const reviews = vi.hoisted(() => ({
  list: vi.fn(),
  settings: vi.fn(),
  allowance: vi.fn(),
  bundle: vi.fn(),
  update: vi.fn()
}));
vi.mock("../../../apps/web/src/lib/improvement-review-api.js", () => ({
  improvementReviewApi: reviews,
  improvementReviewError: () => "Review unavailable"
}));

afterEach(() => {
  resetBrowserSessionClientState();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

function setup(
  plan: "free" | "solo" | "team" = "team"
): Mock<(request: RequestInfo | URL) => Response> {
  reviews.list.mockResolvedValue({
    reviews: [
      {
        id: "33333333-3333-4333-8333-333333333333",
        project_id: "22222222-2222-4222-8222-222222222222",
        project_name: "Saved review project",
        period: reviewFactsFixture().period,
        status: "factual_only",
        reason: null,
        created_at: "2026-11-09T09:00:00.000Z",
        expires_at: "2027-02-01T00:00:00.000Z"
      }
    ],
    next_cursor: null
  });
  reviews.settings.mockResolvedValue({
    version: 1,
    enabled: false,
    scope: [],
    privacy_mode: "restricted",
    source_consent: false,
    next_due_at: null,
    requires_review: false
  });
  reviews.allowance.mockResolvedValue({ remaining: 25, limit: 25 });
  const fetchMock = vi.fn((request: RequestInfo | URL) => {
    const url = requestUrl(request);
    if (url.endsWith("/v1/auth/session"))
      return jsonResponse(200, {
        session: createSession({ organization_plan: plan, role: "member" })
      });
    if (url.includes("/v1/improvements?"))
      return jsonResponse(200, {
        improvements: [],
        next_cursor: null
      });
    return jsonResponse(404, { error: "not_found" });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

it("keeps opportunities as the default and preserves its filter when switching review views", async () => {
  const fetchMock = setup();
  const user = userEvent.setup();
  render(<App initialEntries={["/improvements"]} />);
  const tabs = await screen.findByRole("tablist", { name: "Workspace improvement views" });
  expect(within(tabs).getByRole("tab", { name: "Opportunities" })).toHaveAttribute(
    "aria-selected",
    "true"
  );
  expect(screen.getByRole("tabpanel", { name: "Opportunities" })).toBeVisible();
  expect(reviews.list).not.toHaveBeenCalled();

  const status = screen.getByRole("combobox", { name: /status/i });
  status.focus();
  fireEvent.keyDown(status, { key: "ArrowDown", code: "ArrowDown" });
  await user.click(await screen.findByRole("option", { name: "Resolved" }));
  await waitFor(() =>
    expect(
      fetchMock.mock.calls.some(([request]) => requestUrl(request).includes("status=resolved"))
    ).toBe(true)
  );
  await user.click(within(tabs).getByRole("tab", { name: "Weekly reviews" }));
  expect(await screen.findByText("Saved review project")).toBeVisible();
  expect(screen.queryByRole("combobox", { name: /status/i })).not.toBeInTheDocument();
  expect(screen.queryByText("Improvement inventory")).not.toBeInTheDocument();
  expect(reviews.update).not.toHaveBeenCalled();

  await user.click(within(tabs).getByRole("tab", { name: "Opportunities" }));
  expect(await screen.findByRole("combobox", { name: /status/i })).toHaveTextContent("Resolved");
  expect(screen.queryByText("Saved review project")).not.toBeInTheDocument();
  expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
});

it.each(["free", "solo"] as const)(
  "opens a saved weekly review directly after downgrade to %s without exposing Owner settings",
  async (plan) => {
    setup(plan);
    render(<App initialEntries={["/improvements/reviews"]} />);
    expect(await screen.findByText("Saved review project")).toBeVisible();
    expect(screen.getByRole("tab", { name: "Weekly reviews" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(screen.getByRole("tabpanel", { name: "Weekly reviews" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Improvements" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(
      screen.queryByRole("button", { name: "Weekly review settings" })
    ).not.toBeInTheDocument();
    expect(reviews.update).not.toHaveBeenCalled();
  }
);

it("supports keyboard navigation with one accessible active tab panel", async () => {
  setup();
  const user = userEvent.setup();
  render(<App initialEntries={["/improvements"]} />);
  const opportunities = await screen.findByRole("tab", { name: "Opportunities" });
  opportunities.focus();
  await user.keyboard("{ArrowRight}");
  expect(await screen.findByText("Saved review project")).toBeVisible();
  expect(screen.getByRole("tab", { name: "Weekly reviews" })).toHaveFocus();
  expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
  await user.keyboard("{ArrowLeft}");
  expect(await screen.findByRole("tabpanel", { name: "Opportunities" })).toBeVisible();
  expect(opportunities).toHaveFocus();
  expect(screen.queryByRole("tabpanel", { name: "Weekly reviews" })).not.toBeInTheDocument();
  expect(reviews.update).not.toHaveBeenCalled();
});
