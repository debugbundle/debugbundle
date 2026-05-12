import { readdir as readdirFromFs, readFile as readFileFromFs, stat as statFromFs } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import { classifyEvent } from "../../../packages/event-normalizer/src/index.js";
import { redact, type JsonValue } from "../../../packages/redaction/src/index.js";
import { createEventEnvelope } from "../../../packages/shared-types/src/index.js";
import { CliAuthStateError, readCliAuthState } from "./auth-state.js";
import type { CliAuthState } from "./auth-state.js";
import { ConnectionConfigSchema } from "./connection-config.js";
import { CONNECTION_FILE_PATH, PROFILE_FILE_PATH, SKILL_FILE_PATH } from "./local-scaffold.js";
import type { CliCommandResult } from "./token-commands.js";

type FileReader = (path: string) => Promise<string>;
type DirectoryReader = (path: string) => Promise<string[]>;
type StatReader = (path: string) => Promise<{ isDirectory(): boolean; mtimeMs: number }>;

type DoctorCommandDependencies = {
  cwd?: () => string;
  now?: () => Date;
  fetchImpl?: typeof fetch;
  readAuthState?: typeof readCliAuthState;
  readdir?: DirectoryReader;
  readFile?: FileReader;
  stat?: StatReader;
};

type DoctorCheck = {
  name: string;
  status: "ok" | "warning" | "missing" | "error";
  message: string;
};

type DoctorPrivacyPreview = {
  sample_event_type: "request_event";
  sample_event_class: "incident_signal" | "context_signal" | "operational_signal";
  sample_can_create_incident: boolean;
  incident_rule: string;
  redacted_fields: string[];
  omitted_fields: string[];
  retained_metadata: {
    service: string;
    environment: string;
    method: string;
    route_template: string;
    response_status: number;
  };
  redacted_sample: {
    payload: JsonValue;
  };
};

const ProfileSchema = z.object({
  debugbundle: z.object({
    last_reviewed_at: z.string(),
    validation_status: z.enum(["static-analysis-only", "agent-validated"])
  })
});

const HealthResponseSchema = z.object({
  status: z.literal("ok")
});

const IncidentsProbeResponseSchema = z.object({
  incidents: z.array(z.unknown())
});

const PROFILE_STALENESS_THRESHOLD_DAYS = 30;
const LOCAL_RELAY_SPOOL_DIRECTORY_PATH = ".debugbundle/local/browser-relay-spool";
const RELAY_SPOOL_DELIVERED_MARKER_SUFFIX = ".delivered";
const RELAY_SPOOL_EVENT_SUFFIX = ".events.json";

const SUGGESTED_ACTIONS = [
  "Run debugbundle setup if local scaffold files are missing.",
  "Run debugbundle login --github, debugbundle login --github-device, or debugbundle login <dbundle_mem_...> to create ~/.debugbundle/auth.json.",
  "Review .debugbundle/profile.json when architecture changes or the profile becomes stale."
] as const;

async function pathExists(path: string, stat: StatReader): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

function resolveOverallStatus(checks: DoctorCheck[]): "healthy" | "warning" | "error" {
  if (checks.some((check) => check.status === "error")) {
    return "error";
  }

  if (checks.some((check) => check.status !== "ok")) {
    return "warning";
  }

  return "healthy";
}

function formatDoctorOutput(status: "healthy" | "warning" | "error", checks: DoctorCheck[], privacyPreview?: DoctorPrivacyPreview): string {
  return [
    "DebugBundle doctor report.",
    `Status: ${status}`,
    "Checks:",
    ...checks.map((check) => `- ${check.name}: ${check.status} - ${check.message}`),
    ...(privacyPreview === undefined
      ? []
      : [
          "Privacy preview:",
          `- sample_event_type: ${privacyPreview.sample_event_type}`,
          `- sample_event_class: ${privacyPreview.sample_event_class}`,
          `- sample_can_create_incident: ${privacyPreview.sample_can_create_incident ? "yes" : "no"}`,
          `- incident_rule: ${privacyPreview.incident_rule}`,
          `- redacted_fields: ${privacyPreview.redacted_fields.join(", ")}`,
          `- omitted_fields: ${privacyPreview.omitted_fields.length === 0 ? "none" : privacyPreview.omitted_fields.join(", ")}`,
          `- retained_metadata: service=${privacyPreview.retained_metadata.service}, environment=${privacyPreview.retained_metadata.environment}, method=${privacyPreview.retained_metadata.method}, route_template=${privacyPreview.retained_metadata.route_template}, response_status=${privacyPreview.retained_metadata.response_status}`,
          "Redacted sample:",
          ...JSON.stringify(privacyPreview.redacted_sample, null, 2)
            .split("\n")
            .map((line) => `  ${line}`)
        ]),
    "Suggested actions:",
    ...SUGGESTED_ACTIONS.map((action) => `- ${action}`)
  ].join("\n");
}

