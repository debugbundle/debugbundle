import { mkdir as mkdirFromFs, readFile as readFileFromFs, rename as renameFromFs, writeFile as writeFileFromFs } from "node:fs/promises";
import { join } from "node:path";

import { buildProjectId } from "../../../packages/log-parser/src/index.js";
import { createEventEnvelope } from "../../../packages/shared-types/src/index.js";
import {
  deriveIncidentReasonFromSignal,
  type IncidentReason
} from "../../../packages/storage/src/index.js";
import { createRetrievalApi } from "../../../packages/retrieval-client/src/index.js";
import { createTokenManagementApi } from "../../../packages/token-management/src/index.js";

import { CliAuthStateError, readCliAuthState, type CliAuthState } from "./auth-state.js";
import { createCliHttpClient } from "./auth-context.js";
import { buildEventFileName, LOCAL_EVENTS_DIRECTORY_PATH, readProfile } from "./ingest-command.js";
import { getLocalBundle, readLocalState } from "./local-retrieval-store.js";
import { processCommand as defaultProcessCommand, type ProcessSummary } from "./process-command.js";
import { validateProfile } from "./profile-validation.js";
import type { CliCommandResult } from "./token-commands.js";

type VerifyCheck = {
  name: string;
  status: "ok" | "warning" | "missing" | "error";
  message: string;
};

type ProductionIncidentLike = {
  incident_id: string;
  last_seen_at: string;
  incident_reason?: IncidentReason;
};

type CloudVerificationDetails = {
  mode: "active_4xx" | "active_5xx" | "passive_recent_incident" | "app_event";
  accepted_event_count?: number;
  incident_id?: string;
  bundle_status?: "ready" | "pending" | "unknown";
  classification_reason?: IncidentReason;
  suggested_next_command?: string;
  correlation_hints?: {
    service?: string;
    environment?: string;
    trace_id?: string;
    request_id?: string;
  };
  matched_hints?: string[];
};

type CloudCorrelationHints = NonNullable<CloudVerificationDetails["correlation_hints"]>;

type DirectoryMaker = (path: string, options: { recursive: true }) => Promise<void>;
type FileRenamer = (sourcePath: string, destinationPath: string) => Promise<void>;
type FileWriter = (path: string, content: string) => Promise<void>;

type VerifyLocalDependencies = {
  cwd?: () => string;
  mkdir?: DirectoryMaker;
  now?: () => Date;
  processCommand?: typeof defaultProcessCommand;
  readLocalState?: typeof readLocalState;
  getLocalBundle?: typeof getLocalBundle;
  rename?: FileRenamer;
  writeFile?: FileWriter;
};

type VerifyCloudDependencies = {
  now?: () => Date;
  readAuthState?: typeof readCliAuthState;
  createProjectToken?: (input: { bearerToken: string; projectId: string; label: string }) => Promise<{ token_id: string; plaintext?: string }>;
  revokeProjectToken?: (input: { bearerToken: string; projectId: string; tokenId: string }) => Promise<unknown>;
  sendEvents?: (input: { baseUrl: string; projectToken: string; events: Array<unknown> }) => Promise<{ accepted: number; rejected: number; errors: Array<{ index: number; reason: string }> }>;
  listIncidents?: (input: {
    bearerToken: string;
    projectId: string;
    environment: string;
    service?: string;
    limit: number;
  }) => Promise<{ incidents: ProductionIncidentLike[]; next_cursor: string | null }>;
  getBundle?: (input: { bearerToken: string; incidentId: string }) => Promise<{ status?: "pending" } | { bundle_version: number }>;
  pollAttempts?: number;
  pollIntervalMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  fetchImpl?: typeof fetch;
};

function resolveOverallStatus(checks: VerifyCheck[]): "healthy" | "warning" | "error" {
  if (checks.some((check) => check.status === "error" || check.status === "missing")) {
    return "error";
  }

  if (checks.some((check) => check.status === "warning")) {
    return "warning";
  }

  return "healthy";
}

function buildSuggestedActions(status: "healthy" | "warning" | "error", incidentId?: string): string[] {
  if (status === "healthy" && incidentId !== undefined) {
    return [
      `Review incident ${incidentId} if you want to inspect the generated local bundle.`,
      "Re-run debugbundle verify local after changing local DebugBundle configuration."
    ];
  }

  return [
    "Run debugbundle setup if the local scaffold is missing or invalid.",
    "Re-run debugbundle verify local after the local event pipeline is healthy."
  ];
}

