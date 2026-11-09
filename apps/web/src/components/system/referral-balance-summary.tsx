import type { ReferralBalance } from "../../../../../packages/referrals/src/referral-ledger-contracts.js";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card.js";
import { formatReferralAmount } from "../../lib/referral-api.js";

export function ReferralBalanceSummary({ balance }: { balance: ReferralBalance }): JSX.Element {
  const values = [
    ["Available", balance.available_minor],
    ["Pending", balance.pending_minor],
    ["Claimed", balance.claimed_minor],
    ["Paid", balance.paid_minor]
  ] as const;
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {values.map(([label, value]) => (
        <Card key={label}>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">{label}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold tabular-nums">{formatReferralAmount(value)}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
