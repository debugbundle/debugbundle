import { Link } from "react-router-dom";

import { Button } from "../ui/button.js";
import { CalloutCard } from "./callout-card.js";

interface PlanUpgradeCalloutProps {
  title: string;
  description: string;
  eyebrow?: string;
}

export function PlanUpgradeCallout({
  title,
  description,
  eyebrow = "Paid plan"
}: PlanUpgradeCalloutProps): JSX.Element {
  return (
    <CalloutCard eyebrow={eyebrow} title={title} description={description} tone="neutral">
      <div className="flex flex-wrap gap-2">
        <Button asChild type="button" variant="outline" size="sm">
          <Link to="/billing">Open billing</Link>
        </Button>
      </div>
    </CalloutCard>
  );
}