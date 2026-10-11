import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { createLocalJWKSet, jwtVerify, type JSONWebKeySet, type JWTPayload } from "jose";
import { z } from "zod";

import { HOSTED_READ_SCOPES } from "./hosted-oauth-scopes.js";

const canonicalHttpsUri = z
  .string()
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        !value.includes("?") &&
        !value.includes("#") &&
        (value === url.href || value === url.origin)
      );
    } catch {
      return false;
    }
  });

const profileSchema = z
  .object({
    profileId: z.enum(["openai", "muse"]),
    issuer: canonicalHttpsUri,
    resource: canonicalHttpsUri,
    clientId: z
      .string()
      .min(1)
      .max(2048)
      .regex(/^[\x21-\x7e]+$/)
      .refine((value) => !value.includes("*")),
    scopes: z
      .array(z.enum(HOSTED_READ_SCOPES))
      .min(1)
      .max(HOSTED_READ_SCOPES.length)
      .refine((scopes) => new Set(scopes).size === scopes.length),
    accessTokenTtlSeconds: z.number().int().min(1).max(720)
  })
  .strict();

export type HostedAccessTokenProfile = z.infer<typeof profileSchema>;

export interface HostedGrantStatusInput {
  profileId: HostedAccessTokenProfile["profileId"];
  issuer: string;
  grantId: string;
  userId: string;
  organizationId: string;
  clientId: string;
  resource: string;
  scopes: string[];
}

export interface HostedAccessTokenVerifierDependencies {
  jwks: { keys: Array<Record<string, unknown>> };
  isGrantActive: (input: HostedGrantStatusInput) => Promise<boolean>;
}

/** Verification mechanics only; constructing a verifier cannot enable a route. */
export function createHostedAccessTokenVerifier(
  input: unknown,
  dependencies: HostedAccessTokenVerifierDependencies
): { verifyAccessToken(token: string): Promise<AuthInfo> } {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) throw new Error("hosted_access_token_profile_invalid");
  // Zod copies the source configuration, including its scope array. Do not retain
  // caller-owned policy collections that could change after startup validation.
  const profile = Object.freeze(parsed.data);
  const allowedScopes = new Set<string>(profile.scopes);
  const isGrantActive = dependencies.isGrantActive;
  const failure = `${profile.profileId}_access_token_invalid`;
  // Provider and resource may receive the private signing set, but verification
  // exposes only public RSA parameters to jose and never fetches remote keys.
  const keySet = createLocalJWKSet({
    keys: dependencies.jwks.keys.map((key) => ({
      kty: key["kty"],
      kid: key["kid"],
      alg: key["alg"],
      use: key["use"],
      n: key["n"],
      e: key["e"]
    }))
  } as JSONWebKeySet);

  function requiredClaim(payload: JWTPayload, name: string): string {
    const value = payload[name];
    if (typeof value !== "string" || value.length === 0) throw new Error(failure);
    return value;
  }

  return {
    async verifyAccessToken(token): Promise<AuthInfo> {
      try {
        const { payload, protectedHeader } = await jwtVerify(token, keySet, {
          issuer: profile.issuer,
          audience: profile.resource,
          algorithms: ["RS256"],
          requiredClaims: [
            "sub",
            "client_id",
            "scope",
            "grant_id",
            "organization_id",
            "iat",
            "nbf",
            "exp",
            "jti"
          ]
        });
        if (
          protectedHeader.alg !== "RS256" ||
          protectedHeader.typ !== "at+jwt" ||
          payload.iss !== profile.issuer ||
          payload.aud !== profile.resource ||
          typeof payload.iat !== "number" ||
          typeof payload.nbf !== "number" ||
          typeof payload.exp !== "number" ||
          payload.nbf < payload.iat ||
          payload.nbf > payload.iat + 5 ||
          payload.exp - payload.iat !== profile.accessTokenTtlSeconds ||
          payload["email"] !== undefined ||
          payload["email_verified"] !== undefined
        ) {
          throw new Error(failure);
        }
        const userId = requiredClaim(payload, "sub");
        const clientId = requiredClaim(payload, "client_id");
        const grantId = requiredClaim(payload, "grant_id");
        const organizationId = requiredClaim(payload, "organization_id");
        const scopes = requiredClaim(payload, "scope")
          .split(" ")
          .filter((scope) => scope.length > 0);
        if (
          clientId !== profile.clientId ||
          scopes.length === 0 ||
          new Set(scopes).size !== scopes.length ||
          scopes.some((scope) => !allowedScopes.has(scope))
        ) {
          throw new Error(failure);
        }
        if (
          !(await isGrantActive({
            profileId: profile.profileId,
            issuer: profile.issuer,
            grantId,
            userId,
            organizationId,
            clientId,
            resource: profile.resource,
            scopes
          }))
        )
          throw new Error(failure);

        return {
          token,
          clientId,
          scopes,
          expiresAt: payload.exp,
          resource: new URL(profile.resource),
          extra: { userId, organizationId, grantId }
        };
      } catch {
        throw new Error(failure);
      }
    }
  };
}