function buildDoctorJsonOutput(checks: DoctorCheck[], privacyPreview?: DoctorPrivacyPreview): string {
  return JSON.stringify({
    status: resolveOverallStatus(checks),
    checks,
    warnings: checks.filter((check) => check.status === "warning" || check.status === "missing").map((check) => check.message),
    errors: checks.filter((check) => check.status === "error").map((check) => check.message),
    ...(privacyPreview === undefined ? {} : { privacy_preview: privacyPreview }),
    suggested_actions: [...SUGGESTED_ACTIONS],
    auto_fix_available: false
  });
}

function buildPrivacyPreview(): DoctorPrivacyPreview {
  const sampleEvent = createEventEnvelope({
    schema_version: "2026-03-01",
    event_id: "11111111-1111-4111-8111-111111111111",
    event_type: "request_event",
    sdk_name: "debugbundle-node",
    sdk_version: "0.1.0",
    service: {
      name: "checkout-api",
      runtime: "node",
      framework: "fastify",
      environment: "production"
    },
    occurred_at: "2026-03-14T00:00:00.000Z",
    correlation: {
      request_id: "req_preview_123",
      trace_id: "trace_preview_123",
      session_id: null,
      user_id_hash: "usr_preview_hash"
    },
    payload: {
      method: "POST",
      path: "/checkout/ord_preview_123",
      query: {
        step: "payment"
      },
      headers: {
        authorization: "Bearer dbundle_project_secret_preview",
        cookie: "session=preview_cookie",
        "content-type": "application/json"
      },
      body: {
        password: "preview-password",
        card_number: "4242424242424242",
        otp: "123456",
        email: "alice@example.com"
      },
      response_status: 503,
      duration_ms: 842,
      route_template: "/checkout/:orderId",
      response_headers: {
        "content-type": "application/json"
      },
      response_body: {
        error: "upstream timeout"
      }
    }
  });

  if (sampleEvent.event_type !== "request_event") {
    throw new Error("invalid_privacy_preview_sample_event");
  }

  const { redacted, redacted_fields } = redact(sampleEvent.payload as JsonValue);
  const sampleEventClass = classifyEvent(sampleEvent.event_type, undefined, undefined, sampleEvent.payload as Record<string, unknown>);

  return {
    sample_event_type: sampleEvent.event_type,
    sample_event_class: sampleEventClass,
    sample_can_create_incident: sampleEventClass === "incident_signal",
    incident_rule: "request_event with response_status >= 500 is classified as an incident_signal",
    redacted_fields,
    omitted_fields: [],
    retained_metadata: {
      service: sampleEvent.service.name,
      environment: sampleEvent.service.environment,
      method: sampleEvent.payload.method,
      route_template: sampleEvent.payload.route_template ?? sampleEvent.payload.path,
      response_status: sampleEvent.payload.response_status
    },
    redacted_sample: {
      payload: redacted
    }
  };
}

async function buildFileCheck(rootDirectory: string, name: string, filePath: string, stat: StatReader): Promise<DoctorCheck> {
  const exists = await pathExists(join(rootDirectory, filePath), stat);
  return {
    name,
    status: exists ? "ok" : "missing",
    message: exists ? `Found ${filePath}` : `Missing ${filePath}`
  };
}

