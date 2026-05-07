import { createEventEnvelope } from "../packages/shared-types/src/index.js";

type SmokeCheck = {
  name: "api-health" | "web-health" | "browser-session-auth" | "project-token-ingestion" | "incident-retrieval" | "bundle-retrieval";
  status: "ok";
  message: string;
};

type SelfhostSmokeInput = {
  apiBaseUrl: string;
  webBaseUrl: string;
  runId?: string;
  pollIntervalMs?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  wait?: (milliseconds: number) => Promise<void>;
};

type SelfhostSmokeResult = {
  checks: SmokeCheck[];
  projectId: string;
  incidentId: string;
  bundleVersion: number;
};

type LoginSession = {
  csrf_token: string;
};

function normalizeBaseUrl(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function resolveRunId(explicitRunId?: string): string {
  if (explicitRunId !== undefined && explicitRunId.trim().length > 0) {
    return explicitRunId.trim();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildJsonHeaders(extra: Record<string, string> = {}): HeadersInit {
  return {
    "content-type": "application/json",
    ...extra
  };
}

function parseJson<T>(value: unknown): T {
  return value as T;
}

function getSessionCookie(response: Response): string | null {
  const withGetSetCookie = response.headers as Headers & { getSetCookie?: () => string[] };
  const setCookies = typeof withGetSetCookie.getSetCookie === "function"
    ? withGetSetCookie.getSetCookie()
    : [];

  if (setCookies.length > 0) {
    return setCookies[0] ?? null;
  }

  return response.headers.get("set-cookie");
}

async function sleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function pollUntil<T>(input: {
  timeoutMs: number;
  pollIntervalMs: number;
  wait: (milliseconds: number) => Promise<void>;
  execute: () => Promise<T | null>;
  timeoutMessage: string;
}): Promise<T> {
  const deadline = Date.now() + input.timeoutMs;

  while (Date.now() <= deadline) {
    const result = await input.execute();
    if (result !== null) {
      return result;
    }

    await input.wait(input.pollIntervalMs);
  }

  throw new Error(input.timeoutMessage);
}

async function waitForApiHealth(input: {
  apiBaseUrl: string;
  timeoutMs: number;
  pollIntervalMs: number;
  fetchImpl: typeof fetch;
  wait: (milliseconds: number) => Promise<void>;
}): Promise<void> {
  await pollUntil({
    timeoutMs: input.timeoutMs,
    pollIntervalMs: input.pollIntervalMs,
    wait: input.wait,
    timeoutMessage: `Self-host API did not report healthy status within ${input.timeoutMs}ms.`,
    execute: async () => {
      try {
        const response = await input.fetchImpl(`${input.apiBaseUrl}/health`, { method: "GET" });
        if (!response.ok) {
          return null;
        }

        const payload = parseJson<{ status?: string }>(await response.json());
        return payload.status === "ok" ? true : null;
      } catch {
        return null;
      }
    }
  });
}

async function waitForWebHealth(input: {
  webBaseUrl: string;
  timeoutMs: number;
  pollIntervalMs: number;
  fetchImpl: typeof fetch;
  wait: (milliseconds: number) => Promise<void>;
}): Promise<void> {
  await pollUntil({
    timeoutMs: input.timeoutMs,
    pollIntervalMs: input.pollIntervalMs,
    wait: input.wait,
    timeoutMessage: `Self-host web app did not become reachable within ${input.timeoutMs}ms.`,
    execute: async () => {
      try {
        const response = await input.fetchImpl(`${input.webBaseUrl}/`, { method: "GET" });
        return response.ok ? true : null;
      } catch {
        return null;
      }
    }
  });
}

async function expectJsonResponse<T>(response: Response, errorPrefix: string): Promise<T> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`${errorPrefix} returned invalid JSON.`);
  }

  if (!response.ok) {
    throw new Error(`${errorPrefix} failed with HTTP ${response.status}.`);
  }

  return parseJson<T>(payload);
}

