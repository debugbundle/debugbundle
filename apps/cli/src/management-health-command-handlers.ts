import {
  createHealthCheckWithAuthCommand as defaultCreateHealthCheckCommand,
  deleteHealthCheckWithAuthCommand as defaultDeleteHealthCheckCommand,
  getHealthCheckWithAuthCommand as defaultGetHealthCheckCommand,
  listHealthCheckDailyRollupsWithAuthCommand as defaultListHealthCheckDailyRollupsCommand,
  listHealthCheckResultsWithAuthCommand as defaultListHealthCheckResultsCommand,
  listHealthChecksWithAuthCommand as defaultListHealthChecksCommand,
  testHealthCheckWithAuthCommand as defaultTestHealthCheckCommand,
  updateHealthCheckWithAuthCommand as defaultUpdateHealthCheckCommand
} from "./health-check-commands.js";
import {
  appendCommonAuthOptions,
  CliInputError,
  ensureNoExtraPositionals,
  expectNoUnknownOptions,
  readBooleanStringOption,
  readIntegerOption,
  readLimitOption,
  readStringOption,
  requirePositional,
  type ParsedArgv
} from "./argv-helpers.js";
import type { CliCommandResult, ManagementCommandDependencies } from "./management-command-dependencies.js";

function readOptionalServiceName(parsedArgv: ParsedArgv): string | null | undefined {
  const service = readStringOption(parsedArgv, "service");
  if (service === undefined) {
    return undefined;
  }

  return service === "null" ? null : service;
}

function readRequiredProjectId(parsedArgv: ParsedArgv): string {
  const projectId = readStringOption(parsedArgv, "project-id");
  if (projectId === undefined) {
    throw new CliInputError("Missing required option --project-id.");
  }

  return projectId;
}

function readRequiredUrl(parsedArgv: ParsedArgv): string {
  const url = readStringOption(parsedArgv, "url");
  if (url === undefined) {
    throw new CliInputError("Missing required option --url.");
  }

  return url;
}

function readRequiredName(parsedArgv: ParsedArgv): string {
  const name = readStringOption(parsedArgv, "name");
  if (name === undefined) {
    throw new CliInputError("Missing required option --name.");
  }

  return name;
}

