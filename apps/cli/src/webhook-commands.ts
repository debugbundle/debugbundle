import { WebhookApiError } from "../../../packages/webhook-client/src/index.js";
import type { WebhookDelivery, WebhookRecord, WebhookCreatedRecord } from "../../../packages/webhook-client/src/index.js";
import {
  createAuthenticatedWebhookApi,
  runAuthenticatedCliCommand
} from "./auth-context.js";
import type { CliCommandResult } from "./token-commands.js";

function mapErrorToExitCode(error: unknown): number {
  if (!(error instanceof WebhookApiError)) {
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

function formatWebhookTable(webhooks: WebhookRecord[]): string {
  if (webhooks.length === 0) {
    return "No webhooks found.";
  }

  return webhooks
    .map((webhook) => {
      const events = webhook.events.join(",");
      return `${webhook.webhook_id} | ${webhook.is_enabled ? "enabled" : "disabled"} | ${events} | ${webhook.url}`;
    })
    .join("\n");
}

function formatWebhookDeliveriesTable(deliveries: WebhookDelivery[]): string {
  if (deliveries.length === 0) {
    return "No deliveries found.";
  }

  return deliveries
    .map((delivery) => `${delivery.delivery_id} | ${delivery.status} | ${delivery.event_type} | attempts=${delivery.attempt_count}`)
    .join("\n");
}

export async function listWebhooksCommand(
  input: {
    bearerToken: string;
    projectId: string;
    limit?: number;
    json?: boolean;
  },
  api: {
    listWebhooks(input: { bearerToken: string; projectId: string; limit?: number }): Promise<WebhookRecord[]>;
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

    const webhooks = await api.listWebhooks(requestInput);
    return {
      exitCode: 0,
      output: input.json ? JSON.stringify({ webhooks }) : formatWebhookTable(webhooks)
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: error instanceof Error ? error.message : String(error) };
  }
}

export async function listWebhooksWithAuthCommand(
  input: { authFilePath?: string; projectId: string; limit?: number; json?: boolean },
  dependencies?: Parameters<typeof createAuthenticatedWebhookApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedWebhookApi,
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

      return listWebhooksCommand(commandInput, {
        listWebhooks: (requestInput) => api.listWebhooks(requestInput)
      });
    }
  });
}

export async function createWebhookCommand(
  input: {
    bearerToken: string;
    projectId: string;
    url: string;
    events: string[];
    filters?: Record<string, unknown>;
    isEnabled?: boolean;
    json?: boolean;
  },
  api: {
    createWebhook(input: {
      bearerToken: string;
      projectId: string;
      url: string;
      events: string[];
      filters?: Record<string, unknown>;
      isEnabled?: boolean;
    }): Promise<WebhookCreatedRecord>;
  }
): Promise<CliCommandResult> {
  try {
    const requestInput: {
      bearerToken: string;
      projectId: string;
      url: string;
      events: string[];
      filters?: Record<string, unknown>;
      isEnabled?: boolean;
    } = {
      bearerToken: input.bearerToken,
      projectId: input.projectId,
      url: input.url,
      events: input.events
    };

    if (input.filters !== undefined) {
      requestInput.filters = input.filters;
    }
    if (input.isEnabled !== undefined) {
      requestInput.isEnabled = input.isEnabled;
    }

    const webhook = await api.createWebhook(requestInput);
    if (input.json) {
      return { exitCode: 0, output: JSON.stringify({ webhook }) };
    }

    return {
      exitCode: 0,
      output: `Webhook created: ${webhook.webhook_id}\nSigning secret: ${webhook.signing_secret}`
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: error instanceof Error ? error.message : String(error) };
  }
}

export async function createWebhookWithAuthCommand(
  input: {
    authFilePath?: string;
    projectId: string;
    url: string;
    events: string[];
    filters?: Record<string, unknown>;
    isEnabled?: boolean;
    json?: boolean;
  },
  dependencies?: Parameters<typeof createAuthenticatedWebhookApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedWebhookApi,
    dependencies,
    runCommand: (authState, api) => {
      const commandInput: {
        bearerToken: string;
        projectId: string;
        url: string;
        events: string[];
        filters?: Record<string, unknown>;
        isEnabled?: boolean;
        json?: boolean;
      } = {
        bearerToken: authState.bearer_token,
        projectId: input.projectId,
        url: input.url,
        events: input.events
      };

      if (input.filters !== undefined) {
        commandInput.filters = input.filters;
      }
      if (input.isEnabled !== undefined) {
        commandInput.isEnabled = input.isEnabled;
      }
      if (input.json !== undefined) {
        commandInput.json = input.json;
      }

      return createWebhookCommand(commandInput, {
        createWebhook: (requestInput) => api.createWebhook(requestInput)
      });
    }
  });
}

