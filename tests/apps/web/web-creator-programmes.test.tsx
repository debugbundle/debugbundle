// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { CreatorProgrammeControl } from "../../../apps/web/src/components/system/creator-programme-control.js";
import { OfferProgrammeVersionControl } from "../../../apps/web/src/components/system/offer-programme-version-control.js";
import { offerVersion, offerDefinition } from "../../helpers/offer-fixtures.js";
import { jsonResponse, requestUrl } from "./web-test-helpers.js";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.js";
import { resolveReferralTermsUrl } from "../../../apps/web/src/lib/external-links.js";
import { ReferralEnrollmentCard } from "../../../apps/web/src/components/system/referral-enrollment-card.js";
const profile = {
  partner_id: offerVersion.programme_id,
  code: "ABCD234567",
  legacy_code: "ABCD234567",
  accepting_new_referrals: true,
  version: offerVersion,
  accepted_at: offerVersion.created_at
};
afterEach(() => {
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("keeps referral terms on the local, hosted or explicitly configured public site", () => {
  const location = new URL("http://localhost:5291/settings/referrals");
  expect(resolveReferralTermsUrl({ DEV: true }, location)).toBe(
    "http://localhost:5292/terms/#referrals"
  );
  expect(resolveReferralTermsUrl({ DEV: false, MODE: "production" }, location)).toBe(
    "https://debugbundle.com/terms/#referrals"
  );
  expect(
    resolveReferralTermsUrl(
      { VITE_DOCUMENTATION_URL: "https://review.debugbundle.test/docs" },
      location
    )
  ).toBe("https://review.debugbundle.test/terms/#referrals");
  render(
    <ReferralEnrollmentCard
      termsVersion="business-referrals-2026-11"
      pending={false}
      error={null}
      onJoin={vi.fn()}
    />
  );
  expect(screen.getByRole("link", { name: "referral programme terms" })).toHaveAttribute(
    "href",
    "http://localhost:5292/terms/#referrals"
  );
});
it("requires acceptance of the exact terms and shows a branded code only after server confirmation", async () => {
  const user = userEvent.setup(),
    writes: unknown[] = [],
    joined = vi.fn();
  let enrolled = false,
    finish: ((response: Response) => void) | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = requestUrl(input);
      if (path.includes("/programmes?"))
        return jsonResponse(200, { programmes: [offerDefinition] });
      if (path.endsWith("/creator/code")) {
        return new Promise<Response>((resolve) => {
          finish = resolve;
        });
      }
      if (path.endsWith("/creator")) {
        if (init?.method === "POST") {
          enrolled = true;
          writes.push(JSON.parse(typeof init.body === "string" ? init.body : "{}"));
        }
        return jsonResponse(200, {
          creator: enrolled ? profile : null,
          share_url: enrolled ? "https://debugbundle.com/r/ABCD234567" : null
        });
      }
      return jsonResponse(404, { error: "not_found" });
    })
  );
  render(<CreatorProgrammeControl identity="creator" onJoined={joined} />);
  const join = await screen.findByRole("button", { name: "Join referral programme" });
  expect(join).toBeDisabled();
  const details = screen.getByRole("button", { name: "View programme terms for Creators" });
  expect(details).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("table")).toBeNull();
  expect(screen.getByRole("checkbox")).toBeVisible();
  await user.click(details);
  expect(details).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("columnheader", { name: "Example commission" })).toBeVisible();
  await user.keyboard("{Escape}");
  expect(details).toHaveAttribute("aria-expanded", "false");
  expect(details).toHaveFocus();
  expect(screen.queryByRole("table")).toBeNull();
  await user.click(screen.getByRole("checkbox"));
  await user.click(join);
  expect(writes).toEqual([
    { version_id: offerVersion.version_id, terms_version: offerVersion.policy.terms_version }
  ]);
  const code = await screen.findByLabelText("Choose your branded code");
  expect(joined).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: "View programme terms for Creators" })).toHaveAttribute(
    "aria-expanded",
    "false"
  );
  await user.type(code, "OWEN20");
  await user.click(screen.getByRole("button", { name: "Reserve code" }));
  expect(screen.getByLabelText("Referral code")).toHaveValue("ABCD234567");
  expect(screen.getByRole("button", { name: "Reserving code" })).toBeDisabled();
  finish!(
    jsonResponse(200, {
      creator: { ...profile, code: "OWEN20" },
      share_url: "https://debugbundle.com/r/OWEN20"
    })
  );
  await waitFor(() => expect(screen.getByLabelText("Referral code")).toHaveValue("OWEN20"));
  expect(screen.getByLabelText("Referral link")).toHaveValue("https://debugbundle.com/r/OWEN20");
  expect(screen.queryByLabelText("Choose your branded code")).toBeNull();
});
it("shows the saved and available programme values separately without fixed rates or automatic consent", async () => {
  const user = userEvent.setup();
  const selected = {
    ...offerDefinition,
    version_id: "44444444-4444-4444-8444-444444444444",
    name: "Flexible creators",
    policy: {
      ...offerDefinition.policy,
      eligible_plans: ["team"] as const,
      eligible_intervals: ["month"] as const,
      commission_basis_points: 7525,
      discount_basis_points: 1550,
      commission_months: 3,
      terms_version: "flexible-terms"
    }
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) =>
      requestUrl(input).includes("/programmes?")
        ? jsonResponse(200, { programmes: [offerDefinition, selected] })
        : jsonResponse(200, { creator: profile, share_url: "https://debugbundle.com/r/ABCD234567" })
    )
  );
  render(<CreatorProgrammeControl identity="creator" />);
  const choice = await screen.findByRole("article", { name: "Flexible creators" });
  expect(within(choice).getByText("75.25%")).toBeVisible();
  expect(within(choice).getByText("15.5%")).toBeVisible();
  expect(within(choice).getByText(/12\.08/)).toBeVisible();
  expect(within(choice).getByText(/up to 3 months/)).toBeVisible();
  expect(within(choice).getByRole("list", { name: "Eligible plans" })).toHaveTextContent("Team");
  expect(choice).not.toHaveTextContent(/50%|20%|10%|Business/);
  const current = screen.getByRole("article", { name: "Creators" });
  expect(within(current).getByText("50%")).toBeVisible();
  expect(within(current).queryByRole("checkbox")).toBeNull();
  const action = within(choice).getByRole("button", {
    name: "Use this programme for new referrals"
  });
  expect(action).toBeDisabled();
  const details = within(choice).getByRole("button", {
    name: "View programme terms for Flexible creators"
  });
  await user.click(details);
  const terms = screen.getByRole("dialog", { name: "Flexible creators" });
  expect(terms).toHaveTextContent(/75.25%/);
  expect(terms).toHaveTextContent(/15.5%/);
  expect(terms).toHaveTextContent("flexible-terms");
  expect(within(terms).getByRole("link", { name: "General referral terms" })).toHaveAttribute(
    "href",
    "http://localhost:5292/terms/#referrals"
  );
  await user.keyboard("{Escape}");
  expect(details).toHaveFocus();
  expect(action).toBeDisabled();
});
it("requires explicit activation confirmation and unlimited-claims acknowledgement", async () => {
  const user = userEvent.setup(),
    changed = vi.fn(),
    request = vi
      .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValue(jsonResponse(200, { programme: offerVersion }));
  vi.stubGlobal("fetch", request);
  render(
    <OfferProgrammeVersionControl
      version={{
        ...offerVersion,
        state: "draft",
        policy: { ...offerVersion.policy, max_claims: null }
      }}
      onRevise={vi.fn()}
      onChanged={changed}
    />
  );
  const details = screen.getByRole("button", { name: "Programme details" });
  expect(details).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByText("Version", { exact: true })).toBeNull();
  expect(screen.queryByRole("table")).toBeNull();
  expect(screen.getByRole("button", { name: "Activate" })).toBeVisible();
  await user.click(details);
  expect(screen.getByText("Version", { exact: true })).toBeVisible();
  expect(screen.getByRole("table")).toBeVisible();
  await user.click(details);
  expect(screen.queryByRole("table")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Activate" }));
  const confirm = await screen.findByRole("button", { name: "Confirm change" });
  expect(confirm).toBeDisabled();
  expect(request).not.toHaveBeenCalled();
  await user.click(
    screen.getByRole("checkbox", { name: "I acknowledge there is no claim limit." })
  );
  await user.click(confirm);
  await waitFor(() => expect(changed).toHaveBeenCalledOnce());
  const requestBody = request.mock.calls[0]?.[1]?.body;
  expect(JSON.parse(typeof requestBody === "string" ? requestBody : "{}")).toEqual({
    state: "active",
    expected_state: "draft",
    acknowledge_unlimited: true
  });
});
