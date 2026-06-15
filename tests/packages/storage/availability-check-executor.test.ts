import { beforeEach, describe, expect, it, vi } from "vitest";

const { lookupMock } = vi.hoisted(() => ({
  lookupMock: vi.fn()
}));

vi.mock("node:dns/promises", () => ({
  lookup: lookupMock
}));

import {
  AvailabilityCheckValidationError,
  executeAvailabilityCheck,
  validateAvailabilityCheckDefinition
} from "../../../packages/storage/src/availability-check-executor.js";

describe("availability check executor validation", () => {
  beforeEach(() => {
    lookupMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("rejects embedded credentials", async () => {
    await expect(
      validateAvailabilityCheckDefinition({
        url: "https://user:pass@example.com/health",
        method: "GET",
        expected_status_min: 200,
        expected_status_max: 399,
        timeout_ms: 5000
      })
    ).rejects.toEqual(
      expect.objectContaining<Partial<AvailabilityCheckValidationError>>({
        code: "credentials_not_allowed"
      })
    );
  });

  it("rejects blocked ports", async () => {
    await expect(
      validateAvailabilityCheckDefinition({
        url: "https://example.com:8443/health",
        method: "GET",
        expected_status_min: 200,
        expected_status_max: 399,
        timeout_ms: 5000
      })
    ).rejects.toEqual(
      expect.objectContaining<Partial<AvailabilityCheckValidationError>>({
        code: "blocked_port"
      })
    );
  });

  it("rejects unsupported protocols and embedded private host suffixes", async () => {
    await expect(
      validateAvailabilityCheckDefinition({
        url: "ftp://example.com/health",
        method: "GET",
        expected_status_min: 200,
        expected_status_max: 399,
        timeout_ms: 5000
      })
    ).rejects.toEqual(
      expect.objectContaining<Partial<AvailabilityCheckValidationError>>({
        code: "invalid_protocol"
      })
    );

    await expect(
      validateAvailabilityCheckDefinition({
        url: "https://api.internal/health",
        method: "GET",
        expected_status_min: 200,
        expected_status_max: 399,
        timeout_ms: 5000
      })
    ).rejects.toEqual(
      expect.objectContaining<Partial<AvailabilityCheckValidationError>>({
        code: "blocked_hostname"
      })
    );
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it("rejects localhost and private hostnames before DNS lookup", async () => {
    await expect(
      validateAvailabilityCheckDefinition({
        url: "http://localhost/health",
        method: "GET",
        expected_status_min: 200,
        expected_status_max: 399,
        timeout_ms: 5000
      })
    ).rejects.toEqual(
      expect.objectContaining<Partial<AvailabilityCheckValidationError>>({
        code: "blocked_hostname"
      })
    );
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it("rejects private or metadata IP targets after DNS resolution", async () => {
    lookupMock.mockResolvedValue([{ address: "169.254.169.254", family: 4 }]);

    await expect(
      validateAvailabilityCheckDefinition({
        url: "https://metadata.example.test/health",
        method: "HEAD",
        expected_status_min: 200,
        expected_status_max: 399,
        timeout_ms: 5000
      })
    ).rejects.toEqual(
      expect.objectContaining<Partial<AvailabilityCheckValidationError>>({
        code: "blocked_address"
      })
    );
  });

  it("rejects unsafe IPv6, invalid, empty, and failed DNS resolution results", async () => {
    lookupMock.mockResolvedValueOnce([{ address: "fd00::1", family: 6 }]);
    await expect(
      validateAvailabilityCheckDefinition({
        url: "https://private-ipv6.example.test/health",
        method: "GET",
        expected_status_min: 200,
        expected_status_max: 399,
        timeout_ms: 5000
      })
    ).rejects.toEqual(
      expect.objectContaining<Partial<AvailabilityCheckValidationError>>({
        code: "blocked_address"
      })
    );

    lookupMock.mockResolvedValueOnce([{ address: "not-an-ip", family: 4 }]);
    await expect(
      validateAvailabilityCheckDefinition({
        url: "https://invalid-resolution.example.test/health",
        method: "GET",
        expected_status_min: 200,
        expected_status_max: 399,
        timeout_ms: 5000
      })
    ).rejects.toEqual(
      expect.objectContaining<Partial<AvailabilityCheckValidationError>>({
        code: "invalid_address"
      })
    );

    lookupMock.mockResolvedValueOnce([]);
    await expect(
      validateAvailabilityCheckDefinition({
        url: "https://empty-resolution.example.test/health",
        method: "GET",
        expected_status_min: 200,
        expected_status_max: 399,
        timeout_ms: 5000
      })
    ).rejects.toEqual(
      expect.objectContaining<Partial<AvailabilityCheckValidationError>>({
        code: "dns_lookup_failed"
      })
    );

    lookupMock.mockRejectedValueOnce(new Error("ENOTFOUND missing.example.test"));
    await expect(
      validateAvailabilityCheckDefinition({
        url: "https://missing.example.test/health",
        method: "GET",
        expected_status_min: 200,
        expected_status_max: 399,
        timeout_ms: 5000
      })
    ).rejects.toEqual(
      expect.objectContaining<Partial<AvailabilityCheckValidationError>>({
        code: "dns_lookup_failed"
      })
    );
  });

  it("accepts standard public https targets", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);

    await expect(
      validateAvailabilityCheckDefinition({
        url: "https://example.com/health",
        method: "GET",
        expected_status_min: 200,
        expected_status_max: 399,
        timeout_ms: 5000
      })
    ).resolves.toEqual({
      normalized_url: "https://example.com/health"
    });
  });

  it("redacts query values from retained execution evidence", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(null, {
          status: 200
        })
      )
    );

    const result = await executeAvailabilityCheck({
      url: "https://example.com/health?token=secret&tenant=acme#fragment",
      method: "GET",
      expected_status_min: 200,
      expected_status_max: 399,
      timeout_ms: 5000
    });

    expect(result.checked_url_query).toEqual({
      tenant: "[redacted]",
      token: "[redacted]"
    });
    expect(result.final_url).toBe(
      "https://example.com/health?token=%5Bredacted%5D&tenant=%5Bredacted%5D"
    );
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(JSON.stringify(result)).not.toContain("fragment");
  });

  it("reports status mismatches without throwing", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(null, {
          status: 503
        })
      )
    );

    const result = await executeAvailabilityCheck({
      url: "https://example.com/health",
      method: "HEAD",
      expected_status_min: 200,
      expected_status_max: 399,
      timeout_ms: 5000
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: "http_status_mismatch",
        http_status: 503,
        error_kind: "http_status_mismatch",
        redirect_count: 0
      })
    );
    expect(result.error_message).toContain("Expected 200-399 but received 503.");
  });

  it("follows safe redirects and blocks unsafe redirect targets", async () => {
    lookupMock
      .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
      .mockResolvedValueOnce([{ address: "93.184.216.35", family: 4 }])
      .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
      .mockResolvedValueOnce([{ address: "10.0.0.5", family: 4 }]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "https://www.example.com/ready" } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "https://internal.example.test/health" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      executeAvailabilityCheck({
        url: "https://example.com/start",
        method: "GET",
        expected_status_min: 200,
        expected_status_max: 299,
        timeout_ms: 5000
      })
    ).resolves.toEqual(
      expect.objectContaining({
        status: "success",
        http_status: 204,
        checked_url_host: "www.example.com",
        checked_url_path: "/ready",
        redirect_count: 1
      })
    );

    const blocked = await executeAvailabilityCheck({
      url: "https://example.com/start",
      method: "GET",
      expected_status_min: 200,
      expected_status_max: 299,
      timeout_ms: 5000
    });

    expect(blocked).toEqual(
      expect.objectContaining({
        status: "security_blocked",
        http_status: null,
        error_kind: "blocked_address",
        checked_url_host: "example.com",
        redirect_count: 0
      })
    );
  });

  it("blocks redirect chains after the maximum redirect count", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: "/next" } }))
    );

    const result = await executeAvailabilityCheck({
      url: "https://example.com/start",
      method: "GET",
      expected_status_min: 200,
      expected_status_max: 299,
      timeout_ms: 5000
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: "redirect_blocked",
        http_status: 302,
        error_kind: "too_many_redirects",
        redirect_count: 3
      })
    );
  });

  it("classifies fetch failures into stable availability statuses", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new DOMException("aborted", "AbortError"))
      .mockRejectedValueOnce(new Error("certificate expired"))
      .mockRejectedValueOnce(new Error("ENOTFOUND app.example.test"))
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockRejectedValueOnce(new Error("unexpected parser failure"));
    vi.stubGlobal("fetch", fetchMock);

    const base = {
      url: "https://example.com/health",
      method: "GET" as const,
      expected_status_min: 200,
      expected_status_max: 399,
      timeout_ms: 5000
    };

    await expect(executeAvailabilityCheck(base)).resolves.toEqual(
      expect.objectContaining({ status: "timeout", error_kind: "timeout" })
    );
    await expect(executeAvailabilityCheck(base)).resolves.toEqual(
      expect.objectContaining({ status: "tls_error", error_kind: "tls_error" })
    );
    await expect(executeAvailabilityCheck(base)).resolves.toEqual(
      expect.objectContaining({ status: "dns_error", error_kind: "dns_error" })
    );
    await expect(executeAvailabilityCheck(base)).resolves.toEqual(
      expect.objectContaining({ status: "connection_error", error_kind: "connection_error" })
    );
    await expect(executeAvailabilityCheck(base)).resolves.toEqual(
      expect.objectContaining({ status: "internal_error", error_kind: "internal_error" })
    );
  });
});
