export interface AvailabilityUptimeInput {
  day?: string;
  total_checks: number;
  successful_checks: number;
}

export function computeAvailabilityUptimePercentage(
  days: AvailabilityUptimeInput[]
): number | null {
  const totalChecks = days.reduce((total, day) => total + day.total_checks, 0);
  if (totalChecks === 0) {
    return null;
  }

  const successfulChecks = days.reduce((total, day) => total + day.successful_checks, 0);
  return Math.max(0, Math.min(100, (successfulChecks / totalChecks) * 100));
}

export function computeLatestAvailabilityUptimePercentage(
  days: AvailabilityUptimeInput[]
): number | null {
  const latestDay = days.reduce<string | null>((latest, day) => {
    if (day.total_checks === 0 || day.day === undefined) {
      return latest;
    }

    return latest === null || day.day > latest ? day.day : latest;
  }, null);

  if (latestDay === null) {
    return computeAvailabilityUptimePercentage(days);
  }

  return computeAvailabilityUptimePercentage(days.filter((day) => day.day === latestDay));
}

export function formatAvailabilityUptime(value: number | null): string {
  if (value === null) {
    return "No data";
  }

  if (value === 100) {
    return "100%";
  }

  return `${value.toFixed(2)}%`;
}
