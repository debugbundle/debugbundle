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
  mode: "active_5xx" | "passive_recent_incident";
  accepted_event_count?: number;
  incident_id?: string;
  bundle_status?: "ready" | "pending" | "unknown";
  classification_reason?: IncidentReason;
  suggested_next_command?: string;
};

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

function buildCloudSuggestedActions(status: "healthy" | "warning" | "error", incidentId?: string, mode: CloudVerificationDetails["mode"] = "passive_recent_incident"): string[] {
  if (status === "healthy" && incidentId !== undefined && mode === "active_5xx") {
    return [
      `Run debugbundle inspect ${incidentId} --source cloud to inspect why the incident fired.`,
      `Run debugbundle bundle ${incidentId} --source cloud to fetch the generated debug bundle.`
    ];
  }

  if (status === "healthy" && incidentId !== undefined) {
    return [
      `Review incident ${incidentId} if you want to inspect the latest production bundle.`,
      "Re-run debugbundle verify cloud after a fresh deploy or instrumentation change."
    ];
  }

  return [
    "Run debugbundle login to create ~/.debugbundle/auth.json before verifying cloud traffic.",
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
    suggested_actions: buildCloudSuggestedActions(status, incidentId, verification?.mode),
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
    ...buildCloudSuggestedActions(status, incidentId, verification?.mode).map((action) => `- ${action}`)
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

function requestFailure5xxReason(): IncidentReason {
  const incidentReason = deriveIncidentReasonFromSignal({
    event_type: "request_event",
    event_class: "incident_signal",
    response_status: 503
  });

  if (incidentReason === null) {
    throw new Error("request_failure_5xx_reason_unavailable");
  }

  return incidentReason;
}

function buildCloudVerificationEvent(input: {
  now: Date;
  serviceName: string;
  environment: string;
}): ReturnType<typeof createEventEnvelope> {
  const runId = cloudVerificationRunId(input.now);
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
      path: "/debugbundle/verify/cloud",
      route_template: "/debugbundle/verify/cloud",
      query: {
        debugbundle_verification: true,
        run_id: runId
      },
      headers: {
        "x-debugbundle-verification": "true"
      },
      response_status: 503,
      duration_ms: 37,
      response_headers: {
        "x-debugbundle-verification": "true"
      },
      response_body: {
        error: "debugbundle_cloud_verification",
        synthetic: true,
        run_id: runId
      }
    }
  });
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
    authFilePath?: string;
    json?: boolean;
  },
  dependencies: VerifyCloudDependencies = {}
): Promise<CliCommandResult> {
  const now = dependencies.now ?? (() => new Date());
  const checks: VerifyCheck[] = [];
  const environment = input.environment ?? "production";
  const maxAgeMinutes = input.maxAgeMinutes ?? 15;

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

  if (input.trigger5xx === true) {
    const verificationStartedAt = now();
    const runId = cloudVerificationRunId(verificationStartedAt);
    const serviceName = input.service ?? `debugbundle-verify-cloud-${runId}`;
    const tokenLabel = `debugbundle verify cloud ${runId}`;
    const pollAttempts = dependencies.pollAttempts ?? 6;
    const pollIntervalMs = dependencies.pollIntervalMs ?? 2_000;
    const sleep = dependencies.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
    const verification: CloudVerificationDetails = {
      mode: "active_5xx",
      bundle_status: "unknown",
      classification_reason: requestFailure5xxReason()
    };
    const errors: string[] = [];
    let exitCode = 0;
    let tokenId: string | null = null;
    let incidentId: string | undefined;
    let activeStep: VerifyCheck["name"] = "active-5xx-event";

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
        environment
      });
      const ingestion = await sendEvents({
        baseUrl: authState.base_url,
        projectToken: token.plaintext,
        events: [event]
      });
      verification.accepted_event_count = ingestion.accepted;

      if (ingestion.accepted < 1 || ingestion.rejected > 0 || ingestion.errors.length > 0) {
        throw new Error(`Synthetic 5xx ingestion was not fully accepted: accepted=${ingestion.accepted}, rejected=${ingestion.rejected}.`);
      }

      checks.push({
        name: "active-5xx-event",
        status: "ok",
        message: "Sent synthetic 5xx request_event through cloud ingestion."
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
          verification.classification_reason = candidate.incident_reason ?? requestFailure5xxReason();
          break;
        }

        if (attempt < pollAttempts) {
          await sleep(pollIntervalMs);
        }
      }

      if (incidentId === undefined) {
        throw new Error("Synthetic 5xx request was accepted but no matching cloud incident was visible yet.");
      }

      checks.push({
        name: "incident-retrieval",
        status: "ok",
        message: `Retrieved cloud incident ${incidentId} for the synthetic 5xx request.`
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
