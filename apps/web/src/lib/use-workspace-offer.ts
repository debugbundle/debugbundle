import type { CustomerReferral } from "../../../../packages/referrals/src/referral-contracts.js";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  OfferClaim,
  PublicOfferPreview
} from "../../../../packages/referrals/src/programme-policy.js";
import { offerApi } from "./offer-api.js";
import { OfferApiError } from "../../../../packages/referral-client/src/offer-api.js";

export type WorkspaceOfferState = {
  status: "loading" | "disabled" | "ready" | "error";
  claim: OfferClaim | null;
  pending: PublicOfferPreview | null;
  early_purchase_allowed: boolean;
  intent_status: string | null;
  intent_code: string | null;
  new_claims_enabled: boolean;
  legacy_attribution: CustomerReferral | null;
  legacy_discount_eligible: boolean;
};
const initial: WorkspaceOfferState = {
  status: "loading",
  claim: null,
  pending: null,
  early_purchase_allowed: false,
  intent_status: null,
  intent_code: null,
  new_claims_enabled: false,
  legacy_attribution: null,
  legacy_discount_eligible: false
};
export function useWorkspaceOffer(organizationId: string): {
  data: WorkspaceOfferState;
  reload: () => void;
} {
  const [data, setData] = useState<WorkspaceOfferState>(initial),
    [revision, setRevision] = useState(0);
  const generation = useRef(0);
  useEffect(() => {
    const current = ++generation.current;
    setData(initial);
    void (async () => {
      let enabled = false;
      try {
        enabled = (await offerApi.execute("capabilities", {})).enabled;
      } catch (error) {
        if (!(error instanceof OfferApiError) || error.status !== 404) {
          if (current === generation.current) setData({ ...initial, status: "error" });
          return;
        }
        if (current === generation.current) setData({ ...initial, status: "disabled" });
        return;
      }
      if (current !== generation.current) return;
      try {
        const intent = await offerApi.execute("retry_signup", {});
        const result = await offerApi.execute("customer", {});
        if (current === generation.current)
          setData({
            status: !enabled && !result.claim && !intent.intent ? "disabled" : "ready",
            ...result,
            intent_status: intent.intent?.status ?? null,
            intent_code: intent.intent?.code ?? null,
            new_claims_enabled: enabled,
            legacy_attribution: result.legacy_attribution ?? null,
            legacy_discount_eligible: result.legacy_discount_eligible ?? false
          });
      } catch {
        if (current === generation.current) setData({ ...initial, status: "error" });
      }
    })();
    return () => {
      generation.current++;
    };
  }, [organizationId, revision]);
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  return { data, reload };
}
