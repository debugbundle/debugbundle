// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  initializeWebFlows,
  observeWebFlowAuthentication,
  observeWebActivationStep,
  setWebFlowCaptureAllowed
} from "../../../apps/web/src/lib/dogfooding-flows.js";

const clients = [0, 1].map(() => ({
  setConsent: vi.fn(),
  start: vi.fn().mockResolvedValue(true),
  step: vi.fn().mockResolvedValue(true),
  arrive: vi.fn().mockResolvedValue(true),
  handoff: vi.fn(),
  withdraw: vi.fn()
}));
const createClient = (options: { flowKey: string }) =>
  clients[options.flowKey === "site-acquisition" ? 0 : 1]!;
const env = {
  VITE_API_URL: "https://api.example.test",
  VITE_DEBUGBUNDLE_FLOW_PROJECT_ID: "00000000-0000-4000-8000-000000000001",
  VITE_DEBUGBUNDLE_FLOW_PROJECT_TOKEN: "dbundle_proj_test"
};

describe("hosted app flow integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    initializeWebFlows({}, false);
    clients[0]!.arrive.mockResolvedValue(true);
  });

  it("keeps capture inactive without a configured project or allowed policy", async () => {
    initializeWebFlows(env, false, createClient);
    await observeWebFlowAuthentication(true);
    await observeWebActivationStep("project_created");
    expect(clients[0]!.arrive).not.toHaveBeenCalled();
    expect(clients[1]!.start).not.toHaveBeenCalled();
  });

  it("records authentication only after app arrival and a confirmed session", async () => {
    let arrived: (value: boolean) => void = () => {};
    clients[0]!.arrive.mockReturnValueOnce(
      new Promise<boolean>((resolve) => {
        arrived = resolve;
      })
    );
    initializeWebFlows(env, true, createClient);
    await observeWebFlowAuthentication(false);
    const complete = observeWebFlowAuthentication(true);
    expect(clients[0]!.step).not.toHaveBeenCalled();
    arrived(true);
    await complete;
    expect(clients[0]!.step).toHaveBeenCalledWith("signed_in");
    expect(clients[0]!.start).not.toHaveBeenCalled();
  });

  it("records an explicitly unlinked app arrival when the handoff is missing", async () => {
    clients[0]!.arrive.mockResolvedValueOnce(false);
    initializeWebFlows(env, true, createClient);
    await observeWebFlowAuthentication(true);
    expect(clients[0]!.start).toHaveBeenCalledWith("app_opened");
    expect(clients[0]!.step).toHaveBeenCalledWith("signed_in");
  });

  it("starts activation at successful project creation and records later observations", async () => {
    initializeWebFlows(env, true, createClient);
    await observeWebActivationStep("project_created");
    await observeWebActivationStep("incident_opened");
    await observeWebActivationStep("bundle_retrieved");
    expect(clients[1]!.start).toHaveBeenCalledWith("project_created");
    expect(clients[1]!.step.mock.calls).toEqual([["incident_opened"], ["bundle_retrieved"]]);
  });

  it("withdraws both clients and stops subsequent observations", async () => {
    initializeWebFlows(env, true, createClient);
    setWebFlowCaptureAllowed(false);
    await observeWebFlowAuthentication(true);
    await observeWebActivationStep("project_created");
    expect(clients.every((client) => client.setConsent.mock.lastCall?.[0] === false)).toBe(true);
    expect(clients[0]!.step).not.toHaveBeenCalled();
    expect(clients[1]!.start).not.toHaveBeenCalled();
  });
});
