// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ReportDeliveryStates } from "../../../apps/web/src/components/system/report-delivery-states.js";
import {
  reportEmailDeliveryFixture,
  reportOrg,
  reportProject,
  reportRequest
} from "../../helpers/smart-reports.js";
afterEach(cleanup);

it("keeps recipient labels private when identities are removed or the saved scope changes", () => {
  const acceptedAt = "2026-11-09T12:00:00.000Z";
  const deliveries = [
    { ...reportEmailDeliveryFixture(), id: "removed", recipient_user_id: null },
    { ...reportEmailDeliveryFixture(), id: "self", recipient_user_id: reportOrg },
    { ...reportEmailDeliveryFixture(), id: "saved", recipient_user_id: reportProject },
    {
      ...reportEmailDeliveryFixture(),
      id: "unlisted",
      recipient_user_id: reportRequest,
      status: "accepted" as const,
      reason: null,
      accepted_at: acceptedAt
    }
  ];
  render(
    <ReportDeliveryStates
      deliveries={deliveries}
      recipientIds={[reportOrg, reportProject]}
      currentUserId={reportOrg}
    />
  );
  expect(screen.getByText("Recipient no longer available")).toBeVisible();
  expect(screen.getByText("You")).toBeVisible();
  expect(screen.getByText("Saved recipient 2")).toBeVisible();
  expect(screen.getByText("Saved recipient 4")).toBeVisible();
  expect(screen.getByText(`Accepted ${acceptedAt}`)).toBeVisible();
  for (const identity of [reportOrg, reportProject, reportRequest])
    expect(screen.queryByText(identity)).not.toBeInTheDocument();
});
