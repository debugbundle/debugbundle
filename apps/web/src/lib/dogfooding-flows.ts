import { createAnalyticsFlowClient, type AnalyticsFlowClient } from "@debugbundle/sdk-browser";

export interface WebFlowEnv {
  VITE_API_URL?: string;
  VITE_DEBUGBUNDLE_FLOW_PROJECT_ID?: string;
  VITE_DEBUGBUNDLE_FLOW_PROJECT_TOKEN?: string;
}

let acquisition: AnalyticsFlowClient | undefined;
let activation: AnalyticsFlowClient | undefined;
let captureAllowed = false;
let arrival: Promise<unknown> = Promise.resolve();

function beginArrival(): void {
  const client = acquisition;
  if (!client || !captureAllowed) return;
  arrival = client
    .arrive()
    .then((linked) => {
      if (!linked && captureAllowed) return client.start("app_opened");
      return linked;
    })
    .catch(() => false);
}

/** DebugBundle consumes the same public flow client available to customer projects. */
export function initializeWebFlows(
  env: WebFlowEnv,
  allowed: boolean,
  createClient: typeof createAnalyticsFlowClient = createAnalyticsFlowClient
): void {
  acquisition = undefined;
  activation = undefined;
  captureAllowed = false;
  arrival = Promise.resolve();
  if (
    !env.VITE_API_URL ||
    !env.VITE_DEBUGBUNDLE_FLOW_PROJECT_ID ||
    !env.VITE_DEBUGBUNDLE_FLOW_PROJECT_TOKEN
  )
    return;
  const options = {
    endpoint: env.VITE_API_URL,
    projectId: env.VITE_DEBUGBUNDLE_FLOW_PROJECT_ID,
    projectToken: env.VITE_DEBUGBUNDLE_FLOW_PROJECT_TOKEN,
    enabled: true,
    consentRequired: true,
    requestTimeoutMs: 500
  };
  acquisition = createClient({ ...options, flowKey: "site-acquisition" });
  activation = createClient({ ...options, flowKey: "product-activation" });
  setWebFlowCaptureAllowed(allowed);
}

export function setWebFlowCaptureAllowed(allowed: boolean): void {
  const shouldStart = allowed && !captureAllowed;
  captureAllowed = allowed;
  acquisition?.setConsent(allowed);
  activation?.setConsent(allowed);
  if (shouldStart) beginArrival();
}

export async function observeWebFlowAuthentication(authenticated: boolean): Promise<void> {
  if (!authenticated || !captureAllowed || !acquisition) return;
  await arrival;
  if (captureAllowed) await acquisition.step("signed_in").catch(() => false);
}

/** Call only after the corresponding application read/write has succeeded. */
export async function observeWebActivationStep(
  step: "project_created" | "incident_opened" | "bundle_retrieved"
): Promise<void> {
  if (!captureAllowed || !activation) return;
  if (step === "project_created") await activation.start(step).catch(() => false);
  else await activation.step(step).catch(() => false);
}
