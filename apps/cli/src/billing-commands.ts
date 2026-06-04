import { BillingApiError } from "../../../packages/billing-client/src/index.js";

import { createAuthenticatedBillingApi, runAuthenticatedCliCommand } from "./auth-context.js";
import type { CliCommandResult } from "./token-commands.js";

interface BillingSummaryLike {
  plan: "free" | "solo" | "team";
  billing_state: "active" | "past_due" | "canceled" | "unpaid" | "incomplete" | "admin_override" | "trialing" | "trial_expired" | null;
  active_projects: number;
  capacity_units: {
    total: number;
    included: number;
    additional_purchased: number;
    pending_reduction: {
      additional_purchased: number;
      total: number;
      effective_at: string;
    } | null;
  };
  usage_window: {
    starts_at: string;
    ends_at: string;
  };
  allowances: {
    monthly_bundle_requests: { used: number; limit: number };
    monthly_raw_ingested_events: { used: number; limit: number };
    retained_bundle_cap: { used: number; limit: number };
    monthly_remote_activations: { used: number; limit: number };
    monthly_alert_deliveries: { used: number; limit: number };
    monthly_webhook_deliveries: { used: number; limit: number };
  };
  trial: {
    available: boolean;
    active: boolean;
    plan: "solo" | "team" | null;
    started_at: string | null;
    ends_at: string | null;
    used_at: string | null;
    converted_at: string | null;
    expired_at: string | null;
    days_remaining: number | null;
  };
}

function mapErrorToExitCode(error: unknown): number {
  if (!(error instanceof BillingApiError)) {
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
  if (error.status === 403 || error.status === 409) {
    return 5;
  }

  return 1;
}

function formatMetric(label: string, metric: { used: number; limit: number }): string {
  return `${label}: ${metric.used}/${metric.limit}`;
}

function formatTrialState(billing: BillingSummaryLike): string[] {
  const { trial } = billing;

  if (trial.active) {
    return [
      `Trial: active ${trial.plan ?? "unknown"} trial`,
      ...(trial.started_at === null ? [] : [`Trial started: ${trial.started_at}`]),
      ...(trial.ends_at === null ? [] : [`Trial ends: ${trial.ends_at}`]),
      ...(trial.days_remaining === null
        ? []
        : [`Trial remaining: ${trial.days_remaining} day${trial.days_remaining === 1 ? "" : "s"}`])
    ];
  }

  if (trial.converted_at !== null) {
    return [
      `Trial: converted${trial.plan === null ? "" : ` from ${trial.plan}`}`,
      `Trial converted: ${trial.converted_at}`
    ];
  }

  if (trial.expired_at !== null) {
    return [
      `Trial: expired${trial.plan === null ? "" : ` ${trial.plan}`}`,
      `Trial expired: ${trial.expired_at}`
    ];
  }

  if (trial.used_at !== null) {
    return [
      `Trial: used${trial.plan === null ? "" : ` ${trial.plan}`}`,
      `Trial used: ${trial.used_at}`
    ];
  }

  return [`Trial: ${trial.available ? "eligible" : "unavailable"}`];
}

function formatBillingError(error: unknown): string {
  if (error instanceof BillingApiError && error.code === "trial_conversion_required") {
    return `${error.message}\nConvert the trial to a paid plan from the billing page before changing capacity.`;
  }

  return error instanceof Error ? error.message : String(error);
}

function formatBillingSummary(billing: BillingSummaryLike): string {
  const lines = [
    `Plan: ${billing.plan}`,
    `Billing state: ${billing.billing_state ?? "none"}`,
    `Projects: ${billing.active_projects} active`,
    `Allowance capacity: ${billing.capacity_units.total} total units (${billing.capacity_units.included} included, ${billing.capacity_units.additional_purchased} purchased)`,
    `Usage window: ${billing.usage_window.starts_at} -> ${billing.usage_window.ends_at}`,
    ...formatTrialState(billing),
    formatMetric("Bundle requests", billing.allowances.monthly_bundle_requests),
    formatMetric("Raw ingested events", billing.allowances.monthly_raw_ingested_events),
    formatMetric("Retained bundles", billing.allowances.retained_bundle_cap),
    formatMetric("Remote activations", billing.allowances.monthly_remote_activations),
    formatMetric("Alert deliveries", billing.allowances.monthly_alert_deliveries),
    formatMetric("Webhook deliveries", billing.allowances.monthly_webhook_deliveries)
  ];

  if (billing.capacity_units.pending_reduction !== null) {
    lines.push(
      `Pending reduction: ${billing.capacity_units.pending_reduction.total} total units at ${billing.capacity_units.pending_reduction.effective_at} (${billing.capacity_units.pending_reduction.additional_purchased} purchased)`
    );
  }

  return lines.join("\n");
}

export async function getBillingSummaryCommand(
  input: {
    bearerToken: string;
    json?: boolean;
  },
  api: {
    getBillingSummary(input: { bearerToken: string }): Promise<BillingSummaryLike>;
  }
): Promise<CliCommandResult> {
  try {
    const billing = await api.getBillingSummary({ bearerToken: input.bearerToken });
    return {
      exitCode: 0,
      output: input.json ? JSON.stringify({ billing }) : formatBillingSummary(billing)
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: formatBillingError(error) };
  }
}

export async function startBillingTrialCommand(
  input: {
    bearerToken: string;
    targetPlan: "solo" | "team";
    json?: boolean;
  },
  api: {
    startTrial(input: { bearerToken: string; targetPlan: "solo" | "team" }): Promise<BillingSummaryLike>;
  }
): Promise<CliCommandResult> {
  try {
    const billing = await api.startTrial({
      bearerToken: input.bearerToken,
      targetPlan: input.targetPlan
    });

    return {
      exitCode: 0,
      output: input.json ? JSON.stringify({ billing }) : `Trial started.\n${formatBillingSummary(billing)}`
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: formatBillingError(error) };
  }
}

export async function increaseBillingCapacityCommand(
  input: {
    bearerToken: string;
    targetAdditionalCapacityUnits: number;
    json?: boolean;
  },
  api: {
    increaseCapacity(input: { bearerToken: string; targetAdditionalCapacityUnits: number }): Promise<BillingSummaryLike>;
  }
): Promise<CliCommandResult> {
  try {
    const billing = await api.increaseCapacity({
      bearerToken: input.bearerToken,
      targetAdditionalCapacityUnits: input.targetAdditionalCapacityUnits
    });

    return {
      exitCode: 0,
      output: input.json ? JSON.stringify({ billing }) : `Allowance capacity increased.\n${formatBillingSummary(billing)}`
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: formatBillingError(error) };
  }
}

export async function scheduleBillingCapacityReductionCommand(
  input: {
    bearerToken: string;
    targetAdditionalCapacityUnits: number;
    json?: boolean;
  },
  api: {
    scheduleCapacityReduction(input: { bearerToken: string; targetAdditionalCapacityUnits: number }): Promise<BillingSummaryLike>;
  }
): Promise<CliCommandResult> {
  try {
    const billing = await api.scheduleCapacityReduction({
      bearerToken: input.bearerToken,
      targetAdditionalCapacityUnits: input.targetAdditionalCapacityUnits
    });

    return {
      exitCode: 0,
      output: input.json ? JSON.stringify({ billing }) : `Capacity reduction scheduled.\n${formatBillingSummary(billing)}`
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: formatBillingError(error) };
  }
}

export async function cancelBillingCapacityReductionCommand(
  input: {
    bearerToken: string;
    json?: boolean;
  },
  api: {
    cancelCapacityReduction(input: { bearerToken: string }): Promise<BillingSummaryLike>;
  }
): Promise<CliCommandResult> {
  try {
    const billing = await api.cancelCapacityReduction({ bearerToken: input.bearerToken });
    return {
      exitCode: 0,
      output: input.json ? JSON.stringify({ billing }) : `Capacity reduction cancelled.\n${formatBillingSummary(billing)}`
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: formatBillingError(error) };
  }
}

export async function getBillingSummaryWithAuthCommand(
  input: { authFilePath?: string; json?: boolean },
  dependencies?: Parameters<typeof createAuthenticatedBillingApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedBillingApi,
    dependencies,
    runCommand: (authState, api) => getBillingSummaryCommand({ bearerToken: authState.bearer_token, ...(input.json === undefined ? {} : { json: input.json }) }, {
      getBillingSummary: (requestInput) => api.getBillingSummary(requestInput)
    })
  });
}

