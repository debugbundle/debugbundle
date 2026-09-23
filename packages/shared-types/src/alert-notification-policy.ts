import { z } from "zod";

export const AlertEmailConfigSchema = z
  .object({
    to: z.string().email(),
    aggregation_window_seconds: z.number().int().min(1).max(300).optional()
  })
  .strict();
const cooldownScope = z.enum(["incident", "project"]).optional();
export const AlertSlackConfigSchema = z.union([
  z.object({ webhook_url: z.string().url().max(2000), cooldown_scope: cooldownScope }).strict(),
  z.object({ slack_destination_id: z.string().uuid(), cooldown_scope: cooldownScope }).strict()
]);
export const AlertDiscordConfigSchema = z
  .object({ webhook_url: z.string().url().max(2000), cooldown_scope: cooldownScope })
  .strict();
export const AlertWebhookConfigSchema = z
  .object({ target_url: z.string().url().max(2000), cooldown_scope: cooldownScope })
  .strict();

/** A digest retains distinct incidents. Immediate-channel project cooldowns are opt-in,
 * scoped to the selected rule, environment and severity so an escalation still alerts. */
export function resolveAlertNoisePolicy(input: {
  channel: string;
  config: Record<string, unknown>;
  projectId: string;
  incidentId: string;
  environment: string;
  severity: string;
  notificationKey: string;
  cooldownSeconds: number;
  coalescingWindowSeconds?: number;
  coalescingKey?: string;
}): { notification_key: string; cooldown_seconds: number; aggregation_window_seconds: number } {
  const email = input.channel === "email";
  const configuredWindow = AlertEmailConfigSchema.safeParse(input.config);
  return {
    notification_key: email
      ? input.coalescingWindowSeconds === undefined
        ? input.notificationKey
        : input.incidentId
      : input.config["cooldown_scope"] === "project"
        ? JSON.stringify(["project_alert", input.projectId, input.environment, input.severity])
        : input.notificationKey,
    // Legacy queued jobs used one key for both checks; retain their bounded behavior.
    cooldown_seconds:
      email || input.coalescingKey !== undefined
        ? input.cooldownSeconds
        : Math.max(input.cooldownSeconds, input.coalescingWindowSeconds ?? 0),
    aggregation_window_seconds: configuredWindow.success
      ? (configuredWindow.data.aggregation_window_seconds ?? 10)
      : 10
  };
}

/** Destination-only edits retain API-configured noise options on the same channel. */
export function preserveAlertNoiseSettings(
  channel: string,
  previous: Record<string, unknown> | undefined,
  next: Record<string, unknown>
): Record<string, unknown> {
  if (previous === undefined) return next;
  if (channel === "email") {
    const parsed = AlertEmailConfigSchema.safeParse(previous);
    return parsed.success && parsed.data.aggregation_window_seconds !== undefined
      ? { aggregation_window_seconds: parsed.data.aggregation_window_seconds, ...next }
      : next;
  }
  const scope = cooldownScope.safeParse(previous["cooldown_scope"]);
  return scope.success && scope.data !== undefined ? { cooldown_scope: scope.data, ...next } : next;
}
