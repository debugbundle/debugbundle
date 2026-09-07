import { randomBytes, randomUUID } from "node:crypto";

import { afterAll, beforeAll, expect, it } from "vitest";

import {
  createPostgresOidcProviderAdapterFactory,
  createPostgresOpenAiOAuthStore,
  hashOpenAiOidcProviderLookup
} from "../../packages/storage/src/index.js";
import {
  bootstrapStorageAndCreateBucket,
  createIntegrationPool,
  createQueryable,
  createS3AdminClient,
  runIntegration,
  seedOwnedProject
} from "../helpers/integration-setup.ts";

const OPENAI_CLIENT_ID = "https://chatgpt.com/oauth/client.json";
const OPENAI_RESOURCE = "https://mcp.debugbundle.com";

runIntegration("OpenAI OAuth grant revocation integration", () => {
  const pool = createIntegrationPool();
  const s3Admin = createS3AdminClient();

  beforeAll(async (): Promise<void> => {
    await bootstrapStorageAndCreateBucket(pool, s3Admin);
  });

  afterAll(async (): Promise<void> => {
    await pool.end();
  });

  it("deletes indexed provider Grants and rejects retained legacy Grants after revocation", async () => {
    const organizationId = randomUUID();
    const projectId = randomUUID();
    const { ownerUserId } = await seedOwnedProject({
      pool,
      organizationId,
      projectId,
      organizationName: `OAuth revocation ${organizationId}`,
      organizationSlug: `oauth-revocation-${organizationId}`,
      projectName: "OAuth revocation",
      projectSlug: `oauth-revocation-${projectId}`
    });
    const encryptionKey = randomBytes(32).toString("base64url");
    const db = createQueryable(pool);
    const Adapter = createPostgresOidcProviderAdapterFactory(db, encryptionKey);
    const store = createPostgresOpenAiOAuthStore(db, encryptionKey);
    const expiresAt = new Date(Date.now() + 3_600_000).toISOString();
    const createBoundGrant = async (providerGrantId: string): Promise<string> => {
      await new Adapter("Grant").upsert(
        providerGrantId,
        {
          jti: providerGrantId,
          kind: "Grant",
          accountId: ownerUserId,
          clientId: OPENAI_CLIENT_ID
        },
        3_600
      );
      return store.createGrant({
        providerGrantId,
        userId: ownerUserId,
        organizationId,
        clientId: OPENAI_CLIENT_ID,
        resource: OPENAI_RESOURCE,
        scopes: ["openid", "email", "debugbundle:projects:read"],
        consentedAt: new Date().toISOString(),
        expiresAt
      });
    };

    const indexedProviderGrantId = randomUUID();
    const indexedGrantId = await createBoundGrant(indexedProviderGrantId);
    await expect(new Adapter("Grant").find(indexedProviderGrantId)).resolves.toMatchObject({
      accountId: ownerUserId
    });
    await store.revokeGrant(indexedGrantId, "user_revoked");
    const indexedRows = await pool.query<{ count: string }>(
      `
        SELECT COUNT(*)::text AS count
        FROM oauth_provider_artifacts
        WHERE model = 'Grant' AND provider_id_hash = $1
      `,
      [hashOpenAiOidcProviderLookup(encryptionKey, "id", indexedProviderGrantId)]
    );
    expect(indexedRows.rows[0]?.count).toBe("0");

    const legacyProviderGrantId = randomUUID();
    const legacyGrantId = await createBoundGrant(legacyProviderGrantId);
    const legacyProviderIdHash = hashOpenAiOidcProviderLookup(
      encryptionKey,
      "id",
      legacyProviderGrantId
    );
    await pool.query(
      `
        UPDATE oauth_provider_artifacts
        SET grant_id_hash = NULL
        WHERE model = 'Grant' AND provider_id_hash = $1
      `,
      [legacyProviderIdHash]
    );
    await store.revokeGrant(legacyGrantId, "user_revoked");
    const legacyRows = await pool.query<{ count: string }>(
      `
        SELECT COUNT(*)::text AS count
        FROM oauth_provider_artifacts
        WHERE model = 'Grant' AND provider_id_hash = $1
      `,
      [legacyProviderIdHash]
    );
    expect(legacyRows.rows[0]?.count).toBe("1");
    await expect(new Adapter("Grant").find(legacyProviderGrantId)).resolves.toBeUndefined();

    await pool.query("DELETE FROM oauth_provider_artifacts WHERE provider_id_hash = $1", [
      legacyProviderIdHash
    ]);
    await pool.query("DELETE FROM organizations WHERE id = $1", [organizationId]);
  });
});