function collectWarnings(checks: VerifyCheck[]): string[] {
  const warnings: string[] = [];
  for (const check of checks) {
    if (check.status === "warning") {
      warnings.push(check.message);
    }
  }

  return warnings;
}

function buildJsonOutput(checks: VerifyCheck[], errors: string[], incidentId?: string): string {
  const status = resolveOverallStatus(checks);
  return JSON.stringify({
    status,
    checks,
    warnings: collectWarnings(checks),
    errors,
    suggested_actions: buildSuggestedActions(status, incidentId),
    auto_fix_available: false
  });
}

function formatHumanOutput(checks: VerifyCheck[], incidentId?: string): string {
  const status = resolveOverallStatus(checks);
  return [
    "DebugBundle local verification passed.",
    "Checks:",
    ...checks.map((check) => `- ${check.name}: ${check.status} - ${check.message}`),
    "Suggested actions:",
    ...buildSuggestedActions(status, incidentId).map((action) => `- ${action}`)
  ].join("\n");
}

function formatResult(
  input: { json?: boolean },
  exitCode: number,
  checks: VerifyCheck[],
  errors: string[],
  incidentId?: string
): CliCommandResult {
  return {
    exitCode,
    output: input.json ? buildJsonOutput(checks, errors, incidentId) : formatHumanOutput(checks, incidentId)
  };
}

function buildCloudSuggestedActions(
  status: "healthy" | "warning" | "error",
  incidentId?: string,
  verification?: CloudVerificationDetails
): string[] {
  const mode = verification?.mode ?? "passive_recent_incident";
  if (status === "healthy" && incidentId !== undefined && (mode === "active_5xx" || mode === "active_4xx")) {
    return [
      `Run debugbundle inspect ${incidentId} --source cloud to inspect why the incident fired.`,
      `Run debugbundle bundle ${incidentId} --source cloud to fetch the generated debug bundle.`
    ];
  }

  if (status === "healthy" && incidentId !== undefined && mode === "app_event") {
    return [
      `Run debugbundle inspect ${incidentId} --source cloud to inspect the captured app event.`,
      "Re-run debugbundle verify cloud --expect-app-event after instrumentation or deploy changes, using the same service, environment, and correlation hints when available."
    ];
  }

  if (status === "healthy" && incidentId !== undefined) {
    return [
      `Review incident ${incidentId} if you want to inspect the latest production bundle.`,
      "Re-run debugbundle verify cloud after a fresh deploy or instrumentation change."
    ];
  }

  if (mode === "app_event") {
    return [
      "Trigger a real SDK event from the target app, then re-run debugbundle verify cloud --expect-app-event with the same service and environment filters.",
      "Add --trace-id or --request-id when you have a correlation hint so the verification can match the hosted bundle deterministically."
    ];
  }

  return [
    "Run debugbundle login to choose an auth flow, or use debugbundle login --github, debugbundle login --github-device, or debugbundle login <dbundle_mem_...> to create ~/.debugbundle/auth.json before verifying cloud traffic.",
    "Generate a live cloud request, then re-run debugbundle verify cloud with the correct project and service filters."
  ];
}

function buildCloudJsonOutput(checks: VerifyCheck[], errors: string[], incidentId?: string, verification?: CloudVerificationDetails): string {
  const status = resolveOverallStatus(checks);
  const output: {
    status: "healthy" | "warning" | "error";
    checks: VerifyCheck[];
    warnings: string[];
    errors: string[];
    suggested_actions: string[];
    auto_fix_available: false;
    verification?: CloudVerificationDetails;
  } = {
    status,
    checks,
    warnings: collectWarnings(checks),
    errors,
    suggested_actions: buildCloudSuggestedActions(status, incidentId, verification),
    auto_fix_available: false
  };

  if (verification !== undefined) {
    output.verification = verification;
  }

  return JSON.stringify(output);
}

function formatCloudHumanOutput(checks: VerifyCheck[], incidentId?: string, verification?: CloudVerificationDetails): string {
  const status = resolveOverallStatus(checks);
  return [
    "DebugBundle cloud verification passed.",
    "Checks:",
    ...checks.map((check) => `- ${check.name}: ${check.status} - ${check.message}`),
    "Suggested actions:",
    ...buildCloudSuggestedActions(status, incidentId, verification).map((action) => `- ${action}`)
  ].join("\n");
}

