import { execFile as execFileFromNode } from "node:child_process";
import { promisify } from "node:util";

import { z } from "zod";

import { buildTokenPreview, persistCliAuthState } from "./auth-state.js";
import type { CliAuthState } from "./auth-state.js";
import type { CliCommandResult } from "./token-commands.js";

const execFile = promisify(execFileFromNode);
const DEFAULT_BASE_URL = "https://api.debugbundle.com";
const DEFAULT_GITHUB_BOOTSTRAP_LABEL = "GitHub bootstrap";
const MIN_DEVICE_POLL_INTERVAL_SECONDS = 7;

const LoginCommandInputSchema = z
  .object({
    bearerToken: z.string().trim().min(1).optional(),
    baseUrl: z.string().url().default(DEFAULT_BASE_URL),
    github: z.boolean().optional(),
    githubCli: z.boolean().optional(),
    githubDevice: z.boolean().optional(),
    label: z.string().trim().min(1).max(120).default(DEFAULT_GITHUB_BOOTSTRAP_LABEL)
  })
  .superRefine((value, context) => {
    const githubModeCount = [value.github, value.githubCli, value.githubDevice].filter((flag) => flag === true).length;
    if (githubModeCount > 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "github_mode_conflict"
      });
    }

    if (value.bearerToken !== undefined && githubModeCount > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "login_mode_conflict"
      });
    }

    if (value.bearerToken === undefined && githubModeCount === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "login_mode_missing"
      });
    }
  });

const ApiErrorResponseSchema = z
  .object({
    error: z.string()
  })
  .strict();

const DeviceStartResponseSchema = z
  .object({
    request_id: z.string().uuid(),
    user_code: z.string().min(1),
    verification_uri: z.string().url(),
    interval_seconds: z.number().int().positive(),
    expires_at: z.string().datetime()
  })
  .strict();

const DevicePollResponseSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("pending"),
      interval_seconds: z.number().int().positive(),
      expires_at: z.string().datetime()
    })
    .strict(),
  z
    .object({
      status: z.enum(["approved", "claimed"]),
      expires_at: z.string().datetime()
    })
    .strict(),
  z
    .object({
      status: z.enum(["denied", "expired", "rejected"]),
      reason: z.string(),
      expires_at: z.string().datetime()
    })
    .strict()
]);

const MemberTokenResponseSchema = z
  .object({
    token: z
      .object({
        token_id: z.string(),
        user_id: z.string(),
        organization_id: z.string(),
        label: z.string(),
        created_at: z.string(),
        last_used_at: z.string().nullable(),
        revoked_at: z.string().nullable(),
        expires_at: z.string().nullable(),
        plaintext: z.string()
      })
      .strict()
  })
  .strict();

type DeviceStartResponse = z.infer<typeof DeviceStartResponseSchema>;
type DevicePollResponse = z.infer<typeof DevicePollResponseSchema>;
type MemberTokenResponse = z.infer<typeof MemberTokenResponseSchema>;

class LoginApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(`login_api_error: ${status}:${code}`);
    this.status = status;
    this.code = code;
  }
}

type LoginMode = "token" | "github" | "github-cli" | "github-device";

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}

function formatLoginOutput(authState: CliAuthState, authFilePath: string): string {
  return [
    "Authenticated: yes",
    `Base URL: ${authState.base_url}`,
    `Auth File: ${authFilePath}`,
    `Token: ${buildTokenPreview(authState.bearer_token)}`
  ].join("\n");
}

function validateMemberToken(token: string): boolean {
  return token.startsWith("dbundle_mem_");
}

function resolveLoginMode(input: z.infer<typeof LoginCommandInputSchema>): LoginMode {
  if (input.bearerToken !== undefined) {
    return "token";
  }
  if (input.githubCli === true) {
    return "github-cli";
  }
  if (input.githubDevice === true) {
    return "github-device";
  }

  return "github";
}

