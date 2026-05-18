import { describe, expect, it, vi } from "vitest";

import {
  queueAllowanceLimitReachedNotification,
  queueAllowanceThresholdNotifications,
  queueRetentionRotationNotice
} from "../../../packages/storage/src/operational-email-notifications.js";
import type { OperationalEmailDeliveryStore } from "../../../packages/storage/src/types.js";

function createStoreMock(): Pick<OperationalEmailDeliveryStore, "queueProjectOperationalEmailDelivery"> {
  return {
    queueProjectOperationalEmailDelivery: vi.fn().mockResolvedValue({
      delivery_id: "opem_123",
      created: true
    })
  };
}

describe("operational email notifications", () => {
  it("queues a monthly 80 percent warning with usage-window dedupe", async (): Promise<void> => {
    const store = createStoreMock();

    await queueAllowanceThresholdNotifications({
      store,
      project_id: "proj_123",
      meter: "monthly_bundle_requests",
      previous_used: 19,
      next_used: 20,
      limit: 25,
      usage_window_starts_at: "2026-05-01T00:00:00.000Z",
      usage_window_ends_at: "2026-06-01T00:00:00.000Z"
    });

    expect(store.queueProjectOperationalEmailDelivery).toHaveBeenCalledOnce();
    expect(store.queueProjectOperationalEmailDelivery).toHaveBeenCalledWith({
      project_id: "proj_123",
      kind: "allowance_warning_80",
      dedupe_key: "allowance_warning_80:monthly_bundle_requests:window:2026-05-01T00:00:00.000Z",
      payload: {
        meter: "monthly_bundle_requests",
        used: 20,
        limit: 25,
        usage_window_ends_at: "2026-06-01T00:00:00.000Z"
      }
    });
  });

  it("queues a retained-bundle limit email with cap-based dedupe", async (): Promise<void> => {
    const store = createStoreMock();

    await queueAllowanceLimitReachedNotification({
      store,
      project_id: "proj_123",
      meter: "retained_bundle_cap",
      used: 450,
      limit: 450
    });

    expect(store.queueProjectOperationalEmailDelivery).toHaveBeenCalledOnce();
    expect(store.queueProjectOperationalEmailDelivery).toHaveBeenCalledWith({
      project_id: "proj_123",
      kind: "allowance_limit_reached",
      dedupe_key: "allowance_limit_reached:retained_bundle_cap:limit:450",
      payload: {
        meter: "retained_bundle_cap",
        used: 450,
        limit: 450,
        usage_window_ends_at: null
      }
    });
  });

  it("queues one retention rotation notice per dedupe date", async (): Promise<void> => {
    const store = createStoreMock();

    await queueRetentionRotationNotice({
      store,
      project_id: "proj_123",
      rotated_owner_count: 3,
      retained_bundle_limit: 450,
      dedupe_date: "2026-05-18"
    });

    expect(store.queueProjectOperationalEmailDelivery).toHaveBeenCalledOnce();
    expect(store.queueProjectOperationalEmailDelivery).toHaveBeenCalledWith({
      project_id: "proj_123",
      kind: "retention_rotation_notice",
      dedupe_key: "retention_rotation_notice:2026-05-18",
      payload: {
        rotated_owner_count: 3,
        retained_bundle_limit: 450
      }
    });
  });
});
