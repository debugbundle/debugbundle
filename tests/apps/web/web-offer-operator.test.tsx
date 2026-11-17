// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { App } from "../../../apps/web/src/app.js";
import { OfferOperatorInventory } from "../../../apps/web/src/components/system/offer-operator-inventory.js";
import { OfferPerformanceReport } from "../../../apps/web/src/components/system/offer-performance-report.js";
import { SignupOfferControl } from "../../../apps/web/src/components/system/signup-offer-control.js";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.js";
import { createSession, jsonResponse, requestUrl } from "./web-test-helpers.js";
import { offerDefinition } from "../../helpers/offer-fixtures.js";
afterEach(() => {
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("requires the operator email ceremony before loading programme data", async () => {
  const requests: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const path = requestUrl(input);
      requests.push(path);
      if (path.endsWith("/auth/session")) return jsonResponse(200, { session: createSession() });
      if (path.endsWith("/operator/access-status"))
        return jsonResponse(200, { status: "email_auth_required" });
      if (path.includes("/projects")) return jsonResponse(200, { projects: [] });
      return jsonResponse(404, { error: "not_found" });
    })
  );
  render(<App initialEntries={["/programmes"]} />);
  expect(await screen.findByText("Continue with email")).toBeInTheDocument();
  expect(requests.some((path) => path.includes("/operator/programmes"))).toBe(false);
});
it("shows inventory errors and retries with the same explicit filters", async () => {
  const user = userEvent.setup(),
    requests: string[] = [];
  let failed = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const path = requestUrl(input);
      requests.push(path);
      if (failed) {
        failed = false;
        return jsonResponse(503, { error: "offer_unavailable" });
      }
      return jsonResponse(200, { codes: [] });
    })
  );
  render(<OfferOperatorInventory />);
  await user.click(await screen.findByRole("button", { name: "Retry inventory" }));
  expect(await screen.findByText("No matching records.")).toBeInTheDocument();
  await user.type(screen.getByLabelText("Public code (optional)"), "OWEN20");
  await user.click(screen.getByRole("button", { name: "Filter records" }));
  await waitFor(() => expect(requests.at(-1)).toContain("code=OWEN20"));
});
it("exposes reconciliation gaps alongside actual report amounts", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(requestUrl(input), "https://app.test");
      return jsonResponse(200, {
        performance: {
          from: url.searchParams.get("from"),
          to: url.searchParams.get("to"),
          version_id: null,
          as_of: "2026-11-16T00:00:00.000Z",
          claims: 2,
          active_trials: 1,
          paid_conversions: 1,
          reconciled_claims: 1,
          unreconciled_claims: 1,
          oldest_observation: "2026-11-15T00:00:00.000Z",
          latest_observation: "2026-11-15T00:00:00.000Z",
          base_cash_collected_minor: 1600,
          base_cash_retained_minor: 800,
          base_cash_reversed_minor: 800,
          base_discount_minor: 400,
          discount_coverage_complete: false,
          commission_net_minor: 400,
          commission_paid_minor: 0,
          commission_reversed_minor: 400,
          disputed_invoices: 0,
          held_invoices: 0,
          currency: "usd"
        }
      });
    })
  );
  render(<OfferPerformanceReport />);
  expect(await screen.findByText("Base cash collected")).toBeInTheDocument();
  expect(screen.getByText("$16.00")).toBeInTheDocument();
  expect(screen.getByText(/displayed discount total is incomplete/)).toBeInTheDocument();
});
it("explains when a pending signup code stops accepting new claims", async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) =>
      requestUrl(input).endsWith("/capabilities")
        ? jsonResponse(200, { enabled: true })
        : jsonResponse(200, {
            offer: { code: "OWEN20", available: false, version: offerDefinition }
          })
    )
  );
  render(<SignupOfferControl presentedCode={null} onLoading={() => {}} />);
  expect(await screen.findByText("This code is unavailable for new claims")).toBeInTheDocument();
  expect(screen.getByText(/Choose another code/)).toBeInTheDocument();
  expect(screen.queryByText(/introductory offer available/)).toBeNull();
  await user.click(screen.getByText("Referral or discount code"));
  fireEvent.change(screen.getByLabelText("Code"), { target: { value: "invalid/code" } });
  await user.click(screen.getByRole("button", { name: "Check code" }));
  expect(await screen.findByText("Enter a valid referral or discount code.")).toBeInTheDocument();
  expect(screen.getByLabelText("Code")).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByLabelText("Code")).toHaveAccessibleDescription(
    /Enter a valid referral or discount code/
  );
});
it("carries a presented signup code as a hint and never calls it a saved benefit", async () => {
  const writes: unknown[] = [],
    loading = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = requestUrl(input);
      if (path.endsWith("/capabilities")) return jsonResponse(200, { enabled: true });
      if (path.endsWith("/pending")) {
        writes.push(JSON.parse(typeof init?.body === "string" ? init.body : "{}"));
        return jsonResponse(200, {
          offer: { code: "OWEN20", version: offerDefinition, available: true }
        });
      }
      return jsonResponse(404, { error: "not_found" });
    })
  );
  render(<SignupOfferControl presentedCode="OWEN20" onLoading={loading} />);
  expect(await screen.findByText(/20%/)).toBeInTheDocument();
  expect(writes).toEqual([{ code: "OWEN20", explicit_correction: false }]);
  expect(screen.queryByText(/discount is saved/)).toBeNull();
  await waitFor(() => expect(loading).toHaveBeenLastCalledWith(false));
});

