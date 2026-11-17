// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { OfferOperatorInventory } from "../../../apps/web/src/components/system/offer-operator-inventory.js";
import { OfferPerformanceReport } from "../../../apps/web/src/components/system/offer-performance-report.js";
import { SignupOfferControl } from "../../../apps/web/src/components/system/signup-offer-control.js";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.js";
import { jsonResponse, requestUrl } from "./web-test-helpers.js";
import { offerDefinition, offerClaim } from "../../helpers/offer-fixtures.js";
const id = (n: number): string => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`,
  date = "2026-11-16T00:00:00.000Z";
afterEach(() => {
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("pages code ownership and switches to minimal claim and grant support histories", async () => {
  const user = userEvent.setup(),
    requests: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const path = requestUrl(input);
      requests.push(path);
      if (path.includes("/codes"))
        return jsonResponse(200, {
          codes: path.includes("before=")
            ? []
            : Array.from({ length: 25 }, (_, n) => ({
                code_id: id(n + 1),
                code: `CODE-${n}`,
                kind: "creator",
                partner_id: id(100),
                version_id: offerDefinition.version_id,
                blocked: n === 0,
                preferred: n === 1,
                created_at: date
              }))
        });
      if (path.includes("/claims"))
        return jsonResponse(200, {
          claims: [
            {
              claim_id: offerClaim.claim_id,
              code: "HOLIDAY30",
              referral_code: "ORIGINAL20",
              organization_id: id(200),
              version_id: offerDefinition.version_id,
              legacy_referral: true,
              status: "saved",
              claimed_at: date,
              redeem_by: "2027-01-01T00:00:00.000Z"
            }
          ]
        });
      return jsonResponse(200, {
        grants: [
          {
            grant_id: id(300),
            claim_id: offerClaim.claim_id,
            code: "ORIGINAL20",
            organization_id: id(200),
            operator_user_id: id(100),
            reason: "Verified customer request",
            created_at: date,
            expires_at: "2027-01-01T00:00:00.000Z",
            revoked_at: null,
            admitted_checkout: true
          }
        ]
      });
    })
  );
  render(<OfferOperatorInventory />);
  await screen.findByText("CODE-0");
  await user.click(screen.getByRole("button", { name: "Load more records" }));
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Load more records" })).toBeNull()
  );
  expect(requests.some((path) => path.includes(`before=${id(25)}`))).toBe(true);
  fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" });
  await user.click(await screen.findByRole("option", { name: "Customer offers" }));
  expect(await screen.findByText("HOLIDAY30")).toBeInTheDocument();
  expect(screen.getByText("Referred by ORIGINAL20")).toBeInTheDocument();
  expect(screen.getByText("Legacy commission agreement")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Workspace ID (optional)"), {
    target: { value: id(200) }
  });
  await user.click(screen.getByRole("button", { name: "Filter records" }));
  await waitFor(() => expect(requests.at(-1)).toContain(`organization_id=${id(200)}`));
  fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" });
  await user.click(await screen.findByRole("option", { name: "Early-purchase grants" }));
  expect(await screen.findByText("Verified customer request")).toBeInTheDocument();
  expect(screen.getByText("Checkout admitted")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Claim ID (optional)"), {
    target: { value: offerClaim.claim_id }
  });
  await user.click(screen.getByRole("button", { name: "Filter records" }));
  await waitFor(() => expect(requests.at(-1)).toContain(`claim_id=${offerClaim.claim_id}`));
});
it("bounds report windows and preserves filter drafts across a failed report request", async () => {
  const user = userEvent.setup(),
    request = vi.fn().mockResolvedValue(jsonResponse(503, { error: "offer_request_failed" }));
  vi.stubGlobal("fetch", request);
  render(<OfferPerformanceReport />);
  await screen.findByRole("button", { name: "Retry report" });
  fireEvent.change(screen.getByLabelText("Claimed from (UTC)"), {
    target: { value: "2024-01-01" }
  });
  fireEvent.change(screen.getByLabelText("Claimed before (UTC, exclusive)"), {
    target: { value: "2027-01-01" }
  });
  await user.click(screen.getByRole("button", { name: "Update report" }));
  expect(await screen.findByText(/at most 366 days/)).toBeInTheDocument();
  expect(request).toHaveBeenCalledOnce();
  fireEvent.change(screen.getByLabelText("Claimed from (UTC)"), {
    target: { value: "2026-11-01" }
  });
  fireEvent.change(screen.getByLabelText("Claimed before (UTC, exclusive)"), {
    target: { value: "2026-12-01" }
  });
  fireEvent.change(screen.getByLabelText("Offer version ID (optional)"), {
    target: { value: offerDefinition.version_id }
  });
  await user.click(screen.getByRole("button", { name: "Update report" }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  await user.click(await screen.findByRole("button", { name: "Retry report" }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(3));
  expect(screen.getByLabelText("Offer version ID (optional)")).toHaveValue(
    offerDefinition.version_id
  );
});
it("confirms a manual signup hint replacement without presenting it as an account claim", async () => {
  const user = userEvent.setup(),
    writes: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = requestUrl(input);
      if (path.endsWith("/capabilities")) return jsonResponse(200, { enabled: true });
      if (path.endsWith("/context"))
        return jsonResponse(200, {
          offer: { code: "OWEN20", version: offerDefinition, available: true }
        });
      const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as Record<
        string,
        unknown
      >;
      writes.push(body);
      return body["explicit_correction"]
        ? jsonResponse(200, {
            offer: {
              code: "HOLIDAY30",
              available: true,
              version: {
                ...offerDefinition,
                policy: { ...offerDefinition.policy, discount_basis_points: 3000 }
              }
            }
          })
        : jsonResponse(409, { error: "offer_change_requires_confirmation" });
    })
  );
  render(<SignupOfferControl presentedCode={null} onLoading={vi.fn()} />);
  await screen.findByText(/OWEN20: 20%/);
  await user.click(screen.getByText("Referral or discount code"));
  fireEvent.change(screen.getByLabelText("Code"), { target: { value: "HOLIDAY30" } });
  await user.click(screen.getByRole("button", { name: "Check code" }));
  await user.click(await screen.findByRole("button", { name: "Keep current offer" }));
  await user.click(screen.getByRole("button", { name: "Check code" }));
  await user.click(await screen.findByRole("button", { name: "Replace pending offer" }));
  expect(await screen.findByText(/HOLIDAY30: 30%/)).toBeInTheDocument();
  expect(writes.at(-1)).toEqual({ code: "HOLIDAY30", explicit_correction: true });
  expect(screen.queryByText("Your discount is saved")).toBeNull();
});