export async function updateWebhookCommand(
  input: {
    bearerToken: string;
    webhookId: string;
    url?: string;
    events?: string[];
    filters?: Record<string, unknown>;
    isEnabled?: boolean;
    json?: boolean;
  },
  api: {
    updateWebhook(input: {
      bearerToken: string;
      webhookId: string;
      url?: string;
      events?: string[];
      filters?: Record<string, unknown>;
      isEnabled?: boolean;
    }): Promise<WebhookRecord>;
  }
): Promise<CliCommandResult> {
  try {
    const requestInput: {
      bearerToken: string;
      webhookId: string;
      url?: string;
      events?: string[];
      filters?: Record<string, unknown>;
      isEnabled?: boolean;
    } = {
      bearerToken: input.bearerToken,
      webhookId: input.webhookId
    };

    if (input.url !== undefined) {
      requestInput.url = input.url;
    }
    if (input.events !== undefined) {
      requestInput.events = input.events;
    }
    if (input.filters !== undefined) {
      requestInput.filters = input.filters;
    }
    if (input.isEnabled !== undefined) {
      requestInput.isEnabled = input.isEnabled;
    }

    const webhook = await api.updateWebhook(requestInput);
    return {
      exitCode: 0,
      output: input.json ? JSON.stringify({ webhook }) : `Webhook updated: ${webhook.webhook_id}`
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: error instanceof Error ? error.message : String(error) };
  }
}

export async function updateWebhookWithAuthCommand(
  input: {
    authFilePath?: string;
    webhookId: string;
    url?: string;
    events?: string[];
    filters?: Record<string, unknown>;
    isEnabled?: boolean;
    json?: boolean;
  },
  dependencies?: Parameters<typeof createAuthenticatedWebhookApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedWebhookApi,
    dependencies,
    runCommand: (authState, api) => {
      const commandInput: {
        bearerToken: string;
        webhookId: string;
        url?: string;
        events?: string[];
        filters?: Record<string, unknown>;
        isEnabled?: boolean;
        json?: boolean;
      } = {
        bearerToken: authState.bearer_token,
        webhookId: input.webhookId
      };

      if (input.url !== undefined) {
        commandInput.url = input.url;
      }
      if (input.events !== undefined) {
        commandInput.events = input.events;
      }
      if (input.filters !== undefined) {
        commandInput.filters = input.filters;
      }
      if (input.isEnabled !== undefined) {
        commandInput.isEnabled = input.isEnabled;
      }
      if (input.json !== undefined) {
        commandInput.json = input.json;
      }

      return updateWebhookCommand(commandInput, {
        updateWebhook: (requestInput) => api.updateWebhook(requestInput)
      });
    }
  });
}

export async function deleteWebhookCommand(
  input: {
    bearerToken: string;
    webhookId: string;
    json?: boolean;
  },
  api: {
    deleteWebhook(input: { bearerToken: string; webhookId: string }): Promise<{ webhook_id: string }>;
  }
): Promise<CliCommandResult> {
  try {
    const webhook = await api.deleteWebhook({
      bearerToken: input.bearerToken,
      webhookId: input.webhookId
    });
    return {
      exitCode: 0,
      output: input.json ? JSON.stringify({ webhook }) : `Webhook deleted: ${webhook.webhook_id}`
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: error instanceof Error ? error.message : String(error) };
  }
}

export async function deleteWebhookWithAuthCommand(
  input: { authFilePath?: string; webhookId: string; json?: boolean },
  dependencies?: Parameters<typeof createAuthenticatedWebhookApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedWebhookApi,
    dependencies,
    runCommand: (authState, api) => {
      const commandInput: { bearerToken: string; webhookId: string; json?: boolean } = {
        bearerToken: authState.bearer_token,
        webhookId: input.webhookId
      };

      if (input.json !== undefined) {
        commandInput.json = input.json;
      }

      return deleteWebhookCommand(commandInput, {
        deleteWebhook: (requestInput) => api.deleteWebhook(requestInput)
      });
    }
  });
}

export async function testWebhookCommand(
  input: {
    bearerToken: string;
    webhookId: string;
    eventType?: "verification.passed" | "verification.failed";
    json?: boolean;
  },
  api: {
    testWebhook(input: {
      bearerToken: string;
      webhookId: string;
      eventType?: "verification.passed" | "verification.failed";
    }): Promise<WebhookDelivery>;
  }
): Promise<CliCommandResult> {
  try {
    const requestInput: {
      bearerToken: string;
      webhookId: string;
      eventType?: "verification.passed" | "verification.failed";
    } = {
      bearerToken: input.bearerToken,
      webhookId: input.webhookId
    };

    if (input.eventType !== undefined) {
      requestInput.eventType = input.eventType;
    }

    const delivery = await api.testWebhook(requestInput);
    return {
      exitCode: 0,
      output: input.json
        ? JSON.stringify({ delivery })
        : `Webhook test queued: ${delivery.delivery_id} | ${delivery.event_type} | attempts=${delivery.attempt_count}`
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: error instanceof Error ? error.message : String(error) };
  }
}

