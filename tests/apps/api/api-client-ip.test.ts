import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import { createApiServer } from "../../../apps/api/src/server.js";
import { createTrustedProxyPolicy } from "../../../apps/api/src/client-ip.js";

describe("explicit single-hop proxy trust", () => {
  it("disables forwarding trust by default and rejects broad or malformed settings", () => {
    expect(createTrustedProxyPolicy(undefined)).toBe(false);
    expect(createTrustedProxyPolicy(" ")).toBe(false);
    expect(() => createTrustedProxyPolicy(Array(17).fill("127.0.0.1").join(","))).toThrow(
      "API_TRUSTED_PROXY_IPS"
    );
    for (const value of ["true", "*", "172.18.0.0/16", "172.18.0.1,garbage"]) {
      expect(() => createTrustedProxyPolicy(value)).toThrow("API_TRUSTED_PROXY_IPS");
    }
  });
  it("trusts only the configured immediate hop, including IPv4-mapped peers", () => {
    const trust = createTrustedProxyPolicy("172.18.0.1,::1");
    expect(typeof trust).toBe("function");
    if (trust === false) throw new Error("missing policy");
    expect(trust("172.18.0.1", 0)).toBe(true);
    expect(trust("::ffff:172.18.0.1", 0)).toBe(true);
    expect(trust("172.18.0.1", 1)).toBe(false);
    expect(trust("198.51.100.1", 0)).toBe(false);
  });
  it("ignores spoofed forwarding on direct requests and uses only the rightmost client behind the managed proxy", async () => {
    const app = createApiServer({} as never, {
      dogfoodingEnv: { API_TRUSTED_PROXY_IPS: "172.18.0.1" }
    });
    app.get("/ip", async (request) => ({ ip: request.ip }));
    try {
      const direct = await app.inject({
        url: "/ip",
        remoteAddress: "203.0.113.10",
        headers: { "x-forwarded-for": "198.51.100.7" }
      });
      expect(direct.json()).toEqual({ ip: "203.0.113.10" });
      const proxied = await app.inject({
        url: "/ip",
        remoteAddress: "172.18.0.1",
        headers: { "x-forwarded-for": "198.51.100.7, 203.0.113.10" }
      });
      expect(proxied.json()).toEqual({ ip: "203.0.113.10" });
    } finally {
      await app.close();
    }
  });
  it("keeps forwarding disabled on an unconfigured API server", async () => {
    const app = Fastify({ trustProxy: createTrustedProxyPolicy(undefined) });
    app.get("/ip", async (request) => ({ ip: request.ip }));
    try {
      expect(
        (
          await app.inject({
            url: "/ip",
            remoteAddress: "203.0.113.10",
            headers: { "x-forwarded-for": "198.51.100.7" }
          })
        ).json()
      ).toEqual({ ip: "203.0.113.10" });
    } finally {
      await app.close();
    }
  });
});
