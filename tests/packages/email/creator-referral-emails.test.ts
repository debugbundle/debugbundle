import { expect, it } from "vitest";
import { renderCreatorReferralEmail } from "../../../packages/email/src/creator-referral-emails.js";
import { getSystemEmailReviewEntry } from "../../../packages/email/src/system-email-review.js";

const programme = {
  programme_id: "11111111-1111-4111-8111-111111111111",
  name: "Creators <&>",
  new_referrals: 2,
  pending_commission_minor: 1520
};
const options = {
  appBaseUrl: "https://app.debugbundle.test",
  publicBaseUrl: "https://debugbundle.test"
};
it("confirms the exact accepted programme and public code without accepting another agreement", () => {
  const message = renderCreatorReferralEmail(
    {
      kind: "joined",
      name: "Creators <&>",
      terms_version: "terms-1",
      code: "OWEN20",
      commission_basis_points: 7500,
      discount_basis_points: 2000,
      commission_months: 6
    },
    options
  );
  expect(message.subject).toBe("You're in: Creators <&>");
  expect(message.text).toMatch(/75%/);
  expect(message.text).toMatch(/OWEN20/);
  expect(message.text).toMatch(/terms-1/);
  expect(message.html).toContain("Creators &lt;&amp;&gt;");
  expect(message.html).toContain("https://debugbundle.test/r/OWEN20");
});
it.each(["first_purchase", "daily_digest"] as const)(
  "renders %s with separate programme sections and pending earnings",
  (kind) => {
    const message = renderCreatorReferralEmail(
      {
        kind,
        window_start: "2026-11-16T00:00:00.000Z",
        window_end: "2026-11-17T00:00:00.000Z",
        sections:
          kind === "first_purchase"
            ? [{ ...programme, new_referrals: 1 }]
            : [
                programme,
                {
                  ...programme,
                  programme_id: "22222222-2222-4222-8222-222222222222",
                  name: "Writers",
                  new_referrals: 1,
                  pending_commission_minor: 200
                }
              ],
        total_referrals: kind === "first_purchase" ? 1 : 3,
        total_commission_minor: kind === "first_purchase" ? 1520 : 1720,
        other_programmes: 0
      },
      options
    );
    expect(message.text).toContain("Creators <&>");
    if (kind === "daily_digest") expect(message.text).toContain("Writers");
    expect(message.text).toContain("$15.20");
    expect(message.html).toContain("$15.20");
    expect(message.text).toContain("Pending");
    expect(message.text).not.toContain("Activity window");
    expect(message.html).not.toContain("Activity window");
    expect(message.text).toMatch(/refunds|Refunds/);
    expect(message.text).not.toMatch(/available to withdraw|paid out/);
    expect(message.html).not.toContain("Creators <&>");
  }
);
it("rejects empty digests, invalid amounts and unsafe configured destinations", () => {
  const empty = {
    kind: "daily_digest" as const,
    window_start: "2026-11-16T00:00:00.000Z",
    window_end: "2026-11-17T00:00:00.000Z",
    sections: [],
    total_referrals: 0,
    total_commission_minor: 0,
    other_programmes: 0
  };
  expect(() => renderCreatorReferralEmail(empty, options)).toThrow();
  expect(() =>
    renderCreatorReferralEmail(
      { ...empty, sections: [programme], total_referrals: 2 },
      { ...options, appBaseUrl: "javascript:alert(1)" }
    )
  ).toThrow();
});
it("keeps all three review previews lazy and on the shared template path", () => {
  for (const id of [
    "creator-programme-joined",
    "creator-first-referral-purchase",
    "creator-referral-daily-digest"
  ]) {
    const entry = getSystemEmailReviewEntry(id)!;
    expect(entry.implementationStatus).toBe("implemented");
    expect(entry.preview!.html).toContain("Open your referrals");
    expect(entry.preview!.html).toContain(">Referrals</p>");
    expect(entry.preview).not.toBe(entry.preview);
  }
});
it("bounds grouped summaries, shows omitted programme counts and prevents header injection", () => {
  const digest = {
    kind: "daily_digest" as const,
    window_start: "2026-11-16T00:00:00.000Z",
    window_end: "2026-11-17T00:00:00.000Z",
    sections: [programme],
    total_referrals: 3,
    total_commission_minor: 2000,
    other_programmes: 1
  };
  expect(renderCreatorReferralEmail(digest, options).text).toContain("1 more programme.");
  expect(() => renderCreatorReferralEmail({ ...digest, other_programmes: 0 }, options)).toThrow();
  expect(() =>
    renderCreatorReferralEmail({ ...digest, window_end: digest.window_start }, options)
  ).toThrow();
  expect(() =>
    renderCreatorReferralEmail(
      { ...digest, sections: [...digest.sections, ...digest.sections] },
      options
    )
  ).toThrow();
  const joined = renderCreatorReferralEmail(
    {
      kind: "joined",
      name: "Creators\r\nBcc: injected",
      code: "REVIEW20",
      terms_version: "v1",
      commission_basis_points: 5000,
      discount_basis_points: 2000,
      commission_months: 12
    },
    options
  );
  expect(joined.subject).not.toMatch(/[\r\n]/);
});
