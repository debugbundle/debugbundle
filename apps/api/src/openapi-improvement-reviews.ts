import { z } from "zod";
import { ReviewPlanDocumentSchema } from "../../../packages/smart-improvements/src/review-planning-contract.js";
import {
  ReviewSettingsSchema,
  ReviewSettingsCommandSchema,
  ReviewRecordSchema,
  ReviewArtifactSchema,
  ReviewListQuerySchema,
  ReviewAllowanceSchema,
  ReviewStatusSchema
} from "../../../packages/smart-improvements/src/review-contract.js";
import { anyMemberAuth, component, type OperationSpec } from "./openapi-model.js";
import { apiError } from "./openapi-components.js";
const base = "/v1/organizations/{organizationId}/improvements/reviews";
const scope = z.object({ organizationId: z.uuid() }).strict(),
  identity = scope.extend({ reviewId: z.uuid() });
const failures = {
  "400": { description: "Invalid bounded input.", schema: apiError },
  "401": { description: "Member/session authentication required.", schema: apiError },
  "403": {
    description: "Current whole-scope access, Owner authority, consent or plan denied.",
    schema: apiError
  },
  "404": { description: "Review unavailable or expired.", schema: apiError },
  "409": { description: "Settings version or workspace changed.", schema: apiError },
  "429": { description: "Request rate limit reached.", schema: apiError },
  "503": {
    description: "New automatic reviews are temporarily unavailable.",
    schema: apiError
  },
  "500": { description: "Operation failed safely.", schema: apiError }
};
export function improvementReviewOperations(): OperationSpec[] {
  const metadata = { tags: ["Improvements"], security: anyMemberAuth };
  return [
    {
      ...metadata,
      method: "get",
      path: `${base}/{reviewId}/plan`,
      operationId: "getImprovementReviewPlan",
      summary:
        "Read saved weekly guidance and supported configuration checks without generating work",
      params: identity,
      responses: {
        ...failures,
        "200": {
          description:
            "Private/no-store evidence-linked investigation, noise, flow and verification plan. Existing exports remain unchanged; older archives have no configuration snapshot.",
          schema: component(
            "ImprovementReviewPlanResponse",
            z
              .object({ bundle: ReviewPlanDocumentSchema.nullable(), status: ReviewStatusSchema })
              .strict()
          )
        }
      }
    },
    {
      ...metadata,
      method: "get",
      path: base,
      operationId: "listImprovementReviews",
      summary: "List retained weekly project reviews without generating work",
      params: scope,
      query: ReviewListQuerySchema,
      responses: {
        ...failures,
        "200": {
          description:
            "Private/no-store authorised reviews and opaque cursor; inaccessible rows never expand scope.",
          schema: component(
            "ImprovementReviewList",
            z
              .object({
                reviews: z.array(ReviewRecordSchema).max(50),
                next_cursor: z.string().nullable()
              })
              .strict()
          )
        }
      }
    },
    {
      ...metadata,
      method: "get",
      path: `${base}/{reviewId}`,
      operationId: "getImprovementReview",
      summary: "Read existing review metadata under its entire frozen scope",
      params: identity,
      responses: {
        ...failures,
        "200": {
          description: "Current access and privacy required, including archives after downgrade.",
          schema: component(
            "ImprovementReviewResponse",
            z.object({ review: ReviewRecordSchema }).strict()
          )
        }
      }
    },
    {
      ...metadata,
      method: "get",
      path: `${base}/{reviewId}/bundle`,
      operationId: "getImprovementReviewBundle",
      summary:
        "Read a versioned evidence-backed review artifact; pending results never enqueue work",
      params: identity,
      responses: {
        ...failures,
        "200": {
          description:
            "Bounded deterministic facts/priorities and optional validated untrusted investigation guidance. No raw logs, request bodies, session identities or provider receipts.",
          schema: component(
            "ImprovementReviewBundle",
            z
              .object({ bundle: ReviewArtifactSchema.nullable(), status: ReviewStatusSchema })
              .strict()
          )
        }
      }
    },
    {
      ...metadata,
      method: "get",
      path: `${base}/settings`,
      operationId: "getImprovementReviewSettings",
      summary: "Read explicit weekly scope, consent and pause state",
      params: scope,
      responses: {
        ...failures,
        "200": {
          description: "Existing customers default disabled; selected current projects only.",
          schema: component(
            "ImprovementReviewSettingsResponse",
            z.object({ settings: ReviewSettingsSchema }).strict()
          )
        }
      }
    },
    {
      ...metadata,
      method: "patch",
      path: `${base}/settings`,
      operationId: "updateImprovementReviewSettings",
      summary: "Owner replaces weekly review settings with version, scope and evidence consent",
      params: scope,
      requestBody: component("ImprovementReviewSettingsCommand", ReviewSettingsCommandSchema),
      responses: {
        ...failures,
        "200": {
          description:
            "Enabling authorises recurring work under its independent allowance. Removing scope/consent or narrowing privacy removes affected derived content; paid uncertainty stays held. No email, code edits or actions are performed.",
          schema: component(
            "ImprovementReviewSettingsUpdated",
            z.object({ settings: ReviewSettingsSchema }).strict()
          )
        }
      }
    },
    {
      ...metadata,
      method: "get",
      path: `${base}/allowance`,
      operationId: "getImprovementReviewAllowance",
      summary: "Read the independent monthly review pool without reserving quota",
      params: scope,
      responses: {
        ...failures,
        "200": {
          description:
            "Anchored billing-month allowance, shared by the selected projects and independent from report/bundle/capacity pools.",
          schema: component(
            "ImprovementReviewAllowanceResponse",
            z.object({ allowance: ReviewAllowanceSchema }).strict()
          )
        }
      }
    }
  ];
}