it("clears an anonymous signup code and its auth links without losing trial intent", async () => {
  const user = userEvent.setup();
  let selected: { code: string; version: typeof offerDefinition; available: boolean } | null = null;
  const writes: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = requestUrl(input);
      if (path.endsWith("/auth/session")) return jsonResponse(401, { error: "invalid_session" });
      if (path.endsWith("/capabilities")) return jsonResponse(200, { enabled: true });
      if (path.endsWith("/pending")) {
        writes.push(init?.method ?? "GET");
        expect(init?.credentials).toBe("include");
        selected =
          init?.method === "DELETE"
            ? null
            : { code: "OWEN20", version: offerDefinition, available: true };
        return jsonResponse(200, { offer: selected });
      }
      if (path.endsWith("/context")) return jsonResponse(200, { offer: selected });
      return jsonResponse(404, { error: "unexpected_request" });
    })
  );
  render(<App initialEntries={["/signup?trial=team&next=%2Fprojects&offer=OWEN20#code"]} />);
  await screen.findByText(/OWEN20: 20%/);
  await user.click(screen.getByText("Referral or discount code"));
  await user.click(screen.getByRole("button", { name: "Clear code" }));
  await waitFor(() => expect(screen.getByLabelText("Code")).toHaveValue(""));
  expect(screen.queryByText(/OWEN20: 20%/)).toBeNull();
  expect(screen.getByRole("link", { name: "Login here" })).toHaveAttribute(
    "href",
    "/login?next=%2Fprojects&trial=team"
  );
  expect(screen.getByText("Team trial selected")).toBeInTheDocument();
  expect(writes).toEqual(["POST", "DELETE"]);
});

it.each(["unavailable", "unconfirmed", "malformed"] as const)(
  "keeps the signup code on a failed clear and only confirms a successful retry (%s)",
  async (failure) => {
    const user = userEvent.setup(),
      cleared = vi.fn();
    let attempts = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = requestUrl(input);
        if (path.endsWith("/capabilities")) return jsonResponse(200, { enabled: true });
        if (path.endsWith("/pending") && init?.method === "DELETE") {
          attempts++;
          if (attempts > 1) return jsonResponse(200, { offer: null });
          if (failure === "unavailable") return jsonResponse(503, { error: "unavailable" });
          return jsonResponse(
            200,
            failure === "malformed"
              ? {}
              : {
                  offer: { code: "OWEN20", version: offerDefinition, available: true }
                }
          );
        }
        return jsonResponse(200, {
          offer: { code: "OWEN20", version: offerDefinition, available: true }
        });
      })
    );
    render(
      <SignupOfferControl presentedCode="OWEN20" onLoading={vi.fn()} onCodeCleared={cleared} />
    );
    await screen.findByText(/OWEN20: 20%/);
    await user.click(screen.getByText("Referral or discount code"));
    await user.click(screen.getByRole("button", { name: "Clear code" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not be (confirmed|reached)/);
    expect(screen.getByLabelText("Code")).toHaveValue("OWEN20");
    expect(screen.getByText(/OWEN20: 20%/)).toBeInTheDocument();
    expect(cleared).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Clear code" }));
    await waitFor(() => expect(cleared).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText("Code")).toHaveValue("");
    expect(screen.queryByRole("alert")).toBeNull();
  }
);