function mapInputValidationError(parsedInput: z.SafeParseError<unknown>): string {
  if (parsedInput.error.issues.some((issue) => issue.message === "github_mode_conflict")) {
    return "Choose only one of --github, --github-cli, or --github-device.";
  }
  if (parsedInput.error.issues.some((issue) => issue.message === "login_mode_conflict")) {
    return "Use either a member token or a GitHub login mode, not both.";
  }
  if (parsedInput.error.issues.some((issue) => issue.message === "login_mode_missing")) {
    return "Provide either a member token or one of --github, --github-cli, or --github-device.";
  }

  return "Invalid login options.";
}

function mapApiErrorToMessage(error: LoginApiError): string {
  switch (error.code) {
    case "auth_not_configured":
      return "GitHub login is not configured on this DebugBundle API.";
    case "github_device_flow_disabled":
      return "GitHub device flow is not enabled for this DebugBundle API.";
    case "github_oauth_unavailable":
      return "GitHub OAuth is temporarily unavailable.";
    case "invalid_github_token":
      return "The local GitHub CLI token was rejected by DebugBundle.";
    case "github_device_request_not_found":
      return "GitHub device authorization request was not found.";
    case "github_device_auth_pending":
      return "GitHub device authorization has not completed yet.";
    case "github_device_auth_expired":
      return "GitHub device authorization expired before it could be claimed.";
    case "github_device_auth_claimed":
      return "GitHub device authorization was already claimed.";
    case "github_device_auth_rejected":
      return "GitHub device authorization was rejected.";
    case "github_email_unavailable":
      return "GitHub did not provide a verified primary email address.";
    case "account_signup_disabled":
      return "This DebugBundle workspace does not allow new account signups for this GitHub identity.";
    case "account_suspended":
      return "This DebugBundle account is suspended.";
    case "rate_limited":
      return "GitHub login was rate limited. Please wait and try again.";
    default:
      return `GitHub login failed: ${error.code}`;
  }
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const rawBody = await response.text();
  if (rawBody.length === 0) {
    return null;
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    return rawBody;
  }
}

async function requestJson(
  input: {
    baseUrl: string;
    method: "POST";
    path: string;
    body: unknown;
  },
  dependencies?: { fetchImpl?: typeof fetch }
): Promise<unknown> {
  const fetchImpl = dependencies?.fetchImpl ?? fetch;
  const response = await fetchImpl(`${normalizeBaseUrl(input.baseUrl)}${input.path}`, {
    method: input.method,
    headers: {
      accept: "application/json",
      "content-type": "application/json"
    },
    body: JSON.stringify(input.body)
  });
  const body = await parseResponseBody(response);

  if (response.status < 200 || response.status >= 300) {
    const parsedError = ApiErrorResponseSchema.safeParse(body);
    throw new LoginApiError(response.status, parsedError.success ? parsedError.data.error : "unknown_error");
  }

  return body;
}

