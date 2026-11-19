// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { OfferProgrammeEditor } from "../../../apps/web/src/components/system/offer-programme-editor.js";
import { OfferOperatorTools } from "../../../apps/web/src/components/system/offer-operator-tools.js";
import { OfferProgrammeVersionControl } from "../../../apps/web/src/components/system/offer-programme-version-control.js";
import { OfferPromotionCodes } from "../../../apps/web/src/components/system/offer-promotion-codes.js";
import { resetBrowserSessionClientState } from "../../../apps/web/src/lib/api.js";
import { jsonResponse, requestUrl } from "./web-test-helpers.js";
import { offerVersion } from "../../helpers/offer-fixtures.js";
afterEach(() => {
  resetBrowserSessionClientState();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const change = (label: string, value: string): void => {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
};
it("chooses the promotional code during creation, reports validation locally and preserves a conflicting draft", async () => {
  const user = userEvent.setup(),
    saved = vi.fn(),
    writes: unknown[] = [];
  let fail = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      writes.push(JSON.parse(typeof init?.body === "string" ? init.body : "{}"));
      if (fail) {
        fail = false;
        return jsonResponse(409, { error: "creator_code_unavailable" });
      }
      return jsonResponse(200, {
        programme: {
          ...offerVersion,
          state: "draft",
          policy: { ...offerVersion.policy, kind: "promotion", commission_basis_points: 0 }
        }
      });
    })
  );
  render(<OfferProgrammeEditor source={null} onSaved={saved} onCancel={vi.fn()} />);
  expect(screen.queryByLabelText("Promotional code")).toBeNull();
  screen.getByRole("combobox", { name: "Programme type" }).focus();
  await user.keyboard("{ArrowDown}{End}{Enter}");
  change("Promotional code", "bad/code");
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  expect(writes).toHaveLength(0);
  expect(screen.getByRole("alert")).toHaveTextContent(/letters, numbers/);
  expect(screen.getByLabelText("Promotional code")).toHaveAttribute("aria-invalid", "true");
  change("Promotional code", "blckfryd26");
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/already in use/);
  expect(screen.getByLabelText("Promotional code")).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByLabelText("Promotional code")).toHaveValue("blckfryd26");
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  expect(writes).toHaveLength(2);
  expect(writes[1]).toMatchObject({ promotion_code: "BLCKFRYD26", policy: { kind: "promotion" } });
  expect(screen.queryByRole("button", { name: "Reserve promotional code" })).toBeNull();
});
it("validates a revised agreement, preserves failed drafts and never activates while saving", async () => {
  const user = userEvent.setup(),
    saved = vi.fn(),
    cancel = vi.fn(),
    writes: Record<string, unknown>[] = [];
  let fail = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      writes.push(
        JSON.parse(typeof init?.body === "string" ? init.body : "{}") as Record<string, unknown>
      );
      if (fail) {
        fail = false;
        return jsonResponse(503, { error: "programme_unavailable" });
      }
      return jsonResponse(200, { programme: { ...offerVersion, state: "draft" } });
    })
  );
  render(<OfferProgrammeEditor source={offerVersion} onSaved={saved} onCancel={cancel} />);
  change("Commission (%)", "101");
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  expect(writes).toHaveLength(0);
  expect(screen.getByRole("alert")).toHaveTextContent(/collected base cash/i);
  change("Commission (%)", "66.67");
  expect(screen.getByLabelText("Commission (%)")).toHaveAttribute("step", "0.01");
  change("Commission months", "10");
  change("Name", "Reviewed launch");
  change("Public description", "Reviewed terms");
  change("Customer discount (%)", "25");
  expect(screen.getByLabelText("Claims start")).toHaveAttribute("type", "datetime-local");
  change("Claims start", "2026-11-16T10:30");
  change("Claims end (optional)", "2027-01-01T12:00");
  change("Redeem by (optional)", "2027-03-01T12:00");
  change("Maximum claims", "75");
  change("Terms version", "reviewed-terms");
  for (const label of ["Solo", "Monthly", "Allow individually approved early-purchase grants"]) {
    await user.click(screen.getByRole("checkbox", { name: label }));
    await user.click(screen.getByRole("checkbox", { name: label }));
  }
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  expect(await screen.findByText(/currently unavailable/)).toBeInTheDocument();
  expect(screen.getByLabelText("Name")).toHaveValue("Reviewed launch");
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  expect(writes[1]).toMatchObject({
    programme_id: offerVersion.programme_id,
    name: "Reviewed launch",
    policy: {
      discount_basis_points: 2500,
      commission_basis_points: 6667,
      commission_months: 10,
      max_claims: 75,
      claims_start_at: new Date("2026-11-16T10:30").toISOString(),
      claims_end_at: new Date("2027-01-01T12:00").toISOString(),
      redeem_by: new Date("2027-03-01T12:00").toISOString()
    }
  });
  expect(writes[1]).not.toHaveProperty("state");
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(cancel).toHaveBeenCalledOnce();
});
it("reads the saved promotional code for the exact version and retries without presenting an unsaved reservation", async () => {
  const user = userEvent.setup(),
    requests: string[] = [];
  let fail = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const path = requestUrl(input);
      requests.push(path);
      if (fail) {
        fail = false;
        return jsonResponse(503, { error: "programme_unavailable" });
      }
      return jsonResponse(200, {
        codes: [
          {
            code_id: offerVersion.programme_id,
            code: "BLCKFRYD26",
            kind: "promotion",
            partner_id: null,
            version_id: offerVersion.version_id,
            blocked: false,
            preferred: false,
            created_at: offerVersion.created_at
          }
        ]
      });
    })
  );
  render(<OfferPromotionCodes versionId={offerVersion.version_id} state="active" />);
  await user.click(await screen.findByRole("button", { name: "Retry code" }));
  expect(await screen.findByText("BLCKFRYD26")).toBeVisible();
  expect(requests).toHaveLength(2);
  for (const path of requests)
    expect(new URL(path, "http://localhost").searchParams.get("version_id")).toBe(
      offerVersion.version_id
    );
  expect(screen.queryByRole("button", { name: "Reserve promotional code" })).toBeNull();
});
it("refreshes an older draft's generated code after activation without remounting the programme", async () => {
  let active = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      jsonResponse(200, {
        codes: active
          ? [
              {
                code_id: offerVersion.programme_id,
                code: "PROMO-LEGACY20",
                kind: "promotion",
                partner_id: null,
                version_id: offerVersion.version_id,
                blocked: false,
                preferred: false,
                created_at: offerVersion.created_at
              }
            ]
          : []
      })
    )
  );
  const programme = (state: "draft" | "active" | "ended") => (
    <OfferProgrammeVersionControl
      version={{
        ...offerVersion,
        state,
        policy: { ...offerVersion.policy, kind: "promotion", commission_basis_points: 0 }
      }}
      onChanged={vi.fn()}
      onRevise={vi.fn()}
      readOnly
    />
  );
  const view = render(programme("draft"));
  expect(await screen.findByText(/Activation will generate one/)).toBeVisible();
  active = true;
  view.rerender(programme("active"));
  expect(await screen.findByText("PROMO-LEGACY20")).toBeVisible();
  active = false;
  view.rerender(programme("ended"));
  expect(await screen.findByText("No promotional code recorded for this revision.")).toBeVisible();
  expect(screen.queryByText(/Activation will generate one/)).toBeNull();
});
it("prepares payment discounts through activation and retries failure without manual coupon fields", async () => {
  const user = userEvent.setup(),
    changed = vi.fn(),
    revised = vi.fn(),
    writes: { path: string; body: unknown }[] = [];
  let fail = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = requestUrl(input);
      if (path.includes("/operator/codes?")) return jsonResponse(200, { codes: [] });
      writes.push({ path, body: JSON.parse(typeof init?.body === "string" ? init.body : "{}") });
      if (path.endsWith("/state") && fail) {
        fail = false;
        return jsonResponse(503, { error: "programme_payment_setup_failed" });
      }
      return jsonResponse(
        200,
        path.endsWith("/state") ? { programme: { ...offerVersion, state: "active" } } : { ok: true }
      );
    })
  );
  render(
    <OfferProgrammeVersionControl
      version={{
        ...offerVersion,
        state: "draft",
        policy: { ...offerVersion.policy, kind: "promotion", commission_basis_points: 0 }
      }}
      onChanged={changed}
      onRevise={revised}
    />
  );
  expect(screen.queryByLabelText("Stripe coupon ID")).toBeNull();
  expect(screen.queryByRole("checkbox", { name: "This is a live-mode coupon" })).toBeNull();
  expect(
    screen.getByText(/Payment discounts are prepared and verified automatically/)
  ).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Activate" }));
  await user.click(screen.getByRole("button", { name: "Confirm change" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    /payment discount could not be prepared/i
  );
  expect(changed).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Confirm change" }));
  await waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole("button", { name: "Reserve promotional code" })).toBeNull();
  expect(writes.map((w) => w.path)).toEqual([
    expect.stringContaining("/state"),
    expect.stringContaining("/state")
  ]);
  expect(writes[0]!.body).toEqual({
    state: "active",
    expected_state: "draft",
    acknowledge_unlimited: false
  });
  await user.click(screen.getByRole("button", { name: "Create revised draft" }));
  expect(revised).toHaveBeenCalledOnce();
});
it("requires a fresh target confirmation for every support mutation", async () => {
  const user = userEvent.setup(),
    writes: { path: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = requestUrl(input);
      writes.push({ path, body: JSON.parse(typeof init?.body === "string" ? init.body : "{}") });
      if (path.endsWith("/creator-codes")) return jsonResponse(200, { code: "RENAMED20" });
      if (path.endsWith("/early-grants"))
        return jsonResponse(200, {
          grant_id: offerVersion.version_id,
          expires_at: "2026-11-17T00:00:00.000Z"
        });
      return jsonResponse(200, { ok: true });
    })
  );
  render(<OfferOperatorTools />);
  for (const [title, submit, fields] of [
    [
      "Correct a creator code",
      "Correct creator code",
      {
        "Partner ID": offerVersion.programme_id,
        "New public code": "RENAMED20",
        Reason: "Reviewed correction"
      }
    ],
    [
      "Approve early purchase",
      "Approve early purchase",
      {
        "Claim ID": offerVersion.version_id,
        "Expires at (UTC)": "2026-11-17T00:00:00.000Z",
        Reason: "Reviewed identity"
      }
    ],
    ["Revoke early purchase", "Revoke grant", { "Grant ID": offerVersion.version_id }],
    [
      "Revoke an unused offer",
      "Revoke unused offer",
      { "Claim ID": offerVersion.version_id, Reason: "Reviewed abuse" }
    ],
    ["Block a public code", "Block code", { "Code to block": "RENAMED20", Reason: "Review" }],
    [
      "Unblock a public code",
      "Unblock code",
      { "Code to unblock": "RENAMED20", Reason: "Resolved" }
    ]
  ] as const) {
    const scope = within(
      screen.getByRole("heading", { name: title }).closest('[data-slot="card"]') as HTMLElement
    );
    for (const [label, value] of Object.entries(fields))
      fireEvent.change(scope.getByLabelText(label), { target: { value } });
    const button = scope.getByRole("button", { name: submit });
    expect(button).toBeDisabled();
    await user.click(scope.getByRole("checkbox"));
    await user.click(button);
    await waitFor(() => expect(button).toBeDisabled());
  }
  expect(writes).toHaveLength(6);
  expect(writes[0]!.body).toMatchObject({
    partner_id: offerVersion.programme_id,
    code: "RENAMED20",
    reason: "Reviewed correction"
  });
  expect(writes[4]!.body).toMatchObject({ blocked: true });
  expect(writes[5]!.body).toMatchObject({ blocked: false });
});
it("keeps delegated authority ephemeral and revokes it explicitly", async () => {
  const user = userEvent.setup(),
    proof = "a".repeat(43),
    writes: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      writes.push(JSON.parse(typeof init?.body === "string" ? init.body : "{}"));
      return jsonResponse(
        200,
        requestUrl(input).endsWith("/revoke")
          ? { ok: true }
          : { proof, expires_at: "2026-11-16T01:00:00.000Z", actions: ["read", "manage"] }
      );
    })
  );
  render(<OfferOperatorTools />);
  change("Member token ID", offerVersion.version_id);
  await user.click(screen.getByRole("checkbox", { name: "Manage drafts, codes and revocations" }));
  await user.click(screen.getByRole("button", { name: "Issue temporary authorisation" }));
  expect(await screen.findByLabelText("Temporary authorisation")).toHaveValue(proof);
  expect(localStorage.getItem("operatorAuthorization")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Revoke this authorisation" }));
  await waitFor(() => expect(screen.queryByLabelText("Temporary authorisation")).toBeNull());
  expect(writes).toEqual([
    { member_token_id: offerVersion.version_id, actions: ["read", "manage"] },
    { operator_authorization: proof }
  ]);
});
