import { describe, expect, it, vi } from "vitest";

import {
  createPostgresSlackDestinationStore,
  type Queryable
} from "../../../packages/storage/src/index.js";

function rowsResult<Row extends Record<string, unknown>>(rows: Row[]): { rows: Row[] } {
  return { rows };
}

describe("postgres slack destination store", () => {
  it("lists destinations for a scoped project and returns null for an out-of-scope project", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce(rowsResult([{ id: "proj_123" }]))
      .mockResolvedValueOnce(
        rowsResult([
          {
            slack_destination_id: "sd_123",
            organization_id: "org_123",
            slack_team_id: "T123",
            slack_team_name: "Acme",
            slack_channel_id: "C123",
            slack_channel_name: "#alerts",
            installed_by_member_id: "usr_123",
            webhook_url_ciphertext: "encv1.iv.tag.payload",
            is_active: true,
            created_at: "2026-05-13T10:00:00.000Z",
            updated_at: "2026-05-13T10:00:00.000Z"
          }
        ])
      )
      .mockResolvedValueOnce(rowsResult([]));

    const store = createPostgresSlackDestinationStore({ query } as Queryable);

    await expect(
      store.listSlackDestinationsForProjectInOrganization({
        organization_id: "org_123",
        project_id: "proj_123",
        limit: 20
      })
    ).resolves.toEqual([
      expect.objectContaining({
        slack_destination_id: "sd_123",
        slack_team_id: "T123",
        slack_channel_id: "C123"
      })
    ]);

    await expect(
      store.listSlackDestinationsForProjectInOrganization({
        organization_id: "org_123",
        project_id: "proj_missing",
        limit: 20
      })
    ).resolves.toBeNull();

    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("LIMIT $2"),
      ["org_123", 20]
    );
  });

  it("upserts and fetches delivery secrets for destinations", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce(
        rowsResult([
          {
            slack_destination_id: "sd_123",
            organization_id: "org_123",
            slack_team_id: "T123",
            slack_team_name: "Acme",
            slack_channel_id: "C123",
            slack_channel_name: "#alerts",
            installed_by_member_id: "usr_123",
            webhook_url_ciphertext: "encv1.iv.tag.payload",
            is_active: true,
            created_at: "2026-05-13T10:00:00.000Z",
            updated_at: "2026-05-13T10:00:00.000Z"
          }
        ])
      )
      .mockResolvedValueOnce(
        rowsResult([
          {
            slack_destination_id: "sd_123",
            organization_id: "org_123",
            slack_team_id: "T123",
            slack_team_name: "Acme",
            slack_channel_id: "C123",
            slack_channel_name: "#alerts",
            installed_by_member_id: "usr_123",
            webhook_url_ciphertext: "encv1.iv.tag.payload",
            is_active: true,
            created_at: "2026-05-13T10:00:00.000Z",
            updated_at: "2026-05-13T10:00:00.000Z"
          }
        ])
      );

    const store = createPostgresSlackDestinationStore({ query } as Queryable);

    await expect(
      store.upsertSlackDestinationForOrganization({
        organization_id: "org_123",
        slack_team_id: "T123",
        slack_team_name: "Acme",
        slack_channel_id: "C123",
        slack_channel_name: "#alerts",
        webhook_url_ciphertext: "encv1.iv.tag.payload",
        installed_by_member_id: "usr_123"
      })
    ).resolves.toEqual(
      expect.objectContaining({
        slack_destination_id: "sd_123",
        slack_team_name: "Acme",
        slack_channel_name: "#alerts"
      })
    );

    await expect(
      store.getSlackDestinationSecretForDelivery({
        slack_destination_id: "sd_123"
      })
    ).resolves.toEqual(
      expect.objectContaining({
        slack_destination_id: "sd_123",
        webhook_url_ciphertext: "encv1.iv.tag.payload"
      })
    );
  });

  it("deletes only destinations visible from the scoped project", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce(rowsResult([{ in_use: false }]))
      .mockResolvedValueOnce(rowsResult([{ slack_destination_id: "sd_123" }]));
    const store = createPostgresSlackDestinationStore({ query } as Queryable);

    await expect(
      store.deleteSlackDestinationForProjectInOrganization({
        organization_id: "org_123",
        project_id: "proj_123",
        slack_destination_id: "sd_123"
      })
    ).resolves.toEqual({ slack_destination_id: "sd_123" });

    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("DELETE FROM slack_destinations"),
      ["org_123", "proj_123", "sd_123"]
    );
  });
});
