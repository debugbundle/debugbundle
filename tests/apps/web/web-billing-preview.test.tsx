// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { BillingPreviewControls } from "../../../apps/web/src/dev/billing-preview-controls.js";
import { LocalBillingPreview } from "../../../apps/web/src/components/system/local-billing-preview.js";
import { createDevMockApi } from "../../../scripts/dev-mock/api.js";
import { resolvePricingUrl } from "../../../apps/web/src/lib/external-links.js";
import { requestUrl } from "./web-test-helpers.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
function setup() {
  const api = createDevMockApi(),
    reload = vi.fn();
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const result = api.handle(
      init?.method ?? "GET",
      requestUrl(input),
      typeof init?.body === "string" ? JSON.parse(init.body) : undefined
    );
    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: { "content-type": "application/json" }
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { api, reload, fetchMock, user: userEvent.setup() };
}
it("requires explicit mock mode before rendering or requesting local simulator controls", () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("VITE_DEBUGBUNDLE_DEV_MOCK", "false");
  const view = render(<LocalBillingPreview />);
  expect(view.container).toBeEmptyDOMElement();
  expect(fetchMock).not.toHaveBeenCalled();
});
it("uses standard tier/state controls and changes only the synthetic scenario", async () => {
  const f = setup();
  render(<BillingPreviewControls onReload={f.reload} />);
  await f.user.click(screen.getByRole("button", { name: "Local billing preview" }));
  await f.user.click(await screen.findByRole("radio", { name: "Business" }));
  await f.user.click(screen.getByRole("radio", { name: "Yearly" }));
  await f.user.click(screen.getByRole("radio", { name: "Complimentary" }));
  await f.user.click(screen.getByRole("button", { name: "Apply preview" }));
  await waitFor(() => expect(f.reload).toHaveBeenCalledOnce());
  expect(f.api.handle("GET", "/v1/billing").body).toMatchObject({
    billing: { plan: "business", billing_state: "admin_override", stripe_customer_id: null }
  });
  expect(screen.getByText(/No charges, emails or database changes/)).toBeVisible();
  expect(f.fetchMock.mock.calls.every(([input]) => input === "/v1/__dev/billing")).toBe(true);
});
it("keeps a failed preview draft and allows retry without contacting a real service", async () => {
  const f = setup();
  render(<BillingPreviewControls onReload={f.reload} />);
  await f.user.click(screen.getByRole("button", { name: "Local billing preview" }));
  await f.user.click(await screen.findByRole("radio", { name: "Solo" }));
  f.fetchMock.mockRejectedValueOnce(new Error("offline"));
  await f.user.click(screen.getByRole("button", { name: "Apply preview" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/could not be applied/);
  expect(screen.getByRole("radio", { name: "Solo" })).toHaveAttribute("aria-checked", "true");
  expect(f.reload).not.toHaveBeenCalled();
  await f.user.click(screen.getByRole("button", { name: "Apply preview" }));
  await waitFor(() => expect(f.reload).toHaveBeenCalledOnce());
});
it("resolves the complimentary pricing link to the right site without starting checkout", () => {
  expect(resolvePricingUrl({ DEV: true }, new URL("http://localhost:5291/billing"))).toBe(
    "http://localhost:5292/pricing/"
  );
  expect(
    resolvePricingUrl(
      { DEV: false, MODE: "production" },
      new URL("https://app.debugbundle.com/billing")
    )
  ).toBe("https://debugbundle.com/pricing/");
});

it("selecting Free clears paid-only capacity and disables irrelevant scenario controls", async () => {
  const f = setup();
  render(<BillingPreviewControls onReload={f.reload} />);
  await f.user.click(screen.getByRole("button", { name: "Local billing preview" }));
  await f.user.click(await screen.findByRole("radio", { name: "Free" }));
  expect(screen.getByLabelText("Extra capacity units")).toHaveValue(0);
  expect(screen.getByLabelText("Extra capacity units")).toBeDisabled();
  await f.user.click(screen.getByRole("button", { name: "Apply preview" }));
  await waitFor(() => expect(f.reload).toHaveBeenCalledOnce());
  expect(f.api.handle("GET", "/v1/__dev/billing").body).toHaveProperty("scenario.plan", "free");
});

it("loads the local preview only when the development mock is explicitly enabled", async () => {
  const f = setup();
  vi.stubEnv("DEV", true);
  vi.stubEnv("VITE_DEBUGBUNDLE_DEV_MOCK", "true");
  render(<LocalBillingPreview />);
  await f.user.click(await screen.findByRole("button", { name: "Local billing preview" }));
  expect(await screen.findByRole("radio", { name: "Business" })).toBeVisible();
  expect(f.fetchMock.mock.calls.every(([input]) => input === "/v1/__dev/billing")).toBe(true);
});
