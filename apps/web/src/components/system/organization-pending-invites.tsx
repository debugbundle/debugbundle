import { MetadataSeparator } from "./metadata-separator.js";
import { MailIcon } from "lucide-react";
import { ResourceEmptyState } from "./resource-empty-state.js";
import { useState } from "react";
import type { OrganizationInvite } from "../../../../../packages/shared-types/src/index.js";
import { Button } from "../ui/button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card.js";
import { PendingButton } from "./pending-button.js";

export function OrganizationPendingInvites({
  invites,
  canManageAdmin,
  pending,
  pendingAction,
  onResend,
  onCancel
}: {
  invites: OrganizationInvite[];
  canManageAdmin: boolean;
  pending: boolean;
  pendingAction: { inviteId: string; kind: "resend" | "cancel" } | null;
  onResend: (inviteId: string) => void;
  onCancel: (inviteId: string) => void;
}): JSX.Element {
  const [page, setPage] = useState(0);
  const current = Math.min(page, Math.max(0, Math.ceil(invites.length / 25) - 1));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pending invitations</CardTitle>
        <CardDescription>
          Links expire after seven days. Resending replaces the previous link and rechecks the saved
          access and available capacity.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {invites.length === 0 ? (
          <ResourceEmptyState
            icon={MailIcon}
            title="No pending invitations"
            description="Invitations awaiting acceptance will appear here."
          />
        ) : (
          <ul className="flex flex-col gap-4">
            {invites.slice(current * 25, current * 25 + 25).map((invite) => (
              <li
                key={invite.invite_id}
                className="flex flex-wrap items-center justify-between gap-3"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="break-all">{invite.email}</span>
                  <span>
                    {invite.role === "admin" ? (
                      <>
                        Admin
                        <MetadataSeparator />
                        all current and future projects
                      </>
                    ) : (
                      <>
                        {invite.default_project_role}
                        <MetadataSeparator />
                        {invite.project_access === "all"
                          ? "all current and future projects"
                          : `${invite.project_ids.length} selected projects`}
                      </>
                    )}
                  </span>
                </div>
                {invite.role === "admin" && !canManageAdmin ? (
                  <span>Owner manages Admin invitations</span>
                ) : (
                  <div className="flex gap-2">
                    <PendingButton
                      variant="outline"
                      size="sm"
                      pending={
                        pending &&
                        pendingAction?.inviteId === invite.invite_id &&
                        pendingAction.kind === "resend"
                      }
                      disabled={pending}
                      onClick={() => onResend(invite.invite_id)}
                    >
                      Resend
                    </PendingButton>
                    <PendingButton
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      pending={
                        pending &&
                        pendingAction?.inviteId === invite.invite_id &&
                        pendingAction.kind === "cancel"
                      }
                      onClick={() => onCancel(invite.invite_id)}
                    >
                      Cancel invitation
                    </PendingButton>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {invites.length > 25 ? (
          <div className="flex items-center justify-between gap-2">
            <Button variant="outline" disabled={current === 0} onClick={() => setPage(current - 1)}>
              Previous invitations
            </Button>
            <span>
              Page {current + 1} of {Math.ceil(invites.length / 25)}
            </span>
            <Button
              variant="outline"
              disabled={(current + 1) * 25 >= invites.length}
              onClick={() => setPage(current + 1)}
            >
              Next invitations
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
