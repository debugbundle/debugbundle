import { z } from "zod";
import type { ReferralStore } from "../../storage/src/referral-store.js";
import {
  ReferralCodeSchema,
  ReferralHttpUrlSchema,
  ReferralError,
  REFERRAL_TERMS_VERSION,
  type ReferralPartner,
  type CustomerReferral,
  type ReferralClient
} from "./referral-contracts.js";
import type { ReferralLinkCodec } from "./referral-link.js";
import type { ReferralFinance } from "./referral-finance.js";

const ActorSchema = z.object({ organization_id: z.uuid(), actor_user_id: z.uuid() }).strict();
const AttributeSchema = ActorSchema.extend({
  code: ReferralCodeSchema,
  source: z.enum(["link", "manual"]),
  explicit_correction: z.boolean()
}).strict();
const EligibilitySchema = z
  .object({
    provider_customer_id_checked: z.string().min(1).max(255).nullable(),
    provider_previously_paid: z.boolean()
  })
  .strict();
type Actor = z.infer<typeof ActorSchema>;
type Attribute = z.infer<typeof AttributeSchema>;
export interface ReferralManagement {
  readonly finance?: ReferralFinance;
  readonly enrollmentEnabled: boolean;
  readonly publicLandingUrl: string;
  shareLink(code: string): string;
  partner(userId: string): Promise<ReferralPartner | null>;
  join(userId: string, termsVersion: string): Promise<ReferralPartner>;
  clients(input: { user_id: string; limit: number; before?: string }): Promise<ReferralClient[]>;
  customer(actor: Actor): Promise<CustomerReferral | null>;
  attribute(input: Attribute): Promise<CustomerReferral>;
  pendingCode(cookieHeader: string | undefined): Promise<string | null>;
  visit(code: string, cookieHeader: string | undefined): Promise<{ cookie: string | null } | null>;
  clearPendingCookie(): string;
  captureSignup(
    input: Actor & { cookie_header: string | undefined; created_user: boolean }
  ): Promise<boolean>;
}
export function createReferralManagement(input: {
  store: ReferralStore;
  links: ReferralLinkCodec;
  enrollmentEnabled: boolean;
  finance?: ReferralFinance;
  publicLandingUrl?: string;
  publicApiUrl?: string;
  readEligibility(actor: Actor): Promise<z.infer<typeof EligibilitySchema>>;
}): ReferralManagement {
  const { store, links } = input;
  const service: ReferralManagement = {
    ...(input.finance === undefined ? {} : { finance: input.finance }),
    enrollmentEnabled: input.enrollmentEnabled,
    publicLandingUrl: ReferralHttpUrlSchema.parse(
      input.publicLandingUrl ?? "https://debugbundle.com/"
    ),
    shareLink: (code) =>
      new URL(
        `/v1/referrals/visit/${ReferralCodeSchema.parse(code)}`,
        ReferralHttpUrlSchema.parse(input.publicApiUrl ?? "https://api.debugbundle.com")
      ).toString(),
    partner: (userId) => store.getPartner({ user_id: userId }),
    async join(userId, termsVersion) {
      if (termsVersion !== REFERRAL_TERMS_VERSION) throw new ReferralError("terms_mismatch");
      const existing = await store.getPartner({ user_id: userId });
      if (existing) return existing;
      if (!input.enrollmentEnabled) throw new ReferralError("program_unavailable");
      return store.joinProgram({ user_id: userId, terms_version: termsVersion });
    },
    clients: (request) => store.listPartnerClients(request),
    customer: (actor) => store.getAttribution(ActorSchema.parse(actor)),
    async attribute(raw) {
      // The customer may choose a code; eligibility facts and actor identity are
      // supplied by the server. Extra provider flags are rejected, not merged.
      const request = AttributeSchema.parse(raw);
      const actor = {
        organization_id: request.organization_id,
        actor_user_id: request.actor_user_id
      };
      if (!input.enrollmentEnabled) {
        const existing = await store.getAttribution(actor);
        if (existing?.partner_code === request.code) return existing;
        throw new ReferralError("program_unavailable");
      }
      const eligibility = EligibilitySchema.parse(await input.readEligibility(actor));
      return store.saveAttribution({ ...request, ...eligibility });
    },
    async pendingCode(header) {
      if (!input.enrollmentEnabled) return null;
      const code = links.read(header);
      return code && (await store.isActiveCode(code)) ? code : null;
    },
    async visit(raw, header) {
      const code = ReferralCodeSchema.safeParse(raw);
      if (!input.enrollmentEnabled || !code.success || !(await store.isActiveCode(code.data)))
        return null;
      if (await service.pendingCode(header)) return { cookie: null };
      return { cookie: links.issue(code.data) };
    },
    clearPendingCookie: () => links.clear(),
    async captureSignup(request) {
      if (!request.created_user || !input.enrollmentEnabled) return false;
      try {
        const code = await service.pendingCode(request.cookie_header);
        if (!code) return false;
        await service.attribute({
          organization_id: request.organization_id,
          actor_user_id: request.actor_user_id,
          code,
          source: "link",
          explicit_correction: false
        });
        return true;
      } catch {
        // Authentication is independent. Keep the cookie so Billing can offer
        // an explicit retry instead of losing a referral during an outage.
        return false;
      }
    }
  };
  return service;
}
