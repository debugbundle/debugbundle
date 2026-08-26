export function createGitHubInstallationTokenFixture(
  format: "stateful" | "stateless"
): string {
  if (format === "stateful") {
    return `ghs_${"a".repeat(36)}`;
  }

  return `ghs_${"a".repeat(170)}.${"b".repeat(170)}.${"c".repeat(174)}`;
}
