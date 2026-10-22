import { billingPlanChangeOperations } from "./openapi-billing-plan-change.js";
import {
  z,
  AccountDeleteBodySchema,
  AccountDeleteRequestOtpBodySchema,
  AcceptInviteBodySchema,
  BillingCheckoutBodySchema,
  BillingCheckoutConfirmBodySchema,
  BillingCapacityChangeBodySchema,
  GithubAuthCallbackQuerySchema,
  GithubSignupStartQuerySchema,
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
    ...billingPlanChangeOperations(),
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
      query: GithubSignupStartQuerySchema,
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
      path: "/v1/billing/upgrade/preview",
      operationId: "previewBillingUpgrade",
      summary: "Preview a same-subscription Solo to Team upgrade",
      tags: ["Billing"],
      security: browserSessionAuth,
      requestBody: component("BillingUpgradePreviewBody", z.object({}).strict()),
      responses: {
        "200": {
          description:
            "A ten-minute confirmation quote, or the existing unpaid invoice to resume. This preview makes no payment mutation.",
          schema: component(
            "BillingUpgradePreviewResponse",
            z.union([
              z.object({
                quote: z.object({
                  confirmation_token: z.string(),
                  expires_at: z.string().datetime(),
                  currency: z.string(),
                  amount_due: z.number().int(),
                  tax: z.number().int(),
                  monthly_total: z.number().int(),
                  additional_capacity_units: z.number().int()
                })
              }),
              z.object({ payment_url: z.string().url() })
            ])
          )
        },
        "400": { description: "Invalid payload.", schema: apiError },
        "401": { description: "Invalid browser session.", schema: apiError },
        "403": { description: "Verified owner session and CSRF token required.", schema: apiError },
        "409": { description: "Unsafe plan change or an unresolved operation.", schema: apiError },
        "429": { description: "Rate limit reached.", schema: apiError },
        "503": { description: "Billing service unavailable.", schema: apiError }
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
        "200": {
          description:
            "Hosted Checkout URL for a new subscription, the same paid-upgrade invoice URL for authentication/payment recovery, or the billing return URL after that upgrade is applied.",
          schema: billingLinkResponse
        },
        "400": { description: "Invalid request body.", schema: apiError },
        "401": { description: "Browser session is missing or invalid.", schema: apiError },
        "403": { description: "Owner access or a verified email is required.", schema: apiError },
        "404": { description: "Billing was not found or is unavailable.", schema: apiError },
        "409": {
          description:
            "Invalid or unsafe plan change, first paid purchase locked until seven full trial days (paid_purchase_locked), or a durable checkout/subscription operation is still in progress.",
          schema: apiError
        },
        "429": {
          description: "Checkout admission limit reached; Retry-After is returned.",
          schema: apiError
        },
        "503": {
          description:
            "Billing is not configured or provider/persistence work failed; uncertain reservations remain retained.",
          schema: apiError
        }
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
        "200": {
          description:
            "Confirmed applied capacity, or an existing Stripe invoice requiring payment/authentication. Capacity remains unchanged until payment applies.",
          schema: {
            oneOf: [
              billingSummaryResponse,
              component(
                "BillingCapacityPaymentRequired",
                z.object({ payment_required: z.object({ url: z.string().url() }) })
              )
            ]
          }
        },
        "400": { description: "Invalid request body.", schema: apiError },
        "401": { description: "Authentication is invalid.", schema: apiError },
        "403": { description: "Owner access or a verified email is required.", schema: apiError },
        "404": { description: "Billing was not found or is unavailable.", schema: apiError },
        "409": {
          description:
            "Requested capacity change is invalid or another durable subscription operation is pending (billing_change_in_progress).",
          schema: apiError
        },
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
        "409": {
          description:
            "Requested capacity reduction is invalid or another durable subscription operation is pending (billing_change_in_progress).",
          schema: apiError
        },
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
        "409": {
          description:
            "No scheduled reduction exists or another durable subscription operation is pending (billing_change_in_progress).",
          schema: apiError
        },
        "503": { description: "Billing is not configured.", schema: apiError }
      }
    }
  ];
}
