import { PlanUpgradeCallout } from "./plan-upgrade-callout.js";

interface HostedImprovementsUpgradeCalloutProps {
  scope: "workspace" | "project";
}

export function HostedImprovementsUpgradeCallout({
  scope
}: HostedImprovementsUpgradeCalloutProps): JSX.Element {
  const description =
    scope === "project"
      ? "Hosted automated improvement bundles are available on paid plans. Upgrade before reviewing deterministic hardening signals or generated improvement bundles from this project."
      : "Hosted automated improvement bundles are available on paid plans. Upgrade before reviewing workspace-wide deterministic hardening signals or generated improvement bundles.";

  return (
    <PlanUpgradeCallout
      title="Upgrade to Solo or Team to unlock hosted improvements"
      description={description}
    />
  );
}
