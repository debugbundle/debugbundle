import { createHmac, randomUUID } from "node:crypto";

import {
  assertIntegrationSecretEncryptionKey,
  decryptIntegrationSecret,
  encryptIntegrationSecret
} from "./integration-secret-crypto.js";
import type { Queryable } from "./types.js";

type ProviderPayload = Record<string, unknown>;

interface ProviderArtifactRow extends Record<string, unknown> {
  payload: unknown;
  consumed_at: string | null;
}

interface EncryptedProviderPayload {
  ciphertext: string;
  format: "oauth-provider-payload-v1";
}

export interface OidcProviderAdapter {
  upsert(id: string, payload: ProviderPayload, expiresIn: number): Promise<void>;
  find(id: string): Promise<ProviderPayload | undefined>;
  findByUid(uid: string): Promise<ProviderPayload | undefined>;
  findByUserCode(userCode: string): Promise<ProviderPayload | undefined>;
  destroy(id: string): Promise<void>;
  consume(id: string): Promise<void>;
  revokeByGrantId(grantId: string): Promise<void>;
}

export interface OidcProviderAdapterConstructor {
  new (model: string): OidcProviderAdapter;
}

export function hashOpenAiOidcProviderLookup(
  key: string,
  category: "id" | "grant" | "session" | "user-code",
  value: string
): string {
  return `hmac-sha256:${createHmac("sha256", key)
    .update(`oauth-provider:${category}:${value}`, "utf8")
    .digest("hex")}`;
}

function encryptPayload(payload: ProviderPayload, key: string): EncryptedProviderPayload {
  return {
    format: "oauth-provider-payload-v1",
    ciphertext: encryptIntegrationSecret(JSON.stringify(payload), key)
  };
}

function decryptPayload(value: unknown, key: string): ProviderPayload {
  if (
    typeof value !== "object" ||
    value === null ||
    (value as { format?: unknown }).format !== "oauth-provider-payload-v1" ||
    typeof (value as { ciphertext?: unknown }).ciphertext !== "string"
  ) {
    throw new Error("oauth_provider_payload_invalid");
  }

  const parsed: unknown = JSON.parse(
    decryptIntegrationSecret((value as { ciphertext: string }).ciphertext, key)
  );
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("oauth_provider_payload_invalid");
  }
  return parsed as ProviderPayload;
}

function mapArtifact(
  row: ProviderArtifactRow | undefined,
  key: string
): ProviderPayload | undefined {
  if (row === undefined) {
    return undefined;
  }

  const payload = decryptPayload(row.payload, key);
  if (row.consumed_at !== null) {
    return {
      ...payload,
      consumed: Math.floor(new Date(row.consumed_at).getTime() / 1000)
    };
  }
  return payload;
}

function withTransaction<Result>(
  db: Queryable,
  callback: (tx: Queryable) => Promise<Result>
): Promise<Result> {
  return db.transaction === undefined ? callback(db) : db.transaction(callback);
}