async function signupAndLogin(input: {
  apiBaseUrl: string;
  email: string;
  password: string;
  fetchImpl: typeof fetch;
}): Promise<{ cookie: string; csrfToken: string }> {
  const signupResponse = await input.fetchImpl(`${input.apiBaseUrl}/v1/auth/signup`, {
    method: "POST",
    headers: buildJsonHeaders(),
    body: JSON.stringify({
      email: input.email,
      password: input.password
    })
  });
  await expectJsonResponse<{ success: true }>(signupResponse, "Self-host signup");

  const loginResponse = await input.fetchImpl(`${input.apiBaseUrl}/v1/auth/login`, {
    method: "POST",
    headers: buildJsonHeaders(),
    body: JSON.stringify({
      email: input.email,
      password: input.password
    })
  });
  const loginPayload = await expectJsonResponse<{ session?: LoginSession }>(loginResponse, "Self-host login");

  const cookie = getSessionCookie(loginResponse);
  if (cookie === null || cookie.length === 0) {
    throw new Error("Self-host login did not return a session cookie.");
  }

  const csrfToken = loginPayload.session?.csrf_token;
  if (typeof csrfToken !== "string" || csrfToken.length === 0) {
    throw new Error("Self-host login did not return a CSRF token.");
  }

  return { cookie, csrfToken };
}

async function createProject(input: {
  apiBaseUrl: string;
  cookie: string;
  csrfToken: string;
  name: string;
  slug: string;
  fetchImpl: typeof fetch;
}): Promise<string> {
  const response = await input.fetchImpl(`${input.apiBaseUrl}/v1/projects`, {
    method: "POST",
    headers: buildJsonHeaders({
      cookie: input.cookie,
      "x-csrf-token": input.csrfToken
    }),
    body: JSON.stringify({
      name: input.name,
      slug: input.slug,
      environment_default: "production"
    })
  });
  const payload = await expectJsonResponse<{ project?: { project_id?: string } }>(response, "Self-host project creation");
  const projectId = payload.project?.project_id;
  if (typeof projectId !== "string" || projectId.length === 0) {
    throw new Error("Self-host project creation did not return a project id.");
  }

  return projectId;
}

async function createProjectToken(input: {
  apiBaseUrl: string;
  cookie: string;
  csrfToken: string;
  projectId: string;
  fetchImpl: typeof fetch;
}): Promise<string> {
  const response = await input.fetchImpl(`${input.apiBaseUrl}/v1/projects/${input.projectId}/tokens`, {
    method: "POST",
    headers: buildJsonHeaders({
      cookie: input.cookie,
      "x-csrf-token": input.csrfToken
    }),
    body: JSON.stringify({
      label: "selfhost-smoke"
    })
  });
  const payload = await expectJsonResponse<{ token?: { plaintext?: string } }>(response, "Self-host project token creation");
  const plaintext = payload.token?.plaintext;
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    throw new Error("Self-host project token creation did not return plaintext credentials.");
  }

  return plaintext;
}

async function ingestEvent(input: {
  apiBaseUrl: string;
  projectId: string;
  projectToken: string;
  serviceName: string;
  fetchImpl: typeof fetch;
}): Promise<void> {
  const now = new Date();
  const event = createEventEnvelope({
    event_type: "backend_exception",
    project_id: input.projectId,
    sdk_name: "debugbundle-selfhost-smoke",
    sdk_version: "0.1.0",
    occurred_at: now.toISOString(),
    service: {
      name: input.serviceName,
      environment: "production",
      runtime: "node",
      framework: null
    },
    payload: {
      name: "SelfHostSmokeError",
      message: `Self-host smoke verification for ${input.serviceName}`,
      stack: `SelfHostSmokeError: Self-host smoke verification for ${input.serviceName}\n    at selfhost.smoke (${input.serviceName})`,
      handled: false,
      request: {
        method: "GET",
        path: "/selfhost/smoke",
        query: {},
        headers: {}
      },
      response: {
        status_code: 500
      },
      runtime: {
        version: process.version
      }
    }
  });

  const response = await input.fetchImpl(`${input.apiBaseUrl}/v1/events`, {
    method: "POST",
    headers: buildJsonHeaders({
      authorization: `Bearer ${input.projectToken}`
    }),
    body: JSON.stringify({
      events: [event]
    })
  });
  const payload = await expectJsonResponse<{ accepted?: number }>(response, "Self-host ingestion");
  if (payload.accepted !== 1) {
    throw new Error("Self-host ingestion did not accept the smoke event.");
  }
}

