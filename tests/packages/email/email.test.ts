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
  renderRetentionRotationNoticeEmail,
  renderWebhookAutoDisabledEmail,
  renderWeeklyReportEmail
} from "../../../packages/email/src/index.js";

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
      projectId: "proj_<123>",
      windowStart: "2026-03-09T00:00:00.000Z",
      windowEnd: "2026-03-16T00:00:00.000Z",
      bundleCounts: {
        failure: 2,
        improvement: 1
      },
      newIncidents: 3,
      regressions: 1,
      topSpikingIncidents: []
    });

    expect(rendered.subject).toContain("proj_<123>");
    expect(rendered.text).toContain("Window: March 9, 2026 to March 16, 2026");
    expect(rendered.text).toContain("Top spiking incidents:\nNone");
    expect(rendered.html).toContain("proj_&lt;123&gt;");
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
    expect(emailCode.html).toContain("12&lt;3456&gt;");
    expect(emailCode.html).toContain("&lt;dashboard&gt;");
    expect(invite.subject).toContain("project was shared");
    expect(invite.text).toContain("Owen Example shared a DebugBundle project with you.");
    expect(invite.text).toContain("https://debugbundle.test/accept?token=<secret>");
    expect(invite.html).toContain("Owen Example");
    expect(invite.html).toContain("&lt;secret&gt;");
  });

  it("renders alert emails with human copy and links", () => {
    const rendered = renderAlertEmail({
      conditionType: "new_incident",
      incidentId: "inc_<123>",
      occurredAt: "2026-05-13T08:33:56.774Z",
      serviceName: "checkout-<api>",
      environment: "production",
      severity: "high",
      incidentUrl: "https://app.debugbundle.com/incidents/inc_<123>",
      bundleUrl: "https://api.debugbundle.com/v1/incidents/inc_<123>/bundle"
    });

    expect(rendered.subject).toBe("[DebugBundle Alert] A new incident was detected");
    expect(rendered.text).toContain("Service: checkout-<api>");
    expect(rendered.text).toContain("Detected at: May 13, 2026, 8:33 AM UTC");
    expect(rendered.text).toContain("Open incident: https://app.debugbundle.com/incidents/inc_<123>");
    expect(rendered.html).toContain("checkout-&lt;api&gt;");
    expect(rendered.html).toContain("May 13, 2026, 8:33 AM UTC");
    expect(rendered.html).toContain("&lt;123&gt;");
    expect(rendered.html).toContain("Open incident in DebugBundle");
  });

  it("renders alert digest emails with grouped incidents", () => {
    const rendered = renderAlertDigestEmail({
      alerts: [
        {
          conditionType: "new_incident",
          incidentId: "inc_1",
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
    expect(rendered.text).toContain("Alerts: New incident, Severity threshold reached");
    expect(rendered.text).toContain("Detected at: May 17, 2026, 10:00 AM UTC");
    expect(rendered.html).toContain("Checkout crash");
    expect(rendered.html).toContain("checkout-&lt;api&gt;");
    expect(rendered.html).toContain("May 17, 2026, 10:00 AM UTC");
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
