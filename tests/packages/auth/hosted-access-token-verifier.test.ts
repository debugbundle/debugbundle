import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  createHostedAccessTokenVerifier,
  createOpenAiAccessTokenVerifier,
  OPENAI_HOSTED_MCP_SCOPES
} from "../../../packages/auth/src/index.js";

let privateKey: Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];
let jwks: { keys: Array<Record<string, unknown>> };
const openai = {
  profileId: "openai" as const,
  issuer: "https://api.debugbundle.com",
  resource: "https://mcp.debugbundle.com",
  clientId: "https://chatgpt.com/oauth/client.json",
  scopes: [...OPENAI_HOSTED_MCP_SCOPES],
  accessTokenTtlSeconds: 720
};
// Protocol-only fixtures: these are deliberately not real Muse client details.
const muse = {
  ...openai,
  profileId: "muse" as const,
  issuer: "https://issuer.example.test/muse",
  resource: "https://mcp.debugbundle.com/muse/mcp",
  clientId: "synthetic-muse-client"
};

beforeAll(async () => {
  const pair = await generateKeyPair("RS256", { extractable: true });
  privateKey = pair.privateKey;
  jwks = { keys: [{ ...(await exportJWK(pair.publicKey)), kid: "test", alg: "RS256" }] };
});

async function sign(
  profile: Pick<typeof openai, "issuer" | "resource" | "clientId" | "accessTokenTtlSeconds">,
  overrides: Record<string, unknown> = {},
  header: Record<string, unknown> = {}
): Promise<string> {
  const now = Math.floor(Date.now() / 1_000);
  return new SignJWT({
    iss: profile.issuer,
    aud: profile.resource,
    sub: "synthetic-user",
    client_id: profile.clientId,
    scope: "debugbundle:projects:read",
    grant_id: "synthetic-grant",
    organization_id: "synthetic-org",
    iat: now,
    nbf: now,
    exp: now + profile.accessTokenTtlSeconds,
    jti: "synthetic-token",
    ...overrides
  })
    .setProtectedHeader({ alg: "RS256", kid: "test", typ: "at+jwt", ...header })
    .sign(privateKey);
}