async function pollIncident(input: {
  apiBaseUrl: string;
  cookie: string;
  projectId: string;
  serviceName: string;
  timeoutMs: number;
  pollIntervalMs: number;
  fetchImpl: typeof fetch;
  wait: (milliseconds: number) => Promise<void>;
}): Promise<string> {
  return pollUntil({
    timeoutMs: input.timeoutMs,
    pollIntervalMs: input.pollIntervalMs,
    wait: input.wait,
    timeoutMessage: `Self-host incident retrieval did not observe the smoke event within ${input.timeoutMs}ms.`,
    execute: async () => {
      const url = new URL(`${input.apiBaseUrl}/v1/incidents`);
      url.searchParams.set("project_id", input.projectId);
      url.searchParams.set("environment", "production");
      url.searchParams.set("service", input.serviceName);
      url.searchParams.set("limit", "1");

      const response = await input.fetchImpl(url.toString(), {
        method: "GET",
        headers: {
          cookie: input.cookie
        }
      });
      const payload = await expectJsonResponse<{ incidents?: Array<{ incident_id?: string }> }>(response, "Self-host incident retrieval");
      const incidentId = payload.incidents?.[0]?.incident_id;
      return typeof incidentId === "string" && incidentId.length > 0 ? incidentId : null;
    }
  });
}

async function pollBundle(input: {
  apiBaseUrl: string;
  cookie: string;
  incidentId: string;
  timeoutMs: number;
  pollIntervalMs: number;
  fetchImpl: typeof fetch;
  wait: (milliseconds: number) => Promise<void>;
}): Promise<number> {
  return pollUntil({
    timeoutMs: input.timeoutMs,
    pollIntervalMs: input.pollIntervalMs,
    wait: input.wait,
    timeoutMessage: `Self-host bundle retrieval did not finish within ${input.timeoutMs}ms.`,
    execute: async () => {
      const response = await input.fetchImpl(`${input.apiBaseUrl}/v1/incidents/${input.incidentId}/bundle`, {
        method: "GET",
        headers: {
          cookie: input.cookie
        }
      });
      const payload = parseJson<{ status?: string; bundle_version?: number }>(await response.json());
      if (!response.ok) {
        throw new Error(`Self-host bundle retrieval failed with HTTP ${response.status}.`);
      }

      if (payload.status === "failed") {
        throw new Error("Self-host bundle generation reported a failed status.");
      }

      if (payload.status === "pending") {
        return null;
      }

      return typeof payload.bundle_version === "number" ? payload.bundle_version : null;
    }
  });
}

