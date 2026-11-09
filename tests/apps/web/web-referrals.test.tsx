// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { referralApi } from "../../../apps/web/src/lib/referral-api.js";
import { InvalidSessionError } from "../../../apps/web/src/lib/api-client.js";
import { App } from "../../../apps/web/src/app.js";
import { CustomerReferralControl } from "../../../apps/web/src/components/system/customer-referral-control.js";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.js";
import {
  createBillingSummary,
  createSession,
  jsonResponse,
  requestUrl
} from "./web-test-helpers.js";
import { REFERRAL_TERMS_VERSION } from "../../../packages/referrals/src/referral-contracts.js";
import { ReferralBalanceSummary } from "../../../apps/web/src/components/system/referral-balance-summary.js";
import { ReferralHistory } from "../../../apps/web/src/components/system/referral-history.js";
const org = "11111111-1111-4111-8111-111111111111",
  partner = "22222222-2222-4222-8222-222222222222";
const profile = {
  partner_id: partner,
  code: "ABCD234567",
  status: "active",
  terms_version: REFERRAL_TERMS_VERSION,
  commission_basis_points: 5000,
  accepted_at: "2026-11-07T00:00:00.000Z"
};
it("shows available, pending, claimed and paid balances separately, including a post-payout negative offset", () => {
  render(
    <ReferralBalanceSummary
      balance={{
        currency: "usd",
        available_minor: -125,
        pending_minor: 590,
        claimed_minor: 2655,
        paid_minor: 5310
      }}
    />
  );
  for (const value of [
    "Available",
    "Pending",
    "Claimed",
    "Paid",
    "-$1.25",
    "$5.90",
    "$26.55",
    "$53.10"
  ])
    expect(screen.getByText(value)).toBeVisible();
});
afterEach(() => {
  resetBrowserSessionClientState();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function base(input: RequestInfo | URL): Response | null {
  const url = requestUrl(input);
  if (url.endsWith("/v1/auth/session"))
    return jsonResponse(200, {
      session: createSession({ organization_id: org, organization_plan: "free" })
    });
  if (url.endsWith("/v1/projects")) return jsonResponse(200, { projects: [] });
  if (url.endsWith("/v1/organizations")) return jsonResponse(200, { organizations: [] });
  return null;
}

it.each([
  { plan: "business", state: "active", trial: false, visible: false },
  { plan: "business", state: "admin_override", trial: false, visible: false },
  { plan: "team", state: "active", trial: false, visible: false },
  { plan: "solo", state: "active", trial: false, visible: false },
  { plan: "business", state: "trialing", trial: true, visible: true },
  { plan: "team", state: "trialing", trial: true, visible: true },
  { plan: "solo", state: "trialing", trial: true, visible: true },
  { plan: "free", state: null, trial: false, visible: true }
] as const)(
  "shows the customer referral prompt only before paid conversion: %j",
  async ({ plan, state, trial, visible }) => {
    const billing = createBillingSummary({ plan, billing_state: state });
    billing.trial.active = trial;
    billing.trial.plan = trial ? plan : null;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.endsWith("/v1/auth/session"))
        return jsonResponse(200, {
          session: createSession({ organization_id: org, organization_plan: plan })
        });
      if (url.endsWith("/v1/billing")) return jsonResponse(200, { billing });
      if (url.endsWith("/referrals/attribution"))
        return jsonResponse(200, { attribution: null, pending_code: null });
      return base(input) ?? jsonResponse(404, { error: "not_found" });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App initialEntries={["/billing"]} />);
    await screen.findByText("Current plan");
    if (visible)
      expect(
        await screen.findByRole("button", { name: /Have a Business referral code/ })
      ).toBeVisible();
    else {
      expect(
        screen.queryByRole("button", { name: /Have a Business referral code/ })
      ).not.toBeInTheDocument();
      expect(
        fetchMock.mock.calls.some(([input]) => requestUrl(input).includes("/referrals/attribution"))
      ).toBe(false);
    }
  }
);

