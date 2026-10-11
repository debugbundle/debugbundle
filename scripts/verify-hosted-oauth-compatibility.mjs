import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { exportJWK, generateKeyPair, importJWK, SignJWT } from "jose";
import Fastify from "fastify";
import { Pool } from "pg";
import {
  createOpenAiOidcProvider,
  buildOpenAiOidcConfiguration,
  createOpenAiAccessTokenVerifier,
  buildOpenAiAuthorizationServerMetadata,
  buildOpenAiProtectedResourceMetadata,
  OPENAI_CIMD_CLIENT_ID,
  OPENAI_CIMD_JWKS_URI,
  OPENAI_MCP_RESOURCE,
  OPENAI_PRODUCTION_REDIRECT_URI
} from "../packages/auth/src/index.ts";
import {
  createPostgresOidcProviderAdapterFactory,
  createPostgresOpenAiOAuthStore,
  createRedisAuthRateLimiter
} from "../packages/storage/src/index.ts";
import { registerOpenAiOAuthHttpRoutes } from "../apps/api/src/openai-oauth-http.ts";

// Copied into each source tree: factories and dependencies belong to that revision.
// Credentials and encrypted corpus are synthetic, private and deleted by the runner.
const [mode, name] = process.argv.slice(2);
const directory = process.env.HOSTED_OAUTH_CORPUS_DIR;
const databaseHost = process.env.DB_HOST;
if (
  typeof databaseHost !== "string" ||
  !/^debugbundle-hosted-oauth-[1-9][0-9]*-postgres$/.test(databaseHost) ||
  process.env.REDIS_URL !== `redis://${databaseHost.replace(/-postgres$/, "-redis")}:6379` ||
  directory !== "/corpus" ||
  process.env.NODE_ENV === "production"
) {
  console.error("hosted_oauth_compatibility_invalid_test_target");
  process.exit(1);
}
const pool = new Pool({
  host: process.env.DB_HOST,
  port: 5432,
  user: "debugbundle",
  password: "debugbundle",
  database: "debugbundle"
});
const rateLimiter = createRedisAuthRateLimiter({ redisUrl: process.env.REDIS_URL });
let app;
function check(condition, reason) {
  if (!condition) throw new Error(`compat_${reason}`);
}
async function save(file, value) {
  await writeFile(`${directory}/${file}.json`, JSON.stringify(value), { mode: 0o600 });
}
async function load(file) {
  return JSON.parse(await readFile(`${directory}/${file}.json`, "utf8"));
}
const db = {
  query: (sql, params) => pool.query(sql, params),
  async transaction(callback) {
    const connection = await pool.connect();
    try {
      await connection.query("BEGIN");
      const result = await callback({ query: (sql, params) => connection.query(sql, params) });
      await connection.query("COMMIT");
      return result;
    } catch (error) {
      await connection.query("ROLLBACK");
      throw error;
    } finally {
      connection.release();
    }
  }
};

