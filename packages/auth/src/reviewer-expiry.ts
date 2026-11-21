const DAY_MS = 86_400_000;
export type ReviewerExpiryMilestone = "fourteen_days" | "seven_days" | "one_day" | "expired";

/** On startup report the current milestone. Later polls only advance the reminder. */
export function createReviewerExpirySchedule(expiresAt: string) {
  const deadline = Date.parse(expiresAt);
  const milestones: { at: number; milestone: ReviewerExpiryMilestone }[] = [
    { at: deadline - 14 * DAY_MS, milestone: "fourteen_days" },
    { at: deadline - 7 * DAY_MS, milestone: "seven_days" },
    { at: deadline - DAY_MS, milestone: "one_day" },
    { at: deadline, milestone: "expired" }
  ];
  let lastReportedAt = Number.NEGATIVE_INFINITY;
  return (now: number) => {
    const current = milestones.filter(({ at }) => at <= now).at(-1);
    const nextAt = milestones.find(({ at }) => at > now)?.at;
    if (!current || current.at <= lastReportedAt) return { nextAt, reminder: null };
    lastReportedAt = current.at;
    return {
      nextAt,
      reminder: {
        milestone: current.milestone,
        remainingDays: Math.floor((deadline - now) / DAY_MS),
        expiresAt: new Date(deadline).toISOString(),
        expired: current.milestone === "expired"
      }
    };
  };
}