async function readGitHubAccessTokenFromGh(): Promise<string | null> {
  try {
    const result = await execFile("gh", ["auth", "token"]);
    const token = result.stdout.trim();
    return token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

async function exchangeGitHubToken(
  input: {
    baseUrl: string;
    githubAccessToken: string;
    label: string;
  },
  dependencies?: { fetchImpl?: typeof fetch }
): Promise<MemberTokenResponse> {
  const body = await requestJson(
    {
      baseUrl: input.baseUrl,
      method: "POST",
      path: "/v1/auth/github/token/exchange",
      body: {
        github_access_token: input.githubAccessToken,
        label: input.label,
        accepted_terms: true
      }
    },
    dependencies
  );
  return MemberTokenResponseSchema.parse(body);
}

async function startGitHubDeviceFlow(
  input: { baseUrl: string },
  dependencies?: { fetchImpl?: typeof fetch }
): Promise<DeviceStartResponse> {
  const body = await requestJson(
    {
      baseUrl: input.baseUrl,
      method: "POST",
      path: "/v1/auth/github/device/start",
      body: {
        accepted_terms: true
      }
    },
    dependencies
  );
  return DeviceStartResponseSchema.parse(body);
}

async function pollGitHubDeviceFlow(
  input: {
    baseUrl: string;
    requestId: string;
  },
  dependencies?: { fetchImpl?: typeof fetch }
): Promise<DevicePollResponse> {
  const body = await requestJson(
    {
      baseUrl: input.baseUrl,
      method: "POST",
      path: "/v1/auth/github/device/poll",
      body: {
        request_id: input.requestId
      }
    },
    dependencies
  );
  return DevicePollResponseSchema.parse(body);
}

async function claimGitHubDeviceFlow(
  input: {
    baseUrl: string;
    requestId: string;
    label: string;
  },
  dependencies?: { fetchImpl?: typeof fetch }
): Promise<MemberTokenResponse> {
  const body = await requestJson(
    {
      baseUrl: input.baseUrl,
      method: "POST",
      path: "/v1/auth/github/device/claim",
      body: {
        request_id: input.requestId,
        label: input.label
      }
    },
    dependencies
  );
  return MemberTokenResponseSchema.parse(body);
}

function formatPersistedSuccess(
  input: {
    authFilePath?: string;
    baseUrl: string;
    json?: boolean;
    bearerToken: string;
  },
  dependencies: {
    writeAuthState: (input: { authFilePath?: string; authState: CliAuthState }) => Promise<string | void>;
  }
): Promise<CliCommandResult> {
  const authState: CliAuthState = {
    bearer_token: input.bearerToken,
    base_url: input.baseUrl
  };

  return dependencies.writeAuthState({
    ...(input.authFilePath === undefined ? {} : { authFilePath: input.authFilePath }),
    authState
  }).then((persistedPath) => {
    const authFilePath = persistedPath ?? input.authFilePath ?? "";
    const payload = {
      authenticated: true,
      auth: {
        base_url: authState.base_url,
        token_preview: buildTokenPreview(authState.bearer_token)
      },
      auth_file_path: authFilePath
    };

    return {
      exitCode: 0,
      output: input.json ? JSON.stringify(payload) : formatLoginOutput(authState, authFilePath)
    };
  });
}

function buildProgressReporter(
  dependency?: ((text: string) => void) | undefined
): (text: string) => void {
  if (dependency !== undefined) {
    return dependency;
  }

  return (text: string) => {
    process.stderr.write(`${text}\n`);
  };
}

export { persistCliAuthState } from "./auth-state.js";

export async function loginCommand(
  input: {
    authFilePath?: string;
    bearerToken?: string;
    baseUrl?: string;
    json?: boolean;
    github?: boolean;
    githubCli?: boolean;
    githubDevice?: boolean;
    label?: string;
  },
  dependencies?: {
    fetchImpl?: typeof fetch;
    writeAuthState?: (input: { authFilePath?: string; authState: CliAuthState }) => Promise<string | void>;
    readGitHubAccessToken?: () => Promise<string | null>;
    sleep?: (ms: number) => Promise<void>;
    reportProgress?: (text: string) => void;
  }
): Promise<CliCommandResult> {
  const parsedInput = LoginCommandInputSchema.safeParse({
    bearerToken: input.bearerToken,
    baseUrl: input.baseUrl ?? DEFAULT_BASE_URL,
    github: input.github,
    githubCli: input.githubCli,
    githubDevice: input.githubDevice,
    label: input.label ?? DEFAULT_GITHUB_BOOTSTRAP_LABEL
  });

  if (!parsedInput.success) {
    return {
      exitCode: 4,
      output: mapInputValidationError(parsedInput)
    };
  }

  const normalizedInput = parsedInput.data;
  const writeAuthState =
    dependencies?.writeAuthState ??
    (persistCliAuthState as (input: { authFilePath?: string; authState: CliAuthState }) => Promise<string | void>);

  try {
    if (resolveLoginMode(normalizedInput) === "token") {
      if (!validateMemberToken(normalizedInput.bearerToken!)) {
        return {
          exitCode: 4,
          output: "Invalid member token."
        };
      }

      return await formatPersistedSuccess(
        {
          baseUrl: normalizedInput.baseUrl,
          bearerToken: normalizedInput.bearerToken!,
          ...(input.json === undefined ? {} : { json: input.json }),
          ...(input.authFilePath === undefined ? {} : { authFilePath: input.authFilePath })
        },
        { writeAuthState }
      );
    }

    const readGitHubAccessToken = dependencies?.readGitHubAccessToken ?? readGitHubAccessTokenFromGh;
    const sleep = dependencies?.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    const reportProgress = buildProgressReporter(dependencies?.reportProgress);
    const loginMode = resolveLoginMode(normalizedInput);

    if (loginMode !== "github-device") {
      const githubAccessToken = await readGitHubAccessToken();
      if (githubAccessToken !== null) {
        reportProgress("Using existing GitHub CLI authentication.");

        try {
          const exchanged = await exchangeGitHubToken(
            {
              baseUrl: normalizedInput.baseUrl,
              githubAccessToken,
              label: normalizedInput.label
            },
            dependencies
          );

          return await formatPersistedSuccess(
            {
              baseUrl: normalizedInput.baseUrl,
              bearerToken: exchanged.token.plaintext,
              ...(input.json === undefined ? {} : { json: input.json }),
              ...(input.authFilePath === undefined ? {} : { authFilePath: input.authFilePath })
            },
            { writeAuthState }
          );
        } catch (error) {
          if (!(error instanceof LoginApiError)) {
            throw error;
          }

          if (loginMode === "github-cli" || error.code !== "invalid_github_token") {
            return {
              exitCode: error.status === 401 || error.status === 403 ? 4 : 1,
              output: mapApiErrorToMessage(error)
            };
          }

          reportProgress("The local GitHub CLI token was not accepted. Falling back to device flow.");
        }
      } else if (loginMode === "github-cli") {
        return {
          exitCode: 4,
          output: "GitHub CLI is not authenticated on this machine."
        };
      } else {
        reportProgress("GitHub CLI is not authenticated. Falling back to device flow.");
      }
    }

    const started = await startGitHubDeviceFlow(
      {
        baseUrl: normalizedInput.baseUrl
      },
      dependencies
    );

    reportProgress(`Open ${started.verification_uri} and enter code ${started.user_code}.`);
    reportProgress("Waiting for GitHub approval...");

    let intervalSeconds = Math.max(started.interval_seconds, MIN_DEVICE_POLL_INTERVAL_SECONDS);

    for (;;) {
      await sleep(intervalSeconds * 1_000);

      const polled = await pollGitHubDeviceFlow(
        {
          baseUrl: normalizedInput.baseUrl,
          requestId: started.request_id
        },
        dependencies
      );

      if (polled.status === "pending") {
        intervalSeconds = Math.max(polled.interval_seconds, MIN_DEVICE_POLL_INTERVAL_SECONDS);
        continue;
      }

      if (polled.status === "approved") {
        const claimed = await claimGitHubDeviceFlow(
          {
            baseUrl: normalizedInput.baseUrl,
            requestId: started.request_id,
            label: normalizedInput.label
          },
          dependencies
        );

        return await formatPersistedSuccess(
          {
            baseUrl: normalizedInput.baseUrl,
            bearerToken: claimed.token.plaintext,
            ...(input.json === undefined ? {} : { json: input.json }),
            ...(input.authFilePath === undefined ? {} : { authFilePath: input.authFilePath })
          },
          { writeAuthState }
        );
      }

      if (polled.status === "claimed") {
        return {
          exitCode: 4,
          output: "GitHub device authorization was already claimed."
        };
      }

      if (polled.status === "denied" || polled.status === "expired" || polled.status === "rejected") {
        return {
          exitCode: 4,
          output:
            polled.status === "denied"
              ? "GitHub device authorization was denied."
              : polled.status === "expired"
                ? "GitHub device authorization expired."
                : `GitHub device authorization was rejected: ${polled.reason}`
        };
      }

      return {
        exitCode: 1,
        output: "GitHub device authorization returned an unexpected status."
      };
    }
  } catch (error) {
    if (error instanceof LoginApiError) {
      return {
        exitCode: error.status === 400 || error.status === 401 || error.status === 403 || error.status === 409 ? 4 : 1,
        output: mapApiErrorToMessage(error)
      };
    }

    return {
      exitCode: 1,
      output: error instanceof Error ? error.message : String(error)
    };
  }
}