async function setup() {
  let config;
  if (mode === "seed" && name === "old") {
    const signing = await generateKeyPair("RS256", { extractable: true });
    const client = await generateKeyPair("RS256", { extractable: true });
    config = {
      jwks: {
        keys: [
          {
            ...(await exportJWK(signing.privateKey)),
            kid: "synthetic-provider",
            alg: "RS256",
            use: "sig"
          }
        ]
      },
      clientKey: {
        ...(await exportJWK(client.privateKey)),
        kid: "synthetic-client",
        alg: "RS256",
        use: "sig"
      },
      clientPublicKey: {
        ...(await exportJWK(client.publicKey)),
        kid: "synthetic-client",
        alg: "RS256",
        use: "sig"
      },
      encryptionKey: randomBytes(32).toString("base64url"),
      cookieKeys: [randomBytes(32).toString("base64url"), randomBytes(32).toString("base64url")]
    };
    await save("config", config);
  } else {
    config = await load("config");
  }
  const Adapter = createPostgresOidcProviderAdapterFactory(db, config.encryptionKey);
  const store = createPostgresOpenAiOAuthStore(db, config.encryptionKey);
  const documents = new Map([
    [
      OPENAI_CIMD_CLIENT_ID,
      {
        client_id: OPENAI_CIMD_CLIENT_ID,
        redirect_uris: [OPENAI_PRODUCTION_REDIRECT_URI],
        token_endpoint_auth_method: "private_key_jwt",
        token_endpoint_auth_signing_alg: "RS256",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        jwks_uri: OPENAI_CIMD_JWKS_URI
      }
    ],
    [OPENAI_CIMD_JWKS_URI, { keys: [config.clientPublicKey] }]
  ]);
  for (const [url, document] of documents) {
    await rateLimiter.setOpenAiCimdResponse(
      url,
      JSON.stringify({
        body: Buffer.from(JSON.stringify(document)).toString("base64"),
        headers: [["content-type", "application/json"]],
        status: 200,
        statusText: "OK"
      }),
      300_000
    );
  }
  const dependencies = {
    adapter: Adapter,
    cimdCache: rateLimiter,
    jwks: config.jwks,
    cookieKeys: config.cookieKeys,
    findVerifiedAccount: async (userId) => ({
      userId,
      email: "synthetic@example.test",
      emailVerified: true
    }),
    claimClientAssertionJti: (input) => rateLimiter.claimOpenAiClientAssertionJti(input),
    resolveGrantClaims: (grantId) => store.resolveProviderGrantClaims(grantId),
    fetchImpl: async () => {
      throw new Error("compat_external_fetch_forbidden");
    }
  };
  const provider = createOpenAiOidcProvider(dependencies);
  const rotatesOnEveryUse = buildOpenAiOidcConfiguration(dependencies).rotateRefreshToken === true;
  app = Fastify();
  registerOpenAiOAuthHttpRoutes(app, { expectedHost: "api.debugbundle.com", provider });
  const verifier = createOpenAiAccessTokenVerifier({
    jwks: config.jwks,
    isGrantActive: (input) => store.isGrantActive(input)
  });
  return { config, Adapter, provider, store, verifier, rotatesOnEveryUse };
}

async function exchange(config, parameters, expectedStatus = 200) {
  const now = Math.floor(Date.now() / 1_000);
  const assertion = await new SignJWT({})
    .setProtectedHeader({ alg: "RS256", kid: "synthetic-client" })
    .setIssuer(OPENAI_CIMD_CLIENT_ID)
    .setSubject(OPENAI_CIMD_CLIENT_ID)
    .setAudience("https://api.debugbundle.com/oauth/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .setJti(randomUUID())
    .sign(await importJWK(config.clientKey, "RS256"));
  const response = await app.inject({
    method: "POST",
    url: "/oauth/token",
    headers: {
      host: "api.debugbundle.com",
      "x-forwarded-host": "api.debugbundle.com",
      "x-forwarded-proto": "https",
      "x-debugbundle-surface": "openai-oauth",
      "content-type": "application/x-www-form-urlencoded"
    },
    payload: new URLSearchParams({
      client_id: OPENAI_CIMD_CLIENT_ID,
      resource: OPENAI_MCP_RESOURCE,
      client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
      client_assertion: assertion,
      ...parameters
    }).toString()
  });
  check(response.statusCode === expectedStatus, "token_exchange_status");
  const result = response.json();
  if (expectedStatus !== 200) check(result.error === "invalid_grant", "replay_error");
  else
    check(
      typeof result.access_token === "string" && typeof result.refresh_token === "string",
      "token_response"
    );
  return result;
}

async function seed({ provider, store, verifier, Adapter }) {
  const userId = randomUUID();
  const organizationId = randomUUID();
  await pool.query("INSERT INTO users (id, email, email_verified_at) VALUES ($1, $2, now())", [
    userId,
    `synthetic-${userId}@example.test`
  ]);
  await pool.query(
    "INSERT INTO organizations (id, name, slug) VALUES ($1, 'Synthetic OAuth compatibility', $2)",
    [organizationId, `synthetic-${organizationId}`]
  );
  await pool.query(
    "INSERT INTO organization_members (id, user_id, organization_id, role) VALUES ($1, $2, $3, 'owner')",
    [randomUUID(), userId, organizationId]
  );
  const grant = new provider.Grant({ accountId: userId, clientId: OPENAI_CIMD_CLIENT_ID });
  grant.addOIDCScope("openid email");
  grant.addResourceScope(OPENAI_MCP_RESOURCE, "debugbundle:projects:read");
  const providerGrantId = await grant.save();
  const grantId = await store.createGrant({
    providerGrantId,
    userId,
    organizationId,
    clientId: OPENAI_CIMD_CLIENT_ID,
    resource: OPENAI_MCP_RESOURCE,
    scopes: ["openid", "email", "debugbundle:projects:read"],
    consentedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 2_592_000_000).toISOString()
  });
  const client = await provider.Client.find(OPENAI_CIMD_CLIENT_ID);
  check(client !== undefined, "client_lookup");
  const base = {
    client,
    accountId: userId,
    grantId: providerGrantId,
    resource: OPENAI_MCP_RESOURCE,
    scope: "openid email debugbundle:projects:read"
  };
  const codeVerifier = randomBytes(32).toString("base64url");
  const code = await new provider.AuthorizationCode({
    ...base,
    redirectUri: OPENAI_PRODUCTION_REDIRECT_URI,
    codeChallenge: createHash("sha256").update(codeVerifier).digest("base64url"),
    codeChallengeMethod: "S256"
  }).save();
  const refresh = await new provider.RefreshToken(base).save();
  const access = await new provider.AccessToken({
    ...base,
    scope: "debugbundle:projects:read",
    resourceServer: { audience: OPENAI_MCP_RESOURCE, accessTokenFormat: "jwt" }
  }).save();
  await verifier.verifyAccessToken(access);
  const sessionId = randomUUID();
  const sessionUid = randomUUID();
  await new Adapter("Session").upsert(sessionId, { uid: sessionUid, accountId: userId }, 3600);
  const lease = await rateLimiter.acquireConcurrency({
    bucket: "openai-mcp-global-concurrency",
    subject: organizationId,
    limit: 2,
    leaseMs: 60_000
  });
  check(lease.acquired, "initial_lease");
  const assertionJti = randomUUID();
  const assertionExpiry = Math.floor(Date.now() / 1_000) + 315;
  check(
    await rateLimiter.claimOpenAiClientAssertionJti({
      issuer: OPENAI_CIMD_CLIENT_ID,
      jti: assertionJti,
      expiresAt: assertionExpiry
    }),
    "initial_assertion"
  );
  await save(name, {
    userId,
    organizationId,
    providerGrantId,
    grantId,
    code,
    codeVerifier,
    refresh,
    access,
    sessionId,
    sessionUid,
    lease,
    assertionJti,
    assertionExpiry,
    metadata: {
      resource: buildOpenAiProtectedResourceMetadata(),
      issuer: buildOpenAiAuthorizationServerMetadata()
    }
  });
}

