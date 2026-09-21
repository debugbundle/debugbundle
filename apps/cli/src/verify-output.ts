import type { IncidentReason } from "../../../packages/storage/src/index.js";
import type { CliCommandResult } from "./token-commands.js";

export type VerifyCheck = {
  name: string;
  status: "ok" | "warning" | "missing" | "error";
  message: string;
};

export type CloudVerificationDetails = {
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

function resolveOverallStatus(checks: VerifyCheck[]): "healthy" | "warning" | "error" {
  if (checks.some((check) => check.status === "error" || check.status === "missing")) {
    return "error";
  }

  if (checks.some((check) => check.status === "warning")) {
    return "warning";
  }

  return "healthy";
}

function buildSuggestedActions(
  status: "healthy" | "warning" | "error",
  incidentId?: string
): string[] {
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

export function formatResult(
  input: { json?: boolean },
  exitCode: number,
  checks: VerifyCheck[],
  errors: string[],
  incidentId?: string
): CliCommandResult {
  return {
    exitCode,
    output: input.json
      ? buildJsonOutput(checks, errors, incidentId)
      : formatHumanOutput(checks, incidentId)
  };
}

function buildCloudSuggestedActions(
  status: "healthy" | "warning" | "error",
  incidentId?: string,
  verification?: CloudVerificationDetails
): string[] {
  const mode = verification?.mode ?? "passive_recent_incident";
  if (
    status === "healthy" &&
    incidentId !== undefined &&
    (mode === "active_5xx" || mode === "active_4xx")
  ) {
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

function buildCloudJsonOutput(
  checks: VerifyCheck[],
  errors: string[],
  incidentId?: string,
  verification?: CloudVerificationDetails
): string {
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

function formatCloudHumanOutput(
  checks: VerifyCheck[],
  incidentId?: string,
  verification?: CloudVerificationDetails
): string {
  const status = resolveOverallStatus(checks);
  return [
    "DebugBundle cloud verification passed.",
    "Checks:",
    ...checks.map((check) => `- ${check.name}: ${check.status} - ${check.message}`),
    "Suggested actions:",
    ...buildCloudSuggestedActions(status, incidentId, verification).map((action) => `- ${action}`)
  ].join("\n");
}

export function formatCloudResult(
  input: { json?: boolean },
  exitCode: number,
  checks: VerifyCheck[],
  errors: string[],
  incidentId?: string,
  verification?: CloudVerificationDetails
): CliCommandResult {
  return {
    exitCode,
    output: input.json
      ? buildCloudJsonOutput(checks, errors, incidentId, verification)
      : formatCloudHumanOutput(checks, incidentId, verification)
  };
}
