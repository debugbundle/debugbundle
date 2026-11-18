// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { App } from "../../../apps/web/src/app.js";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.js";
import { createSession, jsonResponse, requestUrl } from "./web-test-helpers.js";
import { offerVersion } from "../../helpers/offer-fixtures.js";
const id = (n: number): string => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
afterEach(() => {
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("pages version history and saves a reviewed revision without publishing it", async () => {
  const user = userEvent.setup(),
    writes: Record<string, unknown>[] = [];
  const versions = Array.from({ length: 25 }, (_, n) => ({
    ...offerVersion,
    programme_id: id(n + 101),
    version_id: id(n + 1),
    name: `Programme ${n + 1}`
  }));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = requestUrl(input);
      if (path.endsWith("/auth/session")) return jsonResponse(200, { session: createSession() });
      if (path.endsWith("/operator/access-status")) return jsonResponse(200, { status: "ready" });
      if (path.endsWith("/capabilities")) return jsonResponse(200, { enabled: true });
      if (path.includes("/operator/programmes")) {
        if (init?.method === "POST") {
          const body = JSON.parse(typeof init.body === "string" ? init.body : "{}") as Record<
            string,
            unknown
          >;
          writes.push(body);
          return jsonResponse(200, {
            programme: { ...offerVersion, version_id: id(100), state: "draft", name: body["name"] }
          });
        }
        return jsonResponse(200, {
          programmes: path.includes("before=")
            ? [
                versions[0],
                {
                  ...offerVersion,
                  programme_id: id(199),
                  version_id: id(99),
                  name: "Old agreement"
                }
              ]
            : versions
        });
      }
      if (path.includes("/projects")) return jsonResponse(200, { projects: [] });
      return jsonResponse(404, { error: "not_found" });
    })
  );
  render(<App initialEntries={["/programmes"]} />);
  expect(
    (await screen.findByRole("heading", { name: "Programmes & offers" })).closest("header")
  ).not.toBeNull();
  await user.click(await screen.findByRole("button", { name: "Load older revisions" }));
  await screen.findByText("Old agreement");
  expect(screen.getAllByText("Programme 1", { exact: true })).toHaveLength(1);
  await user.click(screen.getByRole("button", { name: "Create programme" }));
  await screen.findByText("Create programme draft");
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  await user.click(screen.getAllByRole("button", { name: "Create revised draft" })[0]!);
  expect(screen.getByLabelText("Name")).toHaveValue("Programme 1");
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Reviewed revision" } });
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(screen.queryByText("New revision of Programme 1")).toBeNull());
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({
    programme_id: versions[0]!.programme_id,
    name: "Reviewed revision"
  });
  expect(writes[0]).not.toHaveProperty("state");
});
it("groups revisions under one programme and keeps ended mistakes in collapsed history", async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const path = requestUrl(input);
      if (path.endsWith("/auth/session")) return jsonResponse(200, { session: createSession() });
      if (path.endsWith("/operator/access-status")) return jsonResponse(200, { status: "ready" });
      if (path.endsWith("/capabilities")) return jsonResponse(200, { enabled: true });
      if (path.includes("/operator/programmes"))
        return jsonResponse(200, {
          programmes: [
            {
              ...offerVersion,
              version_id: id(4),
              revision: 3,
              state: "draft",
              name: "Pending revision"
            },
            { ...offerVersion, version_id: id(2), revision: 2, name: "Correct promotion" },
            {
              ...offerVersion,
              version_id: id(1),
              revision: 1,
              state: "ended",
              name: "Mistaken name"
            },
            {
              ...offerVersion,
              programme_id: id(100),
              version_id: id(3),
              state: "ended",
              name: "Ended mistake"
            }
          ]
        });
      if (path.includes("/projects")) return jsonResponse(200, { projects: [] });
      return jsonResponse(404, { error: "not_found" });
    })
  );
  render(<App initialEntries={["/programmes"]} />);
  await screen.findByText("Correct promotion");
  const draft = screen.getByText("Pending revision").closest("section")!;
  expect(within(draft).getByRole("button", { name: "Discard draft" })).toBeEnabled();
  expect(screen.getAllByRole("button", { name: "Pause" })).toHaveLength(1);
  await user.click(within(draft).getByRole("button", { name: "Create revised draft" }));
  expect(screen.getByLabelText("Name")).toHaveValue("Pending revision");
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.getByText("Correct promotion")).toBeVisible();
  expect(screen.queryByText("Mistaken name")).toBeNull();
  expect(screen.queryByText("Ended mistake")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Revision history (1)" }));
  expect(screen.getByText("Mistaken name")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Archived programmes (1)" }));
  expect(screen.getByText("Ended mistake")).toBeVisible();
});
it("rechecks programme access after the shared email-code ceremony", async () => {
  const user = userEvent.setup();
  let ready = false,
    sent = 0,
    verified = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const path = requestUrl(input);
      if (path.endsWith("/auth/session")) return jsonResponse(200, { session: createSession() });
      if (path.endsWith("/operator/access-status"))
        return jsonResponse(200, { status: ready ? "ready" : "email_auth_required" });
      if (path.includes("/auth/request-code")) {
        sent++;
        return jsonResponse(
          sent === 1 ? 503 : 200,
          sent === 1 ? { error: "unavailable" } : { ok: true }
        );
      }
      if (path.includes("/auth/verify-code")) {
        verified++;
        if (verified === 1) return jsonResponse(400, { error: "invalid_code" });
        ready = true;
        return jsonResponse(200, { session: createSession() });
      }
      if (path.endsWith("/capabilities")) return jsonResponse(200, { enabled: false });
      if (path.includes("/operator/programmes")) return jsonResponse(200, { programmes: [] });
      if (path.includes("/projects")) return jsonResponse(200, { projects: [] });
      return jsonResponse(404, { error: "not_found" });
    })
  );
  render(<App initialEntries={["/programmes"]} />);
  await user.click(await screen.findByRole("button", { name: "Send code" }));
  await screen.findByText(/could not send/);
  await user.click(screen.getByRole("button", { name: "Send code" }));
  await screen.findByLabelText("Six-digit code");
  await user.click(screen.getByRole("button", { name: "Verify code" }));
  await screen.findByText("Enter the six-digit code from your email.");
  fireEvent.change(screen.getByLabelText("Six-digit code"), { target: { value: "123456" } });
  await user.click(screen.getByRole("button", { name: "Verify code" }));
  await screen.findByText(/invalid or expired/);
  await user.click(screen.getByRole("button", { name: "Resend code" }));
  fireEvent.change(screen.getByLabelText("Six-digit code"), { target: { value: "654321" } });
  await user.click(screen.getByRole("button", { name: "Verify code" }));
  expect(await screen.findByText("New programme claims are disabled")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Create programme" })).toBeEnabled();
});