function formatCloudResult(
  input: { json?: boolean },
  exitCode: number,
  checks: VerifyCheck[],
  errors: string[],
  incidentId?: string,
  verification?: CloudVerificationDetails
): CliCommandResult {
  return {
    exitCode,
    output: input.json ? buildCloudJsonOutput(checks, errors, incidentId, verification) : formatCloudHumanOutput(checks, incidentId, verification)
  };
}

function localFailureStepName(checks: VerifyCheck[]): VerifyCheck["name"] {
  let hasLocalProcessing = false;
  let hasIncidentRetrieval = false;
  for (const check of checks) {
    if (check.name === "local-processing") {
      hasLocalProcessing = true;
    }
    if (check.name === "incident-retrieval") {
      hasIncidentRetrieval = true;
    }
  }

  if (hasIncidentRetrieval) {
    return "bundle-retrieval";
  }

  if (hasLocalProcessing) {
    return "incident-retrieval";
  }

  return "local-event-batch";
}

function cloudVerificationRunId(now: Date): string {
  return now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
}

function requestFailureReason(responseStatus: number): IncidentReason {
  const incidentReason = deriveIncidentReasonFromSignal({
    event_type: "request_event",
    event_class: "incident_signal",
    response_status: responseStatus
  });

  if (incidentReason === null) {
    throw new Error("request_failure_reason_unavailable");
  }

  return incidentReason;
}

function buildCloudVerificationEvent(input: {
  now: Date;
  serviceName: string;
  environment: string;
  responseStatus: number;
}): ReturnType<typeof createEventEnvelope> {
  const runId = cloudVerificationRunId(input.now);
  const is5xxVerification = input.responseStatus >= 500;
  const routeTemplate = is5xxVerification
    ? "/debugbundle/verify/cloud"
    : `/debugbundle/verify/cloud/client-error/${input.responseStatus}`;
  const verificationLabel = is5xxVerification ? "true" : `client-error-${input.responseStatus}`;
  return createEventEnvelope({
    event_type: "request_event",
    sdk_name: "debugbundle-cli",
    sdk_version: "0.1.0",
    service: {
      name: input.serviceName,
      environment: input.environment,
      runtime: "verification",
      framework: null
    },
    occurred_at: input.now.toISOString(),
    payload: {
      method: "GET",
      path: routeTemplate,
      route_template: routeTemplate,
      query: {
        debugbundle_verification: true,
        run_id: runId,
        synthetic_status: input.responseStatus
      },
      headers: {
        "x-debugbundle-verification": verificationLabel
      },
      response_status: input.responseStatus,
      duration_ms: 37,
      response_headers: {
        "x-debugbundle-verification": verificationLabel
      },
      response_body: {
        error: is5xxVerification ? "debugbundle_cloud_verification" : "debugbundle_cloud_client_error_verification",
        synthetic: true,
        run_id: runId,
        response_status: input.responseStatus
      }
    }
  });
}

function validateActiveCloudVerificationInput(input: {
  trigger5xx?: boolean;
  trigger4xxStatus?: number;
}): string | null {
  if (input.trigger5xx === true && input.trigger4xxStatus !== undefined) {
    return "Choose either --trigger-5xx or --trigger-4xx, not both.";
  }

  if (input.trigger4xxStatus !== undefined && (input.trigger4xxStatus < 400 || input.trigger4xxStatus > 499)) {
    return "--trigger-4xx must be an integer status between 400 and 499.";
  }

  return null;
}

function validateCloudVerificationInput(input: {
  trigger5xx?: boolean;
  trigger4xxStatus?: number;
  expectAppEvent?: boolean;
  service?: string;
  traceId?: string;
  requestId?: string;
}): string | null {
  const activeInputError = validateActiveCloudVerificationInput(input);
  if (activeInputError !== null) {
    return activeInputError;
  }

  const appEventVerificationEnabled = input.expectAppEvent === true || input.traceId !== undefined || input.requestId !== undefined;
  if (appEventVerificationEnabled && (input.trigger5xx === true || input.trigger4xxStatus !== undefined)) {
    return "Choose either a synthetic trigger run or --expect-app-event, not both.";
  }

  if (appEventVerificationEnabled && input.service === undefined && input.traceId === undefined && input.requestId === undefined) {
    return "App-event verification requires --service, --trace-id, or --request-id so the check stays scoped.";
  }

  return null;
}

