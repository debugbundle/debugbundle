export class MutationOutcomeUnconfirmedError extends Error {
  readonly code = "mutation_outcome_unconfirmed";
  readonly outcome = "unknown";
  readonly retrySafe = false;

  constructor(readonly status?: number) {
    super(
      "mutation_outcome_unconfirmed: The operation may have succeeded, but its result could not be confirmed. Check the current state before retrying; do not automatically repeat the mutation."
    );
    this.name = "MutationOutcomeUnconfirmedError";
  }

  toJSON(): { error: string; outcome: string; retry_safe: boolean; message: string } {
    return {
      error: this.code,
      outcome: this.outcome,
      retry_safe: this.retrySafe,
      message: this.message
    };
  }
}

export function formatMutationOutcomeError(error: unknown, json?: boolean): string | null {
  if (!(error instanceof MutationOutcomeUnconfirmedError)) return null;
  return json === true ? JSON.stringify(error.toJSON()) : error.message;
}
