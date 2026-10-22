export interface BillingLinkProvider {
  createCheckoutUrl(input: { target_plan: "solo" | "team" }): string | null;
  createPortalUrl(): string | null;
}

function readTrimmedEnv(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

export function createEnvBillingLinkProvider(
  env: NodeJS.ProcessEnv = process.env
): BillingLinkProvider {
  return {
    createCheckoutUrl(input): string | null {
      // Static links cannot bind ownership or participate in durable reservations.
      // Keep the legacy local scaffold, but fail closed in production.
      if (env["NODE_ENV"] === "production") return null;
      return input.target_plan === "solo"
        ? readTrimmedEnv(env["STRIPE_SOLO_CHECKOUT_URL"])
        : readTrimmedEnv(env["STRIPE_TEAM_CHECKOUT_URL"]);
    },

    createPortalUrl(): string | null {
      if (env["NODE_ENV"] === "production") return null;
      return readTrimmedEnv(env["STRIPE_CUSTOMER_PORTAL_URL"]);
    }
  };
}
