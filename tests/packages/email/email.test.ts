import { afterEach, describe, expect, it, vi } from "vitest";

const { sesSendMock, sesClientConfigSpy, sendEmailCommandSpy, emailCommandCapture } = vi.hoisted(() => ({
  sesSendMock: vi.fn(),
  sesClientConfigSpy: vi.fn(),
  sendEmailCommandSpy: vi.fn(),
  emailCommandCapture: {
    lastInput: undefined as unknown
  }
}));

vi.mock("@aws-sdk/client-sesv2", () => ({
  SESv2Client: vi.fn().mockImplementation(function (config: unknown) {
    sesClientConfigSpy(config);
    return {
      send: sesSendMock
    };
  }),
  SendEmailCommand: vi.fn().mockImplementation(function (input: unknown) {
    emailCommandCapture.lastInput = input;
    sendEmailCommandSpy(input);
    return input;
  })
}));

import {
  EmailDeliveryError,
  createSesEmailTransport,
  formatProductFromEmail,
  renderAlertDigestEmail,
  renderAlertEmail,
  renderAllowanceLimitReachedEmail,
  renderAllowanceWarning80Email,
  renderEmailAuthCodeEmail,
  renderProjectInviteEmail,
  renderTrialConvertedEmail,
  renderTrialEndingSoonEmail,
  renderTrialExpiredEmail,
  renderTrialStartedEmail,
  renderRetentionRotationNoticeEmail,
  renderWebhookAutoDisabledEmail,
  renderWeeklyReportEmail
} from "../../../packages/email/src/index.js";
import {
  getSystemEmailReviewEntry,
  SYSTEM_EMAIL_REVIEW_ENTRIES
} from "../../../packages/email/src/system-email-review.js";