it("requires explicit terms, retains the join choice after failure and shares only its own public code", async () => {
  const user = userEvent.setup(),
    join = vi
      .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(jsonResponse(503, { error: "program_unavailable" }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          partner: profile,
          share_url: "https://api.debugbundle.com/v1/referrals/visit/ABCD234567",
          enrollment_enabled: true,
          terms_version: REFERRAL_TERMS_VERSION
        })
      );
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const known = base(input);
      if (known) return known;
      const url = requestUrl(input);
      if (url.endsWith("/referrals/partner") && init?.method === "POST") return join(input, init);
      if (url.endsWith("/referrals/partner"))
        return jsonResponse(200, {
          partner: null,
          share_url: null,
          enrollment_enabled: true,
          terms_version: REFERRAL_TERMS_VERSION
        });
      if (url.endsWith("/referrals/earnings"))
        return jsonResponse(200, { balance: null, operator_access: false });
      if (url.includes("/referrals/clients")) return jsonResponse(200, { clients: [] });
      if (url.includes("/referrals/payouts")) return jsonResponse(200, { payouts: [] });
      return jsonResponse(404, { error: "not_found" });
    })
  );
  render(<App initialEntries={["/settings/referrals"]} />);
  expect(await screen.findByRole("heading", { name: "Referrals", level: 1 })).toBeVisible();
  const button = await screen.findByRole("button", { name: "Join referral programme" });
  expect(button).toBeDisabled();
  expect(
    screen.getByRole("checkbox", { name: "I accept the referral programme terms" })
  ).not.toBeChecked();
  expect(screen.getByRole("link", { name: "referral programme terms" })).toHaveAttribute(
    "href",
    "https://debugbundle.com/terms/#referrals"
  );
  await user.click(screen.getByRole("checkbox", { name: /accept.*referral.*terms/i }));
  await user.click(button);
  await screen.findByRole("alert");
  expect(screen.getByRole("checkbox")).toBeChecked();
  await user.click(button);
  expect(await screen.findByLabelText("Referral code")).toHaveValue("ABCD234567");
  expect(join).toHaveBeenCalledTimes(2);
  expect(JSON.parse(join.mock.calls[1]![1]!.body as string) as unknown).toEqual({
    terms_version: REFERRAL_TERMS_VERSION
  });
  const headers = new Headers(join.mock.calls[1]![1]!.headers);
  expect(headers.get("authorization")).toBeNull();
  expect(headers.get("x-csrf-token")).toBe("csrf-token-123");
});
it("requires confirmation before replacing an existing customer code and preserves a failed draft", async () => {
  const user = userEvent.setup(),
    apply = vi
      .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValue(jsonResponse(409, { error: "attribution_frozen" }));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return apply(input, init);
      return jsonResponse(200, {
        attribution: {
          referral_id: partner,
          partner_code: "ABCD234567",
          source: "manual",
          checkout_reserved: false
        },
        pending_code: null
      });
    })
  );
  render(<CustomerReferralControl organizationId={org} />);
  await user.click(await screen.findByRole("button", { name: /Business referral code/i }));
  const field = screen.getByLabelText("Business referral code");
  await user.clear(field);
  await user.type(field, "EFGH234567");
  await user.click(screen.getByRole("button", { name: "Apply code" }));
  expect(apply).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Replace referral" }));
  await waitFor(() => expect(apply).toHaveBeenCalledTimes(1));
  expect(JSON.parse(apply.mock.calls[0]![1]!.body as string) as unknown).toEqual({
    code: "EFGH234567",
    explicit_correction: true,
    expected_organization_id: org
  });
  await screen.findByRole("alert");
  expect(field).toHaveValue("EFGH234567");
});
it("denies ordinary workspace Owners the payout screen without requesting operator data", async () => {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL) =>
      base(input) ?? jsonResponse(200, { balance: null, operator_access: false })
  );
  vi.stubGlobal("fetch", fetchMock);
  render(<App initialEntries={["/settings/referrals/payouts"]} />);
  expect(await screen.findByText(/Only configured DebugBundle operators/i)).toBeVisible();
  expect(fetchMock.mock.calls.some(([input]) => requestUrl(input).includes("/operator/"))).toBe(
    false
  );
});
it("shows payouts as a child of Referrals and hides pagination for an empty first page", async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const known = base(input);
      if (known) return known;
      const url = requestUrl(input);
      if (url.endsWith("/referrals/earnings"))
        return jsonResponse(200, { balance: null, operator_access: true });
      if (url.includes("/operator/balances")) return jsonResponse(200, { partners: [] });
      if (url.includes("/operator/payouts")) return jsonResponse(200, { payouts: [] });
      if (url.endsWith("/referrals/partner"))
        return jsonResponse(200, {
          partner: null,
          share_url: null,
          enrollment_enabled: true,
          terms_version: REFERRAL_TERMS_VERSION
        });
      return jsonResponse(404, { error: "not_found" });
    })
  );
  render(<App initialEntries={["/settings/referrals/payouts"]} />);
  await screen.findByText("No earned commissions yet");
  expect(screen.getByText("No payments yet")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Previous" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
  const breadcrumb = screen.getByRole("navigation", { name: "breadcrumb" });
  expect(within(breadcrumb).getByText("Payouts")).toHaveAttribute("aria-current", "page");
  await user.click(within(breadcrumb).getByRole("link", { name: "Referrals" }));
  expect(await screen.findByRole("button", { name: "Join referral programme" })).toBeVisible();
});

