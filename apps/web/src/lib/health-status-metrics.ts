export interface AvailabilityUptimeInput {
  total_checks: number;
  failed_checks: number;
}

export function computeAvailabilityUptimePercentage(days: AvailabilityUptimeInput[]): number | null {
  const totalChecks = days.reduce((total, day) => total + day.total_checks, 0);
  if (totalChecks === 0) {
    return null;
  }

  const failedChecks = days.reduce((total, day) => total + day.failed_checks, 0);
  return Math.max(0, Math.min(100, ((totalChecks - failedChecks) / totalChecks) * 100));
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
