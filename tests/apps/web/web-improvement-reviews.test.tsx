// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "../../../node_modules/.pnpm/node_modules/react-router-dom/dist/index.js";
import { ImprovementReviewSection } from "../../../apps/web/src/components/system/improvement-review-section.js";
import { createSession, createProject } from "./web-test-helpers.js";
import * as api from "../../../apps/web/src/lib/api.js";
import { reviewFactsFixture } from "../../helpers/improvement-reviews.js";
import {
  reviewPriorities,
  type ReviewSettings,
  type ReviewRecord
} from "../../../packages/smart-improvements/src/review.js";
const calls = vi.hoisted(() => ({
  list: vi.fn(),
  settings: vi.fn(),
  allowance: vi.fn(),
  bundle: vi.fn(),
  update: vi.fn()
}));
vi.mock("../../../apps/web/src/lib/improvement-review-api.js", () => ({
  improvementReviewApi: calls,
  improvementReviewError: (error: unknown) =>
    error instanceof Error ? error.message : "Review failed"
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.resetAllMocks();
});
function setup(): {
  session: ReturnType<typeof createSession>;
  review: ReviewRecord;
  settings: ReviewSettings;
} {
  const facts = reviewFactsFixture(),
    session = createSession({
      organization_id: "11111111-1111-4111-8111-111111111111",
      organization_plan: "team"
    });
  const review: ReviewRecord = {
    id: "33333333-3333-4333-8333-333333333333",
    project_id: facts.project_id,
    project_name: "Saved project",
    period: facts.period,
    status: "ready",
    reason: null,
    created_at: facts.cutoff_at,
    expires_at: "2027-02-01T00:00:00.000Z"
  };
  const settings: ReviewSettings = {
    version: 0,
    enabled: false,
    scope: [],
    privacy_mode: "restricted",
    source_consent: false,
    next_due_at: null,
    requires_review: false
  };
  calls.list.mockResolvedValue({ reviews: [review], next_cursor: null });
  calls.settings.mockResolvedValue(settings);
  calls.allowance.mockResolvedValue({ limit: 25, remaining: 25 });
  calls.bundle.mockResolvedValue({
    bundle: {
      schema_version: "improvement_review.v1",
      facts,
      priorities: reviewPriorities(facts),
      guidance: null,
      analysis: "unavailable"
    },
    status: "factual_only"
  });
  vi.spyOn(api, "listProjects").mockResolvedValue([
    createProject({
      project_id: facts.project_id,
      organization_id: session.organization_id,
      name: "Saved project"
    })
  ]);
  return { session, review, settings };
}
it("opens and refreshes saved facts without a generation or settings mutation", async () => {
  const f = setup(),
    user = userEvent.setup();
  render(
    <MemoryRouter>
      <ImprovementReviewSection session={f.session} />
    </MemoryRouter>
  );
  expect(await screen.findByText("Saved project")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "View review" }));
  expect(await screen.findByText(/AI guidance is unavailable/)).toBeVisible();
  expect(screen.getByText("Lifetime observations: 8")).toBeVisible();
  expect(screen.getByRole("link", { name: "Critical open incident" })).toHaveAttribute(
    "href",
    `/projects/${f.review.project_id}/incidents/33333333-3333-4333-8333-333333333333`
  );
  expect(calls.update).not.toHaveBeenCalled();
  expect(calls.bundle).toHaveBeenCalledOnce();
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("button", { name: "Refresh weekly reviews" }));
  await waitFor(() => expect(calls.list).toHaveBeenCalledTimes(2));
  expect(calls.update).not.toHaveBeenCalled();
});
it("keeps archive reads when settings access is denied and hides owner mutation controls", async () => {
  const f = setup();
  calls.settings.mockRejectedValue(new Error("forbidden"));
  render(
    <MemoryRouter>
      <ImprovementReviewSection session={{ ...f.session, role: "member" }} />
    </MemoryRouter>
  );
  expect(await screen.findByText("Saved project")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Weekly review settings" })).not.toBeInTheDocument();
});
it("requires explicit project and provider consent before saving an enabled schedule", async () => {
  const f = setup(),
    user = userEvent.setup();
  render(
    <MemoryRouter>
      <ImprovementReviewSection session={f.session} />
    </MemoryRouter>
  );
  await user.click(await screen.findByRole("button", { name: "Weekly review settings" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Save weekly reviews" })).toBeEnabled()
  );
  await user.click(screen.getByLabelText("Enable weekly reviews"));
  await user.click(screen.getByRole("button", { name: "Save weekly reviews" }));
  expect(await screen.findByText(/Choose projects and agree/)).toBeVisible();
  expect(calls.update).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: /Projects:/ }));
  await user.click(await screen.findByRole("menuitemcheckbox", { name: "Saved project" }));
  await user.keyboard("{Escape}");
  await user.click(screen.getByLabelText(/Allow the selected retained evidence/));
  calls.update.mockResolvedValue({ ...f.settings, version: 1 });
  await user.click(screen.getByRole("button", { name: "Save weekly reviews" }));
  await waitFor(() => expect(calls.update).toHaveBeenCalledOnce());
  expect(calls.update).toHaveBeenCalledWith(
    expect.objectContaining({
      command: expect.objectContaining({
        expected_version: 0,
        expected_organization_id: f.session.organization_id,
        enabled: true,
        source_consent: true,
        project_ids: [f.review.project_id],
        privacy_mode: "restricted"
      })
    })
  );
});
it("retains failed settings edits for a safe retry and permits withdrawal after downgrade", async () => {
  const f = setup(),
    user = userEvent.setup();
  calls.settings.mockResolvedValue({
    ...f.settings,
    version: 2,
    scope: [{ project_id: f.review.project_id, origin_project_ids: [f.review.project_id] }],
    source_consent: true
  });
  calls.update.mockRejectedValue(new Error("version changed"));
  render(
    <MemoryRouter>
      <ImprovementReviewSection session={{ ...f.session, organization_plan: "solo" }} />
    </MemoryRouter>
  );
  await user.click(await screen.findByRole("button", { name: "Weekly review settings" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Save weekly reviews" })).toBeEnabled()
  );
  expect(screen.getByLabelText("Enable weekly reviews")).toBeDisabled();
  await user.click(screen.getByLabelText(/Allow the selected retained evidence/));
  await user.click(screen.getByRole("button", { name: "Save weekly reviews" }));
  expect(await screen.findByText("version changed")).toBeVisible();
  expect(screen.getByLabelText(/Allow the selected retained evidence/)).not.toBeChecked();
  expect(calls.update).toHaveBeenCalledWith(
    expect.objectContaining({
      command: expect.objectContaining({ enabled: false, source_consent: false })
    })
  );
});
it("clears the open review and pending reads when workspace context changes", async () => {
  const f = setup(),
    user = userEvent.setup(),
    view = render(
      <MemoryRouter>
        <ImprovementReviewSection session={f.session} />
      </MemoryRouter>
    );
  await user.click(await screen.findByRole("button", { name: "View review" }));
  await screen.findByText(/AI guidance is unavailable/);
  calls.list.mockResolvedValue({ reviews: [], next_cursor: null });
  view.rerender(
    <MemoryRouter>
      <ImprovementReviewSection
        session={{ ...f.session, organization_id: "44444444-4444-4444-8444-444444444444" }}
      />
    </MemoryRouter>
  );
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.queryByText("Critical open incident")).not.toBeInTheDocument();
  expect(await screen.findByText("No weekly reviews yet")).toBeVisible();
});

it("loads retained selected project names and permits explicit reselection after consolidation", async () => {
  const f = setup(),
    user = userEvent.setup(),
    retained = "55555555-5555-4555-8555-555555555555";
  calls.settings.mockResolvedValue({
    ...f.settings,
    version: 2,
    enabled: true,
    source_consent: true,
    scope: [{ project_id: retained, origin_project_ids: [retained] }]
  });
  vi.mocked(api.listProjects).mockImplementation(async (id) => [
    createProject({
      project_id: id ?? f.review.project_id,
      organization_id: f.session.organization_id,
      name: id ? "Retained source" : "Current project"
    })
  ]);
  render(
    <MemoryRouter>
      <ImprovementReviewSection session={f.session} />
    </MemoryRouter>
  );
  await user.click(await screen.findByRole("button", { name: "Weekly review settings" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Save weekly reviews" })).toBeEnabled()
  );
  await user.click(screen.getByRole("button", { name: /Projects:/ }));
  await user.click(await screen.findByRole("menuitemcheckbox", { name: "Retained source" }));
  await user.click(screen.getByRole("menuitemcheckbox", { name: "Current project" }));
  await user.keyboard("{Escape}");
  calls.update.mockResolvedValue({ ...f.settings, version: 3 });
  await user.click(screen.getByRole("button", { name: "Save weekly reviews" }));
  await waitFor(() => expect(calls.update).toHaveBeenCalledOnce());
  expect(calls.update).toHaveBeenCalledWith(
    expect.objectContaining({
      command: expect.objectContaining({ project_ids: [f.review.project_id], source_consent: true })
    })
  );
});
