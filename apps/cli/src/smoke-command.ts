import { z } from "zod";

import type { CliCommandResult } from "./token-commands.js";
import { verifyCloudCommand, verifyLocalCommand } from "./verify-command.js";

type SmokeCheck = {
  name: string;
  status: "ok" | "warning" | "missing" | "error";
  message: string;
};

type SmokeChildJson = {
  status: "healthy" | "warning" | "error";
  warnings: string[];
  errors: string[];
};

type SmokeCommandInput = {
  projectId: string;
  service?: string;
  environment?: string;
  maxAgeMinutes?: number;
  authFilePath?: string;
  json?: boolean;
};

type SmokeCommandDependencies = {
  verifyLocal?: typeof verifyLocalCommand;
  verifyCloud?: typeof verifyCloudCommand;
};

const SmokeChildOutputSchema = z
  .object({
    status: z.enum(["healthy", "warning", "error"]),
    warnings: z.array(z.string()),
    errors: z.array(z.string())
  })
  .passthrough();

function toCheckStatus(status: SmokeChildJson["status"]): SmokeCheck["status"] {
  if (status === "healthy") {
    return "ok";
  }

  if (status === "warning") {
    return "warning";
  }

  return "error";
}

function buildCheckMessage(label: "Local" | "Cloud", status: SmokeChildJson["status"]): string {
  if (status === "healthy") {
    return `${label} verification passed.`;
  }

  if (status === "warning") {
    return `${label} verification completed with warnings.`;
  }

  return `${label} verification failed.`;
}

function resolveOverallStatus(checks: SmokeCheck[]): "healthy" | "warning" | "error" {
  if (checks.some((check) => check.status === "error" || check.status === "missing")) {
    return "error";
  }

  if (checks.some((check) => check.status === "warning")) {
    return "warning";
  }

  return "healthy";
}

function resolveExitCode(exitCodes: number[]): number {
  if (exitCodes.some((code) => code === 4)) {
    return 4;
  }

  if (exitCodes.some((code) => code === 3)) {
    return 3;
  }

  if (exitCodes.some((code) => code === 2)) {
    return 2;
  }

  if (exitCodes.some((code) => code !== 0)) {
    return 1;
  }

  return 0;
}

function buildSuggestedActions(status: "healthy" | "warning" | "error"): string[] {
  if (status === "healthy") {
    return ["Re-run debugbundle smoke after changing local or deployed DebugBundle configuration."];
  }

  return [
    "Run debugbundle verify local to inspect local setup failures in detail.",
    "Run debugbundle verify cloud to inspect hosted traffic verification in detail."
  ];
}

function buildJsonOutput(checks: SmokeCheck[], warnings: string[], errors: string[]): string {
  const status = resolveOverallStatus(checks);
  return JSON.stringify({
    status,
    checks,
    warnings,
    errors,
    suggested_actions: buildSuggestedActions(status),
    auto_fix_available: false
  });
}

function buildHumanOutput(checks: SmokeCheck[]): string {
  const status = resolveOverallStatus(checks);
  return [
    status === "healthy" ? "DebugBundle smoke check passed." : "DebugBundle smoke check failed.",
    "Checks:",
    ...checks.map((check) => `- ${check.name}: ${check.status} - ${check.message}`),
    "Suggested actions:",
    ...buildSuggestedActions(status).map((action) => `- ${action}`)
  ].join("\n");
}

function formatResult(input: { json?: boolean }, exitCode: number, checks: SmokeCheck[], warnings: string[], errors: string[]): CliCommandResult {
  return {
    exitCode,
    output: input.json ? buildJsonOutput(checks, warnings, errors) : buildHumanOutput(checks)
  };
}

function parseChildOutput(label: "local" | "cloud", output: string): SmokeChildJson {
  const parsedJson = JSON.parse(output) as unknown;
  const parsed = SmokeChildOutputSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new Error(`${label} verification returned invalid JSON output.`);
  }

  return parsed.data;
}

export async function smokeCommand(
  input: SmokeCommandInput,
  dependencies: SmokeCommandDependencies = {}
): Promise<CliCommandResult> {
  const runVerifyLocal = dependencies.verifyLocal ?? verifyLocalCommand;
  const runVerifyCloud = dependencies.verifyCloud ?? verifyCloudCommand;

  const localResult = await runVerifyLocal({
    json: true
  });

  const cloudResult = await runVerifyCloud({
    projectId: input.projectId,
    ...(input.service === undefined ? {} : { service: input.service }),
    ...(input.environment === undefined ? {} : { environment: input.environment }),
    ...(input.maxAgeMinutes === undefined ? {} : { maxAgeMinutes: input.maxAgeMinutes }),
    ...(input.authFilePath === undefined ? {} : { authFilePath: input.authFilePath }),
    json: true
  });

  let localOutput: SmokeChildJson;
  let cloudOutput: SmokeChildJson;
  try {
    localOutput = parseChildOutput("local", localResult.output);
    cloudOutput = parseChildOutput("cloud", cloudResult.output);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const checks: SmokeCheck[] = [
      {
        name: "local-verification",
        status: "error",
        message: "Smoke orchestration failed."
      },
      {
        name: "cloud-verification",
        status: "error",
        message: "Smoke orchestration failed."
      }
    ];

    return formatResult(input, 1, checks, [], [message]);
  }

  const checks: SmokeCheck[] = [
    {
      name: "local-verification",
      status: toCheckStatus(localOutput.status),
      message: buildCheckMessage("Local", localOutput.status)
    },
    {
      name: "cloud-verification",
      status: toCheckStatus(cloudOutput.status),
      message: buildCheckMessage("Cloud", cloudOutput.status)
    }
  ];

  const warnings = [
    ...localOutput.warnings.map((warning) => `local: ${warning}`),
    ...cloudOutput.warnings.map((warning) => `cloud: ${warning}`)
  ];

  const errors = [
    ...localOutput.errors.map((error) => `local: ${error}`),
    ...cloudOutput.errors.map((error) => `cloud: ${error}`)
  ];

  return formatResult(input, resolveExitCode([localResult.exitCode, cloudResult.exitCode]), checks, warnings, errors);
}