async function exercise({ config, provider, store, verifier, Adapter, rotatesOnEveryUse }) {
  const corpus = await load(name);
  check(
    JSON.stringify(corpus.metadata) ===
      JSON.stringify({
        resource: buildOpenAiProtectedResourceMetadata(),
        issuer: buildOpenAiAuthorizationServerMetadata()
      }),
    "metadata_changed"
  );
  check(
    (await verifier.verifyAccessToken(corpus.access)).extra.grantId === corpus.grantId,
    "access_grant"
  );
  check(
    (await provider.Grant.find(corpus.providerGrantId))?.accountId === corpus.userId,
    "encrypted_grant_read"
  );
  check(
    (await new Adapter("Session").findByUid(corpus.sessionUid))?.accountId === corpus.userId,
    "encrypted_session_read"
  );
  check(
    (await provider.AuthorizationCode.find(corpus.code))?.clientId === OPENAI_CIMD_CLIENT_ID,
    "encrypted_code_read"
  );
  check(
    (await provider.RefreshToken.find(corpus.refresh))?.clientId === OPENAI_CIMD_CLIENT_ID,
    "encrypted_refresh_read"
  );
  const connections = await store.listConnectionsForUser({
    userId: corpus.userId,
    organizationId: corpus.organizationId
  });
  check(
    connections.length === 1 && connections[0].clientName === "ChatGPT and Codex",
    "connection_inventory"
  );
  const codeResult = await exchange(config, {
    grant_type: "authorization_code",
    code: corpus.code,
    code_verifier: corpus.codeVerifier,
    redirect_uri: OPENAI_PRODUCTION_REDIRECT_URI
  });
  const refreshResult = await exchange(config, {
    grant_type: "refresh_token",
    refresh_token: corpus.refresh
  });
  const refreshRotated = refreshResult.refresh_token !== corpus.refresh;
  check(refreshRotated === rotatesOnEveryUse, "refresh_rotation_policy");
  if (!refreshRotated) console.log("hosted_oauth_legacy_source_refresh_rotation_gap");
  await verifier.verifyAccessToken(codeResult.access_token);
  await verifier.verifyAccessToken(refreshResult.access_token);
  check(
    !(await rateLimiter.claimOpenAiClientAssertionJti({
      issuer: OPENAI_CIMD_CLIENT_ID,
      jti: corpus.assertionJti,
      expiresAt: corpus.assertionExpiry
    })),
    "shared_assertion_replay"
  );
  const second = await rateLimiter.acquireConcurrency({
    bucket: "openai-mcp-global-concurrency",
    subject: corpus.organizationId,
    limit: 2,
    leaseMs: 60_000
  });
  const third = await rateLimiter.acquireConcurrency({
    bucket: "openai-mcp-global-concurrency",
    subject: corpus.organizationId,
    limit: 2,
    leaseMs: 60_000
  });
  check(second.acquired && !third.acquired, "shared_concurrency");
  for (const lease of [corpus.lease, second])
    await rateLimiter.releaseConcurrency({
      bucket: "openai-mcp-global-concurrency",
      subject: corpus.organizationId,
      leaseId: lease.lease_id
    });
  await save(`${name}-exchanged`, { codeResult, refreshResult, refreshRotated });
}

