import { createHash } from "node:crypto";

export interface OpenAiRequestRateLimiter {
  checkAvailability?(): Promise<void>;
  claimRequest(input: {
    ip: string;
    subject?: string;
    bucket?: string;
    limit: number;
    now?: string;
  }): Promise<{ allowed: boolean; retry_after_ms: number }>;
}

export interface OpenAiMcpAdmissionCoordinator extends OpenAiRequestRateLimiter {
  acquireConcurrency(input: {
    bucket: string;
    subject: string;
    limit: number;
    leaseMs: number;
  }): Promise<{ acquired: boolean; lease_id: string; retry_after_ms: number }>;
  releaseConcurrency(input: { bucket: string; subject: string; leaseId: string }): Promise<void>;
}

export function pseudonymousOpenAiSubject(category: string, value: string): string {
  return createHash("sha256").update(`${category}:${value}`, "utf8").digest("hex");
}

export async function claimOpenAiRateLimits(input: {
  limiter: OpenAiRequestRateLimiter | undefined;
  ip: string;
  claims: Array<{ bucket: string; subject: string; limit: number }>;
}): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  if (input.limiter === undefined) {
    return { allowed: true, retryAfterSeconds: 0 };
  }
  for (const claim of input.claims) {
    const result = await input.limiter.claimRequest({
      ip: input.ip,
      bucket: claim.bucket,
      subject: claim.subject,
      limit: claim.limit
    });
    if (!result.allowed) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil(result.retry_after_ms / 1_000))
      };
    }
  }
  return { allowed: true, retryAfterSeconds: 0 };
}
