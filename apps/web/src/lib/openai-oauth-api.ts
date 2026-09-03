import { API_BASE, buildBrowserSessionHeaders, readJson } from "./api-client.js";
import type {
  OpenAiConnectionRecord,
  OpenAiConsentInteractionRecord,
  OpenAiProductScope
} from "./api-types.js";

export async function getOpenAiConsentInteraction(
  interactionId: string
): Promise<OpenAiConsentInteractionRecord> {
  const body = await readJson<{ interaction: OpenAiConsentInteractionRecord }>(
    await fetch(`${API_BASE}/oauth/interaction/${encodeURIComponent(interactionId)}`, {
      credentials: "include",
      headers: { Accept: "application/json" }
    })
  );
  return body.interaction;
}

export async function submitOpenAiConsent(input: {
  interactionId: string;
  decision: "allow" | "deny";
  productScopes: OpenAiProductScope[];
}): Promise<string> {
  const body = await readJson<{ continue_url: string }>(
    await fetch(`${API_BASE}/oauth/interaction/${encodeURIComponent(input.interactionId)}`, {
      method: "POST",
      credentials: "include",
      headers: buildBrowserSessionHeaders(true),
      body: JSON.stringify({
        decision: input.decision,
        product_scopes: input.productScopes
      })
    })
  );
  return body.continue_url;
}

export async function submitOpenAiReviewerCredential(input: {
  interactionId: string;
  credential: string;
}): Promise<string> {
  const body = await readJson<{ continue_url: string }>(
    await fetch(
      `${API_BASE}/oauth/interaction/${encodeURIComponent(input.interactionId)}/reviewer`,
      {
        method: "POST",
        credentials: "include",
        headers: buildBrowserSessionHeaders(true),
        body: JSON.stringify({ credential: input.credential })
      }
    )
  );
  return body.continue_url;
}

export async function listOpenAiConnections(): Promise<OpenAiConnectionRecord[]> {
  const body = await readJson<{ connections?: OpenAiConnectionRecord[] }>(
    await fetch(`${API_BASE}/v1/openai/connections`, { credentials: "include" })
  );
  return body.connections ?? [];
}

export async function revokeOpenAiConnection(grantId: string): Promise<void> {
  await readJson<{ revoked: true }>(
    await fetch(`${API_BASE}/v1/openai/connections/revoke`, {
      method: "POST",
      credentials: "include",
      headers: buildBrowserSessionHeaders(true),
      body: JSON.stringify({ grant_id: grantId })
    })
  );
}

export function continueOpenAiAuthorization(continueUrl: string): void {
  window.location.assign(continueUrl);
}
