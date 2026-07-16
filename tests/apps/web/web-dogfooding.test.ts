// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import {
  initializeWebDogfooding,
  resolveWebDogfoodingConfig,
  type DogfoodingWindowTarget
} from "../../../apps/web/src/lib/dogfooding.ts";

describe("web dogfooding", () => {
  const relayEndpoint = "/debugbundle/browser";

  it("stays disabled when dogfooding is neither explicitly enabled nor backed by a project token", () => {
    expect(
      resolveWebDogfoodingConfig({
        DEV: true,
        MODE: "development",
        VITE_API_URL: "http://localhost:3001"
      })
    ).toBeNull();
  });

  it("uses the same-origin relay endpoint in dev so Vite can proxy browser events", () => {
    expect(
      resolveWebDogfoodingConfig({
        DEV: true,
        MODE: "development",
        VITE_API_URL: "http://localhost:3001",
        VITE_DEBUGBUNDLE_DOGFOOD_PROJECT_TOKEN: "dbundle_proj_browser",
        VITE_DEBUGBUNDLE_DOGFOOD_EXPOSE_TRIGGERS: "true"
      })
    ).toEqual({
      enabled: true,
      endpoint: relayEndpoint,
      environment: "development",
      service: "debugbundle-web",
      projectToken: "dbundle_proj_browser",
      exposeTriggers: true,
      captureConsole: false
    });
  });

  it("allows relay-mode dogfooding without a browser project token when explicitly enabled", () => {
    expect(
      resolveWebDogfoodingConfig({
        DEV: true,
        MODE: "development",
        VITE_DEBUGBUNDLE_DOGFOOD_ENABLED: "true"
      })
    ).toEqual({
      enabled: true,
      endpoint: relayEndpoint,
      environment: "development",
      service: "debugbundle-web",
      projectToken: null,
      exposeTriggers: false,
      captureConsole: false
    });
  });

  it("derives the ingestion endpoint from the configured api base url outside dev", () => {
    expect(
      resolveWebDogfoodingConfig({
        DEV: false,
        MODE: "production",
        VITE_API_URL: "https://api.debugbundle.local",
        VITE_DEBUGBUNDLE_DOGFOOD_PROJECT_TOKEN: "dbundle_proj_browser"
      })
    ).toEqual({
      enabled: true,
      endpoint: "https://api.debugbundle.local/v1/events",
      environment: "production",
      service: "debugbundle-web",
      projectToken: "dbundle_proj_browser",
      exposeTriggers: false,
      captureConsole: false
    });
  });

  it("rejects production direct-mode dogfooding when no api base url is configured", () => {
    expect(() =>
      resolveWebDogfoodingConfig({
        DEV: false,
        MODE: "production",
        VITE_DEBUGBUNDLE_DOGFOOD_PROJECT_TOKEN: "dbundle_proj_browser"
      })
    ).toThrowError("web_dogfooding_missing_api_url");
  });

  it("initializes the browser sdk and exposes a manual trigger bridge when enabled", () => {
    const sdk = {
      init: vi.fn(),
      captureException: vi.fn(),
      flush: vi.fn().mockResolvedValue(undefined)
    };
    let scheduledCallback: (() => void) | null = null;
    const target = {
      setTimeout: vi.fn((callback: () => void) => {
        scheduledCallback = callback;
        return 1;
      })
    } as unknown as Window & {
      __DEBUGBUNDLE_DOGFOOD__?: {
        triggerFrontendException(message?: string): void;
      };
    };

    initializeWebDogfooding(
      {
        DEV: true,
        MODE: "development",
        VITE_API_URL: "http://localhost:3001",
        VITE_DEBUGBUNDLE_DOGFOOD_PROJECT_TOKEN: "dbundle_proj_browser",
        VITE_DEBUGBUNDLE_DOGFOOD_EXPOSE_TRIGGERS: "true"
      },
      target,
      sdk
    );

    expect(sdk.init).toHaveBeenCalledWith({
      endpoint: relayEndpoint,
      environment: "development",
      service: "debugbundle-web",
      captureConsole: false,
      breadcrumbsOnErrorOnly: false,
      tracePropagationTargets: ["http://localhost:3001/"]
    });
    expect(target.__DEBUGBUNDLE_DOGFOOD__).toBeDefined();

    target.__DEBUGBUNDLE_DOGFOOD__?.triggerFrontendException("manual browser dogfood");

    expect(sdk.captureException).toHaveBeenCalledOnce();
    expect(sdk.captureException).toHaveBeenCalledWith(expect.objectContaining({ message: "manual browser dogfood" }));
    expect(sdk.flush).toHaveBeenCalledOnce();
    expect(scheduledCallback).toBeNull();
  });

  it("keeps relay-mode dogfooding credentials out of browser sdk init", () => {
    const sdk = {
      init: vi.fn()
    };
    const target: DogfoodingWindowTarget = {
      setTimeout: vi.fn()
    };

    initializeWebDogfooding(
      {
        DEV: true,
        MODE: "development",
        VITE_DEBUGBUNDLE_DOGFOOD_PROJECT_TOKEN: "dbundle_proj_browser",
        VITE_DEBUGBUNDLE_DOGFOOD_ENDPOINT: "/debugbundle/browser"
      },
      target,
      sdk
    );

    expect(sdk.init).toHaveBeenCalledWith(expect.not.objectContaining({ projectToken: expect.any(String) }));
  });

  it("does not expose the manual bridge when trigger access is disabled", () => {
    const sdk = {
      init: vi.fn()
    };
    const target: DogfoodingWindowTarget = {
      setTimeout: vi.fn()
    };

    initializeWebDogfooding(
      {
        DEV: true,
        MODE: "development",
        VITE_API_URL: "http://localhost:3001",
        VITE_DEBUGBUNDLE_DOGFOOD_PROJECT_TOKEN: "dbundle_proj_browser"
      },
      target,
      sdk
    );

    expect(sdk.init).toHaveBeenCalledOnce();
    expect(target.__DEBUGBUNDLE_DOGFOOD__).toBeUndefined();
  });

  it("initializes relay-mode dogfooding without a browser project token", () => {
    const sdk = {
      init: vi.fn()
    };
    const target: DogfoodingWindowTarget = {
      setTimeout: vi.fn()
    };

    initializeWebDogfooding(
      {
        DEV: true,
        MODE: "development",
        VITE_DEBUGBUNDLE_DOGFOOD_ENABLED: "true"
      },
      target,
      sdk
    );

    expect(sdk.init).toHaveBeenCalledWith({
      endpoint: relayEndpoint,
      environment: "development",
      service: "debugbundle-web",
      captureConsole: false,
      breadcrumbsOnErrorOnly: false
    });
  });

  it("enables browser analytics only when local dogfooding explicitly opts in", () => {
    const sdk = {
      init: vi.fn()
    };
    const target: DogfoodingWindowTarget = {
      setTimeout: vi.fn()
    };

    initializeWebDogfooding(
      {
        DEV: true,
        MODE: "development",
        VITE_DEBUGBUNDLE_DOGFOOD_ENABLED: "true",
        VITE_DEBUGBUNDLE_DOGFOOD_ANALYTICS_ENABLED: "true"
      },
      target,
      sdk
    );

    expect(sdk.init).toHaveBeenCalledWith(expect.objectContaining({
      analytics: { enabled: true }
    }));
  });

  it("allowlists the configured api base url for split-origin request promotion", () => {
    const sdk = {
      init: vi.fn()
    };
    const target: DogfoodingWindowTarget = {
      setTimeout: vi.fn()
    };

    initializeWebDogfooding(
      {
        DEV: false,
        MODE: "production",
        VITE_API_URL: "https://api.debugbundle.com",
        VITE_DEBUGBUNDLE_DOGFOOD_PROJECT_TOKEN: "dbundle_proj_browser"
      },
      target,
      sdk
    );

    expect(sdk.init).toHaveBeenCalledWith({
      projectToken: "dbundle_proj_browser",
      endpoint: "https://api.debugbundle.com/v1/events",
      environment: "production",
      service: "debugbundle-web",
      captureConsole: false,
      breadcrumbsOnErrorOnly: false,
      tracePropagationTargets: ["https://api.debugbundle.com/"]
    });
  });

  it("warns and disables dogfooding when production direct mode is missing the api base url", () => {
    const sdk = {
      init: vi.fn()
    };
    const warn = vi.fn();
    const target: DogfoodingWindowTarget = {
      setTimeout: vi.fn()
    };

    const config = initializeWebDogfooding(
      {
        DEV: false,
        MODE: "production",
        VITE_DEBUGBUNDLE_DOGFOOD_PROJECT_TOKEN: "dbundle_proj_browser"
      },
      target,
      sdk,
      warn
    );

    expect(config).toBeNull();
    expect(sdk.init).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith("web_dogfooding_disabled: web_dogfooding_missing_api_url");
  });
});