export async function testWebhookWithAuthCommand(
  input: {
    authFilePath?: string;
    webhookId: string;
    eventType?: "verification.passed" | "verification.failed";
    json?: boolean;
  },
  dependencies?: Parameters<typeof createAuthenticatedWebhookApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedWebhookApi,
    dependencies,
    runCommand: (authState, api) => {
      const commandInput: {
        bearerToken: string;
        webhookId: string;
        eventType?: "verification.passed" | "verification.failed";
        json?: boolean;
      } = {
        bearerToken: authState.bearer_token,
        webhookId: input.webhookId
      };

      if (input.eventType !== undefined) {
        commandInput.eventType = input.eventType;
      }
      if (input.json !== undefined) {
        commandInput.json = input.json;
      }

      return testWebhookCommand(commandInput, {
        testWebhook: (requestInput) => api.testWebhook(requestInput)
      });
    }
  });
}

export async function listWebhookDeliveriesCommand(
  input: {
    bearerToken: string;
    webhookId: string;
    limit?: number;
    json?: boolean;
  },
  api: {
    listWebhookDeliveries(input: { bearerToken: string; webhookId: string; limit?: number }): Promise<WebhookDelivery[]>;
  }
): Promise<CliCommandResult> {
  try {
    const requestInput: { bearerToken: string; webhookId: string; limit?: number } = {
      bearerToken: input.bearerToken,
      webhookId: input.webhookId
    };

    if (input.limit !== undefined) {
      requestInput.limit = input.limit;
    }

    const deliveries = await api.listWebhookDeliveries(requestInput);
    return {
      exitCode: 0,
      output: input.json ? JSON.stringify({ deliveries }) : formatWebhookDeliveriesTable(deliveries)
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: error instanceof Error ? error.message : String(error) };
  }
}

export async function listWebhookDeliveriesWithAuthCommand(
  input: { authFilePath?: string; webhookId: string; limit?: number; json?: boolean },
  dependencies?: Parameters<typeof createAuthenticatedWebhookApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedWebhookApi,
    dependencies,
    runCommand: (authState, api) => {
      const commandInput: { bearerToken: string; webhookId: string; limit?: number; json?: boolean } = {
        bearerToken: authState.bearer_token,
        webhookId: input.webhookId
      };

      if (input.limit !== undefined) {
        commandInput.limit = input.limit;
      }
      if (input.json !== undefined) {
        commandInput.json = input.json;
      }

      return listWebhookDeliveriesCommand(commandInput, {
        listWebhookDeliveries: (requestInput) => api.listWebhookDeliveries(requestInput)
      });
    }
  });
}

export async function retryWebhookDeliveryCommand(
  input: {
    bearerToken: string;
    webhookId: string;
    deliveryId: string;
    json?: boolean;
  },
  api: {
    retryWebhookDelivery(input: { bearerToken: string; webhookId: string; deliveryId: string }): Promise<{ delivery_id: string; event_type: string }>;
  }
): Promise<CliCommandResult> {
  try {
    const result = await api.retryWebhookDelivery({
      bearerToken: input.bearerToken,
      webhookId: input.webhookId,
      deliveryId: input.deliveryId
    });
    return {
      exitCode: 0,
      output: input.json ? JSON.stringify(result) : `Delivery retried: ${result.delivery_id} | ${result.event_type}`
    };
  } catch (error) {
    return { exitCode: mapErrorToExitCode(error), output: error instanceof Error ? error.message : String(error) };
  }
}

export async function retryWebhookDeliveryWithAuthCommand(
  input: { authFilePath?: string; webhookId: string; deliveryId: string; json?: boolean },
  dependencies?: Parameters<typeof createAuthenticatedWebhookApi>[1]
): Promise<CliCommandResult> {
  return runAuthenticatedCliCommand(input, {
    createApi: createAuthenticatedWebhookApi,
    dependencies,
    runCommand: (authState, api) => {
      const commandInput: { bearerToken: string; webhookId: string; deliveryId: string; json?: boolean } = {
        bearerToken: authState.bearer_token,
        webhookId: input.webhookId,
        deliveryId: input.deliveryId
      };

      if (input.json !== undefined) {
        commandInput.json = input.json;
      }

      return retryWebhookDeliveryCommand(commandInput, {
        retryWebhookDelivery: (requestInput) => api.retryWebhookDelivery(requestInput)
      });
    }
  });
}