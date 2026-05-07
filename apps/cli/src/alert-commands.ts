import { AlertApiError } from "../../../packages/alert-client/src/index.js";
import type { AlertChannel, AlertConditionType, AlertRecord } from "../../../packages/alert-client/src/index.js";
import { createAuthenticatedAlertApi, runAuthenticatedCliCommand } from "./auth-context.js";
import type { CliCommandResult } from "./token-commands.js";

function mapErrorToExitCode(error: unknown): number {
  if (!(error instanceof AlertApiError)) {
    return 1;
  }

  if (error.status === 401) {
    return 2;
  }
  if (error.status === 404) {
    return 3;
  }
  if (error.status === 400) {
    return 4;
  }

  return 1;
}

function formatAlertTable(alerts: AlertRecord[]): string {
  if (alerts.length === 0) {
    return "No alerts found.";
  }

  return alerts
    .map(
      (alert) =>
        `${alert.alert_id} | ${alert.is_enabled ? "enabled" : "disabled"} | ${alert.condition_type} | ${alert.channel} | project=${alert.project_id}`
    )
    .join("\n");
}

export async function listAlertsCommand(
  input: {
    bearerToken: string;
    projectId: string;
    limit?: number;
    json?: boolean;
  },
  api: {
    listAlerts(input: { bearerToken: string; projectId: string; limit?: number }): Promise<AlertRecord[]>;
  }
): Promise<CliCommandResult> {
  try {
    const requestInput: { bearerToken: string; projectId: string; limit?: number } = {
      bearerToken: input.bearerToken,
      projectId: input.projectId
    };
    if (input.limit !== undefined) {
      requestInput.limit = input.limit;
    }

    const alerts = await api.listAlerts(requestInput);
    return {
      exitCode: 0,
      output: input.json ? JSON.stringify({ alerts }) : formatAlertTable(alerts)
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: error instanceof Error ? error.message : String(error) };
  }
}

export async function listAlertsWithAuthCommand(
  input: { authFilePath?: string; projectId: string; limit?: number; json?: boolean },
  dependencies?: Parameters<typeof createAuthenticatedAlertApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedAlertApi,
    dependencies,
    runCommand: (authState, api) => {
      const commandInput: { bearerToken: string; projectId: string; limit?: number; json?: boolean } = {
        bearerToken: authState.bearer_token,
        projectId: input.projectId
      };
      if (input.limit !== undefined) {
        commandInput.limit = input.limit;
      }
      if (input.json !== undefined) {
        commandInput.json = input.json;
      }

      return listAlertsCommand(commandInput, {
        listAlerts: (requestInput) => api.listAlerts(requestInput)
      });
    }
  });
}

export async function createAlertCommand(
  input: {
    bearerToken: string;
    projectId: string;
    serviceId?: string;
    channel: AlertChannel;
    conditionType: AlertConditionType;
    severityMin?: "low" | "medium" | "high" | "critical";
    config?: Record<string, unknown>;
    isEnabled?: boolean;
    json?: boolean;
  },
  api: {
    createAlert(input: {
      bearerToken: string;
      projectId: string;
      serviceId?: string;
      channel: AlertChannel;
      conditionType: AlertConditionType;
      severityMin?: "low" | "medium" | "high" | "critical";
      config?: Record<string, unknown>;
      isEnabled?: boolean;
    }): Promise<AlertRecord>;
  }
): Promise<CliCommandResult> {
  try {
    const requestInput: {
      bearerToken: string;
      projectId: string;
      serviceId?: string;
      channel: AlertChannel;
      conditionType: AlertConditionType;
      severityMin?: "low" | "medium" | "high" | "critical";
      config?: Record<string, unknown>;
      isEnabled?: boolean;
    } = {
      bearerToken: input.bearerToken,
      projectId: input.projectId,
      channel: input.channel,
      conditionType: input.conditionType
    };
    if (input.serviceId !== undefined) {
      requestInput.serviceId = input.serviceId;
    }
    if (input.severityMin !== undefined) {
      requestInput.severityMin = input.severityMin;
    }
    if (input.config !== undefined) {
      requestInput.config = input.config;
    }
    if (input.isEnabled !== undefined) {
      requestInput.isEnabled = input.isEnabled;
    }

    const alert = await api.createAlert(requestInput);
    return {
      exitCode: 0,
      output: input.json ? JSON.stringify({ alert }) : `Alert created: ${alert.alert_id}`
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: error instanceof Error ? error.message : String(error) };
  }
}

export async function createAlertWithAuthCommand(
  input: {
    authFilePath?: string;
    projectId: string;
    serviceId?: string;
    channel: AlertChannel;
    conditionType: AlertConditionType;
    severityMin?: "low" | "medium" | "high" | "critical";
    config?: Record<string, unknown>;
    isEnabled?: boolean;
    json?: boolean;
  },
  dependencies?: Parameters<typeof createAuthenticatedAlertApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedAlertApi,
    dependencies,
    runCommand: (authState, api) => {
      const commandInput: {
        bearerToken: string;
        projectId: string;
        serviceId?: string;
        channel: AlertChannel;
        conditionType: AlertConditionType;
        severityMin?: "low" | "medium" | "high" | "critical";
        config?: Record<string, unknown>;
        isEnabled?: boolean;
        json?: boolean;
      } = {
        bearerToken: authState.bearer_token,
        projectId: input.projectId,
        channel: input.channel,
        conditionType: input.conditionType
      };
      if (input.serviceId !== undefined) {
        commandInput.serviceId = input.serviceId;
      }
      if (input.severityMin !== undefined) {
        commandInput.severityMin = input.severityMin;
      }
      if (input.config !== undefined) {
        commandInput.config = input.config;
      }
      if (input.isEnabled !== undefined) {
        commandInput.isEnabled = input.isEnabled;
      }
      if (input.json !== undefined) {
        commandInput.json = input.json;
      }

      return createAlertCommand(commandInput, {
        createAlert: (requestInput) => api.createAlert(requestInput)
      });
    }
  });
}

