// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { CreatorPayoutPreferences } from "../../../apps/web/src/components/system/creator-payout-preferences.js";
import { PAYOUT_COUNTRIES } from "../../../packages/referrals/src/payout-preferences.js";
import { PayoutInstructionDetails } from "../../../apps/web/src/components/system/payout-instruction-details.js";
const id = "11111111-1111-4111-8111-111111111111";
const requestPath = (input: RequestInfo | URL): string =>
  typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
HTMLElement.prototype.hasPointerCapture ??= () => false;
HTMLElement.prototype.setPointerCapture ??= () => {};
HTMLElement.prototype.releasePointerCapture ??= () => {};
HTMLElement.prototype.scrollIntoView ??= () => {};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("offers every approved currency and saves a masked profile without retaining the typed destination", async () => {
  const user = userEvent.setup(),
    writes: unknown[] = [],
    completed = vi.fn();
  let saved = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = requestPath(input);
      if (path.endsWith("payout-policy"))
        return Response.json({
          configured: true,
          currencies: ["usd", "eur", "gbp", "cad", "aud"],
          methods: ["iban", "wise", "revolut"],
          countries: PAYOUT_COUNTRIES,
          default_currency: "usd",
          routine_minimum_usd_minor: 5000
        });
      const preference = {
        programme_id: id,
        revision: "22222222-2222-4222-8222-222222222222",
        method: "wise",
        country: "MT",
        currency: "cad",
        masked_destination: "••••owen",
        updated_at: "2026-11-16T00:00:00.000Z"
      };
      if (init?.method === "POST") {
        if (typeof init.body !== "string") throw new Error("expected_json_body");
        writes.push(JSON.parse(init.body));
        saved = true;
        return Response.json({ preference });
      }
      return Response.json({
        user_id: id,
        programmes: [{ programme_id: id, name: "Creators", preference: saved ? preference : null }]
      });
    })
  );
  render(<CreatorPayoutPreferences identity={id} onSetupCompleteChange={completed} />);
  await screen.findByLabelText("Account holder / recipient name");
  expect(completed).toHaveBeenLastCalledWith(false);
  expect(screen.getByRole("combobox", { name: "Preferred payout currency" })).toHaveTextContent(
    "US dollars"
  );
  await user.click(screen.getByRole("combobox", { name: "Payment method" }));
  await user.click(screen.getByRole("option", { name: "Wise" }));
  fireEvent.change(screen.getByLabelText("Account holder / recipient name"), {
    target: { value: "Owen Far" }
  });
  fireEvent.change(screen.getByLabelText("Wisetag"), { target: { value: "@owen" } });
  await user.click(screen.getByRole("combobox", { name: "Country" }));
  await user.click(screen.getByRole("option", { name: "Malta" }));
  await user.click(screen.getByRole("combobox", { name: "Preferred payout currency" }));
  for (const label of [
    "US dollars",
    "Euros",
    "British pounds",
    "Canadian dollars",
    "Australian dollars"
  ])
    expect(screen.getByRole("option", { name: label })).toBeInTheDocument();
  await user.click(screen.getByRole("option", { name: "Canadian dollars" }));
  await user.click(screen.getByRole("button", { name: "Save payout preferences" }));
  await screen.findByText(/••••owen/);
  await waitFor(() => expect(screen.queryByLabelText("Wisetag")).toBeNull());
  expect(completed).toHaveBeenLastCalledWith(true);
  expect(writes).toEqual([
    {
      expected_user_id: id,
      programme_id: id,
      expected_revision: null,
      details: {
        method: "wise",
        holder: "Owen Far",
        country: "MT",
        currency: "cad",
        destination: "@owen"
      }
    }
  ]);
  await user.click(screen.getByRole("button", { name: "Update payout preferences" }));
  expect(screen.getByLabelText("Wisetag")).toHaveValue("");
});
const settings = {
  configured: true,
  currencies: ["usd", "eur", "gbp", "cad", "aud"],
  methods: ["iban", "wise", "revolut"],
  countries: PAYOUT_COUNTRIES,
  default_currency: "usd",
  routine_minimum_usd_minor: 5000
};
const summary = {
  programme_id: id,
  revision: id,
  method: "iban",
  country: "MT",
  currency: "gbp",
  masked_destination: "••••3000",
  updated_at: "2026-11-16T00:00:00.000Z"
};
function installSetup(
  options: {
    configured?: boolean;
    saved?: boolean;
    empty?: boolean;
    wrongIdentity?: boolean;
    incompleteProgramme?: boolean;
  } = {}
) {
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
    requestPath(input).endsWith("payout-policy")
      ? Response.json({ ...settings, configured: options.configured ?? true })
      : init?.method === "POST"
        ? Response.json({ error: "payout_preferences_changed" }, { status: 409 })
        : Response.json({
            user_id: options.wrongIdentity ? "22222222-2222-4222-8222-222222222222" : id,
            programmes: options.empty
              ? []
              : [
                  {
                    programme_id: id,
                    name: "Creators",
                    preference: options.saved ? summary : null
                  },
                  ...(options.incompleteProgramme
                    ? [
                        {
                          programme_id: "22222222-2222-4222-8222-222222222222",
                          name: "Another programme",
                          preference: null
                        }
                      ]
                    : [])
                ]
          })
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
it("keeps setup prominent while another accepted programme still needs payment details", async () => {
  installSetup({ saved: true, incompleteProgramme: true });
  const completed = vi.fn();
  render(<CreatorPayoutPreferences identity={id} onSetupCompleteChange={completed} />);
  await screen.findByRole("button", { name: "Update payout preferences" });
  expect(completed).toHaveBeenLastCalledWith(false);
});
it("validates required fields, keeps failed input and lets a creator cancel an edit", async () => {
  const fetch = installSetup({ saved: true }),
    user = userEvent.setup();
  render(<CreatorPayoutPreferences identity={id} />);
  await user.click(await screen.findByRole("button", { name: "Update payout preferences" }));
  await user.click(screen.getByRole("button", { name: "Save payout preferences" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("recipient name");
  fireEvent.change(screen.getByLabelText("Account holder / recipient name"), {
    target: { value: "Private Recipient" }
  });
  fireEvent.change(screen.getByLabelText("IBAN"), { target: { value: "invalid" } });
  await user.click(screen.getByRole("button", { name: "Save payout preferences" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("valid IBAN");
  fireEvent.change(screen.getByLabelText("IBAN"), { target: { value: "DE89370400440532013000" } });
  await user.click(screen.getByRole("button", { name: "Save payout preferences" }));
  await screen.findByText(/changed/i);
  expect(screen.getByLabelText("IBAN")).toHaveValue("DE89370400440532013000");
  expect(fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  await user.click(screen.getByRole("button", { name: "Update payout preferences" }));
  expect(screen.getByLabelText("IBAN")).toHaveValue("");
  expect(screen.getByLabelText("Account holder / recipient name")).toHaveValue("");
});
it("shows safe empty and unconfigured states and rejects another signed-in identity", async () => {
  installSetup({ empty: true });
  const view = render(<CreatorPayoutPreferences identity={id} />);
  expect(await screen.findByText(/Join a referral programme to add/)).toBeInTheDocument();
  view.unmount();
  installSetup({ configured: false });
  const next = render(<CreatorPayoutPreferences identity={id} />);
  expect(await screen.findByText("Payment setup is temporarily unavailable")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Save payout preferences" })).toBeNull();
  next.unmount();
  installSetup({ wrongIdentity: true });
  render(<CreatorPayoutPreferences identity={id} />);
  expect(await screen.findByText("Payout preferences could not be loaded")).toBeInTheDocument();
  installSetup();
  await userEvent.setup().click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByLabelText("IBAN")).toBeInTheDocument();
});
it("reveals frozen instructions only after explicit action and clears them on batch changes", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ error: "payout_instructions_unavailable" }, { status: 503 })
    )
    .mockResolvedValueOnce(
      Response.json({
        instructions: {
          batch_id: id,
          partner_id: id,
          programme_id: id,
          revision: id,
          details: {
            method: "wise",
            holder: "Frozen Recipient",
            country: "CA",
            currency: "cad",
            destination: "@frozen"
          }
        }
      })
    )
    .mockResolvedValueOnce(Response.json({ instructions: null }));
  vi.stubGlobal("fetch", fetch);
  const user = userEvent.setup();
  const view = render(<PayoutInstructionDetails key={id} batchId={id} />);
  expect(fetch).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Show payment instructions" }));
  await screen.findByText(/instructions could not|instructions.*unavailable/i);
  await user.click(screen.getByRole("button", { name: "Show payment instructions" }));
  expect(await screen.findByLabelText("Payment tag")).toHaveValue("@frozen");
  expect(screen.getByLabelText("Account holder / recipient name")).toHaveValue("Frozen Recipient");
  view.rerender(
    <PayoutInstructionDetails key="second" batchId="22222222-2222-4222-8222-222222222222" />
  );
  expect(screen.queryByLabelText("Payment tag")).toBeNull();
  expect(fetch).toHaveBeenCalledTimes(2);
  await user.click(screen.getByRole("button", { name: "Show payment instructions" }));
  expect(await screen.findByText(/Legacy payment/)).toBeInTheDocument();
});
