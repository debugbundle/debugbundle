import type { ReactNode } from "react";
import type { z } from "zod";
import { ArrowRightIcon, CheckIcon, UsersIcon } from "lucide-react";
import {
  programmeEarningsExamples,
  type OfferDefinitionSchema
} from "../../../../../packages/referrals/src/programme-policy.js";
import { getBillingCatalogPrice } from "../../../../../packages/shared-types/src/index.js";
import { formatBillingAmount } from "./billing-offer-summary.js";
import { OfferPolicyDetails } from "./offer-policy-details.js";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter
} from "../ui/card.js";
import { Button } from "../ui/button.js";
import { Separator } from "../ui/separator.js";
import { resolveReferralTermsUrl } from "../../lib/external-links.js";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "../ui/dialog.js";

/** The same programme summary serves discovery and the creator's frozen agreement.
 * Enrolment/consent stays with the caller; inspecting terms never joins a programme. */
export function ReferralProgrammeCard({
  programme,
  children
}: {
  programme: z.infer<typeof OfferDefinitionSchema>;
  children?: ReactNode;
}): JSX.Element {
  const { policy, name, public_description, version_id } = programme;
  const examples = programmeEarningsExamples(
    policy,
    (plan, interval) => getBillingCatalogPrice(plan, interval, "plan").amount_minor
  );
  const maximum = examples.every(({ commissionMinor }) => commissionMinor !== null)
    ? Math.max(...examples.map(({ commissionMinor }) => commissionMinor!))
    : null;
  const titleId = `referral-programme-${version_id}`;
  return (
    <Card role="article" aria-labelledby={titleId} className="h-full">
      <CardHeader className="gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-primary">
            <UsersIcon aria-hidden="true" className="size-5" />
          </span>
          <CardTitle id={titleId} className="min-w-0 break-words">
            {name}
          </CardTitle>
        </div>
        <CardDescription>{public_description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-2 rounded-xl bg-muted p-4">
          <p className="text-sm font-medium">{maximum === null ? "Earn" : "Earn up to"}</p>
          <p className="flex flex-wrap items-baseline gap-2 text-primary">
            <strong className="text-4xl font-semibold tracking-tight tabular-nums">
              {maximum === null
                ? `${policy.commission_basis_points / 100}%`
                : formatBillingAmount(maximum)}
            </strong>
            {maximum !== null ? <span className="text-xs font-semibold">USD</span> : null}
          </p>
          <p className="text-sm text-muted-foreground">
            {maximum === null ? "of eligible collected payments" : "per first qualifying invoice"}
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex flex-col gap-1">
            <dt className="text-muted-foreground">Your commission</dt>
            <dd className="text-lg font-semibold">{policy.commission_basis_points / 100}%</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-muted-foreground">Customer discount</dt>
            <dd className="text-lg font-semibold">{policy.discount_basis_points / 100}%</dd>
          </div>
        </dl>
        <div className="flex flex-col gap-3 text-sm">
          <ul aria-label="Eligible plans" className="flex flex-col gap-2">
            {policy.eligible_plans.map((plan) => (
              <li key={plan} className="flex items-center gap-2">
                <CheckIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                {plan[0]!.toUpperCase() + plan.slice(1)}
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground">
            {policy.eligible_intervals
              .map((interval) => (interval === "year" ? "Yearly" : "Monthly"))
              .join(" and ")}{" "}
            billing. Customer discount applies to the first invoice.
          </p>
          <p className="text-muted-foreground">
            Earn on eligible payments for up to {policy.commission_months}{" "}
            {policy.commission_months === 1 ? "month" : "months"} of paid service.
          </p>
        </div>
      </CardContent>
      <CardFooter className="mt-auto flex flex-col items-stretch gap-4 bg-transparent">
        <Dialog>
          <DialogTrigger asChild>
            <Button
              variant="link"
              className="h-auto justify-between p-0"
              aria-label={`View programme terms for ${name}`}
            >
              View programme terms <ArrowRightIcon aria-hidden="true" data-icon="inline-end" />
            </Button>
          </DialogTrigger>
          <DialogContent size="xl" className="flex flex-col" surface="raised">
            <DialogHeader className="pr-8">
              <DialogTitle>{name}</DialogTitle>
              <DialogDescription>
                Programme terms {policy.terms_version}. Review the conditions, customer discount and
                earnings examples.
              </DialogDescription>
            </DialogHeader>
            <Separator />
            <div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
              <OfferPolicyDetails policy={policy} />
              <Button variant="link" asChild className="self-start p-0">
                <a href={resolveReferralTermsUrl()} target="_blank" rel="noreferrer">
                  General referral terms
                </a>
              </Button>
            </div>
            <DialogFooter showCloseButton />
          </DialogContent>
        </Dialog>
        {children}
      </CardFooter>
    </Card>
  );
}