function buildCorrelationHints(input: {
  environment: string;
  service?: string;
  traceId?: string;
  requestId?: string;
}): CloudCorrelationHints {
  return {
    ...(input.service === undefined ? {} : { service: input.service }),
    environment: input.environment,
    ...(input.traceId === undefined ? {} : { trace_id: input.traceId }),
    ...(input.requestId === undefined ? {} : { request_id: input.requestId })
  };
}

function collectBundleHintMatches(
  bundle: unknown,
  input: { traceId?: string; requestId?: string }
): string[] {
  const serializedBundle = JSON.stringify(bundle);
  const matches: string[] = [];

  if (input.traceId !== undefined && serializedBundle.includes(input.traceId)) {
    matches.push("trace_id");
  }

  if (input.requestId !== undefined && serializedBundle.includes(input.requestId)) {
    matches.push("request_id");
  }

  return matches;
}

function requestedBundleHints(input: { traceId?: string; requestId?: string }): string[] {
  return [
    ...(input.traceId === undefined ? [] : ["trace_id"]),
    ...(input.requestId === undefined ? [] : ["request_id"])
  ];
}

async function sendEventsToApi(
  input: { baseUrl: string; projectToken: string; events: Array<unknown> },
  dependencies: { fetchImpl?: typeof fetch } = {}
): Promise<{ accepted: number; rejected: number; errors: Array<{ index: number; reason: string }> }> {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const baseUrl = input.baseUrl.endsWith("/") ? input.baseUrl.slice(0, -1) : input.baseUrl;
  const response = await fetchImpl(`${baseUrl}/v1/events`, {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${input.projectToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      events: input.events
    })
  });
  const rawBody = await response.text();
  const body = rawBody.length === 0 ? {} : JSON.parse(rawBody) as {
    accepted?: number;
    rejected?: number;
    errors?: Array<{ index: number; reason: string }>;
    error?: string;
  };

  if (response.status < 200 || response.status >= 300) {
    throw new Error(typeof body.error === "string" ? body.error : `verify_cloud_ingestion_failed:${response.status}`);
  }

  return {
    accepted: body.accepted ?? 0,
    rejected: body.rejected ?? 0,
    errors: body.errors ?? []
  };
}

function buildVerificationEvent(now: Date, projectId: string): { event: ReturnType<typeof createEventEnvelope>; serviceName: string; environment: string } {
  const runId = now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const serviceName = `debugbundle-verify-local-${runId}`;
  const environment = "local";

  return {
    serviceName,
    environment,
    event: createEventEnvelope({
      event_type: "backend_exception",
      project_id: projectId,
      sdk_name: "debugbundle-cli",
      sdk_version: "0.1.0",
      service: {
        name: serviceName,
        environment,
        runtime: null,
        framework: null
      },
      occurred_at: now.toISOString(),
      payload: {
        name: "DebugBundleLocalVerificationError",
        message: `DebugBundle local verification ${runId}`,
        stack: `DebugBundleLocalVerificationError: DebugBundle local verification ${runId}\n    at debugbundle.verify.local (${serviceName})`,
        handled: false,
        request: {
          method: "GET",
          path: "/debugbundle/verify/local",
          query: {},
          headers: {}
        },
        response: {
          status_code: 500
        },
        runtime: {
          version: "unknown"
        }
      }
    })
  };
}

async function writeVerificationEventBatch(
  input: { rootDirectory: string; event: ReturnType<typeof createEventEnvelope>; runId: string },
  dependencies: { mkdir: DirectoryMaker; rename: FileRenamer; writeFile: FileWriter }
): Promise<string> {
  const eventDirectory = join(input.rootDirectory, LOCAL_EVENTS_DIRECTORY_PATH);
  await dependencies.mkdir(eventDirectory, { recursive: true });

  const fileName = buildEventFileName([input.event], `debugbundle-verify-local-${input.runId}`);
  const destinationPath = join(eventDirectory, fileName);
  const temporaryPath = `${destinationPath}.tmp`;

  await dependencies.writeFile(temporaryPath, `${JSON.stringify([input.event], null, 2)}\n`);
  await dependencies.rename(temporaryPath, destinationPath);

  return fileName;
}

