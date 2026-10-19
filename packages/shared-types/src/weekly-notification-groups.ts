/** Never combine reports with different effective destinations after recipient filtering. */
export function groupWeeklyNotificationDeliveries<
  T extends { channel: { channel: string; config: Record<string, unknown> } }
>(deliveries: T[]): T[][] {
  const groups = new Map<string, T[]>();
  for (const delivery of deliveries) {
    const { channel, config } = delivery.channel;
    const to = config["to"];
    const destination =
      channel === "email"
        ? {
            ...config,
            to: (Array.isArray(to) ? to : [to])
              .map(String)
              .map((value) => value.trim().toLowerCase())
              .sort()
          }
        : config;
    const key = JSON.stringify([channel, destination]);
    const group = groups.get(key) ?? [];
    group.push(delivery);
    groups.set(key, group);
  }
  return [...groups.values()];
}
