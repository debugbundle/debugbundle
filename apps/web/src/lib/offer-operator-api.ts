import { z } from "zod";
import { buildApiUrl, buildBrowserSessionHeaders, readJson } from "./api-client.js";
import {
  OfferDelegationSchema,
  type OfferOperatorAction
} from "../../../../packages/referrals/src/offer-operator-contracts.js";

async function operatorRequest(path: string, body?: unknown): Promise<unknown> {
  const response = await fetch(buildApiUrl(`/v2/offers/operator/${path}`), {
    method: body === undefined ? "GET" : "POST",
    credentials: "include",
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
    headers: buildBrowserSessionHeaders(body !== undefined),
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  return readJson<unknown>(response);
}
export async function getOfferOperatorAccess(): Promise<{
  status: "ready" | "email_auth_required";
}> {
  return z
    .object({ status: z.enum(["ready", "email_auth_required"]) })
    .strict()
    .parse(await operatorRequest("access-status"));
}
/** Browser-only consent ceremony. The proof is never stored in browser persistence. */
export async function issueOfferDelegation(
  memberTokenId: string,
  actions: OfferOperatorAction[]
): Promise<z.infer<typeof OfferDelegationSchema>> {
  return OfferDelegationSchema.parse(
    await operatorRequest("delegations", { member_token_id: memberTokenId, actions })
  );
}
export async function revokeOfferDelegation(proof: string): Promise<void> {
  await operatorRequest("delegations/revoke", { operator_authorization: proof });
}
