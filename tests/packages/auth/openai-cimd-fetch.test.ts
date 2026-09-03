import { describe, expect, it, vi } from "vitest";

const { lookupHost } = vi.hoisted(() => ({
  lookupHost: vi.fn()
}));
const networkMocks = vi.hoisted(() => ({
  agentClose: vi.fn(async () => undefined),
  pinnedLookup: undefined as unknown,
  undiciFetch: vi.fn()
}));

vi.mock("node:dns/promises", () => ({ lookup: lookupHost }));
vi.mock("undici", () => ({
  Agent: class {
    public constructor(options: { connect: { lookup: unknown } }) {
      networkMocks.pinnedLookup = options.connect.lookup;
    }

    public close = networkMocks.agentClose;
  },
  fetch: networkMocks.undiciFetch
}));

import {
  OPENAI_CIMD_CLIENT_ID,
  OPENAI_CIMD_JWKS_URI,
  createOpenAiCimdFetch
} from "../../../packages/auth/src/index.js";

const PUBLIC_IPV4 = { address: "8.8.8.8", family: 4 as const };
const PUBLIC_IPV6 = { address: "2606:4700:4700::1111", family: 6 as const };

describe("OpenAI CIMD safe fetch", () => {
  it("uses the shared bounded cache and avoids DNS and network work on a hit", async () => {
    const lookup = vi.fn(async () => [PUBLIC_IPV4]);
    const fetchImpl = vi.fn(async () => new Response("network")) as typeof fetch;
    const cache = {
      getOpenAiCimdResponse: vi.fn(async () =>
        JSON.stringify({
          body: Buffer.from('{"client_id":"cached"}', "utf8").toString("base64"),
          headers: [["content-type", "application/json"]],
          status: 200,
          statusText: "OK"
        })
      ),
      setOpenAiCimdResponse: vi.fn()
    };
    const safeFetch = createOpenAiCimdFetch(fetchImpl, { cache, lookup });

    const response = await safeFetch(OPENAI_CIMD_CLIENT_ID);

    await expect(response.json()).resolves.toEqual({ client_id: "cached" });
    expect(cache.getOpenAiCimdResponse).toHaveBeenCalledWith(OPENAI_CIMD_CLIENT_ID);
    expect(cache.setOpenAiCimdResponse).not.toHaveBeenCalled();
    expect(lookup).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("writes only successful bounded responses to the shared five-minute cache", async () => {
    const cache = {
      getOpenAiCimdResponse: vi.fn(async () => undefined),
      setOpenAiCimdResponse: vi.fn(async (url: string, response: string, ttlMs: number) => {
        void url;
        void response;
        void ttlMs;
      })
    };
    const safeFetch = createOpenAiCimdFetch(
      vi.fn(
        async () =>
          new Response('{"client_id":"network"}', {
            status: 200,
            headers: { "content-type": "application/json" }
          })
      ) as typeof fetch,
      { cache, lookup: vi.fn(async () => [PUBLIC_IPV4]) }
    );

    const response = await safeFetch(OPENAI_CIMD_CLIENT_ID);

    await expect(response.json()).resolves.toEqual({ client_id: "network" });
    expect(cache.setOpenAiCimdResponse).toHaveBeenCalledWith(
      OPENAI_CIMD_CLIENT_ID,
      expect.any(String),
      300_000
    );
    const cached = JSON.parse(cache.setOpenAiCimdResponse.mock.calls[0]![1]) as {
      body: string;
      status: number;
    };
    expect(cached.status).toBe(200);
    expect(Buffer.from(cached.body, "base64").toString("utf8")).toBe('{"client_id":"network"}');
  });

  it("fails closed when shared CIMD cache coordination is unavailable", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}")) as typeof fetch;
    const safeFetch = createOpenAiCimdFetch(fetchImpl, {
      cache: {
        getOpenAiCimdResponse: vi.fn(async () => {
          throw new Error("redis unavailable");
        }),
        setOpenAiCimdResponse: vi.fn()
      },
      lookup: vi.fn(async () => [PUBLIC_IPV4])
    });

    await expect(safeFetch(OPENAI_CIMD_CLIENT_ID)).rejects.toThrow("redis unavailable");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("resolves public addresses, forces manual redirects, and returns a bounded response", async () => {
    const fetchImpl = vi.fn(async (_input: URL | RequestInfo, init?: RequestInit) => {
      expect(init?.redirect).toBe("manual");
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return new Response('{"client_id":"fixture"}', {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }) as typeof fetch;
    const safeFetch = createOpenAiCimdFetch(fetchImpl, {
      lookup: vi.fn(async () => [PUBLIC_IPV4, PUBLIC_IPV6])
    });

    const response = await safeFetch(OPENAI_CIMD_CLIENT_ID);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ client_id: "fixture" });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("uses the system resolver when a test or caller does not supply one", async () => {
    lookupHost.mockResolvedValueOnce([
      { address: PUBLIC_IPV4.address, family: PUBLIC_IPV4.family },
      { address: PUBLIC_IPV6.address, family: PUBLIC_IPV6.family }
    ]);
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 })) as typeof fetch;
    const safeFetch = createOpenAiCimdFetch(fetchImpl);

    await expect(safeFetch(OPENAI_CIMD_CLIENT_ID)).resolves.toHaveProperty("status", 200);
    expect(lookupHost).toHaveBeenCalledWith("chatgpt.com", { all: true, verbatim: true });
  });

  it("pins the validated DNS answers for the default transport", async () => {
    networkMocks.undiciFetch.mockResolvedValue(new Response("{}", { status: 200 }));
    const safeFetch = createOpenAiCimdFetch(undefined, {
      lookup: vi.fn(async () => [PUBLIC_IPV4, PUBLIC_IPV6])
    });

    await expect(safeFetch(OPENAI_CIMD_CLIENT_ID)).resolves.toHaveProperty("status", 200);
    expect(networkMocks.agentClose).toHaveBeenCalledOnce();

    const pinnedLookup = networkMocks.pinnedLookup as (
      hostname: string,
      options: { all?: boolean; family?: number },
      callback: (...values: unknown[]) => void
    ) => void;
    const allCallback = vi.fn();
    pinnedLookup("chatgpt.com", { all: true }, allCallback);
    expect(allCallback).toHaveBeenCalledWith(null, [PUBLIC_IPV4, PUBLIC_IPV6]);

    const singleCallback = vi.fn();
    pinnedLookup("chatgpt.com", { family: 6 }, singleCallback);
    expect(singleCallback).toHaveBeenCalledWith(null, PUBLIC_IPV6.address, 6);

    const ipv4OnlyFetch = createOpenAiCimdFetch(undefined, {
      lookup: vi.fn(async () => [PUBLIC_IPV4])
    });
    await expect(ipv4OnlyFetch(OPENAI_CIMD_JWKS_URI)).resolves.toHaveProperty("status", 200);
    const ipv4OnlyLookup = networkMocks.pinnedLookup as typeof pinnedLookup;
    const unavailableCallback = vi.fn();
    ipv4OnlyLookup("chatgpt.com", { family: 6 }, unavailableCallback);
    expect(unavailableCallback).toHaveBeenCalledWith(
      expect.objectContaining({ code: "ENOTFOUND" }),
      ""
    );
  });

  it("rejects every URL outside the exact CIMD metadata and JWKS allowlist before DNS", async () => {
    const lookup = vi.fn(async () => [PUBLIC_IPV4]);
    const fetchImpl = vi.fn(async () => new Response("{}")) as typeof fetch;
    const safeFetch = createOpenAiCimdFetch(fetchImpl, { lookup });

    await expect(safeFetch("https://attacker.example/client.json")).rejects.toThrow(
      "oauth_cimd_fetch_url_not_allowed"
    );
    await expect(safeFetch(`${OPENAI_CIMD_JWKS_URI}?unexpected=true`)).rejects.toThrow(
      "oauth_cimd_fetch_url_not_allowed"
    );
    expect(lookup).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    { addresses: [{ address: "127.0.0.1", family: 4 as const }] },
    { addresses: [{ address: "169.254.169.254", family: 4 as const }] },
    { addresses: [{ address: "10.0.0.1", family: 4 as const }] },
    { addresses: [{ address: "192.0.2.1", family: 4 as const }] },
    { addresses: [{ address: "::1", family: 6 as const }] },
    { addresses: [{ address: "::ffff:10.0.0.1", family: 6 as const }] },
    { addresses: [{ address: "fd00::1", family: 6 as const }] },
    { addresses: [{ address: "fe80::1", family: 6 as const }] },
    { addresses: [{ address: "2001:db8::1", family: 6 as const }] },
    { addresses: [PUBLIC_IPV4, { address: "10.0.0.1", family: 4 as const }] }
  ])(
    "rejects a private, reserved, or mixed DNS answer before connecting",
    async ({ addresses }) => {
      const fetchImpl = vi.fn(async () => new Response("{}")) as typeof fetch;
      const safeFetch = createOpenAiCimdFetch(fetchImpl, {
        lookup: vi.fn(async () => addresses)
      });

      await expect(safeFetch(OPENAI_CIMD_CLIENT_ID)).rejects.toThrow(
        "oauth_cimd_address_not_allowed"
      );
      expect(fetchImpl).not.toHaveBeenCalled();
    }
  );

  it("rejects empty DNS, redirects, and oversized metadata responses", async () => {
    const emptyDns = createOpenAiCimdFetch(vi.fn() as typeof fetch, {
      lookup: vi.fn(async () => [])
    });
    await expect(emptyDns(OPENAI_CIMD_CLIENT_ID)).rejects.toThrow("oauth_cimd_dns_lookup_empty");

    const redirect = createOpenAiCimdFetch(
      vi.fn(
        async () => new Response(null, { status: 302, headers: { location: OPENAI_CIMD_JWKS_URI } })
      ) as typeof fetch,
      { lookup: vi.fn(async () => [PUBLIC_IPV4]) }
    );
    await expect(redirect(OPENAI_CIMD_CLIENT_ID)).rejects.toThrow(
      "oauth_cimd_redirect_not_allowed"
    );

    const oversized = createOpenAiCimdFetch(
      vi.fn(async () => new Response("12345")) as typeof fetch,
      { lookup: vi.fn(async () => [PUBLIC_IPV4]), responseLimitBytes: 4 }
    );
    await expect(oversized(OPENAI_CIMD_CLIENT_ID)).rejects.toThrow("oauth_cimd_response_too_large");
  });

  it("applies one total deadline to DNS and network work", async () => {
    const safeFetch = createOpenAiCimdFetch(vi.fn() as typeof fetch, {
      lookup: vi.fn(() => new Promise<never>(() => undefined)),
      timeoutMs: 5
    });

    await expect(safeFetch(OPENAI_CIMD_CLIENT_ID)).rejects.toThrow("oauth_cimd_fetch_timeout");
  });
});
