import {
  createNotificationApi,
  NotificationApiError,
  type NotificationAction,
  type NotificationHttpClient
} from "../../../packages/alert-client/src/notification-preferences.js";
import {
  NotificationAudienceSchema,
  NOTIFICATION_CHANNELS,
  type NotificationAudience
} from "../../../packages/shared-types/src/notification-preferences.js";
import { createCliHttpClient } from "./auth-context.js";
import { readCliAuthState, type CliAuthState } from "./auth-state.js";
import {
  CliInputError,
  expectNoUnknownOptions,
  ensureNoExtraPositionals,
  readStringOption,
  readBooleanOption,
  type ParsedArgv
} from "./argv-helpers.js";
import type { CliCommandResult } from "./token-commands.js";

export type NotificationCommandInput = {
  action: NotificationAction;
  audience: NotificationAudience;
  projectId?: string;
  body?: unknown;
  authFilePath?: string;
  json?: boolean;
};
export async function notificationWithAuthCommand(
  input: NotificationCommandInput,
  dependencies: {
    readAuthState?: (input: { authFilePath?: string }) => Promise<CliAuthState>;
    createHttpClient?: (input: { baseUrl: string }) => NotificationHttpClient;
  } = {}
): Promise<CliCommandResult> {
  try {
    const auth = await (dependencies.readAuthState ?? readCliAuthState)(
      input.authFilePath === undefined ? {} : { authFilePath: input.authFilePath }
    );
    const api = createNotificationApi(
      (dependencies.createHttpClient ?? createCliHttpClient)({ baseUrl: auth.base_url })
    );
    const response = await api.request(
      {
        bearerToken: auth.bearer_token,
        audience: input.audience,
        ...(input.projectId === undefined ? {} : { projectId: input.projectId })
      },
      input.action,
      input.body
    );
    return {
      exitCode: 0,
      output: input.json
        ? JSON.stringify(response)
        : [
            `${response.audience} notifications · ${response.project_id ?? "all projects"}`,
            ...NOTIFICATION_CHANNELS.filter(
              (channel) => response.audience === "shared" || channel === "email"
            ).map((channel) => {
              const policy = response.effective[channel];
              return `${channel}: ${policy.mode} (${policy.reason})${policy.reason.endsWith("paused") ? ` · ${policy.paused_until ?? "until resumed"}` : ""}${policy.mode === "daily" ? ` · ${policy.daily.time} ${policy.daily.timezone}` : ""}`;
            })
          ].join("\n")
    };
  } catch (error) {
    return {
      exitCode: error instanceof NotificationApiError && error.status === 401 ? 2 : 1,
      output:
        error instanceof NotificationApiError
          ? error.message
          : "Could not read or update notification preferences. Check authentication and input."
    };
  }
}

export async function handleNotificationCommand(
  argv: ParsedArgv,
  run = notificationWithAuthCommand
): Promise<CliCommandResult> {
  ensureNoExtraPositionals(argv, 2);
  const action = argv.positionals[1];
  if (!["get", "set", "pause", "resume"].includes(action ?? ""))
    throw new CliInputError("Use notifications get, set, pause, or resume.");
  const common = ["project-id", "audience", "auth-file", "json"];
  expectNoUnknownOptions(argv, [
    ...common,
    ...(action === "set"
      ? ["email", "slack", "discord", "webhook", "time", "timezone", "inherit-schedule"]
      : action === "pause"
        ? ["channels", "for", "until", "allow-health-checks"]
        : action === "resume"
          ? ["channels"]
          : [])
  ]);
  const audience = NotificationAudienceSchema.parse(
    readStringOption(argv, "audience") ?? "personal"
  );
  const projectId = readStringOption(argv, "project-id");
  const authFilePath = readStringOption(argv, "auth-file");
  let body: unknown;
  if (action === "set") {
    const channels = Object.fromEntries(
      NOTIFICATION_CHANNELS.flatMap((channel) => {
        const value = readStringOption(argv, channel);
        return value === undefined ? [] : [[channel, value]];
      })
    );
    const time = readStringOption(argv, "time"),
      timezone = readStringOption(argv, "timezone");
    const inherit = readStringOption(argv, "inherit-schedule");
    if ((time === undefined) !== (timezone === undefined))
      throw new CliInputError("Supply --time and --timezone together.");
    if (
      inherit !== undefined &&
      (inherit !== "true" || time !== undefined || projectId === undefined)
    )
      throw new CliInputError(
        "--inherit-schedule true requires a project and cannot be combined with a schedule."
      );
    body = {
      ...(Object.keys(channels).length ? { channels } : {}),
      ...(inherit === "true"
        ? { daily: null }
        : time === undefined
          ? {}
          : { daily: { time, timezone } })
    };
  } else if (action === "pause" || action === "resume") {
    const selected = readStringOption(argv, "channels") ?? "all";
    const channels =
      selected === "all"
        ? audience === "personal"
          ? ["email"]
          : [...NOTIFICATION_CHANNELS]
        : selected.split(",");
    if (action === "resume") body = { channels };
    else {
      const duration = readStringOption(argv, "for"),
        until = readStringOption(argv, "until");
      if ((duration === undefined) === (until === undefined))
        throw new CliInputError("Choose --for 24h|7d|forever or --until <ISO8601>.");
      if (duration !== undefined && !["24h", "7d", "forever"].includes(duration))
        throw new CliInputError("Supported pause durations: 24h, 7d, forever.");
      const health = readStringOption(argv, "allow-health-checks") ?? "false";
      if (health !== "true" && health !== "false")
        throw new CliInputError("--allow-health-checks requires true or false.");
      body = {
        channels,
        until:
          until ??
          (duration === "forever"
            ? null
            : new Date(Date.now() + (duration === "7d" ? 7 : 1) * 86400000).toISOString()),
        allow_health_checks: health === "true"
      };
    }
  }
  return run({
    action: action === "set" ? "update" : (action as NotificationAction),
    audience,
    ...(body === undefined ? {} : { body }),
    ...(projectId === undefined ? {} : { projectId }),
    ...(authFilePath === undefined ? {} : { authFilePath }),
    json: readBooleanOption(argv, "json") ?? false
  });
}
