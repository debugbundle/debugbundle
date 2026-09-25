import { describe, expect, it, vi } from "vitest";

import {
  assertAlertOutboundTarget,
  resolveAlertOutboundAddress
} from "../../../packages/storage/src/alert-outbound-guard.js";

describe("alert outbound target guard", () => {
  it.each([
    "http://127.0.0.1/alert",
    "http://169.254.169.254/latest/meta-data/",
    "https://[::1]/alert",
    "https://[::ffff:127.0.0.1]/alert",
    "http://localhost/alert",
    "https://alerts.internal/alert",
    "https://example.com:8443/alert",
    "https://user:password@example.com/alert"
  ])("rejects a private or unsafe destination before fetching %s", (target) => {
    expect(() => assertAlertOutboundTarget(target)).toThrow("alert_target_blocked");
  });

  it("accepts an external standard-port destination", () => {
    expect(assertAlertOutboundTarget("https://hooks.slack.com/services/T/B/X").hostname)
      .toBe("hooks.slack.com");
  });

  it("rejects a mixed DNS answer instead of connecting to its public address", async () => {
    const resolve = vi.fn().mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "169.254.169.254", family: 4 }
    ]);
    await expect(resolveAlertOutboundAddress("alerts.example.com", resolve))
      .rejects.toThrow("alert_target_blocked");
    expect(resolve).toHaveBeenCalledOnce();
  });

  it("rejects private IPv4-mapped IPv6 DNS answers", async () => {
    const resolve = vi.fn().mockResolvedValue([
      { address: "::ffff:127.0.0.1", family: 6 }
    ]);
    await expect(resolveAlertOutboundAddress("alerts.example.com", resolve))
      .rejects.toThrow("alert_target_blocked");
  });

  it("returns only the validated address used for the connection", async () => {
    const resolve = vi.fn().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    await expect(resolveAlertOutboundAddress("alerts.example.com", resolve))
      .resolves.toEqual({ address: "93.184.216.34", family: 4 });
  });
});
