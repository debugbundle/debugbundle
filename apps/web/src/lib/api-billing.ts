import {
  API_BASE,
  buildBrowserSessionHeaders,
  normalizeBillingSummary,
  readJson
} from "./api-client.js";
import type { BillingSummaryRecord } from "./api-types.js";

type BillingSummaryResponse = {
  billing: Omit<BillingSummaryRecord, "allowances" | "trial"> & {
    allowances?: Partial<BillingSummaryRecord["allowances"]>;
    trial?: Partial<BillingSummaryRecord["trial"]>;
  };
};

export async function getBillingSummary(): Promise<BillingSummaryRecord> {
  const body = await readJson<BillingSummaryResponse>(
    await fetch(`${API_BASE}/v1/billing`, {
      credentials: "include"
    })
  );

  return normalizeBillingSummary(body.billing);
}

export async function startBillingTrial(
  targetPlan: "solo" | "team"
): Promise<BillingSummaryRecord> {
  const body = await readJson<BillingSummaryResponse>(
    await fetch(`${API_BASE}/v1/billing/trial/start`, {
      method: "POST",
      credentials: "include",
      headers: buildBrowserSessionHeaders(true),
      body: JSON.stringify({ target_plan: targetPlan })
    })
  );

  return normalizeBillingSummary(body.billing);
}

export async function startBillingCheckout(
  targetPlan: "solo" | "team"
): Promise<string> {
  const body = await readJson<{ url: string }>(
    await fetch(`${API_BASE}/v1/billing/checkout`, {
      method: "POST",
      credentials: "include",
      headers: buildBrowserSessionHeaders(true),
      body: JSON.stringify({ target_plan: targetPlan })
    })
  );

  return body.url;
}

export async function confirmBillingCheckout(
  sessionId: string
): Promise<BillingSummaryRecord> {
  const body = await readJson<BillingSummaryResponse>(
    await fetch(`${API_BASE}/v1/billing/checkout/confirm`, {
      method: "POST",
      credentials: "include",
      headers: buildBrowserSessionHeaders(true),
      body: JSON.stringify({ session_id: sessionId })
    })
  );

  return normalizeBillingSummary(body.billing);
}

export async function openBillingPortal(): Promise<string> {
  const body = await readJson<{ url: string }>(
    await fetch(`${API_BASE}/v1/billing/portal`, {
      method: "POST",
      credentials: "include",
      headers: buildBrowserSessionHeaders()
    })
  );

  return body.url;
}

export async function increaseBillingCapacity(
  targetAdditionalCapacityUnits: number
): Promise<BillingSummaryRecord> {
  const body = await readJson<BillingSummaryResponse>(
    await fetch(`${API_BASE}/v1/billing/capacity/increase`, {
      method: "POST",
      credentials: "include",
      headers: buildBrowserSessionHeaders(true),
      body: JSON.stringify({
        target_additional_capacity_units: targetAdditionalCapacityUnits
      })
    })
  );

  return normalizeBillingSummary(body.billing);
}

export async function scheduleBillingCapacityReduction(
  targetAdditionalCapacityUnits: number
): Promise<BillingSummaryRecord> {
  const body = await readJson<BillingSummaryResponse>(
    await fetch(`${API_BASE}/v1/billing/capacity/scheduled-reduction`, {
      method: "POST",
      credentials: "include",
      headers: buildBrowserSessionHeaders(true),
      body: JSON.stringify({
        target_additional_capacity_units: targetAdditionalCapacityUnits
      })
    })
  );

  return normalizeBillingSummary(body.billing);
}

export async function cancelBillingCapacityReduction(): Promise<BillingSummaryRecord> {
  const body = await readJson<BillingSummaryResponse>(
    await fetch(`${API_BASE}/v1/billing/capacity/scheduled-reduction`, {
      method: "DELETE",
      credentials: "include",
      headers: buildBrowserSessionHeaders()
    })
  );

  return normalizeBillingSummary(body.billing);
}
