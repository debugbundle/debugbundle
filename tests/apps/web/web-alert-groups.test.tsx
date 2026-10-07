// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "../../../node_modules/.pnpm/node_modules/react-router-dom/dist/index.js";
import { AlertGroupsCard } from "../../../apps/web/src/components/system/alert-groups-card.js";
import { jsonResponse, requestUrl } from "./web-test-helpers.js";
const project = "11111111-1111-4111-8111-111111111111";
const first = "22222222-2222-4222-8222-222222222222";
const second = "33333333-3333-4333-8333-333333333333";
const member = "44444444-4444-4444-8444-444444444444";
const summary = (id: string, kind = "direct") => ({
  group_id: id,
  kind,
  project_id: project,
  alert_id: null,
  root_incident_id: null,
  channel: "email",
  status: "delivered",
  member_count: 2,
  created_at: "2026-10-07T00:00:00Z",
  delivered_at: "2026-10-07T00:00:01Z"
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("traverses group and member cursors with project scope and bounded requests", async () => {
  const requests: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);
      requests.push(url);
      const params = new URL(url, "https://example.com").searchParams;
      expect(params.get("project_id")).toBe(project);
      expect(params.get("limit")).toBe("20");
      if (url.includes(`/alert-groups/direct/${first}`))
        return jsonResponse(200, {
          group: summary(first),
          members: params.has("cursor")
            ? [
                {
                  incident_id: member,
                  condition_type: "incident_regressed",
                  created_at: "2026-10-07T00:00:01Z"
                }
              ]
            : [],
          next_cursor: params.has("cursor") ? null : "member-next"
        });
      return jsonResponse(200, {
        groups: [
          summary(
            params.has("cursor") ? second : first,
            params.has("cursor") ? "email_digest" : "direct"
          )
        ],
        next_cursor: params.has("cursor") ? null : "group-next"
      });
    })
  );
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <AlertGroupsCard projectId={project} />
    </MemoryRouter>
  );
  await user.click(await screen.findByRole("button", { name: `Inspect group ${first}` }));
  await user.click(await screen.findByRole("button", { name: /next members/i }));
  expect(await screen.findByRole("link", { name: member })).toHaveAttribute(
    "href",
    `/incidents/${member}`
  );
  await user.click(screen.getByRole("button", { name: /previous members/i }));
  await waitFor(() => expect(requests.at(-1)).not.toContain("cursor="));
  await user.click(screen.getByRole("button", { name: /back to groups/i }));
  await user.click(await screen.findByRole("button", { name: /next groups/i }));
  expect(
    await screen.findByRole("button", { name: `Inspect group ${second}` })
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /previous groups/i }));
  await screen.findByRole("button", { name: `Inspect group ${first}` });
  expect(requests.some((url) => url.includes("cursor=member-next"))).toBe(true);
  expect(requests.some((url) => url.includes("cursor=group-next"))).toBe(true);
  expect(screen.queryByText(/of \d/i)).toBeNull();
});
it("shows a retryable unavailable state and ignores reads after unmount", async () => {
  let unavailable = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      unavailable
        ? jsonResponse(404, { error: "group_not_found" })
        : jsonResponse(200, { groups: [], next_cursor: null })
    )
  );
  const view = render(
    <MemoryRouter>
      <AlertGroupsCard projectId={project} />
    </MemoryRouter>
  );
  expect(await screen.findByText(/could not load grouped deliveries/i)).toBeInTheDocument();
  unavailable = false;
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /retry grouped deliveries/i }));
  expect(await screen.findByText("No grouped deliveries yet.")).toBeInTheDocument();
  view.unmount();
  await waitFor(() => expect(screen.queryByRole("table")).toBeNull());
});

it("applies the supported group and member page limit", async () => {
  const requests: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);
      requests.push(url);
      return url.includes(`/direct/${first}`)
        ? jsonResponse(200, { group: summary(first), members: [], next_cursor: null })
        : jsonResponse(200, { groups: [summary(first)], next_cursor: null });
    })
  );
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <AlertGroupsCard projectId={project} />
    </MemoryRouter>
  );
  await screen.findByRole("button", { name: `Inspect group ${first}` });
  fireEvent.change(screen.getByLabelText("Grouped delivery page limit"), {
    target: { value: "100" }
  });
  await user.click(screen.getByRole("button", { name: "Apply grouped delivery page limit" }));
  await waitFor(() => expect(requests.at(-1)).toContain("limit=100"));
  await user.click(await screen.findByRole("button", { name: `Inspect group ${first}` }));
  await waitFor(() => expect(requests.at(-1)).toContain(`/direct/${first}`));
  expect(requests.at(-1)).toContain("limit=100");
});
