import { gunzipSync } from "node:zlib";

import type { AuthEmailSender, GitHubOAuthConfig } from "../../../packages/auth/src/index.js";
import { createGitHubOAuthClient } from "../../../packages/auth/src/index.js";
import {
  buildEmailBrandMarkUrl,
  renderEmailAuthCodeEmail,
  renderProjectInviteEmail,
  type EmailMessage,
  type EmailTransport
} from "../../../packages/email/src/index.js";
import {
  buildBundleObjectKey,
  buildImprovementBundleObjectKey,
  buildRawEventObjectKey,
  buildReproductionObjectKey,
  type ObjectStoreReader,
  type Queryable
} from "../../../packages/storage/src/index.js";

const DEV_GITHUB_MOCK_CODE = "debugbundle-dev-mock-code";
const DEV_GITHUB_MOCK_USER_ID = "debugbundle-dev-mock-user";
const DEV_GITHUB_MOCK_EMAIL = "dev@debugbundle.local";

export interface BillingEmailContact {
  organizationName: string;
  recipientEmail: string;
}

export interface BillingEmailService {
  managementUrl?: string;
  getBillingContactForOrganization(input: { organization_id: string }): Promise<BillingEmailContact | null>;
  send(message: EmailMessage): Promise<void>;
}

export function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function readNonEmptyEnv(env: Record<string, string | undefined>, key: string): string | undefined {
  const value = env[key];
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function resolveEmailAssetBaseUrl(env: Record<string, string | undefined>): string | undefined {
  return readNonEmptyEnv(env, "EMAIL_ASSET_BASE_URL")
    ?? readNonEmptyEnv(env, "APP_BASE_URL")
    ?? readNonEmptyEnv(env, "PUBLIC_SITE_URL");
}

export function readCsvEnv(env: Record<string, string | undefined>, key: string): string[] | undefined {
  const value = readNonEmptyEnv(env, key);
  if (value === undefined) {
    return undefined;
  }

  const entries = value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  return entries.length > 0 ? entries : undefined;
}

export function getStringField(record: Record<string, unknown>, field: string): string | null {
  const value = record[field];
  return typeof value === "string" ? value : null;
}

export function getBooleanField(record: Record<string, unknown>, field: string): boolean {
  return record[field] === true;
}

async function readStoredJsonArtifact(
  objectStoreReader: Pick<ObjectStoreReader, "getObject">,
  key: string,
): Promise<{ key: string; content: unknown }> {
  try {
    const compressed = await objectStoreReader.getObject({ key });

    try {
      return {
        key,
        content: JSON.parse(gunzipSync(compressed).toString("utf8")),
      };
    } catch {
      return {
        key,
        content: { error: "artifact_invalid" },
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      key,
      content: { error: message === "s3_object_not_found" ? "artifact_not_found" : "artifact_unavailable" },
    };
  }
}

export async function buildAccountExportArtifacts(
  objectStoreReader: Pick<ObjectStoreReader, "getObject">,
  exportData: {
    incidents: Record<string, unknown>[];
    incident_events: Record<string, unknown>[];
    improvement_opportunities: Record<string, unknown>[];
    improvement_opportunity_events: Record<string, unknown>[];
  },
): Promise<{
  raw_events: Array<{ key: string; content: unknown }>;
  bundles: Array<{ key: string; content: unknown }>;
  reproductions: Array<{ key: string; content: unknown }>;
}> {
  const rawEventRefs = new Set(exportData.incident_events.flatMap((record) => {
    if (!getBooleanField(record, "is_sampled")) {
      return [];
    }

    const projectId = getStringField(record, "project_id");
    const eventId = getStringField(record, "event_id");
    const occurredAt = getStringField(record, "occurred_at");
    if (projectId === null || eventId === null || occurredAt === null) {
      return [];
    }

    return [
      buildRawEventObjectKey({
        projectId,
        eventId,
        occurredAt: new Date(occurredAt),
      }),
    ];
  }));

  for (const record of exportData.improvement_opportunity_events) {
    const projectId = getStringField(record, "project_id");
    const eventId = getStringField(record, "event_id");
    const occurredAt = getStringField(record, "occurred_at");
    if (projectId === null || eventId === null || occurredAt === null) {
      continue;
    }

    rawEventRefs.add(
      buildRawEventObjectKey({
        projectId,
        eventId,
        occurredAt: new Date(occurredAt),
      }),
    );
  }

  const incidentRefs = exportData.incidents.flatMap((record) => {
    const projectId = getStringField(record, "project_id");
    const incidentId = getStringField(record, "incident_id");
    if (projectId === null || incidentId === null) {
      return [];
    }

    return [
      {
        bundleKey: buildBundleObjectKey(projectId, incidentId),
        reproductionKey: buildReproductionObjectKey(projectId, incidentId),
      },
    ];
  });

  const improvementBundleRefs = exportData.improvement_opportunities.flatMap((record) => {
    const projectId = getStringField(record, "project_id");
    const opportunityId = getStringField(record, "improvement_opportunity_id");
    const generationNumber = Number(record["bundle_generation_number"] ?? 0);
    if (projectId === null || opportunityId === null || generationNumber <= 0) {
      return [];
    }

    return [buildImprovementBundleObjectKey(projectId, opportunityId)];
  });

  const raw_events = await Promise.all([...rawEventRefs].map((key) => readStoredJsonArtifact(objectStoreReader, key)));
  const bundles = await Promise.all([
    ...incidentRefs.map((record) => readStoredJsonArtifact(objectStoreReader, record.bundleKey)),
    ...improvementBundleRefs.map((key) => readStoredJsonArtifact(objectStoreReader, key)),
  ]);
  const reproductions = await Promise.all(
    incidentRefs.map((record) => readStoredJsonArtifact(objectStoreReader, record.reproductionKey)),
  );

  return { raw_events, bundles, reproductions };
}

export function createGithubOAuthConfigFromEnv(env: Record<string, string | undefined>): GitHubOAuthConfig | undefined {
  const appBaseUrl = readNonEmptyEnv(env, "APP_BASE_URL");
  const githubClientId = readNonEmptyEnv(env, "GITHUB_CLIENT_ID");
  const githubClientSecret = readNonEmptyEnv(env, "GITHUB_CLIENT_SECRET");
  const githubOauthCallbackUrl = readNonEmptyEnv(env, "GITHUB_OAUTH_CALLBACK_URL");
  const githubOauthStateSecret = readNonEmptyEnv(env, "GITHUB_OAUTH_STATE_SECRET");
  const hasRealGithubConfig =
    githubClientId !== undefined &&
    githubClientSecret !== undefined &&
    githubOauthCallbackUrl !== undefined &&
    githubOauthStateSecret !== undefined &&
    appBaseUrl !== undefined;

  if (hasRealGithubConfig) {
    return {
      clientId: githubClientId,
      callbackUrl: githubOauthCallbackUrl,
      appRedirectUrl: `${stripTrailingSlash(appBaseUrl)}${"/auth/github/callback"}`,
      stateSecret: githubOauthStateSecret,
      client: createGitHubOAuthClient({
        clientId: githubClientId,
        clientSecret: githubClientSecret,
        callbackUrl: githubOauthCallbackUrl
      })
    };
  }

  if (env["DEV_GITHUB_MOCK_LOGIN"] !== "true" || appBaseUrl === undefined) {
    return undefined;
  }

  const normalizedAppBaseUrl = stripTrailingSlash(appBaseUrl);

  return {
    clientId: "debugbundle-dev-mock-github",
    callbackUrl: githubOauthCallbackUrl ?? `${normalizedAppBaseUrl}/v1/auth/github/callback`,
    appRedirectUrl: `${normalizedAppBaseUrl}/auth/github/callback`,
    authorizeUrl: `${normalizedAppBaseUrl}/v1/auth/github/mock-authorize`,
    stateSecret: githubOauthStateSecret ?? "debugbundle-dev-mock-github-state-secret",
    client: {
      exchangeCodeForIdentity: ({ code }) => {
        if (code !== DEV_GITHUB_MOCK_CODE) {
          return Promise.resolve(null);
        }

        return Promise.resolve({
          github_user_id: DEV_GITHUB_MOCK_USER_ID,
          email: env["DEV_GITHUB_MOCK_EMAIL"] ?? DEV_GITHUB_MOCK_EMAIL
        });
      },
      resolveIdentityFromAccessToken: ({ access_token }) => {
        if (access_token !== DEV_GITHUB_MOCK_CODE) {
          return Promise.resolve({
            ok: false as const,
            error: "token_invalid" as const
          });
        }

        return Promise.resolve({
          ok: true as const,
          identity: {
            github_user_id: DEV_GITHUB_MOCK_USER_ID,
            email: env["DEV_GITHUB_MOCK_EMAIL"] ?? DEV_GITHUB_MOCK_EMAIL
          }
        });
      },
      beginDeviceAuthorization: () =>
        Promise.resolve({
          ok: true as const,
          device_code: DEV_GITHUB_MOCK_CODE,
          user_code: "MOCK-CODE",
          verification_uri: `${normalizedAppBaseUrl}/v1/auth/github/mock-authorize`,
          expires_in: 900,
          interval: 5
        }),
      pollDeviceAuthorization: ({ device_code }) => {
        if (device_code !== DEV_GITHUB_MOCK_CODE) {
          return Promise.resolve({
            status: "provider_error" as const
          });
        }

        return Promise.resolve({
          status: "approved" as const,
          identity: {
            github_user_id: DEV_GITHUB_MOCK_USER_ID,
            email: env["DEV_GITHUB_MOCK_EMAIL"] ?? DEV_GITHUB_MOCK_EMAIL
          }
        });
      }
    }
  };
}

export function normalizeEmailForConfig(email: string): string {
  return email.trim().toLowerCase();
}

export function readBillingAdminEmailsFromEnv(env: Record<string, string | undefined>): string[] | undefined {
  const emails = readCsvEnv(env, "BILLING_ADMIN_OVERRIDE_EMAILS");
  if (emails === undefined) {
    return undefined;
  }

  const normalized = [...new Set(emails.map(normalizeEmailForConfig).filter((email) => email.length > 0))];
  return normalized.length > 0 ? normalized : undefined;
}

export function createAuthEmailSender(input: {
  emailTransport: EmailTransport;
  appBaseUrl: string;
  emailAssetBaseUrl?: string;
}): AuthEmailSender {
  const baseUrl = stripTrailingSlash(input.appBaseUrl);
  const brandMarkUrl = buildEmailBrandMarkUrl(input.emailAssetBaseUrl ?? baseUrl);

  return {
    async sendEmailAuthCode({ email, code, expires_in_minutes }): Promise<void> {
      const rendered = renderEmailAuthCodeEmail({
        code,
        expiresInMinutes: expires_in_minutes,
        appUrl: `${baseUrl}/login`,
        brandMarkUrl
      });
      await input.emailTransport.send({
        to: [email],
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html
      });
    },

    async sendProjectInviteEmail({ email, token, inviter_name }): Promise<void> {
      const rendered = renderProjectInviteEmail({
        acceptUrl: `${baseUrl}/invite?token=${encodeURIComponent(token)}`,
        inviterName: inviter_name,
        brandMarkUrl
      });
      await input.emailTransport.send({
        to: [email],
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html
      });
    }
  };
}

export function createBillingEmailService(input: {
  db: Queryable;
  emailTransport: EmailTransport;
  appBaseUrl: string;
}): BillingEmailService {
  const managementUrl = `${stripTrailingSlash(input.appBaseUrl)}/billing`;

  return {
    managementUrl,
    async getBillingContactForOrganization(request: { organization_id: string }): Promise<BillingEmailContact | null> {
      const result = await input.db.query<{
        organization_name: string;
        recipient_email: string;
      }>(
        `
          SELECT
            o.name AS organization_name,
            u.email AS recipient_email
          FROM organizations o
          JOIN organization_members om
            ON om.organization_id = o.id
           AND om.role = 'owner'
          JOIN users u
            ON u.id = om.user_id
          WHERE o.id = $1
          ORDER BY om.created_at ASC, om.user_id ASC
          LIMIT 1
        `,
        [request.organization_id]
      );

      const row = result.rows[0];
      if (row === undefined) {
        return null;
      }

      return {
        organizationName: row.organization_name,
        recipientEmail: row.recipient_email
      };
    },
    async send(message: EmailMessage): Promise<void> {
      await input.emailTransport.send(message);
    }
  };
}
