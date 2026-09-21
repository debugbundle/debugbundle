import { describe, expect, it, vi } from "vitest";
import {
  createGitHubOAuthClientMock,
  createAccountDeletionChallengeServiceMock,
  createWebSessionAuthServiceMock,
  createSesEmailTransportMock,
  renderAccountDeletionOtpEmailMock,
  renderEmailAuthCodeEmailMock,
  renderProjectInviteEmailMock,
  emailTransportSendMock
} from "../../helpers/api-default-dependency-mocks.js";
import { createApiDependenciesFromEnv } from "../../../apps/api/src/default-dependencies-env.js";

describe("api-default-dependency-mocks authentication", () => {
  it("should compose auth email delivery when ses settings are present", async (): Promise<void> => {
    createApiDependenciesFromEnv({
      SES_REGION: "eu-west-1",
      SES_FROM_EMAIL: "noreply@debugbundle.test",
      AWS_ACCESS_KEY_ID: "aws-key",
      AWS_SECRET_ACCESS_KEY: "aws-secret",
      APP_BASE_URL: "https://app.debugbundle.test"
    });

    expect(createSesEmailTransportMock).toHaveBeenCalledWith({
      region: "eu-west-1",
      fromEmail: "DebugBundle <noreply@debugbundle.test>",
      accessKeyId: "aws-key",
      secretAccessKey: "aws-secret",
      timeoutMs: 10000
    });

    const serviceOptions = createWebSessionAuthServiceMock.mock.calls.at(-1)?.[1] as
      | {
          authEmails?: {
            sendEmailAuthCode(input: {
              email: string;
              code: string;
              expires_in_minutes: number;
            }): Promise<void>;
            sendAccountDeletionOtp(input: {
              email: string;
              code: string;
              expires_in_minutes: number;
            }): Promise<void>;
            sendProjectInviteEmail(input: {
              email: string;
              token: string;
              inviter_name: string;
              project_title: string;
            }): Promise<void>;
          };
        }
      | undefined;

    expect(serviceOptions?.authEmails).toBeDefined();
    expect(createAccountDeletionChallengeServiceMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        authEmails: serviceOptions?.authEmails
      })
    );

    await serviceOptions?.authEmails?.sendEmailAuthCode({
      email: "owen@example.com",
      code: "123456",
      expires_in_minutes: 10
    });
    await serviceOptions?.authEmails?.sendAccountDeletionOtp({
      email: "owen@example.com",
      code: "654321",
      expires_in_minutes: 10
    });
    await serviceOptions?.authEmails?.sendProjectInviteEmail({
      email: "invitee@example.com",
      token: "invite-token",
      inviter_name: "Owen Far",
      project_title: "Checkout API"
    });

    expect(renderEmailAuthCodeEmailMock).toHaveBeenCalledWith({
      code: "123456",
      appUrl: "https://app.debugbundle.test/login",
      expiresInMinutes: 10,
      brandMarkUrl: "https://app.debugbundle.test/email/debugbundle-mark.png"
    });
    expect(renderAccountDeletionOtpEmailMock).toHaveBeenCalledWith({
      code: "654321",
      settingsUrl: "https://app.debugbundle.test/settings",
      expiresInMinutes: 10,
      brandMarkUrl: "https://app.debugbundle.test/email/debugbundle-mark.png"
    });
    expect(renderProjectInviteEmailMock).toHaveBeenCalledWith({
      acceptUrl: "https://app.debugbundle.test/invite?token=invite-token",
      inviterName: "Owen Far",
      projectName: "Checkout API",
      brandMarkUrl: "https://app.debugbundle.test/email/debugbundle-mark.png"
    });
    expect(emailTransportSendMock).toHaveBeenCalledTimes(3);
  });

  it("should prefer the app origin over the public site for email brand assets when no explicit override is set", async (): Promise<void> => {
    createApiDependenciesFromEnv({
      SES_REGION: "eu-west-1",
      SES_FROM_EMAIL: "noreply@debugbundle.test",
      AWS_ACCESS_KEY_ID: "aws-key",
      AWS_SECRET_ACCESS_KEY: "aws-secret",
      APP_BASE_URL: "https://app.debugbundle.test",
      PUBLIC_SITE_URL: "https://debugbundle.test"
    });

    const serviceOptions = createWebSessionAuthServiceMock.mock.calls.at(-1)?.[1] as
      | {
          authEmails?: {
            sendEmailAuthCode(input: {
              email: string;
              code: string;
              expires_in_minutes: number;
            }): Promise<void>;
          };
        }
      | undefined;

    await serviceOptions?.authEmails?.sendEmailAuthCode({
      email: "owen@example.com",
      code: "123456",
      expires_in_minutes: 10
    });

    expect(renderEmailAuthCodeEmailMock).toHaveBeenLastCalledWith({
      code: "123456",
      appUrl: "https://app.debugbundle.test/login",
      expiresInMinutes: 10,
      brandMarkUrl: "https://app.debugbundle.test/email/debugbundle-mark.png"
    });
  });

  it("should compose github oauth support when github env settings are present", (): void => {
    createApiDependenciesFromEnv({
      GITHUB_CLIENT_ID: "gh-client-id",
      GITHUB_CLIENT_SECRET: "gh-client-secret",
      GITHUB_OAUTH_CALLBACK_URL: "https://api.debugbundle.test/v1/auth/github/callback",
      GITHUB_OAUTH_STATE_SECRET: "github-oauth-secret",
      APP_BASE_URL: "https://app.debugbundle.test"
    });

    expect(createGitHubOAuthClientMock).toHaveBeenCalledWith({
      clientId: "gh-client-id",
      clientSecret: "gh-client-secret",
      callbackUrl: "https://api.debugbundle.test/v1/auth/github/callback"
    });

    const serviceOptions = createWebSessionAuthServiceMock.mock.calls.at(-1)?.[1] as {
      githubOAuth?: {
        clientId: string;
        callbackUrl: string;
        appRedirectUrl: string;
        stateSecret: string;
        client: {
          exchangeCodeForIdentity: ReturnType<typeof vi.fn>;
          resolveIdentityFromAccessToken: ReturnType<typeof vi.fn>;
          beginDeviceAuthorization: ReturnType<typeof vi.fn>;
          pollDeviceAuthorization: ReturnType<typeof vi.fn>;
        };
      };
    };
    expect(serviceOptions.githubOAuth).toEqual({
      clientId: "gh-client-id",
      callbackUrl: "https://api.debugbundle.test/v1/auth/github/callback",
      appRedirectUrl: "https://app.debugbundle.test/auth/github/callback",
      stateSecret: "github-oauth-secret",
      client: {
        exchangeCodeForIdentity: expect.any(Function),
        resolveIdentityFromAccessToken: expect.any(Function),
        beginDeviceAuthorization: expect.any(Function),
        pollDeviceAuthorization: expect.any(Function)
      }
    });
  });

  it("should compose dev-only mock github oauth support when enabled without real github credentials", async (): Promise<void> => {
    createApiDependenciesFromEnv({
      APP_BASE_URL: "http://localhost:5291",
      DEV_GITHUB_MOCK_LOGIN: "true",
      DEV_GITHUB_MOCK_EMAIL: "mock-user@example.com"
    });

    expect(createGitHubOAuthClientMock).not.toHaveBeenCalled();

    const serviceOptions = createWebSessionAuthServiceMock.mock.calls.at(-1)?.[1] as {
      githubOAuth?: {
        clientId: string;
        callbackUrl: string;
        appRedirectUrl: string;
        authorizeUrl?: string;
        stateSecret: string;
        client: {
          exchangeCodeForIdentity(input: {
            code: string;
          }): Promise<{ github_user_id: string; email: string } | null>;
        };
      };
    };

    expect(serviceOptions.githubOAuth?.clientId).toBe("debugbundle-dev-mock-github");
    expect(serviceOptions.githubOAuth?.callbackUrl).toBe(
      "http://localhost:5291/v1/auth/github/callback"
    );
    expect(serviceOptions.githubOAuth?.appRedirectUrl).toBe(
      "http://localhost:5291/auth/github/callback"
    );
    expect(serviceOptions.githubOAuth?.authorizeUrl).toBe(
      "http://localhost:5291/v1/auth/github/mock-authorize"
    );
    expect(serviceOptions.githubOAuth?.stateSecret).toBe(
      "debugbundle-dev-mock-github-state-secret"
    );
    await expect(
      serviceOptions.githubOAuth?.client.exchangeCodeForIdentity({
        code: "debugbundle-dev-mock-code"
      })
    ).resolves.toEqual({
      github_user_id: "debugbundle-dev-mock-user",
      email: "mock-user@example.com"
    });
    await expect(
      serviceOptions.githubOAuth?.client.exchangeCodeForIdentity({ code: "wrong-code" })
    ).resolves.toBeNull();
  });

  it("should ignore empty real github env values and still use the dev mock provider", (): void => {
    createApiDependenciesFromEnv({
      APP_BASE_URL: "http://localhost:5291",
      DEV_GITHUB_MOCK_LOGIN: "true",
      GITHUB_CLIENT_ID: "",
      GITHUB_CLIENT_SECRET: "   ",
      GITHUB_OAUTH_CALLBACK_URL: "",
      GITHUB_OAUTH_STATE_SECRET: ""
    });

    expect(createGitHubOAuthClientMock).not.toHaveBeenCalled();

    const serviceOptions = createWebSessionAuthServiceMock.mock.calls.at(-1)?.[1] as {
      githubOAuth?: {
        clientId: string;
        authorizeUrl?: string;
      };
    };

    expect(serviceOptions.githubOAuth?.clientId).toBe("debugbundle-dev-mock-github");
    expect(serviceOptions.githubOAuth?.authorizeUrl).toBe(
      "http://localhost:5291/v1/auth/github/mock-authorize"
    );
  });

  it("should expose the dev mock github device and token helpers when enabled", async (): Promise<void> => {
    createApiDependenciesFromEnv({
      APP_BASE_URL: "http://localhost:5291",
      DEV_GITHUB_MOCK_LOGIN: "true",
      DEV_GITHUB_MOCK_EMAIL: "device-mock@example.com"
    });

    const serviceOptions = createWebSessionAuthServiceMock.mock.calls.at(-1)?.[1] as {
      githubOAuth?: {
        client: {
          resolveIdentityFromAccessToken(input: { access_token: string }): Promise<unknown>;
          beginDeviceAuthorization(): Promise<unknown>;
          pollDeviceAuthorization(input: { device_code: string }): Promise<unknown>;
        };
      };
    };

    await expect(
      serviceOptions.githubOAuth?.client.resolveIdentityFromAccessToken({
        access_token: "debugbundle-dev-mock-code"
      })
    ).resolves.toEqual({
      ok: true,
      identity: {
        github_user_id: "debugbundle-dev-mock-user",
        email: "device-mock@example.com"
      }
    });
    await expect(
      serviceOptions.githubOAuth?.client.resolveIdentityFromAccessToken({
        access_token: "invalid-token"
      })
    ).resolves.toEqual({
      ok: false,
      error: "token_invalid"
    });
    await expect(serviceOptions.githubOAuth?.client.beginDeviceAuthorization()).resolves.toEqual({
      ok: true,
      device_code: "debugbundle-dev-mock-code",
      user_code: "MOCK-CODE",
      verification_uri: "http://localhost:5291/v1/auth/github/mock-authorize",
      expires_in: 900,
      interval: 5
    });
    await expect(
      serviceOptions.githubOAuth?.client.pollDeviceAuthorization({
        device_code: "debugbundle-dev-mock-code"
      })
    ).resolves.toEqual({
      status: "approved",
      identity: {
        github_user_id: "debugbundle-dev-mock-user",
        email: "device-mock@example.com"
      }
    });
    await expect(
      serviceOptions.githubOAuth?.client.pollDeviceAuthorization({
        device_code: "wrong-code"
      })
    ).resolves.toEqual({
      status: "provider_error"
    });
  });
});
