import { createHmac, createPrivateKey, createSign, timingSafeEqual } from "node:crypto";

import { z } from "zod";

const GITHUB_API_VERSION = "2022-11-28";
const DEFAULT_GITHUB_API_BASE_URL = "https://api.github.com";

const GitHubInstallationResponseSchema = z
  .object({
    id: z.number().int().nonnegative(),
    account: z
      .object({
        login: z.string().min(1),
        type: z.enum(["Organization", "User"])
      })
  });

const GitHubInstallationAccessTokenResponseSchema = z
  .object({
    token: z.string().min(1)
  });

const GitHubInstallationRepositoriesResponseSchema = z
  .object({
    repositories: z.array(
      z
        .object({
          id: z.number().int().nonnegative(),
          name: z.string().min(1),
          full_name: z.string().min(1),
          private: z.boolean(),
          default_branch: z.string().min(1),
          owner: z
            .object({
              login: z.string().min(1)
            })
        })
    )
  });

const GitHubAppResponseSchema = z
  .object({
    slug: z.string().min(1)
  });

function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function buildGitHubAppJwt(appId: string, privateKeyPem: string, now: Date): string {
  const issuedAtSeconds = Math.floor(now.getTime() / 1000);
  const payload = {
    iat: issuedAtSeconds - 30,
    exp: issuedAtSeconds + 9 * 60,
    iss: appId
  };
  const encodedHeader = encodeBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(createPrivateKey(privateKeyPem));
  return `${signingInput}.${signature.toString("base64url")}`;
}

function buildGitHubHeaders(authorization: string): HeadersInit {
  return {
    accept: "application/vnd.github+json",
    authorization,
    "x-github-api-version": GITHUB_API_VERSION,
    "user-agent": "DebugBundle/0.1"
  };
}

function normalizeGitHubPrivateKey(value: string): string {
  return value.includes("\\n") ? value.replace(/\\n/g, "\n") : value;
}

export interface GitHubAppClient {
  getInstallUrl(): Promise<string>;
  getInstallation(input: { installationId: number }): Promise<{
    installation_id: number;
    account_login: string;
    account_type: "Organization" | "User";
  }>;
  listRepositories(input: { installationId: number }): Promise<
    Array<{
      id: number;
      owner: string;
      name: string;
      full_name: string;
      default_branch: string;
      private: boolean;
    }>
  >;
  verifyWebhookSignature(input: { rawBody: Buffer; signature: string }): boolean;
}

export function createGitHubAppClient(
  config: {
    appId: string;
    privateKey: string;
    webhookSecret: string;
    apiBaseUrl?: string;
  },
  dependencies?: {
    fetchImpl?: typeof fetch;
    now?: () => Date;
  }
): GitHubAppClient {
  const fetchImpl = dependencies?.fetchImpl ?? fetch;
  const now = dependencies?.now ?? (() => new Date());
  const apiBaseUrl = (config.apiBaseUrl ?? DEFAULT_GITHUB_API_BASE_URL).replace(/\/+$/, "");

  async function requestJson<T>(path: string, init: RequestInit, schema: z.ZodType<T>): Promise<T> {
    const response = await fetchImpl(`${apiBaseUrl}${path}`, init);
    if (!response.ok) {
      throw new Error(`github_api_error:${response.status}`);
    }

    const responseBody: unknown = await response.json();
    const parsed = schema.safeParse(responseBody);
    if (!parsed.success) {
      throw new Error("github_api_invalid_response");
    }

    return parsed.data;
  }

  async function createInstallationAccessToken(installationId: number): Promise<string> {
    const appJwt = buildGitHubAppJwt(config.appId, config.privateKey, now());
    const data = await requestJson(
      `/app/installations/${installationId}/access_tokens`,
      {
        method: "POST",
        headers: buildGitHubHeaders(`Bearer ${appJwt}`)
      },
      GitHubInstallationAccessTokenResponseSchema
    );

    return data.token;
  }

  return {
    async getInstallUrl() {
      const appJwt = buildGitHubAppJwt(config.appId, config.privateKey, now());
      const data = await requestJson(
        "/app",
        {
          method: "GET",
          headers: buildGitHubHeaders(`Bearer ${appJwt}`)
        },
        GitHubAppResponseSchema
      );

      return `https://github.com/apps/${encodeURIComponent(data.slug)}/installations/new`;
    },

    async getInstallation(input) {
      const appJwt = buildGitHubAppJwt(config.appId, config.privateKey, now());
      const data = await requestJson(
        `/app/installations/${input.installationId}`,
        {
          method: "GET",
          headers: buildGitHubHeaders(`Bearer ${appJwt}`)
        },
        GitHubInstallationResponseSchema
      );

      return {
        installation_id: data.id,
        account_login: data.account.login,
        account_type: data.account.type
      };
    },

    async listRepositories(input) {
      const token = await createInstallationAccessToken(input.installationId);
      const data = await requestJson(
        "/installation/repositories",
        {
          method: "GET",
          headers: buildGitHubHeaders(`Bearer ${token}`)
        },
        GitHubInstallationRepositoriesResponseSchema
      );

      return data.repositories.map((repository: z.infer<typeof GitHubInstallationRepositoriesResponseSchema>["repositories"][number]) => ({
        id: repository.id,
        owner: repository.owner.login,
        name: repository.name,
        full_name: repository.full_name,
        default_branch: repository.default_branch,
        private: repository.private
      }));
    },

    verifyWebhookSignature(input) {
      const expectedPrefix = "sha256=";
      if (!input.signature.startsWith(expectedPrefix)) {
        return false;
      }

      const provided = input.signature.slice(expectedPrefix.length);
      const digest = createHmac("sha256", config.webhookSecret).update(input.rawBody).digest("hex");
      const providedBuffer = Buffer.from(provided, "hex");
      const digestBuffer = Buffer.from(digest, "hex");
      if (providedBuffer.length !== digestBuffer.length) {
        return false;
      }

      return timingSafeEqual(providedBuffer, digestBuffer);
    }
  };
}

export function createGitHubAppClientFromEnv(env: Record<string, string | undefined>): GitHubAppClient | undefined {
  const appId = env["GITHUB_APP_ID"]?.trim();
  const privateKey = env["GITHUB_APP_PRIVATE_KEY"]?.trim();
  const webhookSecret = env["GITHUB_APP_WEBHOOK_SECRET"]?.trim();
  const apiBaseUrl = env["GITHUB_API_BASE_URL"]?.trim();

  if (!appId || !privateKey || !webhookSecret) {
    return undefined;
  }

  return createGitHubAppClient({
    appId,
    privateKey: normalizeGitHubPrivateKey(privateKey),
    webhookSecret,
    ...(apiBaseUrl ? { apiBaseUrl } : {})
  });
}
