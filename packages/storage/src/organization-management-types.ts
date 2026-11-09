import type {
  OrganizationInvite,
  OrganizationInviteBody,
  OrganizationMemberUpdate,
  OrganizationPerson,
  OrganizationSummary
} from "../../shared-types/src/index.js";

export interface OrganizationActor {
  organization_id: string;
  actor_user_id: string;
  /** Trusted principal context; omitted for legacy tokens. */
  include_organization_grants?: boolean;
}
export interface OrganizationManagementStore {
  listOrganizationsForUser(userId: string): Promise<OrganizationSummary[]>;
  listOrganizationPeople(input: OrganizationActor): Promise<OrganizationPerson[]>;
  listOrganizationInvites(input: OrganizationActor): Promise<OrganizationInvite[]>;
  createOrganizationInvite(
    input: OrganizationActor &
      OrganizationInviteBody & { invite_token_hash: string; expires_at: string }
  ): Promise<OrganizationInvite>;
  cancelOrganizationInvite(input: OrganizationActor & { invite_id: string }): Promise<boolean>;
  refreshOrganizationInvite(
    input: OrganizationActor & { invite_id: string; invite_token_hash: string; expires_at: string }
  ): Promise<OrganizationInvite>;
  acceptOrganizationInvite(input: {
    user_id: string;
    invite_token_hash: string;
    now: string;
  }): Promise<{ organization_id: string }>;
  updateOrganizationPerson(
    input: OrganizationActor & { user_id: string; changes: OrganizationMemberUpdate }
  ): Promise<void>;
  removeOrganizationPerson(input: OrganizationActor & { user_id: string }): Promise<void>;
  requestOrganizationOwnershipTransfer(
    input: OrganizationActor & {
      recipient_user_id: string;
      accept_token_hash: string;
      expires_at: string;
    }
  ): Promise<{ transfer_id: string }>;
  getOrganizationOwnershipTransfer(
    input: OrganizationActor
  ): Promise<{ transfer_id: string; recipient_user_id: string; expires_at: string } | null>;
  cancelOrganizationOwnershipTransfer(input: OrganizationActor): Promise<boolean>;
  acceptOrganizationOwnershipTransfer(input: {
    user_id: string;
    accept_token_hash: string;
    now: string;
  }): Promise<{ organization_id: string }>;
  switchSessionOrganization(input: {
    user_id: string;
    session_token_hash: string;
    organization_id: string;
  }): Promise<boolean>;
}

export class OrganizationManagementError extends Error {
  constructor(
    readonly code:
      | "forbidden"
      | "upgrade_required"
      | "not_found"
      | "people_limit_reached"
      | "invite_exists"
      | "invalid_invite"
      | "email_verification_required"
      | "invalid_project_scope"
      | "ownership_transfer_unavailable"
  ) {
    super(code);
    this.name = "OrganizationManagementError";
  }
}
