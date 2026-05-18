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
  renderEmailAuthCodeEmail,
  renderProjectInviteEmail,
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
    expect(rendered.text).toContain("Top spiking incidents:\nNone");
    expect(rendered.html).toContain("proj_&lt;123&gt;");
    expect(rendered.html).toContain("<p>None</p>");
  });

  it("renders email auth code and invite emails with escaped content", () => {
    const emailCode = renderEmailAuthCodeEmail({
      code: "12<3456>",
      appUrl: "https://debugbundle.test/login?next=<dashboard>",
      expiresInMinutes: 10
    });
    const invite = renderProjectInviteEmail({ acceptUrl: "https://debugbundle.test/accept?token=<secret>" });

    expect(emailCode.subject).toContain("sign-in code");
    expect(emailCode.text).toContain("12<3456>");
    expect(emailCode.text).toContain("https://debugbundle.test/login?next=<dashboard>");
    expect(emailCode.html).toContain("12&lt;3456&gt;");
    expect(emailCode.html).toContain("&lt;dashboard&gt;");
    expect(invite.subject).toContain("project was shared");
    expect(invite.text).toContain("https://debugbundle.test/accept?token=<secret>");
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
    expect(rendered.text).toContain("Open incident: https://app.debugbundle.com/incidents/inc_<123>");
    expect(rendered.html).toContain("checkout-&lt;api&gt;");
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
    expect(rendered.html).toContain("Checkout crash");
    expect(rendered.html).toContain("checkout-&lt;api&gt;");
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
