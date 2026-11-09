import { afterEach, describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ send: vi.fn(), config: vi.fn(), command: vi.fn() }));
vi.mock("@aws-sdk/client-sesv2", () => ({
  SESv2Client: vi.fn().mockImplementation(function (config: unknown) {
    fixture.config(config);
    return { send: fixture.send };
  }),
  SendEmailCommand: vi.fn().mockImplementation(function (input: unknown) {
    fixture.command(input);
    return { input };
  })
}));
import {
  createSesReportEmailTransport,
  ReportEmailTransportError
} from "../../../packages/email/src/ses-transport.js";
import { createSmartReportEmailSender } from "../../../apps/worker/src/smart-report-email-processor.js";
import { reportDocumentFixture } from "../../helpers/report-document.js";
const message = {
  to: ["verified@example.test"],
  subject: "Monthly report",
  text: "Canonical facts",
  html: "<p>Canonical facts</p>"
};
afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});
describe("receipt-aware report email transport", () => {
  it("composes the worker's optional sender with a bounded fallback deadline and only the verified recipient", async () => {
    expect(createSmartReportEmailSender({})).toBeNull();
    fixture.send.mockResolvedValueOnce({ MessageId: "report-worker-accepted" });
    const send = createSmartReportEmailSender({
      SES_FROM_EMAIL: "reports@example.test",
      SES_REGION: "us-east-1",
      APP_BASE_URL: "https://app.example.test",
      WEEKLY_REPORT_EMAIL_TIMEOUT_MS: "invalid"
    });
    if (send === null) throw new Error("configured sender missing");
    expect(
      await send({
        recipient: "verified@example.test",
        view: { document: reportDocumentFixture(), available_source_refs: [] }
      })
    ).toEqual({ provider_message_id: "report-worker-accepted" });
    expect(fixture.command).toHaveBeenCalledWith(
      expect.objectContaining({ Destination: { ToAddresses: ["verified@example.test"] } })
    );
    expect(fixture.send).toHaveBeenCalledOnce();
  });
  it("returns an uncertain outcome at its deadline even when a transport ignores abort", async () => {
    vi.useFakeTimers();
    fixture.send.mockImplementationOnce(() => new Promise(() => {}));
    const transport = createSesReportEmailTransport({
        region: "us-east-1",
        fromEmail: "reports@example.test",
        timeoutMs: 20000
      }),
      settled = vi.fn();
    void transport.send(message).catch(settled);
    await vi.advanceTimersByTimeAsync(20000);
    expect(settled).toHaveBeenCalledWith(new ReportEmailTransportError("uncertain"));
  });
  it("uses one SDK attempt and returns the acceptance receipt for one recipient", async () => {
    fixture.send.mockResolvedValueOnce({ MessageId: "provider-accepted-123" });
    const transport = createSesReportEmailTransport({
      region: "us-east-1",
      fromEmail: "reports@example.test",
      timeoutMs: 10000
    });
    expect(fixture.config).toHaveBeenCalledWith({ region: "us-east-1", maxAttempts: 1 });
    expect(await transport.send(message)).toEqual({ provider_message_id: "provider-accepted-123" });
    expect(fixture.command).toHaveBeenCalledWith(
      expect.objectContaining({ Destination: { ToAddresses: ["verified@example.test"] } })
    );
    expect(fixture.send).toHaveBeenCalledOnce();
  });
  it("rejects multiple recipients or oversized content before invoking SES", async () => {
    const transport = createSesReportEmailTransport({
      region: "us-east-1",
      fromEmail: "reports@example.test",
      timeoutMs: 10000
    });
    await expect(
      transport.send({ ...message, to: ["first@example.test", "second@example.test"] })
    ).rejects.toMatchObject({ state: "rejected" });
    await expect(
      transport.send({ ...message, html: "x".repeat(128 * 1024 + 1) })
    ).rejects.toMatchObject({ state: "rejected" });
    expect(fixture.send).not.toHaveBeenCalled();
  });
  it("distinguishes explicit rejection from uncertain server/network outcomes and withholds private provider text", async () => {
    const transport = createSesReportEmailTransport({
      region: "us-east-1",
      fromEmail: "reports@example.test",
      timeoutMs: 10000
    });
    fixture.send
      .mockRejectedValueOnce({
        $metadata: { httpStatusCode: 400 },
        message: "synthetic private body"
      })
      .mockRejectedValueOnce({
        $metadata: { httpStatusCode: 500 },
        message: "synthetic private body"
      })
      .mockRejectedValueOnce(new Error("synthetic private body"));
    await expect(transport.send(message)).rejects.toEqual(
      new ReportEmailTransportError("rejected")
    );
    await expect(transport.send(message)).rejects.toEqual(
      new ReportEmailTransportError("uncertain")
    );
    await expect(transport.send(message)).rejects.toEqual(
      new ReportEmailTransportError("uncertain")
    );
    expect(fixture.send).toHaveBeenCalledTimes(3);
  });
  it("caps the provider wait at twenty seconds and records a timeout as uncertain without retry", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    fixture.send.mockImplementationOnce(
      (_command: unknown, options: { abortSignal: AbortSignal }) => {
        signal = options.abortSignal;
        return new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(new Error("private timeout")));
        });
      }
    );
    const transport = createSesReportEmailTransport({
        region: "us-east-1",
        fromEmail: "reports@example.test",
        timeoutMs: 60000
      }),
      send = transport.send(message),
      refused = expect(send).rejects.toEqual(new ReportEmailTransportError("uncertain"));
    await vi.advanceTimersByTimeAsync(20000);
    await refused;
    expect(signal?.aborted).toBe(true);
    expect(fixture.send).toHaveBeenCalledOnce();
  });
});