describe("explicit hosted access-token profiles", () => {
  it("binds a path resource and backing grant to one server-owned profile", async () => {
    const isGrantActive = vi.fn(async () => true);
    const verifier = createHostedAccessTokenVerifier(muse, { jwks, isGrantActive });
    const token = await sign(muse);
    await expect(verifier.verifyAccessToken(token)).resolves.toMatchObject({
      token,
      clientId: muse.clientId,
      resource: new URL(muse.resource),
      extra: {
        userId: "synthetic-user",
        organizationId: "synthetic-org",
        grantId: "synthetic-grant"
      }
    });
    expect(isGrantActive).toHaveBeenCalledWith({
      profileId: "muse",
      issuer: muse.issuer,
      resource: muse.resource,
      clientId: muse.clientId,
      userId: "synthetic-user",
      organizationId: "synthetic-org",
      grantId: "synthetic-grant",
      scopes: ["debugbundle:projects:read"]
    });
  });

  it("rejects both directions across clients even when signing keys are shared", async () => {
    const isGrantActive = vi.fn(async () => true);
    const openaiVerifier = createOpenAiAccessTokenVerifier({ jwks, isGrantActive });
    const museVerifier = createHostedAccessTokenVerifier(muse, { jwks, isGrantActive });
    await expect(openaiVerifier.verifyAccessToken(await sign(muse))).rejects.toThrow(
      "openai_access_token_invalid"
    );
    await expect(museVerifier.verifyAccessToken(await sign(openai))).rejects.toThrow(
      "muse_access_token_invalid"
    );
    expect(isGrantActive).not.toHaveBeenCalled();
  });

  it.each([
    { aud: "https://mcp.debugbundle.com" },
    { aud: "https://mcp.debugbundle.com/muse/mcp/" },
    { aud: [muse.resource, openai.resource] },
    { iss: openai.issuer },
    { client_id: openai.clientId },
    { scope: "debugbundle:projects:read debugbundle:projects:read" },
    { scope: "debugbundle:projects:write" },
    { scope: "openid" },
    { scope: "" },
    { sub: "" },
    { grant_id: 42 },
    { organization_id: null },
    { email: "synthetic@example.test" },
    { email_verified: true },
    { exp: 1 },
    { iat: 1 },
    { nbf: 1 },
    { jti: undefined }
  ])("rejects mismatched or malformed claims before storage: %j", async (claims) => {
    const isGrantActive = vi.fn(async () => true);
    const verifier = createHostedAccessTokenVerifier(muse, { jwks, isGrantActive });
    await expect(verifier.verifyAccessToken(await sign(muse, claims))).rejects.toThrow(
      "muse_access_token_invalid"
    );
    expect(isGrantActive).not.toHaveBeenCalled();
  });

  it("rejects a wrong token type, malformed credential, retired key and exact lifetime mismatch", async () => {
    const verifier = createHostedAccessTokenVerifier(muse, {
      jwks,
      isGrantActive: async () => true
    });
    for (const token of [
      "dbundle_mem_synthetic",
      "dbundle_proj_synthetic",
      await sign(muse, {}, { typ: "JWT" }),
      await sign(muse, {}, { kid: "retired" }),
      await sign({ ...muse, accessTokenTtlSeconds: 721 })
    ]) {
      await expect(verifier.verifyAccessToken(token)).rejects.toThrow("muse_access_token_invalid");
    }
  });

  it("withholds dependency errors and revoked or inaccessible grants", async () => {
    for (const isGrantActive of [
      async () => false,
      async (): Promise<boolean> => {
        throw new Error("private database detail");
      }
    ]) {
      const verifier = createHostedAccessTokenVerifier(muse, { jwks, isGrantActive });
      await expect(verifier.verifyAccessToken(await sign(muse))).rejects.toThrow(
        /^muse_access_token_invalid$/
      );
    }
  });

  it("freezes profile and scope inputs against later configuration mutation", async () => {
    const profile = { ...muse, scopes: ["debugbundle:projects:read"] };
    const verifier = createHostedAccessTokenVerifier(profile, {
      jwks,
      isGrantActive: async () => true
    });
    profile.clientId = openai.clientId;
    profile.resource = openai.resource;
    profile.scopes.push("debugbundle:incidents:read");
    await expect(verifier.verifyAccessToken(await sign(muse))).resolves.toMatchObject({
      clientId: muse.clientId
    });
    await expect(verifier.verifyAccessToken(await sign(profile))).rejects.toThrow(
      "muse_access_token_invalid"
    );
    await expect(
      verifier.verifyAccessToken(await sign(muse, { scope: "debugbundle:incidents:read" }))
    ).rejects.toThrow("muse_access_token_invalid");
  });

  it.each([
    { issuer: "not-a-uri" },
    { issuer: "http://issuer.example.test" },
    { issuer: "https://issuer.example.test/?" },
    { resource: "https://mcp.example.test/mcp#" },
    { issuer: "https://issuer.example.test/#fragment" },
    { resource: "https://user:password@mcp.example.test/mcp" },
    { resource: "https://mcp.example.test/mcp?provider=muse" },
    { resource: "https://mcp.example.test/a/../mcp" },
    { clientId: "*" },
    { profileId: "unknown" },
    { scopes: [] },
    { scopes: ["debugbundle:projects:write"] },
    { scopes: ["debugbundle:projects:read", "debugbundle:projects:read"] },
    { accessTokenTtlSeconds: 0 },
    { accessTokenTtlSeconds: 720.5 }
  ])("fails construction for an invalid server profile: %j", (override) => {
    expect(() =>
      createHostedAccessTokenVerifier(
        { ...muse, ...override },
        { jwks, isGrantActive: async () => true }
      )
    ).toThrow("hosted_access_token_profile_invalid");
  });
});