export async function verifyLocalCommand(
  input: { json?: boolean },
  dependencies: VerifyLocalDependencies = {}
): Promise<CliCommandResult> {
  const cwd = dependencies.cwd ?? (() => process.cwd());
  const mkdir = dependencies.mkdir ?? (async (path: string, options: { recursive: true }) => {
    await mkdirFromFs(path, options);
  });
  const now = dependencies.now ?? (() => new Date());
  const processLocal = dependencies.processCommand ?? defaultProcessCommand;
  const readVerifiedLocalState = dependencies.readLocalState ?? readLocalState;
  const readVerifiedLocalBundle = dependencies.getLocalBundle ?? getLocalBundle;
  const rename = dependencies.rename ?? (async (sourcePath: string, destinationPath: string) => renameFromFs(sourcePath, destinationPath));
  const writeFile = dependencies.writeFile ?? (async (path: string, content: string) => writeFileFromFs(path, content, "utf8"));

  const checks: VerifyCheck[] = [];
  function finalize(exitCode: number, errors: string[], incidentId?: string): CliCommandResult {
    return formatResult(input, exitCode, checks, errors, incidentId);
  }

  const profileValidation = await validateProfile(cwd());
  if (!profileValidation.valid) {
    checks.push({
      name: "profile-schema",
      status: "error",
      message: `Profile validation failed with ${profileValidation.errors.length} errors.`
    });

    return finalize(4, profileValidation.errors.map((error) => `${error.path}: ${error.message}`));
  }

  checks.push({
    name: "profile-schema",
    status: "ok",
    message: "Validated .debugbundle/profile.json"
  });

  try {
    const rootDirectory = cwd();
    const profile = await readProfile(rootDirectory, async (path) => readFileFromFs(path, "utf8"));
    const projectId = buildProjectId(profile);
    const verificationNow = now();
    const runId = verificationNow.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
    const verification = buildVerificationEvent(verificationNow, projectId);

    await writeVerificationEventBatch(
      {
        rootDirectory,
        event: verification.event,
        runId
      },
      {
        mkdir,
        rename,
        writeFile
      }
    );
    checks.push({
      name: "local-event-batch",
      status: "ok",
      message: "Wrote synthetic local event batch."
    });
    const processResult = dependencies.processCommand === undefined
      ? await processLocal({ json: true }, { cwd })
      : await processLocal({ json: true });
    if (processResult.exitCode !== 0) {
      checks.push({
        name: "local-processing",
        status: "error",
        message: processResult.output
      });

      return finalize(processResult.exitCode, [processResult.output]);
    }

    const summary = JSON.parse(processResult.output) as ProcessSummary;
    if (summary.processed !== true) {
      checks.push({
        name: "local-processing",
        status: "error",
        message: summary.message ?? "Synthetic local event batch was not processed."
      });

      return finalize(1, [summary.message ?? "Synthetic local event batch was not processed."]);
    }

    checks.push({
      name: "local-processing",
      status: "ok",
      message: "Processed synthetic local event batch into local artifacts."
    });

    const localState = await readVerifiedLocalState({ cwd });
    const incident = Object.values(localState.incidents).find((candidate) => candidate.source_event_id === verification.event.event_id);
    if (incident === undefined) {
      checks.push({
        name: "incident-retrieval",
        status: "error",
        message: "Local incident verification did not produce an incident."
      });

      return finalize(1, ["Local incident verification did not produce an incident."]);
    }

    checks.push({
      name: "incident-retrieval",
      status: "ok",
      message: `Retrieved local incident ${incident.incident_id}.`
    });

    await readVerifiedLocalBundle({ incidentId: incident.incident_id }, { cwd });

    checks.push({
      name: "bundle-retrieval",
      status: "ok",
      message: `Retrieved local bundle for incident ${incident.incident_id}.`
    });
    return finalize(0, [], incident.incident_id);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stepName = localFailureStepName(checks);
    checks.push({
      name: stepName,
      status: "error",
      message
    });

    return finalize(1, [message]);
  }
}