export async function handleHealthCommand(
  parsedArgv: ParsedArgv,
  dependencies: ManagementCommandDependencies
): Promise<CliCommandResult> {
  const resource = requirePositional(parsedArgv, 1, "resource");
  if (resource !== "checks") {
    throw new CliInputError("Unknown health command.");
  }

  const action = requirePositional(parsedArgv, 2, "action");

  if (action === "list") {
    expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "project-id", "limit"]);
    ensureNoExtraPositionals(parsedArgv, 3);

    const limit = readLimitOption(parsedArgv);
    return await (dependencies.listHealthChecksCommand ?? defaultListHealthChecksCommand)(
      appendCommonAuthOptions(parsedArgv, {
        projectId: readRequiredProjectId(parsedArgv),
        ...(limit === undefined ? {} : { limit })
      })
    );
  }

  if (action === "get") {
    expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "project-id"]);
    ensureNoExtraPositionals(parsedArgv, 4);

    return await (dependencies.getHealthCheckCommand ?? defaultGetHealthCheckCommand)(
      appendCommonAuthOptions(parsedArgv, {
        projectId: readRequiredProjectId(parsedArgv),
        checkId: requirePositional(parsedArgv, 3, "check-id")
      })
    );
  }

  if (action === "create") {
    expectNoUnknownOptions(parsedArgv, [
      "auth-file",
      "json",
      "project-id",
      "name",
      "url",
      "method",
      "expected-status-min",
      "expected-status-max",
      "timeout-ms",
      "interval-seconds",
      "failure-threshold",
      "recovery-threshold",
      "environment",
      "service",
      "enabled"
    ]);
    ensureNoExtraPositionals(parsedArgv, 3);

    const intervalSeconds = readIntegerOption(parsedArgv, "interval-seconds");
    if (intervalSeconds === undefined) {
      throw new CliInputError("Missing required option --interval-seconds.");
    }

    const method = readStringOption(parsedArgv, "method") ?? "GET";
    if (method !== "GET" && method !== "HEAD") {
      throw new CliInputError("Invalid value for --method.");
    }

    const enabled = readBooleanStringOption(parsedArgv, "enabled") ?? true;
    const environment = readStringOption(parsedArgv, "environment");
    const serviceName = readOptionalServiceName(parsedArgv);

    return await (dependencies.createHealthCheckCommand ?? defaultCreateHealthCheckCommand)(
      appendCommonAuthOptions(parsedArgv, {
        projectId: readRequiredProjectId(parsedArgv),
        name: readRequiredName(parsedArgv),
        url: readRequiredUrl(parsedArgv),
        method,
        expectedStatusMin: readIntegerOption(parsedArgv, "expected-status-min") ?? 200,
        expectedStatusMax: readIntegerOption(parsedArgv, "expected-status-max") ?? 399,
        timeoutMs: readIntegerOption(parsedArgv, "timeout-ms") ?? 2500,
        intervalSeconds,
        failureThreshold: readIntegerOption(parsedArgv, "failure-threshold") ?? 3,
        recoveryThreshold: readIntegerOption(parsedArgv, "recovery-threshold") ?? 2,
        ...(environment === undefined ? {} : { environment }),
        ...(serviceName === undefined ? {} : { serviceName }),
        enabled
      })
    );
  }

  if (action === "update") {
    expectNoUnknownOptions(parsedArgv, [
      "auth-file",
      "json",
      "project-id",
      "name",
      "url",
      "method",
      "expected-status-min",
      "expected-status-max",
      "timeout-ms",
      "interval-seconds",
      "failure-threshold",
      "recovery-threshold",
      "environment",
      "service",
      "enabled"
    ]);
    ensureNoExtraPositionals(parsedArgv, 4);

    const method = readStringOption(parsedArgv, "method");
    if (method !== undefined && method !== "GET" && method !== "HEAD") {
      throw new CliInputError("Invalid value for --method.");
    }

    const input = appendCommonAuthOptions(parsedArgv, {
      projectId: readRequiredProjectId(parsedArgv),
      checkId: requirePositional(parsedArgv, 3, "check-id")
    } as {
      authFilePath?: string;
      json?: boolean;
      projectId: string;
      checkId: string;
      name?: string;
      url?: string;
      method?: "GET" | "HEAD";
      expectedStatusMin?: number;
      expectedStatusMax?: number;
      timeoutMs?: number;
      intervalSeconds?: number;
      failureThreshold?: number;
      recoveryThreshold?: number;
      environment?: string;
      serviceName?: string | null;
      enabled?: boolean;
    });

    const name = readStringOption(parsedArgv, "name");
    const url = readStringOption(parsedArgv, "url");
    const expectedStatusMin = readIntegerOption(parsedArgv, "expected-status-min");
    const expectedStatusMax = readIntegerOption(parsedArgv, "expected-status-max");
    const timeoutMs = readIntegerOption(parsedArgv, "timeout-ms");
    const intervalSeconds = readIntegerOption(parsedArgv, "interval-seconds");
    const failureThreshold = readIntegerOption(parsedArgv, "failure-threshold");
    const recoveryThreshold = readIntegerOption(parsedArgv, "recovery-threshold");
    const environment = readStringOption(parsedArgv, "environment");
    const serviceName = readOptionalServiceName(parsedArgv);
    const enabled = readBooleanStringOption(parsedArgv, "enabled");

    if (name !== undefined) input.name = name;
    if (url !== undefined) input.url = url;
    if (method !== undefined) input.method = method;
    if (expectedStatusMin !== undefined) input.expectedStatusMin = expectedStatusMin;
    if (expectedStatusMax !== undefined) input.expectedStatusMax = expectedStatusMax;
    if (timeoutMs !== undefined) input.timeoutMs = timeoutMs;
    if (intervalSeconds !== undefined) input.intervalSeconds = intervalSeconds;
    if (failureThreshold !== undefined) input.failureThreshold = failureThreshold;
    if (recoveryThreshold !== undefined) input.recoveryThreshold = recoveryThreshold;
    if (environment !== undefined) input.environment = environment;
    if (serviceName !== undefined) input.serviceName = serviceName;
    if (enabled !== undefined) input.enabled = enabled;

    const hasChanges =
      name !== undefined ||
      url !== undefined ||
      method !== undefined ||
      expectedStatusMin !== undefined ||
      expectedStatusMax !== undefined ||
      timeoutMs !== undefined ||
      intervalSeconds !== undefined ||
      failureThreshold !== undefined ||
      recoveryThreshold !== undefined ||
      environment !== undefined ||
      serviceName !== undefined ||
      enabled !== undefined;

    if (!hasChanges) {
      throw new CliInputError("At least one health-check field must be provided.");
    }

    return await (dependencies.updateHealthCheckCommand ?? defaultUpdateHealthCheckCommand)(input);
  }

  if (action === "delete") {
    expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "project-id"]);
    ensureNoExtraPositionals(parsedArgv, 4);

    return await (dependencies.deleteHealthCheckCommand ?? defaultDeleteHealthCheckCommand)(
      appendCommonAuthOptions(parsedArgv, {
        projectId: readRequiredProjectId(parsedArgv),
        checkId: requirePositional(parsedArgv, 3, "check-id")
      })
    );
  }

  if (action === "test") {
    expectNoUnknownOptions(parsedArgv, [
      "auth-file",
      "json",
      "project-id",
      "url",
      "method",
      "expected-status-min",
      "expected-status-max",
      "timeout-ms"
    ]);
    ensureNoExtraPositionals(parsedArgv, 3);

    const method = readStringOption(parsedArgv, "method") ?? "GET";
    if (method !== "GET" && method !== "HEAD") {
      throw new CliInputError("Invalid value for --method.");
    }

    return await (dependencies.testHealthCheckCommand ?? defaultTestHealthCheckCommand)(
      appendCommonAuthOptions(parsedArgv, {
        projectId: readRequiredProjectId(parsedArgv),
        url: readRequiredUrl(parsedArgv),
        method,
        expectedStatusMin: readIntegerOption(parsedArgv, "expected-status-min") ?? 200,
        expectedStatusMax: readIntegerOption(parsedArgv, "expected-status-max") ?? 399,
        timeoutMs: readIntegerOption(parsedArgv, "timeout-ms") ?? 2500
      })
    );
  }

  if (action === "results") {
    expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "project-id", "limit"]);
    ensureNoExtraPositionals(parsedArgv, 4);

    const limit = readLimitOption(parsedArgv);
    return await (dependencies.listHealthCheckResultsCommand ?? defaultListHealthCheckResultsCommand)(
      appendCommonAuthOptions(parsedArgv, {
        projectId: readRequiredProjectId(parsedArgv),
        checkId: requirePositional(parsedArgv, 3, "check-id"),
        ...(limit === undefined ? {} : { limit })
      })
    );
  }

  if (action === "daily-rollups") {
    expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "project-id", "limit"]);
    ensureNoExtraPositionals(parsedArgv, 4);

    const limit = readLimitOption(parsedArgv);
    return await (dependencies.listHealthCheckDailyRollupsCommand ?? defaultListHealthCheckDailyRollupsCommand)(
      appendCommonAuthOptions(parsedArgv, {
        projectId: readRequiredProjectId(parsedArgv),
        checkId: requirePositional(parsedArgv, 3, "check-id"),
        ...(limit === undefined ? {} : { limit })
      })
    );
  }

  throw new CliInputError("Unknown health checks command.");
}
