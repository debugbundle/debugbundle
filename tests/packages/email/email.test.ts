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
  renderEmailAuthCodeEmail,
  renderOrganizationInviteEmail,
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
    const invite = renderOrganizationInviteEmail({ acceptUrl: "https://debugbundle.test/accept?token=<secret>" });

    expect(emailCode.subject).toContain("sign-in code");
    expect(emailCode.text).toContain("12<3456>");
    expect(emailCode.text).toContain("https://debugbundle.test/login?next=<dashboard>");
    expect(emailCode.html).toContain("12&lt;3456&gt;");
    expect(emailCode.html).toContain("&lt;dashboard&gt;");
    expect(invite.subject).toContain("invited");
    expect(invite.text).toContain("https://debugbundle.test/accept?token=<secret>");
    expect(invite.html).toContain("&lt;secret&gt;");
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
      fromEmail: "noreply@example.com",
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

    expect(commandInput.FromEmailAddress).toBe("noreply@example.com");
    expect(commandInput.Destination).toEqual({
      ToAddresses: ["team@example.com"]
    });
    expect(commandInput.Content?.Simple).toBeDefined();
  });
});