it.each(["clients", "payouts"] as const)(
  "keeps Previous available after reaching an empty later %s page",
  async (kind) => {
    const user = userEvent.setup();
    const read = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(requestUrl(input), "http://localhost");
      const rows = url.searchParams.has("before")
        ? []
        : Array.from({ length: 25 }, (_, index) => {
            const id = `33333333-3333-4333-8333-${String(index).padStart(12, "0")}`;
            return kind === "clients"
              ? {
                  client_id: id,
                  status: "awaiting_purchase",
                  created_at: "2026-11-08T00:00:00.000Z"
                }
              : {
                  batch_id: id,
                  partner_id: partner,
                  currency: "usd",
                  amount_minor: 100,
                  status: "paid",
                  external_reference: "payment-reference",
                  claimed_at: "2026-11-08T00:00:00.000Z",
                  paid_at: "2026-11-08T00:00:00.000Z"
                };
          });
      return jsonResponse(200, { [kind]: rows });
    });
    vi.stubGlobal("fetch", read);
    render(<ReferralHistory kind={kind} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Next" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("No more records")).toBeVisible();
    expect(screen.getByRole("button", { name: "Previous" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Previous" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Next" })).toBeEnabled());
  }
);
it("retries an uncertain claim with the same identity and retains externally paid details after recording failure", async () => {
  const user = userEvent.setup(),
    batchId = "33333333-3333-4333-8333-333333333333";
  vi.spyOn(crypto, "randomUUID").mockReturnValue(batchId);
  const balance = {
    currency: "usd",
    available_minor: 2655,
    pending_minor: 0,
    claimed_minor: 0,
    paid_minor: 0
  };
  const payout = {
    batch_id: batchId,
    partner_id: partner,
    currency: "usd",
    amount_minor: 2655,
    status: "claimed",
    external_reference: null,
    claimed_at: "2026-12-10T00:00:00.000Z",
    paid_at: null
  };
  let claimed = false,
    paid = false;
  const claimRequest = vi
    .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
    .mockResolvedValueOnce(jsonResponse(503, { error: "referral_service_unavailable" }))
    .mockImplementation(async () => {
      claimed = true;
      return jsonResponse(200, { payout });
    });
  const recordRequest = vi
    .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
    .mockResolvedValueOnce(jsonResponse(503, { error: "referral_service_unavailable" }))
    .mockImplementation(async () => {
      paid = true;
      return jsonResponse(200, {
        payout: {
          ...payout,
          status: "paid",
          external_reference: "manual-bank-001",
          paid_at: "2026-12-10T00:01:00.000Z"
        }
      });
    });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const known = base(input);
      if (known) return known;
      const url = requestUrl(input);
      if (url.endsWith("/referrals/earnings"))
        return jsonResponse(200, { balance: null, operator_access: true });
      if (url.includes("/operator/balances"))
        return jsonResponse(200, {
          partners: [
            {
              partner_id: partner,
              code: profile.code,
              balance: claimed
                ? {
                    ...balance,
                    available_minor: 0,
                    claimed_minor: paid ? 0 : 2655,
                    paid_minor: paid ? 2655 : 0
                  }
                : balance
            }
          ]
        });
      if (url.endsWith("/operator/payouts/claim")) return claimRequest(input, init);
      if (url.endsWith(`/${batchId}/paid`)) return recordRequest(input, init);
      if (url.includes("/operator/payouts?"))
        return jsonResponse(200, { payouts: claimed ? [payout] : [] });
      return jsonResponse(404, { error: "not_found" });
    })
  );
  render(<App initialEntries={["/settings/referrals/payouts"]} />);
  await user.click(await screen.findByRole("button", { name: "Claim balance" }));
  await user.click(screen.getByRole("button", { name: "Claim balance" }));
  await screen.findByRole("alert");
  await user.click(screen.getByRole("button", { name: "Claim balance" }));
  const field = await screen.findByLabelText("External payment reference");
  expect(claimRequest).toHaveBeenCalledTimes(2);
  expect(claimRequest.mock.calls[0]![1]?.body).toBe(claimRequest.mock.calls[1]![1]?.body);
  const record = screen.getByRole("button", { name: "Record external payment" });
  expect(record).toBeDisabled();
  await user.type(field, "manual-bank-001");
  await user.click(screen.getByRole("checkbox", { name: /verified.*exact external payment/i }));
  await user.click(record);
  await screen.findByRole("alert");
  expect(field).toHaveValue("manual-bank-001");
  expect(screen.getByRole("checkbox")).toBeChecked();
  await user.click(record);
  await screen.findByText("External payment recorded.");
  expect(recordRequest).toHaveBeenCalledTimes(2);
  expect(recordRequest.mock.calls[0]![1]?.body).toBe(recordRequest.mock.calls[1]![1]?.body);
});

