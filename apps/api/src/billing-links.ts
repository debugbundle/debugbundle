export interface BillingLinkProvider {
  createCheckoutUrl(input: { target_plan: "solo" | "team" }): string | null;
  createPortalUrl(): string | null;
}

function readTrimmedEnv(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

export function createEnvBillingLinkProvider(env: NodeJS.ProcessEnv = process.env): BillingLinkProvider {
  return {
    createCheckoutUrl(input): string | null {
      return input.target_plan === "solo"
        ? readTrimmedEnv(env["STRIPE_SOLO_CHECKOUT_URL"])
        : readTrimmedEnv(env["STRIPE_TEAM_CHECKOUT_URL"]);
    },

    createPortalUrl(): string | null {
      return readTrimmedEnv(env["STRIPE_CUSTOMER_PORTAL_URL"]);
    }
  };
}