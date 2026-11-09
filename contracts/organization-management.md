# Organisation management

Implements FR-BUS-02 / AC-BUS-02–03 in [the Business contract](../spec/business-tier.md).
These are additive member-authenticated API routes. Business organisation Admin
rights require a browser session or a new credential with explicit organisation
scope and `organization:admin`. Legacy tokens retain direct/owner authority and
do not inherit new Admin rights. The domain store rechecks every live role,
membership, plan and suspension; client role assertions are never authoritative.

| Operation                           | API                                                        |
| ----------------------------------- | ---------------------------------------------------------- |
| List live memberships               | `GET /v1/organizations`                                    |
| Select browser context              | `POST /v1/organizations/switch`                            |
| List retained people                | `GET /v1/organizations/:id/people`                         |
| Change member role/grant/suspension | `PATCH /v1/organizations/:id/people/:userId`               |
| Remove org/direct access            | `DELETE /v1/organizations/:id/people/:userId`              |
| List pending org invitations        | `GET /v1/organizations/:id/invites`                        |
| Invite a member                     | `POST /v1/organizations/:id/invites`                       |
| Resend saved access                 | `POST /v1/organizations/:id/invites/:inviteId/resend`      |
| Cancel an invitation                | `DELETE /v1/organizations/:id/invites/:inviteId`           |
| Accept a verified invitation        | `POST /v1/organizations/invites/accept`                    |
| View pending transfer               | `GET /v1/organizations/:id/ownership-transfer`             |
| Request / cancel transfer           | `POST` / `DELETE /v1/organizations/:id/ownership-transfer` |
| Accept transfer                     | `POST /v1/organizations/ownership-transfer/accept`         |

Organisation Member grants are explicit `selected` or `all`, with future-project
default `member` or `viewer`. Admin inherits administration of all current/future
projects. Only the Owner can appoint/manage an Admin; neither may remove/demote
the Owner through member updates. Existing project Admin peer-management rights
remain. Suspension denies every grant source. Removing a person revokes their
org/direct memberships, pending invitations addressed to or issued by them, and org-issued credentials; it keeps
the human identity and unrelated organisations intact. Retained merged origins
use narrow transaction contexts for removal and accepted ownership transfer;
ordinary configuration mutations keep the existing merge fences.

Team/Business admission counts the Owner, org members, direct collaborators and
pending normalised-email reservations once across the whole organisation.
Suspended membership still counts. Creation and acceptance serialise on the
organisation row before project fences. A new distinct identity above 1,000
returns `people_limit_reached` (org invitation) or the compatible
`collaborator_limit_reached` (project invitation/acceptance). Expired/cancelled
invitations do not reserve places.

Org invitations last seven days and require a verified matching identity at
acceptance. The inviter's current delegation is rechecked. Resending rotates the hash, invalidates the prior link and rechecks the saved access and capacity, including expired reservations. Selected project IDs are accepted only for selected Member invitations; inherited access is never materialised as direct roles. Acceptance does not
silently replace existing grants or reactivate a suspended/paused membership.
Selected direct grants never overwrite stronger existing project roles.

Switching modifies only an existing live browser session and requires a live
target membership. It never rewrites bearer-token context. Ownership request,
cancellation and acceptance require verified human sessions. The recipient must
be a live verified member. Acceptance atomically changes the primary Owner and
all project owner references, retaining IDs, billing subscription and explicit
grants. The former Owner becomes selected Member; personal credentials never
change owners. The current Owner may cancel a pending request. Requests expire
after two days.

New invitation/transfer email links use distinct opaque token prefixes and
server-stored hashes. Responses never return acceptance plaintext. Creation, resend and ownership emails share the existing 30/minute management-write budget per organisation (in addition to caller throttling). Missing mail
configuration fails before creating a request. Delivery failure returns 503 with
non-secret pending metadata; an authorised administrator can resend/cancel the invitation or the Owner can
replace/cancel the transfer. It does not silently grant access.

Browser People settings live at `/settings/people`; workspace selection changes the live session context and remounts private page state. Ownership and invitation acceptance use `/organizations/accept`; neither link is consumed by GET. Paused inherited grants require explicit Owner review. Direct grants retain their existing project settings workflow.

Ordinary CLI `debugbundle organization` supports `list`, `people`, `invites`, `invite`, `resend-invite`, `cancel-invite`, `update-person`, `remove-person` and `transfer-status`. The ordinary MCP equivalents are `list_organizations`, `list_organization_people`, `list_organization_invites`, `invite_organization_member`, `resend_organization_invite`, `cancel_organization_invite`, `update_organization_member`, `remove_organization_member` and `get_organization_ownership_transfer`. Both use the same validated organisation client and API domain. Acceptance, switching and ownership mutation adapters preserve the verified interactive browser requirement; they do not bypass it. Hosted/restricted MCP catalogues are unchanged.

All organisation mutations produce metadata-only security audit events, including failures; audit failure remains fail-open. The worker prunes terminal invitation and ownership-acceptance credentials 90 days after acceptance, cancellation or expiry, in bounded batches. Active or recently terminal requests and live memberships remain intact. Both API and worker readiness require the forward schema before runtime starts.

Local qualification covers queued authority, credential redaction, downgrade pausing/contact synchronisation and regressions; see [the qualification record](../spec/business-tier-qualification-20261108.md).

Ownership acceptance also commits a `sync-billing-contact` durable worker intent.
It contains organisation/transfer IDs only. The post-commit worker resolves the
current Owner and linked customer, updates only its email with a stable
idempotency key, and rereads ownership after acknowledgement. A concurrent
transfer or uncertain provider response stays retryable; it never creates or
replaces a customer/subscription or holds a database lock during Stripe calls.
`STRIPE_SECRET_KEY` is optional for self-hosted debugging; hosted billing must
provide it to the worker before ownership transfer is enabled. Exhausted jobs
remain visible through the existing operator job inspection/retry workflow.
