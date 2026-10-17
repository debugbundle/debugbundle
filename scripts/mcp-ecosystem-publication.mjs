// Check both OpenClaw distributions before any publisher can mutate a registry.
// Persist individual receipts so a later failure cannot erase an accepted upload.
export async function publishTargets(context, options, { preflight, publishTarget, recordResult }) {
  if (
    !options.dryRun &&
    context.targetEntries.some(([key]) => key === "clawhub" || key === "clawhubPlugin")
  ) {
    await preflight();
  }
  for (const [key, target] of context.targetEntries) {
    if (target.type !== "push") continue;
    const result = await publishTarget(key, target, options.dryRun);
    recordResult(key, result);
  }
}