export async function updateAlertCommand(
  input: {
    bearerToken: string;
    alertId: string;
    serviceId?: string | null;
    channel?: AlertChannel;
    conditionType?: AlertConditionType;
    severityMin?: "low" | "medium" | "high" | "critical" | null;
    config?: Record<string, unknown> | null;
    isEnabled?: boolean;
    json?: boolean;
  },
  api: {
    updateAlert(input: {
      bearerToken: string;
      alertId: string;
      serviceId?: string | null;
      channel?: AlertChannel;
      conditionType?: AlertConditionType;
      severityMin?: "low" | "medium" | "high" | "critical" | null;
      config?: Record<string, unknown> | null;
      isEnabled?: boolean;
    }): Promise<AlertRecord>;
  }
): Promise<CliCommandResult> {
  try {
    const requestInput: {
      bearerToken: string;
      alertId: string;
      serviceId?: string | null;
      channel?: AlertChannel;
      conditionType?: AlertConditionType;
      severityMin?: "low" | "medium" | "high" | "critical" | null;
      config?: Record<string, unknown> | null;
      isEnabled?: boolean;
    } = {
      bearerToken: input.bearerToken,
      alertId: input.alertId
    };
    if (input.serviceId !== undefined) {
      requestInput.serviceId = input.serviceId;
    }
    if (input.channel !== undefined) {
      requestInput.channel = input.channel;
    }
    if (input.conditionType !== undefined) {
      requestInput.conditionType = input.conditionType;
    }
    if (input.severityMin !== undefined) {
      requestInput.severityMin = input.severityMin;
    }
    if (input.config !== undefined) {
      requestInput.config = input.config;
    }
    if (input.isEnabled !== undefined) {
      requestInput.isEnabled = input.isEnabled;
    }

    const alert = await api.updateAlert(requestInput);
    return {
      exitCode: 0,
      output: input.json ? JSON.stringify({ alert }) : `Alert updated: ${alert.alert_id}`
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: error instanceof Error ? error.message : String(error) };
  }
}

export async function updateAlertWithAuthCommand(
  input: {
    authFilePath?: string;
    alertId: string;
    serviceId?: string | null;
    channel?: AlertChannel;
    conditionType?: AlertConditionType;
    severityMin?: "low" | "medium" | "high" | "critical" | null;
    config?: Record<string, unknown> | null;
    isEnabled?: boolean;
    json?: boolean;
  },
  dependencies?: Parameters<typeof createAuthenticatedAlertApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedAlertApi,
    dependencies,
    runCommand: (authState, api) => {
      const commandInput: {
        bearerToken: string;
        alertId: string;
        serviceId?: string | null;
        channel?: AlertChannel;
        conditionType?: AlertConditionType;
        severityMin?: "low" | "medium" | "high" | "critical" | null;
        config?: Record<string, unknown> | null;
        isEnabled?: boolean;
        json?: boolean;
      } = {
        bearerToken: authState.bearer_token,
        alertId: input.alertId
      };
      if (input.serviceId !== undefined) {
        commandInput.serviceId = input.serviceId;
      }
      if (input.channel !== undefined) {
        commandInput.channel = input.channel;
      }
      if (input.conditionType !== undefined) {
        commandInput.conditionType = input.conditionType;
      }
      if (input.severityMin !== undefined) {
        commandInput.severityMin = input.severityMin;
      }
      if (input.config !== undefined) {
        commandInput.config = input.config;
      }
      if (input.isEnabled !== undefined) {
        commandInput.isEnabled = input.isEnabled;
      }
      if (input.json !== undefined) {
        commandInput.json = input.json;
      }

      return updateAlertCommand(commandInput, {
        updateAlert: (requestInput) => api.updateAlert(requestInput)
      });
    }
  });
}

export async function deleteAlertCommand(
  input: {
    bearerToken: string;
    alertId: string;
    json?: boolean;
  },
  api: {
    deleteAlert(input: { bearerToken: string; alertId: string }): Promise<{ alert_id: string }>;
  }
): Promise<CliCommandResult> {
  try {
    const alert = await api.deleteAlert({
      bearerToken: input.bearerToken,
      alertId: input.alertId
    });
    return {
      exitCode: 0,
      output: input.json ? JSON.stringify({ alert }) : `Alert deleted: ${alert.alert_id}`
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: error instanceof Error ? error.message : String(error) };
  }
}

export async function deleteAlertWithAuthCommand(
  input: { authFilePath?: string; alertId: string; json?: boolean },
  dependencies?: Parameters<typeof createAuthenticatedAlertApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedAlertApi,
    dependencies,
    runCommand: (authState, api) => {
      const commandInput: { bearerToken: string; alertId: string; json?: boolean } = {
        bearerToken: authState.bearer_token,
        alertId: input.alertId
      };
      if (input.json !== undefined) {
        commandInput.json = input.json;
      }

      return deleteAlertCommand(commandInput, {
        deleteAlert: (requestInput) => api.deleteAlert(requestInput)
      });
    }
  });
}