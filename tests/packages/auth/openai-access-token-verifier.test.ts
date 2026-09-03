import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { createOpenAiAccessTokenVerifier } from "../../../packages/auth/src/index.js";

let privateKey: Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];
let jwks: { keys: Array<Record<string, unknown>> };

beforeAll(async () => {
  const pair = await generateKeyPair("RS256", { extractable: true });
  privateKey = pair.privateKey;
  const publicJwk = await exportJWK(pair.publicKey);
  jwks = { keys: [{ ...publicJwk, kid: "key-1", alg: "RS256", use: "sig" }] };
});

async function signToken(
  overrides: Record<string, unknown> = {},
  audience = "https://mcp.debugbundle.com"
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    sub: "user_1",
    client_id: "https://chatgpt.com/oauth/client.json",
    scope: "debugbundle:projects:read debugbundle:incidents:read",
    grant_id: "grant_1",
    organization_id: "org_1",
    ...overrides
  };
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: "key-1", typ: "at+jwt" })
    .setIssuer("https://api.debugbundle.com")
    .setAudience(audience)
    .setIssuedAt(now)
    .setNotBefore(now)
    .setExpirationTime(now + 720)
    .setJti("access-token-id")
    .sign(privateKey);
}

describe("OpenAI access-token verifier", () => {
  it("verifies the exact JWT profile and checks the backing grant", async () => {
    const isGrantActive = vi.fn(async () => true);
    const verifier = createOpenAiAccessTokenVerifier({ jwks, isGrantActive });
    const token = await signToken();

    await expect(verifier.verifyAccessToken(token)).resolves.toMatchObject({
      token,
      clientId: "https://chatgpt.com/oauth/client.json",
      scopes: ["debugbundle:projects:read", "debugbundle:incidents:read"],
      resource: new URL("https://mcp.debugbundle.com"),
      extra: {
        userId: "user_1",
        organizationId: "org_1",
        grantId: "grant_1"
      }
    });
    expect(isGrantActive).toHaveBeenCalledWith({
      grantId: "grant_1",
      userId: "user_1",
      organizationId: "org_1",
      clientId: "https://chatgpt.com/oauth/client.json",
      resource: "https://mcp.debugbundle.com",
      scopes: ["debugbundle:projects:read", "debugbundle:incidents:read"]
    });
  });

  it("rejects wrong audience, customer identity claims, and inactive grants", async () => {
    const active = createOpenAiAccessTokenVerifier({
      jwks,
      isGrantActive: vi.fn(async () => true)
    });
    await expect(
      active.verifyAccessToken(await signToken({}, "https://api.debugbundle.com"))
    ).rejects.toThrow("openai_access_token_invalid");
    await expect(
      active.verifyAccessToken(await signToken({ email: "member@example.com" }))
    ).rejects.toThrow("openai_access_token_invalid");

    const inactive = createOpenAiAccessTokenVerifier({
      jwks,
      isGrantActive: vi.fn(async () => false)
    });
    await expect(inactive.verifyAccessToken(await signToken())).rejects.toThrow(
      "openai_access_token_invalid"
    );
  });
});