it("preserves server referral error codes while keeping invalid-session handling intact", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(400, { error: "invalid_referral_code" }))
      .mockResolvedValueOnce(jsonResponse(401, { error: "invalid_session" }))
  );
  await expect(referralApi.apply(org, "ABCD234567", false)).rejects.toMatchObject({
    name: "ReferralApiError",
    status: 400,
    code: "invalid_referral_code"
  });
  await expect(referralApi.partner()).rejects.toBeInstanceOf(InvalidSessionError);
});

it("hides the Billing referral form when the programme is unavailable", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(jsonResponse(503, { error: "program_unavailable" }))
  );
  const { container } = render(<CustomerReferralControl organizationId={org} />);
  await waitFor(() => expect(container).toBeEmptyDOMElement());
});

it("shows a neutral programme-unavailable state instead of blaming the connection", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (input: RequestInfo | URL) =>
        base(input) ?? jsonResponse(503, { error: "program_unavailable" })
    )
  );
  render(<App initialEntries={["/settings/referrals"]} />);
  expect(await screen.findByText("Referrals are unavailable")).toBeVisible();
  expect(screen.queryByText("Check your connection and try again.")).not.toBeInTheDocument();
});

it("keeps transient referral failures visible and preserves useful domain messages", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(503, { error: "referral_service_unavailable" }))
      .mockResolvedValueOnce(jsonResponse(200, { attribution: null, pending_code: null }))
      .mockResolvedValueOnce(jsonResponse(400, { error: "invalid_referral_code" }))
  );
  const user = userEvent.setup();
  render(<CustomerReferralControl organizationId={org} />);
  await user.click(await screen.findByRole("button", { name: /Have a Business referral code/ }));
  expect(await screen.findByRole("button", { name: "Retry" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(screen.getByLabelText("Business referral code")).toBeEnabled());
  await user.type(screen.getByLabelText("Business referral code"), "ABCD234567");
  await user.click(screen.getByRole("button", { name: "Apply code" }));
  expect(
    await screen.findByText("This referral code is invalid or no longer accepting new referrals.")
  ).toBeVisible();
});