async function loadProfile(rootDirectory: string, dependencies: { readFile: FileReader; stat: StatReader }): Promise<{ check: DoctorCheck; profile: z.infer<typeof ProfileSchema> | null }> {
  const profilePath = join(rootDirectory, PROFILE_FILE_PATH);
  if (!(await pathExists(profilePath, dependencies.stat))) {
    return {
      check: {
        name: "profile",
        status: "missing",
        message: `Missing ${PROFILE_FILE_PATH}`
      },
      profile: null
    };
  }

  try {
    const parsedProfile = ProfileSchema.parse(JSON.parse(await dependencies.readFile(profilePath)));
    return {
      check: {
        name: "profile",
        status: "ok",
        message: `Found ${PROFILE_FILE_PATH}`
      },
      profile: parsedProfile
    };
  } catch {
    return {
      check: {
        name: "profile",
        status: "error",
        message: `Invalid ${PROFILE_FILE_PATH}`
      },
      profile: null
    };
  }
}

async function loadConnection(rootDirectory: string, dependencies: { readFile: FileReader; stat: StatReader }): Promise<{ check: DoctorCheck; connection: z.infer<typeof ConnectionConfigSchema> | null }> {
  const connectionPath = join(rootDirectory, CONNECTION_FILE_PATH);
  if (!(await pathExists(connectionPath, dependencies.stat))) {
    return {
      check: {
        name: "connection-config",
        status: "missing",
        message: `Missing ${CONNECTION_FILE_PATH}`
      },
      connection: null
    };
  }

  try {
    const parsedConnection = ConnectionConfigSchema.parse(JSON.parse(await dependencies.readFile(connectionPath)));
    return {
      check: {
        name: "connection-config",
        status: "ok",
        message: `Found ${CONNECTION_FILE_PATH}`
      },
      connection: parsedConnection
    };
  } catch {
    return {
      check: {
        name: "connection-config",
        status: "error",
        message: `Invalid ${CONNECTION_FILE_PATH}`
      },
      connection: null
    };
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}

function buildProjectModeCheck(connection: z.infer<typeof ConnectionConfigSchema> | null): DoctorCheck {
  if (connection === null) {
    return {
      name: "project-mode",
      status: "missing",
      message: `Cannot determine project mode without ${CONNECTION_FILE_PATH}`
    };
  }

  return {
    name: "project-mode",
    status: "ok",
    message: `Project mode is ${connection.mode}.`
  };
}

function buildProfileValidationCheck(profile: z.infer<typeof ProfileSchema> | null): DoctorCheck {
  if (profile === null) {
    return {
      name: "profile-validation",
      status: "missing",
      message: `Cannot determine profile validation status without ${PROFILE_FILE_PATH}`
    };
  }

  if (profile.debugbundle.validation_status === "agent-validated") {
    return {
      name: "profile-validation",
      status: "ok",
      message: "Profile validation status is agent-validated."
    };
  }

  return {
    name: "profile-validation",
    status: "warning",
    message: "Profile validation status is static-analysis-only."
  };
}

function buildProfileFreshnessCheck(profile: z.infer<typeof ProfileSchema> | null, now: Date): DoctorCheck {
  if (profile === null) {
    return {
      name: "profile-freshness",
      status: "missing",
      message: `Cannot evaluate profile freshness without ${PROFILE_FILE_PATH}`
    };
  }

  const lastReviewedDate = new Date(profile.debugbundle.last_reviewed_at);
  if (Number.isNaN(lastReviewedDate.getTime())) {
    return {
      name: "profile-freshness",
      status: "error",
      message: "Profile has an invalid debugbundle.last_reviewed_at value."
    };
  }

  const ageInDays = Math.floor((now.getTime() - lastReviewedDate.getTime()) / (1000 * 60 * 60 * 24));
  if (ageInDays > PROFILE_STALENESS_THRESHOLD_DAYS) {
    return {
      name: "profile-freshness",
      status: "warning",
      message: `Profile review is stale; last reviewed ${ageInDays} days ago.`
    };
  }

  return {
    name: "profile-freshness",
    status: "ok",
    message: `Profile reviewed ${ageInDays} days ago.`
  };
}

async function buildAuthCheck(
  input: { authFilePath?: string },
  readAuthStateImpl: typeof readCliAuthState
): Promise<{ check: DoctorCheck; authState: CliAuthState | null }> {
  try {
    const authState = await readAuthStateImpl(input);
    return {
      check: {
        name: "auth-state",
        status: "ok",
        message: "Found valid auth state."
      },
      authState
    };
  } catch (error) {
    if (error instanceof CliAuthStateError) {
      return {
        check: {
          name: "auth-state",
          status: error.code === "auth_state_missing" ? "missing" : "error",
          message: error.message
        },
        authState: null
      };
    }

    return {
      check: {
        name: "auth-state",
        status: "error",
        message: error instanceof Error ? error.message : String(error)
      },
      authState: null
    };
  }
}

async function parseResponseBody(response: { text(): Promise<string> }): Promise<unknown> {
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

async function buildConnectedApiCheck(input: {
  connection: z.infer<typeof ConnectionConfigSchema> | null;
  authState: CliAuthState | null;
  fetchImpl: typeof fetch;
}): Promise<DoctorCheck | null> {
  if (input.connection === null || input.connection.mode !== "connected") {
    return null;
  }

  const connectionBaseUrl = input.connection.cloud_base_url === null ? null : normalizeBaseUrl(input.connection.cloud_base_url);
  const authBaseUrl = input.authState === null ? null : normalizeBaseUrl(input.authState.base_url);
  const baseUrl = authBaseUrl ?? connectionBaseUrl;

  if (baseUrl === null) {
    return {
      name: "connected-api",
      status: "missing",
      message: "Cannot verify connected API without cloud_base_url or auth state."
    };
  }

  let healthResponse: Awaited<ReturnType<typeof input.fetchImpl>>;
  try {
    healthResponse = await input.fetchImpl(`${baseUrl}/health`, {
      method: "GET",
      headers: {
        accept: "application/json"
      }
    });
  } catch (error) {
    return {
      name: "connected-api",
      status: "error",
      message: `Connected API ${baseUrl} could not be reached: ${error instanceof Error ? error.message : String(error)}`
    };
  }

  const parsedHealthBody = await parseResponseBody(healthResponse);
  if (healthResponse.status !== 200) {
    return {
      name: "connected-api",
      status: "error",
      message: `Connected API ${baseUrl} failed health validation (HTTP ${healthResponse.status}).`
    };
  }

  if (!HealthResponseSchema.safeParse(parsedHealthBody).success) {
    return {
      name: "connected-api",
      status: "error",
      message: `Connected API ${baseUrl} returned an invalid health response.`
    };
  }

  if (input.authState === null) {
    return {
      name: "connected-api",
      status: "warning",
      message: `Connected API ${baseUrl} is reachable, but member-token auth could not be verified without auth state.`
    };
  }

  let incidentsResponse: Awaited<ReturnType<typeof input.fetchImpl>>;
  try {
    incidentsResponse = await input.fetchImpl(`${baseUrl}/v1/incidents?limit=1`, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.authState.bearer_token}`
      }
    });
  } catch (error) {
    return {
      name: "connected-api",
      status: "error",
      message: `Connected API ${baseUrl} could not verify member-token auth: ${error instanceof Error ? error.message : String(error)}`
    };
  }

  const parsedIncidentsBody = await parseResponseBody(incidentsResponse);
  if (incidentsResponse.status !== 200) {
    return {
      name: "connected-api",
      status: "error",
      message: `Connected API ${baseUrl} failed member-token validation (HTTP ${incidentsResponse.status}).`
    };
  }

  if (!IncidentsProbeResponseSchema.safeParse(parsedIncidentsBody).success) {
    return {
      name: "connected-api",
      status: "error",
      message: `Connected API ${baseUrl} returned an invalid incidents response.`
    };
  }

  if (connectionBaseUrl !== null && authBaseUrl !== null && connectionBaseUrl !== authBaseUrl) {
    return {
      name: "connected-api",
      status: "warning",
      message: `Connected API ${authBaseUrl} is reachable and member-token auth succeeded, but connection config expects ${connectionBaseUrl}.`
    };
  }

  return {
    name: "connected-api",
    status: "ok",
    message: `Connected API ${baseUrl} is reachable and member-token auth succeeded.`
  };
}

function formatRelaySpoolAge(ageInMilliseconds: number): string {
  const ageInHours = Math.max(0, Math.floor(ageInMilliseconds / (1000 * 60 * 60)));
  if (ageInHours < 24) {
    return `${ageInHours} hour${ageInHours === 1 ? "" : "s"} old`;
  }

  const ageInDays = Math.floor(ageInHours / 24);
  return `${ageInDays} day${ageInDays === 1 ? "" : "s"} old`;
}

async function buildRelaySpoolCheck(
  rootDirectory: string,
  now: Date,
  dependencies: { readdir: DirectoryReader; stat: StatReader }
): Promise<DoctorCheck> {
  const spoolDirectory = join(rootDirectory, LOCAL_RELAY_SPOOL_DIRECTORY_PATH);
  if (!(await pathExists(spoolDirectory, dependencies.stat))) {
    return {
      name: "relay-spool",
      status: "ok",
      message: "No undelivered relay spool files found."
    };
  }

  const spoolDirectoryStat = await dependencies.stat(spoolDirectory);
  if (!spoolDirectoryStat.isDirectory()) {
    return {
      name: "relay-spool",
      status: "error",
      message: `Invalid ${LOCAL_RELAY_SPOOL_DIRECTORY_PATH}`
    };
  }

  const entries = await dependencies.readdir(spoolDirectory);
  const entrySet = new Set(entries);
  const undeliveredEventFiles = entries.filter((entry) => {
    if (!entry.endsWith(RELAY_SPOOL_EVENT_SUFFIX)) {
      return false;
    }

    return !entrySet.has(`${entry}${RELAY_SPOOL_DELIVERED_MARKER_SUFFIX}`);
  });

  if (undeliveredEventFiles.length === 0) {
    return {
      name: "relay-spool",
      status: "ok",
      message: "No undelivered relay spool files found."
    };
  }

  const undeliveredStats = await Promise.all(
    undeliveredEventFiles.map(async (entry) => dependencies.stat(join(spoolDirectory, entry)))
  );
  const oldestModifiedTime = Math.min(...undeliveredStats.map((entry) => entry.mtimeMs));

  return {
    name: "relay-spool",
    status: "warning",
    message: `Found ${undeliveredEventFiles.length} undelivered relay spool files; oldest is ${formatRelaySpoolAge(now.getTime() - oldestModifiedTime)}.`
  };
}

export async function doctorCommand(
  input: { json?: boolean; authFilePath?: string; checkRelay?: boolean; privacy?: boolean },
  dependencies: DoctorCommandDependencies = {}
): Promise<CliCommandResult> {
  const cwd = dependencies.cwd ?? (() => process.cwd());
  const now = dependencies.now ?? (() => new Date());
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const readAuthStateImpl = dependencies.readAuthState ?? readCliAuthState;
  const readdir = dependencies.readdir ?? readdirFromFs;
  const readFile = dependencies.readFile ?? ((filePath: string) => readFileFromFs(filePath, "utf8"));
  const stat = dependencies.stat ?? statFromFs;
  const rootDirectory = cwd();
  const currentTime = now();

  const { check: profileCheck, profile } = await loadProfile(rootDirectory, { readFile, stat });
  const { check: connectionCheck, connection } = await loadConnection(rootDirectory, { readFile, stat });
  const { check: authCheck, authState } = await buildAuthCheck(input, readAuthStateImpl);
  const connectedApiCheck = await buildConnectedApiCheck({
    connection,
    authState,
    fetchImpl
  });

  const checks = [
    profileCheck,
    connectionCheck,
    await buildFileCheck(rootDirectory, "agent-skill", SKILL_FILE_PATH, stat),
    authCheck,
    buildProjectModeCheck(connection),
    ...(connectedApiCheck === null ? [] : [connectedApiCheck]),
    buildProfileValidationCheck(profile),
    buildProfileFreshnessCheck(profile, currentTime),
    ...(input.checkRelay === true ? [await buildRelaySpoolCheck(rootDirectory, currentTime, { readdir, stat })] : [])
  ] satisfies DoctorCheck[];
  const privacyPreview = input.privacy === true ? buildPrivacyPreview() : undefined;

  return {
    exitCode: 0,
    output: input.json
      ? buildDoctorJsonOutput(checks, privacyPreview)
      : formatDoctorOutput(resolveOverallStatus(checks), checks, privacyPreview)
  };
}
