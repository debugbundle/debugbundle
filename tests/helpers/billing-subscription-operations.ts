import type {
  BillingSubscriptionOperation,
  BillingSubscriptionOperationStore
} from "../../packages/storage/src/billing-subscription-operation-store.js";

// Composition tests use a memory reservation; SQL concurrency/fencing is proved
// separately against disposable PostgreSQL, including the real API dependency.
export function createMemoryBillingSubscriptionOperationStore(
  subscriptionId = "sub_123",
  customerId = "cus_123",
  idPrefix = "test_attempt",
  clock: () => number = Date.now
): BillingSubscriptionOperationStore {
  let current: BillingSubscriptionOperation | null = null;
  let sequence = 0;
  return {
    async get() {
      return current === null ? null : structuredClone(current);
    },
    async claim(input) {
      if (
        current &&
        current.completed_at === null &&
        (current.kind !== input.kind ||
          JSON.stringify(current.intent) !== JSON.stringify(input.intent))
      )
        return "billing_change_in_progress";
      if (!current || current.completed_at !== null) {
        if (
          input.expected_operation_id !== undefined &&
          input.expected_operation_id !== (current?.id ?? null)
        )
          return "billing_change_in_progress";
        current = {
          ...input,
          id: `${idPrefix}_${++sequence}`,
          subscription_id: subscriptionId,
          customer_id: customerId,
          parameters: null,
          resource_id: null,
          created_at: new Date(clock()).toISOString(),
          completed_at: null
        };
      }
      return structuredClone(current);
    },
    async prepare(_org, id, parameters) {
      if (current?.id !== id) return null;
      current.parameters ??= parameters;
      return structuredClone(current);
    },
    async saveResource(_org, id, resource) {
      if (current?.id !== id) return false;
      current.resource_id = resource;
      return true;
    },
    async complete(_org, id) {
      if (current?.id !== id) return false;
      current.completed_at = new Date(clock()).toISOString();
      return true;
    },
    async abandonUnprepared(_org, id) {
      if (current?.id !== id || current.parameters !== null) return false;
      current.completed_at = new Date(clock()).toISOString();
      return true;
    },
    async retireVoidedPayment(_org, id, invoice) {
      if (current?.id !== id || current.resource_id !== invoice) return false;
      current.completed_at = new Date(clock()).toISOString();
      return true;
    }
  };
}