describe("email package", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    sesSendMock.mockReset();
    sesClientConfigSpy.mockReset();
    sendEmailCommandSpy.mockReset();
  });

  it("renders weekly report emails with escaped html and empty spike fallback", () => {
    const rendered = renderWeeklyReportEmail({
      windowStart: "2026-03-09T00:00:00.000Z",
      windowEnd: "2026-03-16T00:00:00.000Z",
      projects: [
        {
          projectId: "proj_123",
          projectName: "Checkout <API>",
          bundleCounts: {
            failure: 2,
            improvement: 1
          },
          newIncidents: 3,
          resolvedIncidents: 2,
          openedIncidentsResolved: 2,
          regressions: 1,
          topSpikingIncidents: []
        },
        {
          projectId: "proj_456",
          projectName: "Worker",
          bundleCounts: {
            failure: 1,
            improvement: 0
          },
          newIncidents: 0,
          resolvedIncidents: 1,
          openedIncidentsResolved: 0,
          regressions: 0,
          topSpikingIncidents: []
        }
      ]
    });

    expect(rendered.subject).toContain("2 projects");
    expect(rendered.text).toContain("Window: March 9, 2026 to March 16, 2026");
    expect(rendered.text).toContain("Across 2 projects, you closed 2 of the 3 incidents opened this week.");
    expect(rendered.text).toContain("Project: Checkout <API>");
    expect(rendered.text).toContain("Top spiking incidents:\nNone");
    expect(rendered.html).toContain(
      "2 projects: 3 new incidents, 3 resolved incidents, 3 failure bundles, 1 improvement bundle, 1 regression for March 9, 2026 to March 16, 2026."
    );
    expect(rendered.html.indexOf("2 projects: 3 new incidents")).toBeLessThan(rendered.html.indexOf('class="db-email-frame"'));
    expect(rendered.html).toContain("Checkout &lt;API&gt;");
    expect(rendered.html).toContain(">Project<");
    expect(rendered.html).toContain("DebugBundle weekly report");
    expect(rendered.html).toContain("March 9, 2026 to March 16, 2026");
    expect(rendered.html).toContain(">None</p>");
  });

  it("renders email auth code and invite emails with escaped content", () => {
    const emailCode = renderEmailAuthCodeEmail({
      code: "12<3456>",
      appUrl: "https://debugbundle.test/login?next=<dashboard>",
      expiresInMinutes: 10
    });
    const invite = renderProjectInviteEmail({
      acceptUrl: "https://debugbundle.test/accept?token=<secret>",
      inviterName: "Owen Example"
    });

    expect(emailCode.subject).toContain("sign-in code");
    expect(emailCode.text).toContain("12<3456>");
    expect(emailCode.text).toContain("https://debugbundle.test/login?next=<dashboard>");
    expect(emailCode.html).toContain("Your sign-in code expires in 10 minutes.");
    expect(emailCode.html.indexOf("Your sign-in code expires")).toBeLessThan(emailCode.html.indexOf('class="db-email-frame"'));
    expect(emailCode.html).toContain("12&lt;3456&gt;");
    expect(emailCode.html).toContain("&lt;dashboard&gt;");
    expect(emailCode.html).toContain('src="https://debugbundle.test/email/debugbundle-mark.png"');
    expect(invite.subject).toContain("project was shared");
    expect(invite.text).toContain("Owen Example shared a DebugBundle project with you.");
    expect(invite.text).toContain("https://debugbundle.test/accept?token=<secret>");
    expect(invite.html).toContain("Owen Example invited you to a shared project.");
    expect(invite.html).toContain("Owen Example");
    expect(invite.html).toContain("&lt;secret&gt;");
    expect(invite.html).toContain('src="https://debugbundle.test/email/debugbundle-mark.png"');
  });

  it("renders alert emails with human copy and links", () => {
    const rendered = renderAlertEmail({
      conditionType: "new_incident",
      incidentId: "inc_<123>",
      projectName: "Checkout <API>",
      occurredAt: "2026-05-13T08:33:56.774Z",
      serviceName: "checkout-<api>",
      environment: "production",
      severity: "high",
      incidentUrl: "https://app.debugbundle.com/incidents/inc_<123>",
      bundleUrl: "https://api.debugbundle.com/v1/incidents/inc_<123>/bundle"
    });

    expect(rendered.subject).toBe("[DebugBundle Alert] A new incident was detected");
    expect(rendered.html).toContain(
      "Checkout &lt;API&gt;: High new incident for checkout-&lt;api&gt; in production at May 13, 2026, 8:33 AM UTC."
    );
    expect(rendered.html.indexOf("High new incident")).toBeLessThan(rendered.html.indexOf('class="db-email-frame"'));
    expect(rendered.text).toContain("Project: Checkout <API>");
    expect(rendered.text).toContain("Service: checkout-<api>");
    expect(rendered.text).toContain("Detected at: May 13, 2026, 8:33 AM UTC");
    expect(rendered.text).toContain("Open incident: https://app.debugbundle.com/incidents/inc_<123>");
    expect(rendered.html).toContain(">Project<");
    expect(rendered.html).toContain("Checkout &lt;API&gt;");
    expect(rendered.html).toContain("checkout-&lt;api&gt;");
    expect(rendered.html).toContain("May 13, 2026, 8:33 AM UTC");
    expect(rendered.html).toContain("&lt;123&gt;");
    expect(rendered.html).toContain("Open incident in DebugBundle");
    expect(rendered.html).toContain('src="https://app.debugbundle.com/email/debugbundle-mark.png"');
  });

  it("renders alert digest emails with grouped incidents", () => {
    const rendered = renderAlertDigestEmail({
      alerts: [
        {
          conditionType: "new_incident",
          incidentId: "inc_1",
          projectName: "Checkout <API>",
          occurredAt: "2026-05-17T10:00:00.000Z",
          serviceName: "checkout-<api>",
          environment: "production",
          severity: "high",
          incidentUrl: "https://app.debugbundle.com/incidents/inc_1",
          bundleUrl: "https://api.debugbundle.com/v1/incidents/inc_1/bundle",
          summary: "Checkout crash"
        },
        {
          conditionType: "severity_threshold",
          incidentId: "inc_1",
          projectName: "Checkout <API>",
          occurredAt: "2026-05-17T10:00:01.000Z",
          serviceName: "checkout-<api>",
          environment: "production",
          severity: "high",
          incidentUrl: "https://app.debugbundle.com/incidents/inc_1",
          bundleUrl: "https://api.debugbundle.com/v1/incidents/inc_1/bundle",
          summary: "Checkout crash"
        }
      ]
    });

    expect(rendered.subject).toBe("[DebugBundle Alerts] 1 incident matched your alerts");
    expect(rendered.html).toContain(
      "Checkout &lt;API&gt;: 1 incident matched alerts. First: High Checkout crash on checkout-&lt;api&gt; in production."
    );
    expect(rendered.html.indexOf("1 incident matched alerts")).toBeLessThan(rendered.html.indexOf('class="db-email-frame"'));
    expect(rendered.text).toContain("Project: Checkout <API>");
    expect(rendered.text).toContain("Alerts: New incident, Severity threshold reached");
    expect(rendered.text).toContain("Detected at: May 17, 2026, 10:00 AM UTC");
    expect(rendered.html).toContain("Checkout crash");
    expect(rendered.html).toContain(">Project<");
    expect(rendered.html).toContain("Checkout &lt;API&gt;");
    expect(rendered.html).toContain("checkout-&lt;api&gt;");
    expect(rendered.html).toContain("May 17, 2026, 10:00 AM UTC");
    expect(rendered.html.match(/background-color:#fafaf9;/g)?.length ?? 0).toBe(2);
    expect(rendered.html).toContain('src="https://app.debugbundle.com/email/debugbundle-mark.png"');
  });

  it("renders webhook auto-disabled emails with escaped content and management links", () => {
    const rendered = renderWebhookAutoDisabledEmail({
      organizationName: 'Acme <Prod>',
      projectName: 'checkout-<api>',
      webhookId: "wh_<123>",
      targetUrl: "https://hooks.example.test/<danger>",
      webhooksUrl: "https://app.debugbundle.test/projects/proj_123/webhooks?filter=<all>"
    });

    expect(rendered.subject).toContain("webhook auto-disabled");
    expect(rendered.html).toContain(
      "Webhook wh_&lt;123&gt; for checkout-&lt;api&gt; was disabled after 50 delivery failures."
    );
    expect(rendered.text).toContain('Acme <Prod>');
    expect(rendered.text).toContain("Project: checkout-<api>");
    expect(rendered.text).toContain("Webhook ID: wh_<123>");
    expect(rendered.text).toContain("https://hooks.example.test/<danger>");
    expect(rendered.text).toContain("Manage project webhooks: https://app.debugbundle.test/projects/proj_123/webhooks?filter=<all>");
    expect(rendered.html).toContain("Acme &lt;Prod&gt;");
    expect(rendered.html).toContain("checkout-&lt;api&gt;");
    expect(rendered.html).toContain("wh_&lt;123&gt;");
    expect(rendered.html).toContain("&lt;danger&gt;");
    expect(rendered.html).toContain("Manage project webhooks");
    expect(rendered.html).toContain("DebugBundle");
  });

  it("renders Gmail-safe card markup with narrow-client adjustments", () => {
    const rendered = renderWebhookAutoDisabledEmail({
      organizationName: "Acme Production",
      projectName: "Checkout API",
      webhookId: "wh_01hrf91h0v8g6sz8g4ng1q7nq8",
      targetUrl:
        "https://hooks.example.test/debugbundle/really/long/path/that/should/wrap/in/mobile/mail/clients/without/blowing/out/the/layout",
      webhooksUrl: "https://app.debugbundle.test/projects/proj_123/webhooks"
    });

    expect(rendered.html).toContain("<!DOCTYPE html>");
    expect(rendered.html).toContain("<head>");
    expect(rendered.html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1.0" />');
    expect(rendered.html).toContain("<style>");
    expect(rendered.html).toContain("@media only screen and (max-width: 480px)");
    expect(rendered.html).toContain(".db-email-shell { padding-top:20px !important; padding-right:12px !important; padding-bottom:20px !important; padding-left:12px !important; }");
    expect(rendered.html).toContain(".db-email-title { font-size:24px !important; line-height:30px !important; }");
    expect(rendered.html).toContain(".db-email-kv-label, .db-email-kv-value { display:block !important; width:100% !important; text-align:left !important; }");
    expect(rendered.html).not.toContain("@media only screen and (min-width:");
    expect(rendered.html).not.toContain(".db-email-card {");
    expect(rendered.html).not.toContain(".db-email-card-shell {");
    expect(rendered.html).not.toContain(".db-email-card-content {");
    expect(rendered.html).not.toContain("max-width: 640px");
    expect(rendered.html).toContain('<body bgcolor="#f5f5f4" style="margin:0;padding:0;background-color:#f5f5f4;font-family:Arial,Helvetica,sans-serif;">');
    expect(rendered.html).toContain('class="db-email-root" style="margin:0;padding:0;background-color:#f5f5f4;font-family:Arial,Helvetica,sans-serif;"');
    expect(rendered.html).toContain('class="db-email-frame" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f5f5f4" style="width:100%;border-collapse:collapse;background-color:#f5f5f4;"');
    expect(rendered.html).toContain('class="db-email-shell" style="padding-top:32px;padding-right:16px;padding-bottom:32px;padding-left:16px;"');
    expect(rendered.html).toContain('class="db-email-card-shell" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:100%;border-collapse:separate;background-color:#ffffff;border:1px solid #e7e5e4;border-radius:16px;');
    expect(rendered.html).toContain(
      'class="db-email-card-top-space" height="32" style="height:32px;line-height:32px;font-size:1px;mso-line-height-rule:exactly;">&nbsp;</td>'
    );
    expect(rendered.html).toContain(
      'class="db-email-card-content" style="padding-left:28px;padding-right:28px;vertical-align:top;">'
    );
    expect(rendered.html).toContain(
      'class="db-email-card-bottom-space" height="32" style="height:32px;line-height:32px;font-size:1px;mso-line-height-rule:exactly;">&nbsp;</td>'
    );
    expect(rendered.html).not.toContain('class="db-email-card-shell" bgcolor="#ffffff" style="background-color:#ffffff;border:1px solid #e7e5e4;border-radius:16px;overflow:hidden;"');
    expect(rendered.html).not.toContain('class="db-email-card" bgcolor="#ffffff"');
    expect(rendered.html).not.toContain("db-email-card-side-space");
    expect(rendered.html).not.toContain("<svg");
    expect(rendered.html).toContain('src="https://app.debugbundle.test/email/debugbundle-mark.png"');
    expect(rendered.html).toContain('style="display:table-cell;width:34%;padding:0 12px 0 0;');
    expect(rendered.html).toContain('style="display:table-cell;width:66%;padding:0;vertical-align:top;color:#1c1917;font-size:15px;line-height:22px;text-align:right;"');
    expect(rendered.html).toContain("word-break:break-word;overflow-wrap:anywhere;");
    expect(rendered.html).toContain("text-align:right;");
  });

  it("renders system email review previews lazily from the current templates", () => {
    const entry = getSystemEmailReviewEntry("email-sign-in-code");

    expect(entry).not.toBeNull();
    const firstPreview = entry?.preview;
    const secondPreview = entry?.preview;

    expect(firstPreview).toBeDefined();
    expect(secondPreview).toBeDefined();
    expect(firstPreview).not.toBe(secondPreview);
    expect(firstPreview?.html).toContain("@media only screen and (max-width: 480px)");
    expect(firstPreview?.html).toContain('class="db-email-card-content" style="padding-left:28px;padding-right:28px;vertical-align:top;">');
    expect(firstPreview?.html).toContain('src="https://app.debugbundle.local/email/debugbundle-mark.png"');
  });

  it("includes no-card trial lifecycle entries in the shared system email review inventory", () => {
    const entryIds = new Set(SYSTEM_EMAIL_REVIEW_ENTRIES.map((entry) => entry.id));

    expect(entryIds.has("trial-started")).toBe(true);
    expect(entryIds.has("trial-ending-soon-7-day")).toBe(true);
    expect(entryIds.has("trial-ending-soon-1-day")).toBe(true);
    expect(entryIds.has("trial-expired")).toBe(true);
    expect(entryIds.has("trial-converted")).toBe(true);
  });

  it("renders no-card trial lifecycle billing emails with billing ctas", () => {
    const started = renderTrialStartedEmail({
      organizationName: "Acme <Prod>",
      trialPlan: "team",
      trialEndsAt: "2026-06-30",
      billingUrl: "https://app.debugbundle.test/billing?view=<trial>"
    });
    const reminder = renderTrialEndingSoonEmail({
      organizationName: "Acme <Prod>",
      trialPlan: "team",
      trialEndsAt: "2026-06-30",
      daysRemaining: 7,
      billingUrl: "https://app.debugbundle.test/billing?view=<trial>"
    });
    const expired = renderTrialExpiredEmail({
      organizationName: "Acme <Prod>",
      trialPlan: "team",
      trialEndedAt: "2026-06-30",
      billingUrl: "https://app.debugbundle.test/billing?view=<trial>"
    });
    const converted = renderTrialConvertedEmail({
      organizationName: "Acme <Prod>",
      trialPlan: "team",
      paidPlan: "team",
      billingUrl: "https://app.debugbundle.test/billing?view=<trial>"
    });

    expect(started.subject).toContain("trial has started");
    expect(started.text).toContain('Your 30-day team trial for "Acme <Prod>" is active now.');
    expect(started.text).toContain("Extra purchased capacity requires paid conversion.");
    expect(started.html).toContain("Acme &lt;Prod&gt;");
    expect(started.html).toContain("View billing");

    expect(reminder.subject).toContain("7 day(s) left");
    expect(reminder.text).toContain("ends in 7 day(s)");
    expect(reminder.text).toContain("DebugBundle will pause:");
    expect(reminder.text).toContain("Slack destinations plus Slack alert and weekly report channels");
    expect(reminder.html).toContain("Days remaining");
    expect(reminder.html).toContain("Project collaborators and pending invites");
    expect(reminder.html).toContain("Convert to paid");

    expect(expired.subject).toContain("trial has ended");
    expect(expired.text).toContain("paid-feature setup remain saved");
    expect(expired.text).toContain("DebugBundle paused:");
    expect(expired.text).toContain("GitHub automation setup and dispatch rules");
    expect(expired.html).toContain("Ended at");
    expect(expired.html).toContain("generated hosted improvement bundle artifacts");
    expect(expired.html).toContain("View billing");

    expect(converted.subject).toContain("team plan activated");
    expect(converted.text).toContain("converted from a team trial to the paid team plan");
    expect(converted.html).toContain("Manage billing");
  });

  it("renders allowance and retention operational emails with scoped usage copy", () => {
    const warning = renderAllowanceWarning80Email({
      organizationName: "Acme <Prod>",
      projectName: "checkout-<api>",
      meterLabel: "Raw ingested events",
      used: 8400,
      limit: 10500,
      currentBehavior: "new ingestion requests are rejected until the usage window resets",
      usageWindowEndsAt: "2026-06-01T00:00:00.000Z",
      billingUrl: "https://app.debugbundle.test/billing?view=<usage>"
    });
    const limit = renderAllowanceLimitReachedEmail({
      organizationName: "Acme <Prod>",
      projectName: "checkout-<api>",
      meterLabel: "Lifecycle webhook deliveries",
      used: 750,
      limit: 750,
      currentBehavior: "new lifecycle webhook deliveries and synthetic test deliveries are suppressed until the usage window resets",
      usageWindowEndsAt: "2026-06-01T00:00:00.000Z",
      billingUrl: "https://app.debugbundle.test/billing?view=<usage>"
    });
    const retention = renderRetentionRotationNoticeEmail({
      organizationName: "Acme <Prod>",
      projectName: "checkout-<api>",
      rotatedOwnerCount: 3,
      retainedBundleLimit: 450,
      billingUrl: "https://app.debugbundle.test/billing?view=<usage>"
    });

    expect(warning.subject).toContain("80%");
    expect(warning.text).toContain("Usage: 8400 of 10500");
    expect(warning.text).toContain("Usage window ends: June 1, 2026");
    expect(warning.text).toContain("Increasing capacity units from billing raises this allowance immediately.");
    expect(warning.text).toContain("Open billing to increase capacity units: https://app.debugbundle.test/billing?view=<usage>");
    expect(warning.html).toContain("Acme &lt;Prod&gt;");
    expect(warning.html).toContain("checkout-&lt;api&gt;");
    expect(warning.html).toContain("June 1, 2026");
    expect(warning.html).toContain("Open billing to increase capacity");
    expect(limit.subject).toContain("limit reached");
    expect(limit.text).toContain("Lifecycle webhook deliveries");
    expect(limit.text).toContain("Usage window ends: June 1, 2026");
    expect(limit.html).toContain("suppressed until the usage window resets");
    expect(limit.html).toContain("June 1, 2026");
    expect(limit.html).toContain("Increasing capacity units from billing raises this allowance immediately.");
    expect(limit.html).toContain("Open billing to increase capacity");
    expect(retention.subject).toContain("rotated out");
    expect(retention.text).toContain("Rotated bundle owners: 3");
    expect(retention.text).toContain("Increasing capacity units from billing raises the retained bundle cap immediately.");
    expect(retention.text).toContain("Open billing to increase capacity units: https://app.debugbundle.test/billing?view=<usage>");
    expect(retention.html).toContain("Retention cap");
    expect(retention.html).toContain(">450<");
  });

  it("formats the product from email with a DebugBundle display name", () => {
    expect(formatProductFromEmail("noreply@debugbundle.com")).toBe("DebugBundle <noreply@debugbundle.com>");
    expect(formatProductFromEmail("DebugBundle <noreply@debugbundle.com>")).toBe("DebugBundle <noreply@debugbundle.com>");
  });

  it("sends ses requests and maps http, timeout, and transport failures", async () => {
    vi.useFakeTimers();

    sesSendMock
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce({ $metadata: { httpStatusCode: 502 } })
      .mockImplementationOnce(async (_input, options?: { abortSignal?: AbortSignal }) => {
        const signal = options?.abortSignal;
        return await new Promise<void>((_resolve, reject) => {
          signal?.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        });
      })
      .mockRejectedValueOnce(new Error("network_down"));

    const transport = createSesEmailTransport({
      region: "us-east-1",
      fromEmail: "DebugBundle <noreply@example.com>",
      timeoutMs: 10
    });

    await expect(
      transport.send({
        to: ["team@example.com"],
        subject: "Weekly report",
        text: "hello",
        html: "<p>hello</p>"
      })
    ).resolves.toBeUndefined();
    await expect(
      transport.send({
        to: ["team@example.com"],
        subject: "Weekly report",
        text: "hello",
        html: "<p>hello</p>"
      })
    ).rejects.toEqual(new EmailDeliveryError("email_http_error_502"));

    const timeoutPromise = transport.send({
      to: ["team@example.com"],
      subject: "Weekly report",
      text: "hello",
      html: "<p>hello</p>"
    });
    const timeoutExpectation = expect(timeoutPromise).rejects.toEqual(new EmailDeliveryError("email_timeout"));
    await vi.advanceTimersByTimeAsync(20);
    await timeoutExpectation;

    await expect(
      transport.send({
        to: ["team@example.com"],
        subject: "Weekly report",
        text: "hello",
        html: "<p>hello</p>"
      })
    ).rejects.toEqual(new EmailDeliveryError("email_transport_error:network_down"));

    expect(sesClientConfigSpy).toHaveBeenCalledWith({ region: "us-east-1" });
    expect(sendEmailCommandSpy).toHaveBeenCalled();
    expect(emailCommandCapture.lastInput).not.toBeNull();
    expect(typeof emailCommandCapture.lastInput).toBe("object");

    const commandInput = emailCommandCapture.lastInput as {
      FromEmailAddress?: string;
      Destination?: { ToAddresses?: string[] };
      Content?: { Simple?: unknown };
    };

    expect(commandInput.FromEmailAddress).toBe("DebugBundle <noreply@example.com>");
    expect(commandInput.Destination).toEqual({
      ToAddresses: ["team@example.com"]
    });
    expect(commandInput.Content?.Simple).toBeDefined();
  });
});
