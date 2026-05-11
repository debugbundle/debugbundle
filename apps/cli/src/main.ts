import { pathToFileURL } from "node:url";

import { analyzeCommand as defaultAnalyzeCommand } from "./analyze-command.js";
import { cleanCommand as defaultCleanCommand } from "./clean-command.js";
import { connectCommand as defaultConnectCommand } from "./connect-command.js";
import { doctorCommand as defaultDoctorCommand } from "./doctor-command.js";
import { ingestCommand as defaultIngestCommand } from "./ingest-command.js";
import { watchCommand as defaultWatchCommand } from "./watch-command.js";
import { setupCommand as defaultSetupCommand } from "./setup-command.js";
import { loginCommand as defaultLoginCommand } from "./login-command.js";
import { processCommand as defaultProcessCommand } from "./process-command.js";
import { profileValidateCommand as defaultProfileValidateCommand } from "./profile-command.js";
import {
  getBundleWithAuthCommand as defaultGetBundleCommand,
  getIncidentContextWithAuthCommand as defaultGetIncidentContextCommand,
  getIncidentWithAuthCommand as defaultGetIncidentCommand,
  getLogsWithAuthCommand as defaultGetLogsCommand,
  getReproductionWithAuthCommand as defaultGetReproductionCommand,
  reopenIncidentWithAuthCommand as defaultReopenIncidentCommand,
  resolveIncidentWithAuthCommand as defaultResolveIncidentCommand,
  listIncidentsWithAuthCommand as defaultListIncidentsCommand
} from "./retrieval-commands.js";
import { listServicesWithAuthCommand as defaultListServicesCommand } from "./services-command.js";
import { smokeCommand as defaultSmokeCommand } from "./smoke-command.js";
import { formatUsage } from "./usage.js";
import { validateCommand as defaultValidateCommand } from "./validate-command.js";
import { verifyCloudCommand as defaultVerifyCloudCommand, verifyLocalCommand as defaultVerifyLocalCommand } from "./verify-command.js";
import { whoamiCommand as defaultWhoamiCommand } from "./whoami-command.js";
import { appendCommonAuthOptions, CliInputError, ensureNoExtraPositionals, expectNoUnknownOptions, parseArgv, readBooleanOption, readIntegerOption, readLimitOption, readStringOption, requirePositional } from "./argv-helpers.js";
import { handleAlertCommand, handleBillingCommand, handleCapturePolicyCommand, handleGithubCommand, handleMemberCommand, handleProbeCommand, handleProjectCommand, handleTokenCommand, handleWebhookCommand, handleWeeklyReportCommand, type ManagementCommandDependencies } from "./management-command-handlers.js";
import type { CliCommandResult } from "./token-commands.js";

export type CliDependencies = ManagementCommandDependencies & {
  analyzeCommand?: typeof defaultAnalyzeCommand;
  cleanCommand?: typeof defaultCleanCommand;
  connectCommand?: typeof defaultConnectCommand;
  doctorCommand?: typeof defaultDoctorCommand;
  ingestCommand?: typeof defaultIngestCommand;
  watchCommand?: typeof defaultWatchCommand;
  setupCommand?: typeof defaultSetupCommand;
  loginCommand?: typeof defaultLoginCommand;
  processCommand?: typeof defaultProcessCommand;
  profileValidateCommand?: typeof defaultProfileValidateCommand;
  smokeCommand?: typeof defaultSmokeCommand;
  validateCommand?: typeof defaultValidateCommand;
  verifyLocalCommand?: typeof defaultVerifyLocalCommand;
  verifyCloudCommand?: typeof defaultVerifyCloudCommand;
  whoamiCommand?: typeof defaultWhoamiCommand;
  listIncidentsCommand?: typeof defaultListIncidentsCommand;
  getIncidentContextCommand?: typeof defaultGetIncidentContextCommand;
  getIncidentCommand?: typeof defaultGetIncidentCommand;
  resolveIncidentCommand?: typeof defaultResolveIncidentCommand;
  reopenIncidentCommand?: typeof defaultReopenIncidentCommand;
  getBundleCommand?: typeof defaultGetBundleCommand;
  getLogsCommand?: typeof defaultGetLogsCommand;
  getReproductionCommand?: typeof defaultGetReproductionCommand;
  listServicesCommand?: typeof defaultListServicesCommand;
};