export async function increaseBillingCapacityWithAuthCommand(
  input: { authFilePath?: string; targetAdditionalCapacityUnits: number; json?: boolean },
  dependencies?: Parameters<typeof createAuthenticatedBillingApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedBillingApi,
    dependencies,
    runCommand: (authState, api) =>
      increaseBillingCapacityCommand(
        {
          bearerToken: authState.bearer_token,
          targetAdditionalCapacityUnits: input.targetAdditionalCapacityUnits,
          ...(input.json === undefined ? {} : { json: input.json })
        },
        {
          increaseCapacity: (requestInput) => api.increaseCapacity(requestInput)
        }
      )
  });
}

export async function startBillingTrialWithAuthCommand(
  input: { authFilePath?: string; targetPlan: "solo" | "team"; json?: boolean },
  dependencies?: Parameters<typeof createAuthenticatedBillingApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedBillingApi,
    dependencies,
    runCommand: (authState, api) =>
      startBillingTrialCommand(
        {
          bearerToken: authState.bearer_token,
          targetPlan: input.targetPlan,
          ...(input.json === undefined ? {} : { json: input.json })
        },
        {
          startTrial: (requestInput) => api.startTrial(requestInput)
        }
      )
  });
}

export async function scheduleBillingCapacityReductionWithAuthCommand(
  input: { authFilePath?: string; targetAdditionalCapacityUnits: number; json?: boolean },
  dependencies?: Parameters<typeof createAuthenticatedBillingApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedBillingApi,
    dependencies,
    runCommand: (authState, api) =>
      scheduleBillingCapacityReductionCommand(
        {
          bearerToken: authState.bearer_token,
          targetAdditionalCapacityUnits: input.targetAdditionalCapacityUnits,
          ...(input.json === undefined ? {} : { json: input.json })
        },
        {
          scheduleCapacityReduction: (requestInput) => api.scheduleCapacityReduction(requestInput)
        }
      )
  });
}

export async function cancelBillingCapacityReductionWithAuthCommand(
  input: { authFilePath?: string; json?: boolean },
  dependencies?: Parameters<typeof createAuthenticatedBillingApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedBillingApi,
    dependencies,
    runCommand: (authState, api) =>
      cancelBillingCapacityReductionCommand(
        {
          bearerToken: authState.bearer_token,
          ...(input.json === undefined ? {} : { json: input.json })
        },
        {
          cancelCapacityReduction: (requestInput) => api.cancelCapacityReduction(requestInput)
        }
      )
  });
}
