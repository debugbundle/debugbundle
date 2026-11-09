import { describe, expect, it } from "vitest";
import { renderOrganizationAccessEmail } from "../../../packages/email/src/organization-emails.js";

describe("organization access emails", () => {
  it("escapes names and states the actual grant without placing its token in tracking assets", () => {
    const email = renderOrganizationAccessEmail({
      kind: "invite",
      organizationName: "<script>org</script>",
      senderName: "<img src=x onerror=bad>",
      accessSummary: "Read-only access to selected projects.",
      acceptUrl:
        "https://app.debugbundle.com/organizations/accept?kind=invite&token=one-time-secret"
    });
    expect(email.subject).toContain("Join");
    expect(email.html).not.toContain("<script>");
    expect(email.html).not.toContain("<img src=x");
    expect(email.html).toContain("Read-only access to selected projects.");
    expect(email.html).toContain("https://app.debugbundle.com/email/debugbundle-mark.png");
    expect(email.html).not.toMatch(/src="[^"]*one-time-secret/);
  });
  it("makes acceptance and billing responsibility explicit for ownership transfer", () => {
    const email = renderOrganizationAccessEmail({
      kind: "ownership_transfer",
      organizationName: "Business",
      senderName: "Owner",
      acceptUrl:
        "https://app.debugbundle.com/organizations/accept?kind=ownership_transfer&token=secret"
    });
    expect(email.subject).toBe("Accept ownership of Business in DebugBundle");
    expect(email.text).toContain("billing responsibility");
    expect(email.html).toContain("Review ownership transfer");
    expect(email.text).toContain("verified email address");
  });
});
