import type { BillingSummaryRecord } from "../../../packages/storage/src/index.js";

import type { ApiDependencies } from "./api-types.js";

export interface BillingAdminDefaultPlanResult {
  billing: BillingSummaryRecord | null;
  default_applied: boolean;
}

export function isBillingAdminOperator(
  dependencies: Pick<ApiDependencies, "billingAdmin">,
  email: string | undefined
): boolean {
  return email !== undefined && dependencies.billingAdmin?.isOperatorAllowed({ email }) === true;
}

export async function ensureBillingAdminDefaultPlan(input: {
  organization_id: string;
  email: string | undefined;
  now: string;
  dependencies: Pick<ApiDependencies, "billingAdmin" | "billingManagement">;
}): Promise<BillingAdminDefaultPlanResult | undefined> {
  if (!isBillingAdminOperator(input.dependencies, input.email) || input.dependencies.billingManagement === undefined) {
    return undefined;
  }

  const billing = await input.dependencies.billingManagement.getBillingSummaryForOrganization({
    organization_id: input.organization_id,
    now: input.now
  });
  if (billing === null) {
    return {
      billing: null,
      default_applied: false
    };
  }

  if (billing.plan !== "free") {
    return {
      billing,
      default_applied: false
    };
  }

  const overridden = await input.dependencies.billingAdmin!.overrideOrganizationBilling({
    organization_id: input.organization_id,
    plan: "team",
    additional_capacity_units: 0,
    now: input.now
  });

  return {
    billing: overridden === "billing_not_found" ? null : overridden,
    default_applied: overridden !== "billing_not_found"
  };
}