export async function verifyCloudCommand(
  input: {
    projectId: string;
    service?: string;
    environment?: string;
    maxAgeMinutes?: number;
    trigger5xx?: boolean;
    trigger4xxStatus?: number;
    expectAppEvent?: boolean;
    traceId?: string;
    requestId?: string;
    authFilePath?: string;
    json?: boolean;
  },
  dependencies: VerifyCloudDependencies = {}
): Promise<CliCommandResult> {
  const now = dependencies.now ?? (() => new Date());
  const checks: VerifyCheck[] = [];
  const environment = input.environment ?? "production";
  const maxAgeMinutes = input.maxAgeMinutes ?? 15;
  const activeInputError = validateCloudVerificationInput(input);

  if (activeInputError !== null) {
    checks.push({
      name: "trigger-input",
      status: "error",
      message: activeInputError
    });

    return formatCloudResult(input, 4, checks, [activeInputError]);
  }

  const readAuthState = dependencies.readAuthState ?? readCliAuthState;
  let authState: CliAuthState;
  try {
    authState = await readAuthState(input.authFilePath === undefined ? {} : { authFilePath: input.authFilePath });
    checks.push({
      name: "auth-state",
      status: "ok",
      message: "Found valid auth state."
    });
  } catch (error) {
    const message = error instanceof CliAuthStateError ? error.message : error instanceof Error ? error.message : String(error);
    checks.push({
      name: "auth-state",
      status: "error",
      message
    });

    return formatCloudResult(input, 2, checks, [message]);
  }

  const httpClient = createCliHttpClient(
    { baseUrl: authState.base_url },
    dependencies.fetchImpl === undefined ? undefined : { fetchImpl: dependencies.fetchImpl }
  );
  const retrievalApi = createRetrievalApi(httpClient);
  const tokenApi = createTokenManagementApi(httpClient);
  const listIncidents = dependencies.listIncidents ?? ((requestInput: {
    bearerToken: string;
    projectId: string;
    environment: string;
    service?: string;
    limit: number;
  }) => retrievalApi.listIncidents(requestInput));
  const getBundle = dependencies.getBundle ?? ((requestInput: { bearerToken: string; incidentId: string }) => retrievalApi.getBundle(requestInput));
  const createProjectToken = dependencies.createProjectToken ?? ((requestInput: { bearerToken: string; projectId: string; label: string }) => tokenApi.createProjectToken(requestInput));
  const revokeProjectToken = dependencies.revokeProjectToken ?? ((requestInput: { bearerToken: string; projectId: string; tokenId: string }) => tokenApi.revokeProjectToken(requestInput));
  const sendEvents = dependencies.sendEvents ?? ((requestInput: { baseUrl: string; projectToken: string; events: Array<unknown> }) =>
    sendEventsToApi(
      requestInput,
      dependencies.fetchImpl === undefined ? {} : { fetchImpl: dependencies.fetchImpl }
    ));
  const appEventVerificationEnabled = input.expectAppEvent === true || input.traceId !== undefined || input.requestId !== undefined;

  if (appEventVerificationEnabled) {
    const verificationStartedAt = now();
    const pollAttempts = dependencies.pollAttempts ?? 6;
    const pollIntervalMs = dependencies.pollIntervalMs ?? 2_000;
    const sleep = dependencies.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
    const requestedHints = requestedBundleHints(input);
    const verification: CloudVerificationDetails = {
      mode: "app_event",
      bundle_status: "unknown",
      correlation_hints: buildCorrelationHints({
        environment,
        ...(input.service === undefined ? {} : { service: input.service }),
        ...(input.traceId === undefined ? {} : { traceId: input.traceId }),
        ...(input.requestId === undefined ? {} : { requestId: input.requestId })
      })
    };
    const oldestAcceptedIncidentTimestamp = verificationStartedAt.getTime() - (maxAgeMinutes * 60_000);
    let incidentId: string | undefined;
    let exitCode = 0;
    let activeStep: VerifyCheck["name"] = "app-event-visibility";
    const errors: string[] = [];

    try {
      for (let attempt = 1; attempt <= pollAttempts; attempt += 1) {
        const result = await listIncidents({
          bearerToken: authState.bearer_token,
          projectId: input.projectId,
          environment,
          ...(input.service === undefined ? {} : { service: input.service }),
          limit: 5
        });

        const recentIncidents = result.incidents.filter((candidate) => {
          const lastSeenAt = new Date(candidate.last_seen_at);
          return !Number.isNaN(lastSeenAt.getTime()) && lastSeenAt.getTime() >= oldestAcceptedIncidentTimestamp;
        });

        for (const candidate of recentIncidents) {
          const lastSeenAt = new Date(candidate.last_seen_at);
          if (requestedHints.length === 0 && lastSeenAt.getTime() < verificationStartedAt.getTime()) {
            continue;
          }

          if (requestedHints.length === 0) {
            incidentId = candidate.incident_id;
            verification.incident_id = candidate.incident_id;
            break;
          }

          activeStep = "bundle-status";
          const bundle = await getBundle({
            bearerToken: authState.bearer_token,
            incidentId: candidate.incident_id
          });
          verification.bundle_status = "status" in bundle && bundle.status === "pending" ? "pending" : "ready";
          if (verification.bundle_status !== "ready") {
            continue;
          }

          const matchedHints = collectBundleHintMatches(bundle, input);
          verification.matched_hints = matchedHints;
          if (requestedHints.every((hint) => matchedHints.includes(hint))) {
            incidentId = candidate.incident_id;
            verification.incident_id = candidate.incident_id;
            verification.suggested_next_command = `debugbundle inspect ${candidate.incident_id} --source cloud`;
            break;
          }
        }

        if (incidentId !== undefined) {
          break;
        }

        if (attempt < pollAttempts) {
          await sleep(pollIntervalMs);
        }
      }

      if (incidentId === undefined) {
        if (requestedHints.length > 0) {
          throw new Error(`No recent cloud incident matched the requested ${requestedHints.join(" and ")} hints within the ${maxAgeMinutes} minute verification window.`);
        }

        throw new Error(`No new ${environment} app event was visible within the ${maxAgeMinutes} minute verification window.`);
      }

      checks.push({
        name: "app-event-visibility",
        status: "ok",
        message: `Observed cloud incident ${incidentId} for the requested app-driven verification window.`
      });

      if (requestedHints.length > 0) {
        checks.push({
          name: "bundle-hint-match",
          status: "ok",
          message: `Matched ${verification.matched_hints?.join(" and ")} in bundle ${incidentId}.`
        });
      } else {
        const bundle = await getBundle({
          bearerToken: authState.bearer_token,
          incidentId
        });
        verification.bundle_status = "status" in bundle && bundle.status === "pending" ? "pending" : "ready";
        verification.suggested_next_command = `debugbundle inspect ${incidentId} --source cloud`;
        checks.push({
          name: "bundle-status",
          status: verification.bundle_status === "ready" ? "ok" : "warning",
          message: verification.bundle_status === "ready" ? `Bundle for incident ${incidentId} is ready.` : `Bundle for incident ${incidentId} is still pending.`
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      checks.push({
        name: activeStep,
        status: "error",
        message
      });
      errors.push(message);
      exitCode = 1;
    }

    return formatCloudResult(input, exitCode, checks, errors, incidentId, verification);
  }

  if (input.trigger5xx === true || input.trigger4xxStatus !== undefined) {
    const verificationStartedAt = now();
    const runId = cloudVerificationRunId(verificationStartedAt);
    const serviceName = input.service ?? `debugbundle-verify-cloud-${runId}`;
    const tokenLabel = `debugbundle verify cloud ${runId}`;
    const pollAttempts = dependencies.pollAttempts ?? 6;
    const pollIntervalMs = dependencies.pollIntervalMs ?? 2_000;
    const sleep = dependencies.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
    const responseStatus = input.trigger4xxStatus ?? 503;
    const activeMode: CloudVerificationDetails["mode"] = input.trigger4xxStatus !== undefined ? "active_4xx" : "active_5xx";
    const activeCheckName: VerifyCheck["name"] = input.trigger4xxStatus !== undefined ? "active-4xx-event" : "active-5xx-event";
    const statusLabel = input.trigger4xxStatus !== undefined ? `${responseStatus}` : "5xx";
    const verification: CloudVerificationDetails = {
      mode: activeMode,
      bundle_status: "unknown",
      classification_reason: requestFailureReason(responseStatus)
    };
    const errors: string[] = [];
    let exitCode = 0;
    let tokenId: string | null = null;
    let incidentId: string | undefined;
    let activeStep: VerifyCheck["name"] = activeCheckName;

    try {
      const token = await createProjectToken({
        bearerToken: authState.bearer_token,
        projectId: input.projectId,
        label: tokenLabel
      });
      tokenId = token.token_id;
      if (token.plaintext === undefined) {
        throw new Error("Temporary verification project token did not include plaintext.");
      }

      const event = buildCloudVerificationEvent({
        now: verificationStartedAt,
        serviceName,
        environment,
        responseStatus
      });
      const ingestion = await sendEvents({
        baseUrl: authState.base_url,
        projectToken: token.plaintext,
        events: [event]
      });
      verification.accepted_event_count = ingestion.accepted;

      if (ingestion.accepted < 1 || ingestion.rejected > 0 || ingestion.errors.length > 0) {
        throw new Error(`Synthetic ${statusLabel} ingestion was not fully accepted: accepted=${ingestion.accepted}, rejected=${ingestion.rejected}.`);
      }

      checks.push({
        name: activeCheckName,
        status: "ok",
        message: `Sent synthetic ${statusLabel} request_event through cloud ingestion.`
      });
      activeStep = "incident-retrieval";

      for (let attempt = 1; attempt <= pollAttempts; attempt += 1) {
        const result = await listIncidents({
          bearerToken: authState.bearer_token,
          projectId: input.projectId,
          environment,
          service: serviceName,
          limit: 5
        });
        const candidate = result.incidents.find((incident) => {
          const lastSeenAt = new Date(incident.last_seen_at);
          return !Number.isNaN(lastSeenAt.getTime()) && lastSeenAt.getTime() >= verificationStartedAt.getTime();
        });
        if (candidate !== undefined) {
          incidentId = candidate.incident_id;
          verification.incident_id = candidate.incident_id;
          verification.classification_reason = candidate.incident_reason ?? requestFailureReason(responseStatus);
          break;
        }

        if (attempt < pollAttempts) {
          await sleep(pollIntervalMs);
        }
      }

      if (incidentId === undefined) {
        throw new Error(`Synthetic ${statusLabel} request was accepted but no matching cloud incident was visible yet.`);
      }

      checks.push({
        name: "incident-retrieval",
        status: "ok",
        message: `Retrieved cloud incident ${incidentId} for the synthetic ${statusLabel} request.`
      });
      activeStep = "bundle-status";

      const bundle = await getBundle({
        bearerToken: authState.bearer_token,
        incidentId
      });
      verification.bundle_status = "status" in bundle && bundle.status === "pending" ? "pending" : "ready";
      verification.suggested_next_command = `debugbundle inspect ${incidentId} --source cloud`;
      checks.push({
        name: "bundle-status",
        status: verification.bundle_status === "ready" ? "ok" : "warning",
        message: verification.bundle_status === "ready" ? `Bundle for incident ${incidentId} is ready.` : `Bundle for incident ${incidentId} is still pending.`
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      checks.push({
        name: activeStep,
        status: "error",
        message
      });
      errors.push(message);
      exitCode = 1;
    }

    if (tokenId !== null) {
      try {
        await revokeProjectToken({
          bearerToken: authState.bearer_token,
          projectId: input.projectId,
          tokenId
        });
        checks.push({
          name: "verification-token-cleanup",
          status: "ok",
          message: "Revoked temporary verification project token."
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        checks.push({
          name: "verification-token-cleanup",
          status: "warning",
          message: `Temporary verification project token cleanup failed: ${message}`
        });
      }
    }

    return formatCloudResult(input, exitCode, checks, errors, incidentId, verification);
  }

  try {
    const result = await listIncidents({
      bearerToken: authState.bearer_token,
      projectId: input.projectId,
      environment,
      ...(input.service === undefined ? {} : { service: input.service }),
      limit: 1
    });

    const incident = result.incidents[0];
    if (incident === undefined) {
      const message = `No incidents found for ${environment} verification in the last ${maxAgeMinutes} minute verification window.`;
      checks.push({
        name: "passive-traffic-check",
        status: "error",
        message
      });

      return formatCloudResult(input, 1, checks, [message]);
    }

    const lastSeenAt = new Date(incident.last_seen_at);
    if (Number.isNaN(lastSeenAt.getTime())) {
      const message = `Incident ${incident.incident_id} returned an invalid last_seen_at timestamp.`;
      checks.push({
        name: "passive-traffic-check",
        status: "error",
        message
      });

      return formatCloudResult(input, 1, checks, [message]);
    }

    const ageMilliseconds = now().getTime() - lastSeenAt.getTime();
    const ageMinutes = ageMilliseconds / 60000;
    if (ageMinutes > maxAgeMinutes) {
      const message = `Latest ${environment} incident ${incident.incident_id} is older than the ${maxAgeMinutes} minute verification window.`;
      checks.push({
        name: "passive-traffic-check",
        status: "error",
        message
      });

      return formatCloudResult(input, 1, checks, [message]);
    }

    checks.push({
      name: "passive-traffic-check",
      status: "ok",
      message: `Observed ${environment} traffic in incident ${incident.incident_id} within the last ${maxAgeMinutes} minutes.`
    });

    return formatCloudResult(input, 0, checks, [], incident.incident_id);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    checks.push({
      name: "passive-traffic-check",
      status: "error",
      message
    });

    return formatCloudResult(input, 1, checks, [message]);
  }
}