async function rollback({ config, verifier }) {
  for (const source of ["old", "new"]) {
    const { codeResult, refreshResult } = await load(`${source}-exchanged`);
    await verifier.verifyAccessToken(codeResult.access_token);
    await verifier.verifyAccessToken(refreshResult.access_token);
    const rotated = await exchange(config, {
      grant_type: "refresh_token",
      refresh_token: codeResult.refresh_token
    });
    await verifier.verifyAccessToken(rotated.access_token);
  }
}

async function negative({ config, verifier, store, provider }) {
  for (const source of ["old", "new"]) {
    const corpus = await load(source);
    if (!(await load(`${source}-exchanged`)).refreshRotated) {
      // The archived source predates explicit every-use rotation. Demonstrate
      // that the candidate safely accepts, consumes and rotates its still-active
      // token before replaying it; do not call the old runtime security-qualified.
      const first = await exchange(config, {
        grant_type: "refresh_token",
        refresh_token: corpus.refresh
      });
      check(first.refresh_token !== corpus.refresh, "candidate_refresh_did_not_rotate");
    }
    await exchange(config, { grant_type: "refresh_token", refresh_token: corpus.refresh }, 400);
    let rejected = false;
    try {
      await verifier.verifyAccessToken(corpus.access);
    } catch {
      rejected = true;
    }
    check(rejected, "refresh_reuse_did_not_revoke_access");
    check(
      (await provider.Grant.find(corpus.providerGrantId)) === undefined,
      "revoked_provider_grant"
    );
    const connections = await store.listConnectionsForUser({
      userId: corpus.userId,
      organizationId: corpus.organizationId
    });
    check(connections[0]?.revokedAt != null, "revoked_connection");
    await exchange(
      config,
      {
        grant_type: "authorization_code",
        code: corpus.code,
        code_verifier: corpus.codeVerifier,
        redirect_uri: OPENAI_PRODUCTION_REDIRECT_URI
      },
      400
    );
  }
}

try {
  check(
    typeof directory === "string" &&
      ["seed", "exercise", "rollback", "negative"].includes(mode) &&
      ["old", "new"].includes(name),
    "arguments"
  );
  const context = await setup();
  if (mode === "seed") await seed(context);
  else if (mode === "exercise") await exercise(context);
  else if (mode === "rollback") await rollback(context);
  else await negative(context);
  console.log(`hosted_oauth_compatibility_${mode}_${name}_ok`);
} catch (error) {
  const reason =
    error instanceof Error && /^compat_[a-z_]+$/.test(error.message)
      ? error.message
      : "dependency_failure";
  const step = ["seed", "exercise", "rollback", "negative"].includes(mode) ? mode : "invalid";
  console.error(`hosted_oauth_compatibility_failed:${step}:${reason}`);
  process.exitCode = 1;
} finally {
  await app?.close();
  await Promise.all([pool.end(), rateLimiter.close()]);
}