type MainDependencies = CliDependencies & {
  argv?: string[];
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
  setExitCode?: (code: number) => void;
};

function readRetrievalSource(parsedArgv: ReturnType<typeof parseArgv>): "local" | "cloud" | undefined {
  const source = readStringOption(parsedArgv, "source");
  if (source === undefined) {
    return undefined;
  }

  if (source === "local" || source === "cloud") {
    return source;
  }

  throw new CliInputError("Invalid value for --source.");
}

export async function runCli(argv: string[], dependencies: CliDependencies = {}): Promise<CliCommandResult> {
  try {
    const parsedArgv = parseArgv(argv);

    if (argv.length === 0) {
      return {
        exitCode: 4,
        output: `No command provided.\n\n${formatUsage()}`
      };
    }

    if (readBooleanOption(parsedArgv, "help") || parsedArgv.positionals[0] === "help") {
      return {
        exitCode: 0,
        output: formatUsage()
      };
    }

    const command = requirePositional(parsedArgv, 0, "command");

    if (command === "doctor") {
      expectNoUnknownOptions(parsedArgv, ["check-relay", "json", "privacy"]);
      ensureNoExtraPositionals(parsedArgv, 1);

      const checkRelay = readBooleanOption(parsedArgv, "check-relay");
      const json = readBooleanOption(parsedArgv, "json");
      const privacy = readBooleanOption(parsedArgv, "privacy");
      return await (dependencies.doctorCommand ?? defaultDoctorCommand)({
        ...(checkRelay === true ? { checkRelay: true } : {}),
        ...(privacy === true ? { privacy: true } : {}),
        ...(json === true ? { json: true } : {})
      });
    }

    if (command === "analyze") {
      expectNoUnknownOptions(parsedArgv, ["json", "local", "type"]);
      ensureNoExtraPositionals(parsedArgv, 1);

      const input: { type?: string; local?: boolean; json?: boolean } = {};
      const type = readStringOption(parsedArgv, "type");
      if (type !== undefined) {
        input.type = type;
      }
      if (readBooleanOption(parsedArgv, "local") === true) {
        input.local = true;
      }
      if (readBooleanOption(parsedArgv, "json") === true) {
        input.json = true;
      }

      return await (dependencies.analyzeCommand ?? defaultAnalyzeCommand)(input);
    }

    if (command === "setup") {
      expectNoUnknownOptions(parsedArgv, ["json", "non-interactive"]);
      ensureNoExtraPositionals(parsedArgv, 1);

      const json = readBooleanOption(parsedArgv, "json");
      const nonInteractive = readBooleanOption(parsedArgv, "non-interactive");
      return await (dependencies.setupCommand ?? defaultSetupCommand)({
        ...(nonInteractive === true ? { nonInteractive: true } : {}),
        ...(json === true ? { json: true } : {})
      });
    }

    if (command === "connect") {
      expectNoUnknownOptions(parsedArgv, ["auth-file", "json"]);
      ensureNoExtraPositionals(parsedArgv, 1);

      return await (dependencies.connectCommand ?? defaultConnectCommand)(appendCommonAuthOptions(parsedArgv, {}));
    }

    if (command === "ingest") {
      expectNoUnknownOptions(parsedArgv, ["format", "json"]);
      ensureNoExtraPositionals(parsedArgv, 2);

      const filePath = requirePositional(parsedArgv, 1, "file");
      const format = readStringOption(parsedArgv, "format");
      if (format === undefined) {
        throw new CliInputError("Missing required option --format.");
      }

      return await (dependencies.ingestCommand ?? defaultIngestCommand)({
        filePath,
        format,
        ...(readBooleanOption(parsedArgv, "json") === true ? { json: true } : {})
      });
    }

    if (command === "watch") {
      expectNoUnknownOptions(parsedArgv, ["cloud", "log", "format", "json"]);
      ensureNoExtraPositionals(parsedArgv, 1);

      const logPath = readStringOption(parsedArgv, "log");
      if (logPath === undefined) {
        throw new CliInputError("Missing required option --log.");
      }

      const format = readStringOption(parsedArgv, "format");
      if (format === undefined) {
        throw new CliInputError("Missing required option --format.");
      }

      return await (dependencies.watchCommand ?? defaultWatchCommand)({
        ...(readBooleanOption(parsedArgv, "cloud") === true ? { cloud: true } : {}),
        logPath,
        format,
        ...(readBooleanOption(parsedArgv, "json") === true ? { json: true } : {})
      });
    }

    if (command === "process") {
      expectNoUnknownOptions(parsedArgv, ["json"]);
      ensureNoExtraPositionals(parsedArgv, 1);

      const json = readBooleanOption(parsedArgv, "json");
      return await (dependencies.processCommand ?? defaultProcessCommand)(json === true ? { json: true } : {});
    }

    if (command === "clean") {
      expectNoUnknownOptions(parsedArgv, ["events", "bundles", "all", "older-than", "json"]);
      ensureNoExtraPositionals(parsedArgv, 1);

      const events = readBooleanOption(parsedArgv, "events");
      const bundles = readBooleanOption(parsedArgv, "bundles");
      const all = readBooleanOption(parsedArgv, "all");
      const olderThan = readStringOption(parsedArgv, "older-than");
      const json = readBooleanOption(parsedArgv, "json");
      return await (dependencies.cleanCommand ?? defaultCleanCommand)({
        ...(events === true ? { events: true } : {}),
        ...(bundles === true ? { bundles: true } : {}),
        ...(all === true ? { all: true } : {}),
        ...(olderThan === undefined ? {} : { olderThan }),
        ...(json === true ? { json: true } : {})
      });
    }

    if (command === "validate") {
      expectNoUnknownOptions(parsedArgv, ["fix", "json"]);
      ensureNoExtraPositionals(parsedArgv, 1);

      const fix = readBooleanOption(parsedArgv, "fix");
      const json = readBooleanOption(parsedArgv, "json");
      return await (dependencies.validateCommand ?? defaultValidateCommand)({
        ...(fix === true ? { fix: true } : {}),
        ...(json === true ? { json: true } : {})
      });
    }

    if (command === "profile") {
      const subcommand = requirePositional(parsedArgv, 1, "subcommand");
      if (subcommand === "validate") {
        expectNoUnknownOptions(parsedArgv, ["json"]);
        ensureNoExtraPositionals(parsedArgv, 2);

        const json = readBooleanOption(parsedArgv, "json");
        return await (dependencies.profileValidateCommand ?? defaultProfileValidateCommand)(json === true ? { json: true } : {});
      }

      throw new CliInputError("Unknown profile command.");
    }

    if (command === "verify") {
      const subcommand = requirePositional(parsedArgv, 1, "subcommand");
      if (subcommand === "local") {
        expectNoUnknownOptions(parsedArgv, ["json"]);
        ensureNoExtraPositionals(parsedArgv, 2);

        return await (dependencies.verifyLocalCommand ?? defaultVerifyLocalCommand)(readBooleanOption(parsedArgv, "json") === true ? { json: true } : {});
      }

      if (subcommand === "cloud") {
        expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "project-id", "service", "environment", "max-age-minutes", "trigger-5xx"]);
        ensureNoExtraPositionals(parsedArgv, 2);

        const projectId = readStringOption(parsedArgv, "project-id");
        if (projectId === undefined) {
          throw new CliInputError("Missing required option --project-id.");
        }

        const input = appendCommonAuthOptions(parsedArgv, {
          projectId,
          ...(readStringOption(parsedArgv, "service") === undefined ? {} : { service: readStringOption(parsedArgv, "service") }),
          ...(readStringOption(parsedArgv, "environment") === undefined ? {} : { environment: readStringOption(parsedArgv, "environment") })
        } as {
          projectId: string;
          service?: string;
          environment?: string;
          maxAgeMinutes?: number;
          trigger5xx?: boolean;
          authFilePath?: string;
          json?: boolean;
        });

        const maxAgeMinutes = readIntegerOption(parsedArgv, "max-age-minutes");
        if (maxAgeMinutes !== undefined) {
          input.maxAgeMinutes = maxAgeMinutes;
        }
        if (readBooleanOption(parsedArgv, "trigger-5xx") === true) {
          input.trigger5xx = true;
        }

        return await (dependencies.verifyCloudCommand ?? defaultVerifyCloudCommand)(input);
      }

      throw new CliInputError("Unknown verify command.");
    }

    if (command === "smoke") {
      expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "project-id", "service", "environment", "max-age-minutes"]);
      ensureNoExtraPositionals(parsedArgv, 1);

      const projectId = readStringOption(parsedArgv, "project-id");
      if (projectId === undefined) {
        throw new CliInputError("Missing required option --project-id.");
      }

      const input = appendCommonAuthOptions(parsedArgv, {
        projectId,
        ...(readStringOption(parsedArgv, "service") === undefined ? {} : { service: readStringOption(parsedArgv, "service") }),
        ...(readStringOption(parsedArgv, "environment") === undefined ? {} : { environment: readStringOption(parsedArgv, "environment") })
      } as {
        projectId: string;
        service?: string;
        environment?: string;
        maxAgeMinutes?: number;
        authFilePath?: string;
        json?: boolean;
      });

      const maxAgeMinutes = readIntegerOption(parsedArgv, "max-age-minutes");
      if (maxAgeMinutes !== undefined) {
        input.maxAgeMinutes = maxAgeMinutes;
      }

      return await (dependencies.smokeCommand ?? defaultSmokeCommand)(input);
    }

    if (command === "login") {
      expectNoUnknownOptions(parsedArgv, ["auth-file", "base-url", "json"]);
      ensureNoExtraPositionals(parsedArgv, 2);

      const input = appendCommonAuthOptions(parsedArgv, {
        bearerToken: requirePositional(parsedArgv, 1, "member-token")
      } as {
        bearerToken: string;
        baseUrl?: string;
        authFilePath?: string;
        json?: boolean;
      });
      const baseUrl = readStringOption(parsedArgv, "base-url");
      if (baseUrl !== undefined) {
        input.baseUrl = baseUrl;
      }

      return await (dependencies.loginCommand ?? defaultLoginCommand)(input);
    }

    if (command === "whoami") {
      expectNoUnknownOptions(parsedArgv, ["auth-file", "json"]);
      ensureNoExtraPositionals(parsedArgv, 1);
      return await (dependencies.whoamiCommand ?? defaultWhoamiCommand)(appendCommonAuthOptions(parsedArgv, {}));
    }

    if (command === "incidents") {
      expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "source", "project-id", "environment", "service", "status", "severity", "cursor", "limit"]);
      ensureNoExtraPositionals(parsedArgv, 1);

      const input = appendCommonAuthOptions(parsedArgv, {} as {
        authFilePath?: string;
        json?: boolean;
        projectId?: string;
        environment?: string;
        service?: string;
        status?: string;
        severity?: string;
        cursor?: string;
        limit?: number;
        source?: "local" | "cloud";
      });
      const source = readRetrievalSource(parsedArgv);
      if (source !== undefined) {
        input.source = source;
      }
      const projectId = readStringOption(parsedArgv, "project-id");
      if (projectId !== undefined) {
        input.projectId = projectId;
      }
      const environment = readStringOption(parsedArgv, "environment");
      if (environment !== undefined) {
        input.environment = environment;
      }
      const service = readStringOption(parsedArgv, "service");
      if (service !== undefined) {
        input.service = service;
      }
      const status = readStringOption(parsedArgv, "status");
      if (status !== undefined) {
        input.status = status;
      }
      const severity = readStringOption(parsedArgv, "severity");
      if (severity !== undefined) {
        input.severity = severity;
      }
      const cursor = readStringOption(parsedArgv, "cursor");
      if (cursor !== undefined) {
        input.cursor = cursor;
      }
      const limit = readLimitOption(parsedArgv);
      if (limit !== undefined) {
        input.limit = limit;
      }

      return await (dependencies.listIncidentsCommand ?? defaultListIncidentsCommand)(input);
    }

    if (command === "inspect") {
      expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "source"]);
      ensureNoExtraPositionals(parsedArgv, 2);
      const input = appendCommonAuthOptions(parsedArgv, {
        incidentId: requirePositional(parsedArgv, 1, "incident-id")
      } as { incidentId: string; authFilePath?: string; json?: boolean; source?: "local" | "cloud" });
      const source = readRetrievalSource(parsedArgv);
      if (source !== undefined) {
        input.source = source;
      }
      return await (dependencies.getIncidentCommand ?? defaultGetIncidentCommand)(input);
    }

    if (command === "explain") {
      expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "source"]);
      ensureNoExtraPositionals(parsedArgv, 2);
      const input = appendCommonAuthOptions(parsedArgv, {
        incidentId: requirePositional(parsedArgv, 1, "incident-id")
      } as { incidentId: string; authFilePath?: string; json?: boolean; source?: "local" | "cloud" });
      const source = readRetrievalSource(parsedArgv);
      if (source !== undefined) {
        input.source = source;
      }
      return await (dependencies.getIncidentContextCommand ?? defaultGetIncidentContextCommand)(input);
    }

    if (command === "resolve") {
      expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "source"]);
      ensureNoExtraPositionals(parsedArgv, 2);
      const input = appendCommonAuthOptions(parsedArgv, {
        incidentId: requirePositional(parsedArgv, 1, "incident-id")
      } as { incidentId: string; authFilePath?: string; json?: boolean; source?: "local" | "cloud" });
      const source = readRetrievalSource(parsedArgv);
      if (source !== undefined) {
        input.source = source;
      }
      return await (dependencies.resolveIncidentCommand ?? defaultResolveIncidentCommand)(input);
    }

    if (command === "reopen") {
      expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "source"]);
      ensureNoExtraPositionals(parsedArgv, 2);
      const input = appendCommonAuthOptions(parsedArgv, {
        incidentId: requirePositional(parsedArgv, 1, "incident-id")
      } as { incidentId: string; authFilePath?: string; json?: boolean; source?: "local" | "cloud" });
      const source = readRetrievalSource(parsedArgv);
      if (source !== undefined) {
        input.source = source;
      }
      return await (dependencies.reopenIncidentCommand ?? defaultReopenIncidentCommand)(input);
    }

    if (command === "bundle") {
      expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "source"]);
      ensureNoExtraPositionals(parsedArgv, 2);
      const input = appendCommonAuthOptions(parsedArgv, {
        incidentId: requirePositional(parsedArgv, 1, "incident-id")
      } as { incidentId: string; authFilePath?: string; json?: boolean; source?: "local" | "cloud" });
      const source = readRetrievalSource(parsedArgv);
      if (source !== undefined) {
        input.source = source;
      }
      return await (dependencies.getBundleCommand ?? defaultGetBundleCommand)(input);
    }

    if (command === "reproduce") {
      expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "source"]);
      ensureNoExtraPositionals(parsedArgv, 2);
      const input = appendCommonAuthOptions(parsedArgv, {
        incidentId: requirePositional(parsedArgv, 1, "incident-id")
      } as { incidentId: string; authFilePath?: string; json?: boolean; source?: "local" | "cloud" });
      const source = readRetrievalSource(parsedArgv);
      if (source !== undefined) {
        input.source = source;
      }
      return await (dependencies.getReproductionCommand ?? defaultGetReproductionCommand)(input);
    }

    if (command === "logs") {
      expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "level", "cursor", "limit"]);
      ensureNoExtraPositionals(parsedArgv, 2);

      const input = appendCommonAuthOptions(parsedArgv, {
        incidentId: requirePositional(parsedArgv, 1, "incident-id")
      } as {
        incidentId: string;
        authFilePath?: string;
        json?: boolean;
        level?: string;
        cursor?: string;
        limit?: number;
      });
      const level = readStringOption(parsedArgv, "level");
      if (level !== undefined) {
        input.level = level;
      }
      const cursor = readStringOption(parsedArgv, "cursor");
      if (cursor !== undefined) {
        input.cursor = cursor;
      }
      const limit = readLimitOption(parsedArgv);
      if (limit !== undefined) {
        input.limit = limit;
      }

      return await (dependencies.getLogsCommand ?? defaultGetLogsCommand)(input);
    }

    if (command === "services") {
      expectNoUnknownOptions(parsedArgv, ["auth-file", "json", "project-id", "limit"]);
      ensureNoExtraPositionals(parsedArgv, 1);
      const projectId = readStringOption(parsedArgv, "project-id");
      if (projectId === undefined) {
        throw new CliInputError("Missing required option --project-id.");
      }

      const input = appendCommonAuthOptions(parsedArgv, { projectId } as {
        projectId: string;
        authFilePath?: string;
        json?: boolean;
        limit?: number;
      });
      const limit = readLimitOption(parsedArgv);
      if (limit !== undefined) {
        input.limit = limit;
      }

      return await (dependencies.listServicesCommand ?? defaultListServicesCommand)(input);
    }

    if (command === "token") {
      return await handleTokenCommand(parsedArgv, dependencies);
    }

    if (command === "billing") {
      return await handleBillingCommand(parsedArgv, dependencies);
    }

    if (command === "project") {
      return await handleProjectCommand(parsedArgv, dependencies);
    }

    if (command === "github") {
      return await handleGithubCommand(parsedArgv, dependencies);
    }

    if (command === "alert") {
      return await handleAlertCommand(parsedArgv, dependencies);
    }

    if (command === "webhook") {
      return await handleWebhookCommand(parsedArgv, dependencies);
    }

    if (command === "weekly-report") {
      return await handleWeeklyReportCommand(parsedArgv, dependencies);
    }

    if (command === "capture-policy") {
      return await handleCapturePolicyCommand(parsedArgv, dependencies);
    }

    if (command === "probe") {
      return await handleProbeCommand(parsedArgv, dependencies);
    }

    if (command === "member") {
      return await handleMemberCommand(parsedArgv, dependencies);
    }

    return {
      exitCode: 4,
      output: `Unknown command: ${command}.\n\n${formatUsage()}`
    };
  } catch (error) {
    if (error instanceof CliInputError) {
      return {
        exitCode: 4,
        output: `${error.message}\n\n${formatUsage()}`
      };
    }

    return {
      exitCode: 1,
      output: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function main(dependencies: MainDependencies = {}): Promise<void> {
  const argv = dependencies.argv ?? process.argv.slice(2);
  const stdout = dependencies.stdout ?? ((text: string) => process.stdout.write(text));
  const stderr = dependencies.stderr ?? ((text: string) => process.stderr.write(text));
  const setExitCode = dependencies.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });

  const result = await runCli(argv, dependencies);
  if (result.output.length > 0) {
    if (result.exitCode === 0) {
      stdout(`${result.output}\n`);
    } else {
      stderr(`${result.output}\n`);
    }
  }

  setExitCode(result.exitCode);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
