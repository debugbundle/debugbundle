import { readdir as readdirFromFs, readFile as readFileFromFs, stat as statFromFs } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

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
  "Run debugbundle login to create ~/.debugbundle/auth.json.",
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

function formatDoctorOutput(status: "healthy" | "warning" | "error", checks: DoctorCheck[]): string {
  return [
    "DebugBundle doctor report.",
    `Status: ${status}`,
    "Checks:",
    ...checks.map((check) => `- ${check.name}: ${check.status} - ${check.message}`),
    "Suggested actions:",
    ...SUGGESTED_ACTIONS.map((action) => `- ${action}`)
  ].join("\n");
}

function buildDoctorJsonOutput(checks: DoctorCheck[]): string {
  return JSON.stringify({
    status: resolveOverallStatus(checks),
    checks,
    warnings: checks.filter((check) => check.status === "warning" || check.status === "missing").map((check) => check.message),
    errors: checks.filter((check) => check.status === "error").map((check) => check.message),
    suggested_actions: [...SUGGESTED_ACTIONS],
    auto_fix_available: false
  });
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
  input: { json?: boolean; authFilePath?: string; checkRelay?: boolean },
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

  return {
    exitCode: 0,
    output: input.json ? buildDoctorJsonOutput(checks) : formatDoctorOutput(resolveOverallStatus(checks), checks)
  };
}