export async function runSelfhostSmoke(input: SelfhostSmokeInput): Promise<SelfhostSmokeResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const wait = input.wait ?? sleep;
  const pollIntervalMs = input.pollIntervalMs ?? 1_000;
  const timeoutMs = input.timeoutMs ?? 120_000;
  const apiBaseUrl = normalizeBaseUrl(input.apiBaseUrl);
  const webBaseUrl = normalizeBaseUrl(input.webBaseUrl);
  const runId = resolveRunId(input.runId);
  const email = `selfhost-smoke+${runId}@debugbundle.local`;
  const password = `DebugBundle-${runId}-Pass1!`;
  const projectName = `Self-Host Smoke ${runId}`;
  const projectSlug = `selfhost-smoke-${runId.toLowerCase().replace(/[^a-z0-9-]/g, "-")}`;
  const serviceName = `selfhost-smoke-${runId}`;
  const checks: SmokeCheck[] = [];

  await waitForApiHealth({ apiBaseUrl, timeoutMs, pollIntervalMs, fetchImpl, wait });
  checks.push({
    name: "api-health",
    status: "ok",
    message: `API health endpoint responded from ${apiBaseUrl}.`
  });

  await waitForWebHealth({ webBaseUrl, timeoutMs, pollIntervalMs, fetchImpl, wait });
  checks.push({
    name: "web-health",
    status: "ok",
    message: `Web app root responded from ${webBaseUrl}.`
  });

  const session = await signupAndLogin({ apiBaseUrl, email, password, fetchImpl });
  const projectId = await createProject({
    apiBaseUrl,
    cookie: session.cookie,
    csrfToken: session.csrfToken,
    name: projectName,
    slug: projectSlug,
    fetchImpl
  });
  checks.push({
    name: "browser-session-auth",
    status: "ok",
    message: `Created smoke project ${projectId} through the browser-session flow.`
  });

  const projectToken = await createProjectToken({
    apiBaseUrl,
    cookie: session.cookie,
    csrfToken: session.csrfToken,
    projectId,
    fetchImpl
  });
  await ingestEvent({
    apiBaseUrl,
    projectId,
    projectToken,
    serviceName,
    fetchImpl
  });
  checks.push({
    name: "project-token-ingestion",
    status: "ok",
    message: `Ingested a smoke event with the project token for service ${serviceName}.`
  });

  const incidentId = await pollIncident({
    apiBaseUrl,
    cookie: session.cookie,
    projectId,
    serviceName,
    timeoutMs,
    pollIntervalMs,
    fetchImpl,
    wait
  });
  checks.push({
    name: "incident-retrieval",
    status: "ok",
    message: `Retrieved incident ${incidentId} through the session-authenticated API.`
  });

  const bundleVersion = await pollBundle({
    apiBaseUrl,
    cookie: session.cookie,
    incidentId,
    timeoutMs,
    pollIntervalMs,
    fetchImpl,
    wait
  });
  checks.push({
    name: "bundle-retrieval",
    status: "ok",
    message: `Retrieved bundle v${bundleVersion} for incident ${incidentId}.`
  });

  return {
    checks,
    projectId,
    incidentId,
    bundleVersion
  };
}

function formatSmokeResult(result: SelfhostSmokeResult): string {
  return [
    "DebugBundle self-host smoke passed.",
    ...result.checks.map((check) => `- ${check.name}: ${check.message}`),
    `Project: ${result.projectId}`,
    `Incident: ${result.incidentId}`,
    `Bundle version: ${result.bundleVersion}`
  ].join("\n");
}

async function main(): Promise<void> {
  const result = await runSelfhostSmoke({
    apiBaseUrl: process.env["SELFHOST_SMOKE_API_BASE_URL"] ?? "http://localhost:3000",
    webBaseUrl: process.env["SELFHOST_SMOKE_WEB_BASE_URL"] ?? "http://localhost:5291",
    ...(process.env["SELFHOST_SMOKE_RUN_ID"] === undefined ? {} : { runId: process.env["SELFHOST_SMOKE_RUN_ID"] }),
    ...(process.env["SELFHOST_SMOKE_POLL_INTERVAL_MS"] === undefined
      ? {}
      : { pollIntervalMs: Number.parseInt(process.env["SELFHOST_SMOKE_POLL_INTERVAL_MS"], 10) }),
    ...(process.env["SELFHOST_SMOKE_TIMEOUT_MS"] === undefined
      ? {}
      : { timeoutMs: Number.parseInt(process.env["SELFHOST_SMOKE_TIMEOUT_MS"], 10) })
  });

  console.log(formatSmokeResult(result));
}

if (import.meta.url === new URL(process.argv[1] ?? "", "file:").href) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`DebugBundle self-host smoke failed.\n${message}`);
    process.exitCode = 1;
  });
}