function readPayloadString(payload: ProviderPayload, key: string): string | undefined {
  const value = payload[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readPayloadResource(payload: ProviderPayload): string | undefined {
  const value = payload["resource"];
  if (typeof value === "string") {
    return value;
  }
  return Array.isArray(value) && value.length === 1 && typeof value[0] === "string"
    ? value[0]
    : undefined;
}

function readPayloadScopes(payload: ProviderPayload): string[] | undefined {
  const value = readPayloadString(payload, "scope");
  if (value === undefined) {
    return undefined;
  }
  const scopes = [...new Set(value.split(" ").filter((scope) => scope.length > 0))].sort();
  return scopes.length === 0 ? undefined : scopes;
}

async function mirrorAuthorizationCode(
  db: Queryable,
  encryptionKey: string,
  id: string,
  payload: ProviderPayload,
  expiresIn: number
): Promise<void> {
  const providerGrantId = readPayloadString(payload, "grantId");
  const userId = readPayloadString(payload, "accountId");
  const clientId = readPayloadString(payload, "clientId");
  const redirectUri = readPayloadString(payload, "redirectUri");
  const resource = readPayloadResource(payload);
  const scopes = readPayloadScopes(payload);
  const codeChallenge = readPayloadString(payload, "codeChallenge");
  const codeChallengeMethod = readPayloadString(payload, "codeChallengeMethod");
  if (
    providerGrantId === undefined ||
    userId === undefined ||
    clientId === undefined ||
    redirectUri === undefined ||
    resource === undefined ||
    scopes === undefined ||
    codeChallenge === undefined ||
    codeChallengeMethod !== "S256"
  ) {
    return;
  }

  const result = await db.query<Record<string, unknown>>(
    `
      INSERT INTO oauth_authorization_codes (
        id, grant_id, user_id, organization_id, code_hash, client_id,
        redirect_uri, resource, scopes, code_challenge, code_challenge_method,
        expires_at
      )
      SELECT
        $1::uuid, g.id, g.user_id, g.organization_id, $2, $3,
        $4, $5, $6::text[], $7, 'S256', now() + make_interval(secs => $8)
      FROM oauth_authorization_grants g
      WHERE g.provider_grant_id_hash = $9
        AND g.user_id = $10::uuid
        AND g.client_id = $3
        AND g.resource = $5
        AND g.scopes @> $6::text[]
        AND g.revoked_at IS NULL
        AND g.expires_at > now()
      ON CONFLICT (code_hash) DO UPDATE
      SET expires_at = EXCLUDED.expires_at
      RETURNING id
    `,
    [
      randomUUID(),
      hashOpenAiOidcProviderLookup(encryptionKey, "id", id),
      clientId,
      redirectUri,
      resource,
      scopes,
      codeChallenge,
      Math.ceil(expiresIn),
      hashOpenAiOidcProviderLookup(encryptionKey, "grant", providerGrantId),
      userId
    ]
  );
  if (result.rows.length !== 1) {
    throw new Error("oauth_authorization_code_grant_binding_invalid");
  }
}

async function mirrorRefreshToken(
  db: Queryable,
  encryptionKey: string,
  id: string,
  payload: ProviderPayload,
  expiresIn: number
): Promise<void> {
  const providerGrantId = readPayloadString(payload, "grantId");
  const clientId = readPayloadString(payload, "clientId");
  const resource = readPayloadResource(payload);
  const scopes = readPayloadScopes(payload);
  if (
    providerGrantId === undefined ||
    clientId === undefined ||
    resource === undefined ||
    scopes === undefined
  ) {
    return;
  }
  const grant = await db.query<{ grant_id: string } & Record<string, unknown>>(
    `
      SELECT id::text AS grant_id
      FROM oauth_authorization_grants
      WHERE provider_grant_id_hash = $1
        AND client_id = $2
        AND resource = $3
        AND scopes @> $4::text[]
        AND revoked_at IS NULL
        AND expires_at > now()
      LIMIT 1
    `,
    [
      hashOpenAiOidcProviderLookup(encryptionKey, "grant", providerGrantId),
      clientId,
      resource,
      scopes
    ]
  );
  const grantId = grant.rows[0]?.grant_id;
  if (grantId === undefined) {
    throw new Error("oauth_refresh_token_grant_binding_invalid");
  }

  const rotations =
    typeof payload["rotations"] === "number" && payload["rotations"] > 0 ? payload["rotations"] : 0;
  const parent =
    rotations === 0
      ? undefined
      : (
          await db.query<{ token_id: string; family_id: string } & Record<string, unknown>>(
            `
              SELECT id::text AS token_id, family_id::text AS family_id
              FROM oauth_refresh_tokens
              WHERE grant_id = $1::uuid
                AND used_at IS NOT NULL
                AND replacement_token_id IS NULL
              ORDER BY used_at DESC, issued_at DESC
              LIMIT 1
              FOR UPDATE
            `,
            [grantId]
          )
        ).rows[0];
  if (rotations > 0 && parent === undefined) {
    throw new Error("oauth_refresh_token_rotation_parent_missing");
  }

  const tokenId = randomUUID();
  const inserted = await db.query<Record<string, unknown>>(
    `
      INSERT INTO oauth_refresh_tokens (
        id, grant_id, family_id, parent_token_id, token_hash, client_id,
        resource, scopes, expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::text[], now() + make_interval(secs => $9))
      ON CONFLICT (token_hash) DO UPDATE
      SET expires_at = EXCLUDED.expires_at
      RETURNING id
    `,
    [
      tokenId,
      grantId,
      parent?.family_id ?? randomUUID(),
      parent?.token_id ?? null,
      hashOpenAiOidcProviderLookup(encryptionKey, "id", id),
      clientId,
      resource,
      scopes,
      Math.ceil(expiresIn)
    ]
  );
  if (inserted.rows.length !== 1) {
    throw new Error("oauth_refresh_token_persistence_failed");
  }
  if (parent !== undefined) {
    await db.query(
      `
        UPDATE oauth_refresh_tokens
        SET replacement_token_id = $2::uuid
        WHERE id = $1::uuid AND replacement_token_id IS NULL
      `,
      [parent.token_id, tokenId]
    );
  }
}

export function createPostgresOidcProviderAdapterFactory(
  db: Queryable,
  encryptionKey: string
): OidcProviderAdapterConstructor {
  assertIntegrationSecretEncryptionKey(encryptionKey);

  return class PostgresOidcProviderAdapter implements OidcProviderAdapter {
    readonly #model: string;

    constructor(model: string) {
      this.#model = model;
    }

    async upsert(id: string, payload: ProviderPayload, expiresIn: number): Promise<void> {
      if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
        throw new Error("oauth_provider_expiry_invalid");
      }

      await withTransaction(db, async (tx) => {
        await tx.query(
          `
          INSERT INTO oauth_provider_artifacts (
            model,
            provider_id_hash,
            payload,
            grant_id_hash,
            session_uid_hash,
            user_code_hash,
            expires_at,
            consumed_at
          )
          VALUES ($1, $2, $3::jsonb, $4, $5, $6, now() + make_interval(secs => $7), NULL)
          ON CONFLICT (model, provider_id_hash) DO UPDATE
          SET
            payload = EXCLUDED.payload,
            grant_id_hash = EXCLUDED.grant_id_hash,
            session_uid_hash = EXCLUDED.session_uid_hash,
            user_code_hash = EXCLUDED.user_code_hash,
            expires_at = EXCLUDED.expires_at,
            consumed_at = NULL,
            updated_at = now()
          `,
          [
            this.#model,
            hashOpenAiOidcProviderLookup(encryptionKey, "id", id),
            encryptPayload(payload, encryptionKey),
            typeof payload["grantId"] === "string"
              ? hashOpenAiOidcProviderLookup(encryptionKey, "grant", payload["grantId"])
              : null,
            typeof payload["uid"] === "string"
              ? hashOpenAiOidcProviderLookup(encryptionKey, "session", payload["uid"])
              : null,
            typeof payload["userCode"] === "string"
              ? hashOpenAiOidcProviderLookup(encryptionKey, "user-code", payload["userCode"])
              : null,
            Math.ceil(expiresIn)
          ]
        );
        if (this.#model === "AuthorizationCode") {
          await mirrorAuthorizationCode(tx, encryptionKey, id, payload, expiresIn);
        } else if (this.#model === "RefreshToken") {
          await mirrorRefreshToken(tx, encryptionKey, id, payload, expiresIn);
        }
      });
    }

    async find(id: string): Promise<ProviderPayload | undefined> {
      const result = await db.query<ProviderArtifactRow>(
        `
          SELECT payload, consumed_at::text AS consumed_at
          FROM oauth_provider_artifacts
          WHERE model = $1
            AND provider_id_hash = $2
            AND expires_at > now()
          LIMIT 1
        `,
        [this.#model, hashOpenAiOidcProviderLookup(encryptionKey, "id", id)]
      );
      return mapArtifact(result.rows[0], encryptionKey);
    }

    async findByUid(uid: string): Promise<ProviderPayload | undefined> {
      const result = await db.query<ProviderArtifactRow>(
        `
          SELECT payload, consumed_at::text AS consumed_at
          FROM oauth_provider_artifacts
          WHERE session_uid_hash = $1
            AND expires_at > now()
          LIMIT 1
        `,
        [hashOpenAiOidcProviderLookup(encryptionKey, "session", uid)]
      );
      return mapArtifact(result.rows[0], encryptionKey);
    }

    async findByUserCode(userCode: string): Promise<ProviderPayload | undefined> {
      const result = await db.query<ProviderArtifactRow>(
        `
          SELECT payload, consumed_at::text AS consumed_at
          FROM oauth_provider_artifacts
          WHERE user_code_hash = $1
            AND expires_at > now()
          LIMIT 1
        `,
        [hashOpenAiOidcProviderLookup(encryptionKey, "user-code", userCode)]
      );
      return mapArtifact(result.rows[0], encryptionKey);
    }

    async destroy(id: string): Promise<void> {
      await withTransaction(db, async (tx) => {
        await tx.query(
          `
          DELETE FROM oauth_provider_artifacts
          WHERE model = $1 AND provider_id_hash = $2
          `,
          [this.#model, hashOpenAiOidcProviderLookup(encryptionKey, "id", id)]
        );
        if (this.#model === "RefreshToken") {
          await tx.query(
            `
              UPDATE oauth_refresh_tokens
              SET revoked_at = COALESCE(revoked_at, now()),
                  revocation_reason = COALESCE(revocation_reason, 'provider_destroyed')
              WHERE token_hash = $1
            `,
            [hashOpenAiOidcProviderLookup(encryptionKey, "id", id)]
          );
        }
      });
    }

    async consume(id: string): Promise<void> {
      const consumedOnce = await withTransaction(db, async (tx) => {
        const consumed = await tx.query<Record<string, unknown>>(
          `
          UPDATE oauth_provider_artifacts
          SET consumed_at = now(), updated_at = now()
          WHERE model = $1 AND provider_id_hash = $2 AND consumed_at IS NULL
          RETURNING provider_id_hash
          `,
          [this.#model, hashOpenAiOidcProviderLookup(encryptionKey, "id", id)]
        );
        if (consumed.rows.length !== 1) {
          if (this.#model === "RefreshToken") {
            await tx.query(
              `
                WITH reused_token AS (
                  UPDATE oauth_refresh_tokens
                  SET reuse_detected_at = COALESCE(reuse_detected_at, now())
                  WHERE token_hash = $1
                  RETURNING grant_id, family_id
                ), revoked_family AS (
                  UPDATE oauth_refresh_tokens token
                  SET revoked_at = COALESCE(token.revoked_at, now()),
                      revocation_reason = COALESCE(token.revocation_reason, 'refresh_reuse')
                  FROM reused_token reused
                  WHERE token.grant_id = reused.grant_id
                    AND token.family_id = reused.family_id
                  RETURNING token.grant_id
                )
                UPDATE oauth_authorization_grants grant_record
                SET revoked_at = COALESCE(grant_record.revoked_at, now()),
                    revocation_reason = COALESCE(grant_record.revocation_reason, 'refresh_reuse'),
                    updated_at = now()
                WHERE grant_record.id IN (SELECT grant_id FROM revoked_family)
              `,
              [hashOpenAiOidcProviderLookup(encryptionKey, "id", id)]
            );
          }
          return false;
        }
        if (this.#model === "AuthorizationCode") {
          const mirrored = await tx.query<Record<string, unknown>>(
            `
              UPDATE oauth_authorization_codes
              SET consumed_at = now()
              WHERE code_hash = $1 AND consumed_at IS NULL
              RETURNING id
            `,
            [hashOpenAiOidcProviderLookup(encryptionKey, "id", id)]
          );
          if (mirrored.rows.length !== 1) {
            throw new Error("oauth_authorization_code_already_consumed");
          }
        } else if (this.#model === "RefreshToken") {
          const mirrored = await tx.query<Record<string, unknown>>(
            `
              UPDATE oauth_refresh_tokens
              SET used_at = now()
              WHERE token_hash = $1 AND used_at IS NULL AND revoked_at IS NULL
              RETURNING id
            `,
            [hashOpenAiOidcProviderLookup(encryptionKey, "id", id)]
          );
          if (mirrored.rows.length !== 1) {
            throw new Error("oauth_refresh_token_reuse_detected");
          }
        }
        return true;
      });
      if (!consumedOnce) {
        throw new Error("oauth_provider_artifact_already_consumed");
      }
    }

    async revokeByGrantId(grantId: string): Promise<void> {
      const grantIdHash = hashOpenAiOidcProviderLookup(encryptionKey, "grant", grantId);
      await withTransaction(db, async (tx) => {
        await tx.query(`DELETE FROM oauth_provider_artifacts WHERE grant_id_hash = $1`, [
          grantIdHash
        ]);
        await tx.query(
          `
            WITH revoked_grant AS (
              UPDATE oauth_authorization_grants
              SET revoked_at = COALESCE(revoked_at, now()),
                  revocation_reason = COALESCE(revocation_reason, 'provider_revoked'),
                  updated_at = now()
              WHERE provider_grant_id_hash = $1
              RETURNING id
            )
            UPDATE oauth_refresh_tokens
            SET revoked_at = COALESCE(revoked_at, now()),
                revocation_reason = COALESCE(revocation_reason, 'provider_revoked')
            WHERE grant_id IN (SELECT id FROM revoked_grant)
          `,
          [grantIdHash]
        );
      });
    }
  };
}
