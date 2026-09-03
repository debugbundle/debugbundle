export interface IngestionRateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retry_after_ms: number;
}

export interface IngestionRateLimiter {
  claimEvents(input: {
    token_hash: string;
    project_id: string;
    event_count: number;
    limit: number;
    now?: string;
  }): Promise<IngestionRateLimitResult>;
}

export interface AuthRateLimiter {
  claimRequest(input: {
    ip: string;
    subject?: string;
    bucket?: string;
    limit: number;
    now?: string;
  }): Promise<IngestionRateLimitResult>;
  checkAvailability?(): Promise<void>;
  acquireConcurrency?(input: {
    bucket: string;
    subject: string;
    limit: number;
    leaseMs: number;
  }): Promise<{ acquired: boolean; lease_id: string; retry_after_ms: number }>;
  releaseConcurrency?(input: { bucket: string; subject: string; leaseId: string }): Promise<void>;
  getOpenAiCimdResponse?(url: string): Promise<string | undefined>;
  setOpenAiCimdResponse?(url: string, response: string, ttlMs: number): Promise<void>;
  claimOpenAiClientAssertionJti?(input: {
    issuer: string;
    jti: string;
    expiresAt: number;
  }): Promise<boolean>;
}

export interface OpenAiCoordinationService extends AuthRateLimiter {
  checkAvailability(): Promise<void>;
  acquireConcurrency(input: {
    bucket: string;
    subject: string;
    limit: number;
    leaseMs: number;
  }): Promise<{ acquired: boolean; lease_id: string; retry_after_ms: number }>;
  releaseConcurrency(input: { bucket: string; subject: string; leaseId: string }): Promise<void>;
  getOpenAiCimdResponse(url: string): Promise<string | undefined>;
  setOpenAiCimdResponse(url: string, response: string, ttlMs: number): Promise<void>;
  claimOpenAiClientAssertionJti(input: {
    issuer: string;
    jti: string;
    expiresAt: number;
  }): Promise<boolean>;
}
