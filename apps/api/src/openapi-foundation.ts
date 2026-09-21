import {
  z,
  AccountDeleteBodySchema,
  AccountDeleteRequestOtpBodySchema,
  AcceptInviteBodySchema,
  BillingCheckoutBodySchema,
  BillingCheckoutConfirmBodySchema,
  BillingCapacityChangeBodySchema,
  GithubAuthCallbackQuerySchema,
  GithubDeviceClaimBodySchema,
  GithubDevicePollBodySchema,
  GithubDeviceStartBodySchema,
  GithubTokenExchangeBodySchema,
  RequestEmailCodeBodySchema,
  VerifyEmailCodeBodySchema,
  anyMemberAuth,
  browserSessionAuth,
  AccountAvatarImportResponseSchema,
  component,
  type OperationSpec
} from "./openapi-model.js";
import {
  apiError,
  successResponse,
  sessionResponse,
  githubDeviceStartResponse,
  githubDevicePollResponse,
  acceptInviteResponse,
  accountExportResponse,
  accountDeletionResponse,
  avatarImageResponse,
  billingSummaryResponse,
  billingLinkResponse,
  tokenResponse,
  healthResponse,
  readyResponse,
  notReadyResponse,
  liveResponse
} from "./openapi-components.js";

export function foundationOperations(): OperationSpec[] {
  return [
    {
      method: "get",
      path: "/health",
      operationId: "getHealth",
      summary: "Get service health",
      tags: ["System"],
      responses: { "200": { description: "Current health status.", schema: healthResponse } }
    },

    {
      method: "get",
      path: "/ready",
      operationId: "getReadiness",
      summary: "Get readiness status",
      tags: ["System"],
      responses: {
        "200": { description: "Current readiness status.", schema: readyResponse },
        "503": {
          description: "A required runtime dependency is unavailable.",
          schema: notReadyResponse
        }
      }
    },

    {
      method: "get",
      path: "/live",
      operationId: "getLiveness",
      summary: "Get liveness status",
      tags: ["System"],
      responses: { "200": { description: "Current liveness status.", schema: liveResponse } }
    },

    {
      method: "post",
      path: "/v1/auth/request-code",
      operationId: "requestEmailCode",
      summary: "Request a one-time email code",
      tags: ["Auth"],
      requestBody: component("RequestEmailCodeBody", RequestEmailCodeBodySchema),
      responses: {
        "200": { description: "Email code request accepted.", schema: successResponse },
        "400": { description: "Invalid request body.", schema: apiError },
        "429": { description: "Too many auth attempts from this IP.", schema: apiError },
        "503": { description: "Auth is not configured.", schema: apiError }
      }
    },

    {
      method: "post",
      path: "/v1/auth/verify-code",
      operationId: "verifyEmailCode",
      summary: "Verify a one-time email code and create a browser session",
      tags: ["Auth"],
      requestBody: component("VerifyEmailCodeBody", VerifyEmailCodeBodySchema),
      responses: {
        "200": { description: "Browser session created.", schema: sessionResponse },
        "400": { description: "Invalid code or request body.", schema: apiError },
        "429": { description: "Too many auth attempts from this IP.", schema: apiError },
        "503": { description: "Auth is not configured.", schema: apiError }
      }
    },

    {
      method: "get",
      path: "/v1/auth/github/start",
      operationId: "startGithubLogin",
      summary: "Start GitHub OAuth",
      tags: ["Auth"],
      responses: {
        "302": {
          description: "Redirects to GitHub authorization.",
          headers: {
            Location: { description: "GitHub authorization URL.", schema: z.string().url() }
          }
        },
        "503": { description: "Auth is not configured.", schema: apiError }
      }
    },

    {
      method: "get",
      path: "/v1/auth/github/callback",
      operationId: "completeGithubLogin",
      summary: "Complete GitHub OAuth",
      tags: ["Auth"],
      query: GithubAuthCallbackQuerySchema,
      responses: {
        "302": {
          description: "Redirects back to the application callback URL.",
          headers: {
            Location: { description: "Application redirect URL.", schema: z.string().url() }
          }
        },
        "400": { description: "Invalid callback query.", schema: apiError },
        "503": { description: "Auth is not configured.", schema: apiError }
      }
    },

    {
      method: "post",
      path: "/v1/auth/github/device/start",
      operationId: "startGithubDeviceLogin",
      summary: "Start GitHub device login",
      tags: ["Auth"],
      requestBody: component("GithubDeviceStartBody", GithubDeviceStartBodySchema),
      responses: {
        "200": {
          description: "GitHub device authorization created.",
          schema: githubDeviceStartResponse
        },
        "400": { description: "Invalid request body.", schema: apiError },
        "429": { description: "Too many auth attempts from this IP.", schema: apiError },
        "503": { description: "GitHub device auth is unavailable.", schema: apiError }
      }
    },

    {
      method: "post",
      path: "/v1/auth/github/device/poll",
      operationId: "pollGithubDeviceLogin",
      summary: "Poll GitHub device login status",
      tags: ["Auth"],
      requestBody: component("GithubDevicePollBody", GithubDevicePollBodySchema),
      responses: {
        "200": {
          description: "Current GitHub device authorization status.",
          schema: githubDevicePollResponse
        },
        "400": { description: "Invalid request body.", schema: apiError },
        "404": { description: "Device authorization request was not found.", schema: apiError },
        "429": { description: "Too many auth attempts from this IP.", schema: apiError },
        "503": { description: "GitHub device auth is unavailable.", schema: apiError }
      }
    },

    {
      method: "post",
      path: "/v1/auth/github/device/claim",
      operationId: "claimGithubDeviceLogin",
      summary: "Claim the member token issued by GitHub device login",
      tags: ["Auth"],
      requestBody: component("GithubDeviceClaimBody", GithubDeviceClaimBodySchema),
      responses: {
        "200": { description: "Member token issued.", schema: tokenResponse },
        "400": { description: "Invalid request body.", schema: apiError },
        "404": { description: "Device authorization request was not found.", schema: apiError },
        "409": { description: "Device authorization is not claimable.", schema: apiError },
        "429": { description: "Too many auth attempts from this IP.", schema: apiError },
        "503": { description: "GitHub device auth is unavailable.", schema: apiError }
      }
    },

    {
      method: "post",
      path: "/v1/auth/github/token/exchange",
      operationId: "exchangeGithubAccessToken",
      summary: "Exchange a GitHub access token for a DebugBundle member token",
      tags: ["Auth"],
      requestBody: component("GithubTokenExchangeBody", GithubTokenExchangeBodySchema),
      responses: {
        "200": { description: "Member token issued.", schema: tokenResponse },
        "400": { description: "Invalid request body or missing GitHub email.", schema: apiError },
        "401": { description: "GitHub access token is invalid.", schema: apiError },
        "403": { description: "GitHub identity cannot bootstrap this account.", schema: apiError },
        "429": { description: "Too many auth attempts from this IP.", schema: apiError },
        "503": { description: "GitHub auth is unavailable.", schema: apiError }
      }
    },

    {
      method: "get",
      path: "/v1/auth/session",
      operationId: "getSession",
      summary: "Resolve the current browser session",
      tags: ["Auth"],
      security: browserSessionAuth,
      responses: {
        "200": {
          description: "Current browser session or null when signed out.",
          schema: sessionResponse
        },
        "503": { description: "Auth is not configured.", schema: apiError }
      }
    },

    {
      method: "post",
      path: "/v1/auth/logout",
      operationId: "logout",
      summary: "Revoke the current browser session",
      tags: ["Auth"],
      security: browserSessionAuth,
      responses: {
        "200": { description: "Browser session revoked.", schema: successResponse },
        "401": { description: "Browser session is missing or invalid.", schema: apiError },
        "503": { description: "Auth is not configured.", schema: apiError }
      }
    },

    {
      method: "post",
      path: "/v1/auth/project-invite/accept",
      operationId: "acceptInvite",
      summary: "Accept a project invite",
      tags: ["Auth"],
      security: browserSessionAuth,
      requestBody: component("AcceptInviteBody", AcceptInviteBodySchema),
      responses: {
        "200": { description: "Invite accepted.", schema: acceptInviteResponse },
        "400": { description: "Invalid invite token or payload.", schema: apiError },
        "401": { description: "Browser session is missing or invalid.", schema: apiError },
        "403": {
          description: "Invite email does not match the signed-in account.",
          schema: apiError
        },
        "503": { description: "Auth is not configured.", schema: apiError }
      }
    },

    {
      method: "get",
      path: "/v1/account/export",
      operationId: "exportAccount",
      summary: "Export retained organization account data",
      tags: ["Account"],
      security: browserSessionAuth,
      responses: {
        "200": { description: "Account export JSON attachment.", schema: accountExportResponse },
        "401": { description: "Browser session is missing or invalid.", schema: apiError },
        "403": { description: "Owner access is required.", schema: apiError },
        "404": { description: "Account export was not available.", schema: apiError },
        "503": { description: "Account management is not configured.", schema: apiError }
      }
    },

    {
      method: "get",
      path: "/v1/account/avatar",
      operationId: "getAccountAvatar",
      summary: "Get the current account avatar image",
      tags: ["Account"],
      security: browserSessionAuth,
      responses: {
        "200": { description: "Avatar image bytes.", schema: avatarImageResponse },
        "401": { description: "Browser session is missing or invalid.", schema: apiError },
        "404": { description: "Avatar was not found.", schema: apiError },
        "503": { description: "Account management is not configured.", schema: apiError }
      }
    },

    {
      method: "post",
      path: "/v1/account/avatar/import-gravatar",
      operationId: "importAccountAvatarFromGravatar",
      summary: "Import and cache a Gravatar avatar for the signed-in account",
      tags: ["Account"],
      security: browserSessionAuth,
      responses: {
        "200": {
          description: "Avatar imported and cached.",
          schema: component("AccountAvatarImportResponse", AccountAvatarImportResponseSchema)
        },
        "401": { description: "Browser session is missing or invalid.", schema: apiError },
        "404": { description: "No Gravatar image was found.", schema: apiError },
        "502": { description: "Avatar import failed.", schema: apiError },
        "503": { description: "Account management is not configured.", schema: apiError }
      }
    },

    {
      method: "post",
      path: "/v1/account/delete/request-otp",
      operationId: "requestAccountDeletionOtp",
      summary: "Request an email OTP for account deletion",
      tags: ["Account"],
      security: browserSessionAuth,
      requestBody: component("AccountDeleteRequestOtpBody", AccountDeleteRequestOtpBodySchema),
      responses: {
        "200": { description: "Deletion OTP requested.", schema: successResponse },
        "400": { description: "Invalid confirmation payload.", schema: apiError },
        "401": { description: "Browser session is missing or invalid.", schema: apiError },
        "403": { description: "Owner access is required.", schema: apiError },
        "429": {
          description: "Deletion verification requests are rate limited.",
          schema: apiError
        },
        "503": { description: "Account deletion verification is unavailable.", schema: apiError }
      }
    },

    {
      method: "delete",
      path: "/v1/account",
      operationId: "deleteAccount",
      summary: "Delete the current organization account",
      tags: ["Account"],
      security: browserSessionAuth,
      requestBody: component("AccountDeleteBody", AccountDeleteBodySchema),
      responses: {
        "200": { description: "Account deleted.", schema: accountDeletionResponse },
        "400": { description: "Invalid confirmation payload.", schema: apiError },
        "401": { description: "Browser session is missing or invalid.", schema: apiError },
        "403": { description: "Owner access is required.", schema: apiError },
        "404": { description: "Account was not found.", schema: apiError },
        "409": {
          description: "Other owner-scoped organizations or projects still exist.",
          schema: apiError
        },
        "429": { description: "Deletion attempts are rate limited.", schema: apiError },
        "503": { description: "Account management is not configured.", schema: apiError }
      }
    },

    {
      method: "get",
      path: "/v1/billing",
      operationId: "getBillingSummary",
      summary: "Get the billing summary",
      tags: ["Billing"],
      security: anyMemberAuth,
      responses: {
        "200": { description: "Billing summary.", schema: billingSummaryResponse },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "403": { description: "Owner access is required.", schema: apiError },
        "404": { description: "Billing was not found or is unavailable.", schema: apiError }
      }
    },

    {
      method: "post",
      path: "/v1/billing/checkout",
      operationId: "createBillingCheckout",
      summary: "Create a Stripe checkout link",
      tags: ["Billing"],
      security: browserSessionAuth,
      requestBody: component("BillingCheckoutBody", BillingCheckoutBodySchema),
      responses: {
        "200": { description: "Hosted checkout URL.", schema: billingLinkResponse },
        "400": { description: "Invalid request body.", schema: apiError },
        "401": { description: "Browser session is missing or invalid.", schema: apiError },
        "403": { description: "Owner access or a verified email is required.", schema: apiError },
        "404": { description: "Billing was not found or is unavailable.", schema: apiError },
        "409": { description: "Requested plan change is invalid.", schema: apiError },
        "503": { description: "Billing is not configured.", schema: apiError }
      }
    },

    {
      method: "post",
      path: "/v1/billing/checkout/confirm",
      operationId: "confirmBillingCheckout",
      summary: "Confirm a returned Stripe checkout session",
      tags: ["Billing"],
      security: browserSessionAuth,
      requestBody: component("BillingCheckoutConfirmBody", BillingCheckoutConfirmBodySchema),
      responses: {
        "200": { description: "Updated billing summary.", schema: billingSummaryResponse },
        "400": { description: "Invalid request body.", schema: apiError },
        "401": { description: "Browser session is missing or invalid.", schema: apiError },
        "403": { description: "Owner access is required.", schema: apiError },
        "404": { description: "Billing or checkout session was not found.", schema: apiError },
        "409": { description: "Checkout session is not complete.", schema: apiError },
        "503": { description: "Billing confirmation is unavailable.", schema: apiError }
      }
    },

    {
      method: "post",
      path: "/v1/billing/portal",
      operationId: "createBillingPortal",
      summary: "Create a Stripe customer portal link",
      tags: ["Billing"],
      security: browserSessionAuth,
      responses: {
        "200": { description: "Hosted billing portal URL.", schema: billingLinkResponse },
        "401": { description: "Browser session is missing or invalid.", schema: apiError },
        "403": { description: "Owner access or a verified email is required.", schema: apiError },
        "404": { description: "Billing was not found or is unavailable.", schema: apiError },
        "409": { description: "No active subscription exists.", schema: apiError },
        "503": { description: "Billing is not configured.", schema: apiError }
      }
    },

    {
      method: "post",
      path: "/v1/billing/capacity/increase",
      operationId: "increaseCapacity",
      summary: "Increase capacity immediately",
      tags: ["Billing"],
      security: anyMemberAuth,
      requestBody: component("BillingCapacityBody", BillingCapacityChangeBodySchema),
      responses: {
        "200": { description: "Updated billing summary.", schema: billingSummaryResponse },
        "400": { description: "Invalid request body.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "403": { description: "Owner access or a verified email is required.", schema: apiError },
        "404": { description: "Billing was not found or is unavailable.", schema: apiError },
        "409": { description: "Requested capacity change is invalid.", schema: apiError },
        "503": { description: "Billing is not configured.", schema: apiError }
      }
    },

    {
      method: "post",
      path: "/v1/billing/capacity/scheduled-reduction",
      operationId: "scheduleCapacityReduction",
      summary: "Schedule a capacity reduction",
      tags: ["Billing"],
      security: anyMemberAuth,
      requestBody: component("BillingCapacityBody", BillingCapacityChangeBodySchema),
      responses: {
        "200": { description: "Updated billing summary.", schema: billingSummaryResponse },
        "400": { description: "Invalid request body.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "403": { description: "Owner access or a verified email is required.", schema: apiError },
        "404": { description: "Billing was not found or is unavailable.", schema: apiError },
        "409": { description: "Requested capacity reduction is invalid.", schema: apiError },
        "503": { description: "Billing is not configured.", schema: apiError }
      }
    },

    {
      method: "delete",
      path: "/v1/billing/capacity/scheduled-reduction",
      operationId: "cancelCapacityReduction",
      summary: "Cancel a scheduled capacity reduction",
      tags: ["Billing"],
      security: anyMemberAuth,
      responses: {
        "200": { description: "Updated billing summary.", schema: billingSummaryResponse },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "403": { description: "Owner access or a verified email is required.", schema: apiError },
        "404": { description: "Billing was not found or is unavailable.", schema: apiError },
        "409": { description: "No scheduled reduction exists.", schema: apiError },
        "503": { description: "Billing is not configured.", schema: apiError }
      }
    }
  ];
}
