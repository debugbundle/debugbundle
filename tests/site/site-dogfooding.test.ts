// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import {
  initializeSiteDogfooding,
  resolveSiteDogfoodingConfig,
  type DogfoodingWindowTarget
} from "../../site/src/lib/dogfooding.ts";

type SiteDogfoodingEnv = {
  NEXT_PUBLIC_DEBUGBUNDLE_API_URL?: string;
  NEXT_PUBLIC_DEBUGBUNDLE_DOGFOOD_PROJECT_TOKEN?: string;
  NEXT_PUBLIC_DEBUGBUNDLE_DOGFOOD_EXPOSE_TRIGGERS?: string;
};

type SiteDogfoodingConfig = {
  enabled: true;
  endpoint: string;
  environment: string;
  service: string;
  projectToken: string;
  exposeTriggers: boolean;
  captureConsole: boolean;
};

type SiteDogfoodingTestSdk = {
  init: ReturnType<typeof vi.fn>;
  captureException?: ReturnType<typeof vi.fn>;
  flush?: ReturnType<typeof vi.fn>;
};

type ResolveSiteDogfoodingConfig = (env: SiteDogfoodingEnv) => SiteDogfoodingConfig | null;
type InitializeSiteDogfooding = (
  env: SiteDogfoodingEnv,
  target?: DogfoodingWindowTarget,
  sdk?: SiteDogfoodingTestSdk
) => SiteDogfoodingConfig | null;

const resolveSiteDogfoodingConfigUnderTest = resolveSiteDogfoodingConfig as ResolveSiteDogfoodingConfig;
const initializeSiteDogfoodingUnderTest = initializeSiteDogfooding as unknown as InitializeSiteDogfooding;

describe("site dogfooding", () => {
  it("stays disabled when no project token is configured", () => {
    expect(resolveSiteDogfoodingConfigUnderTest({ NEXT_PUBLIC_DEBUGBUNDLE_API_URL: "https://api.debugbundle.local" })).toBeNull();
  });

  it("derives the hosted ingestion endpoint from the configured api base url", () => {
    expect(
        resolveSiteDogfoodingConfigUnderTest({
        NEXT_PUBLIC_DEBUGBUNDLE_API_URL: "https://api.debugbundle.local",
        NEXT_PUBLIC_DEBUGBUNDLE_DOGFOOD_PROJECT_TOKEN: "dbundle_proj_site"
      })
    ).toEqual({
      enabled: true,
      endpoint: "https://api.debugbundle.local/v1/events",
      environment: "production",
      service: "debugbundle-site",
      projectToken: "dbundle_proj_site",
      exposeTriggers: false,
      captureConsole: false
    });
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

    initializeSiteDogfoodingUnderTest(
      {
        NEXT_PUBLIC_DEBUGBUNDLE_API_URL: "https://api.debugbundle.local",
        NEXT_PUBLIC_DEBUGBUNDLE_DOGFOOD_PROJECT_TOKEN: "dbundle_proj_site",
        NEXT_PUBLIC_DEBUGBUNDLE_DOGFOOD_EXPOSE_TRIGGERS: "true"
      },
      target,
      sdk
    );

    expect(sdk.init).toHaveBeenCalledWith({
      projectToken: "dbundle_proj_site",
      endpoint: "https://api.debugbundle.local/v1/events",
      environment: "production",
      service: "debugbundle-site",
      captureConsole: false,
      breadcrumbsOnErrorOnly: false
    });
    expect(target.__DEBUGBUNDLE_DOGFOOD__).toBeDefined();

    target.__DEBUGBUNDLE_DOGFOOD__?.triggerFrontendException("manual site dogfood");

    expect(sdk.captureException).toHaveBeenCalledOnce();
    expect(sdk.captureException).toHaveBeenCalledWith(expect.objectContaining({ message: "manual site dogfood" }));
    expect(sdk.flush).toHaveBeenCalledOnce();
    expect(scheduledCallback).toBeNull();
  });

  it("does not expose the manual trigger bridge when trigger access is disabled", () => {
    const sdk = {
      init: vi.fn()
    };
    const target: DogfoodingWindowTarget = {
      setTimeout: vi.fn()
    };

    initializeSiteDogfoodingUnderTest(
      {
        NEXT_PUBLIC_DEBUGBUNDLE_API_URL: "https://api.debugbundle.local",
        NEXT_PUBLIC_DEBUGBUNDLE_DOGFOOD_PROJECT_TOKEN: "dbundle_proj_site"
      },
      target,
      sdk
    );

    expect(sdk.init).toHaveBeenCalledOnce();
    expect(target.__DEBUGBUNDLE_DOGFOOD__).toBeUndefined();
  });
});