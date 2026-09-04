# OpenAI Plugin Consent And Reviewer Access Design Proposal

Status: Owner-approved 2026-08-30; aggregate-analytics extension approved 2026-09-02; implemented and deployed for owner-approved Developer Mode validation; keyboard and screen-reader review pending
Version: 1.0
Last updated: 2026-09-04

## Purpose and approval boundary

This proposal defines the UI and interaction contract required to finish the OpenAI plugin OAuth consent, revocation, and synthetic-reviewer flows. It follows `spec/design-system.md`, `rules/design-discipline.md`, and the existing web authentication patterns. Approval of the OpenAI production plan did not originally approve these UI changes; the owner explicitly approved this proposal on 2026-08-30 and authorized implementation using the existing app UI/UX and design-system workflow.

The standard OAuth pattern is recommended: a focused full-page authorization surface with a single primary decision, followed by a normal connected-apps revocation surface. No custom MCP UI, embedded tool UI, or parallel visual system is proposed.

## Human tasks

Normal member:

1. Sign in through the existing DebugBundle login flow if no verified browser session exists.
2. Understand which OpenAI client is requesting access, which DebugBundle organization will be linked, and what data can leave DebugBundle.
3. Select the requested read scopes, approve or deny access, and return to ChatGPT/Codex.
4. Later inspect and revoke the connection from DebugBundle settings.

OpenAI reviewer:

1. Open the same OAuth interaction from a fresh browser without email, SMS, MFA, or private-network access.
2. Enter the portal-delivered review credential in a POST-backed form.
3. Be connected only to the fixed synthetic reviewer organization and project.
4. Never see or choose a customer organization.

## Chosen patterns

### Normal consent

Use a dedicated public-auth template route at `app.debugbundle.com/oauth/consent`, based on the existing `AuthLayout` and `AuthCard` composition. This is a short, focused authorization task, so a full-page auth surface is clearer and safer than a modal, drawer, or dashboard page.

The page contains:

- DebugBundle brand lockup and `Connect DebugBundle to ChatGPT and Codex` heading;
- requesting client, publisher, and selected organization in a compact definition list;
- a fixed verified-identity row for `openid` and `email`, explaining that UserInfo supplies only a verified email for managed-workspace restrictions;
- six checked product-scope rows using standard checkboxes, plain-language labels, and concise data-category descriptions;
- a prominent read-only notice stating that the plugin cannot modify projects, resolve incidents, delete data, reconfigure checks, or send messages;
- an explicit data-transfer notice covering incidents, redacted artifacts/reproductions, improvements, aggregate product analytics, and endpoint-health evidence;
- primary `Allow access` and secondary `Deny` actions; and
- privacy, terms, and revocation links.

The interaction identifier may appear in the application URL. Credentials, OAuth codes, assertions, tokens, email addresses, organization IDs, project IDs, and customer data must not appear in URLs or browser history.

### Reviewer credential

Use the same public-auth template at `app.debugbundle.com/oauth/reviewer`, with one labeled password-style credential field and primary `Continue to synthetic review project` action. Supporting copy must state that this path is for OpenAI review, expires automatically, and opens only deterministic synthetic data. Do not present organization or project selection.

The credential is paste-friendly, never revealed after entry, submitted only in a POST body, and cleared from component state immediately after the response. The page must not save it to local storage, session storage, autofill history, analytics, errors, or logs.

### Revocation

Add an `OpenAI connections` section to the existing signed-in Settings page. Use the signed-in management template and a compact list/table rather than cards. Each row shows client name, organization, granted scopes summary, consent time, expiry, and status. The explicit `Revoke access` action opens the existing `AlertDialog` pattern and names the connection and consequence. Revocation does not delete DebugBundle data.

## Existing system reuse

Reuse without page-local forks:

- `AuthLayout`, `BrandLockup`, and the existing login continuation pattern;
- shadcn `Card`, `Button`, `Input`, `Label`, `Checkbox`, `Separator`, and `AlertDialog` primitives;
- shared `Field`, `FieldLabel`, `FieldDescription`, and `FieldError` form composition;
- shared `Notice` for identity, read-only, error, and expiry messages;
- the existing loader icon/button pending treatment;
- existing neutral theme tokens, semantic status tokens, type scale, radii, focus ring, and spacing scale; and
- existing settings page, table/list, toast, and destructive-confirmation patterns.

No new color, typography, radius, shadow, breakpoint, icon system, motion primitive, or marketing layout is needed.

## Component inventory

Reusable feature components proposed for approval:

- `OAuthInteractionLayout`: public-auth shell plus interaction loading/error handling;
- `OAuthClientSummary`: publisher, client, and organization definition list;
- `OAuthScopeList`: required identity purpose and selectable product scopes;
- `OAuthDataTransferNotice`: fixed allowlisted disclosure copy;
- `OAuthConsentActions`: allow/deny action group with pending state;
- `OpenAiReviewerCredentialForm`: credential-only reviewer entry;
- `OpenAiConnectionsSection`: signed-in connection list and empty state; and
- `RevokeOpenAiConnectionDialog`: standard destructive confirmation.

These components must consume existing primitives and may not introduce alternative base components.

## Responsive behavior

Mobile uses one readable column with full-width actions and scope rows. The primary `Allow access` action appears first, with the secondary `Deny` action immediately below, separated by one compact spacing step. On tablet and desktop, the actions become a compact right-aligned inline group with `Deny` on the left and `Allow access` on the right. The same focused content remains width-bounded; the client/organization summary may use two definition columns, but scopes and disclosures stay in one reading order. The consent task does not benefit from a sidebar, split pane, or dense desktop table.

The settings revocation list may render as stacked definition rows on narrow screens and the existing shared table pattern on desktop.

## State matrix

Normal consent states:

- interaction loading;
- anonymous, with redirect to existing login and preserved safe continuation;
- verified session with organization available;
- organization unavailable, suspended, or membership removed;
- default scope selection;
- product scope selected/unselected;
- all product scopes unselected, with identity-only consequence explained;
- submitting allow;
- submitting deny;
- successful handoff/redirect;
- stale, expired, mismatched-client, mismatched-resource, or invalid interaction;
- session expired during submission;
- provider or coordination unavailable; and
- retryable request failure with the user's selection preserved.

Reviewer states:

- default;
- invalid credential with generic error;
- expired or revoked credential with generic error;
- rate-limited with retry timing;
- synthetic fixture unavailable;
- submitting;
- successful provider redirect; and
- feature disabled/non-discoverable.

Revocation states:

- empty;
- active;
- expired;
- revoked;
- confirmation open;
- revoking;
- success; and
- failure with the active state reloaded from the server.

## Accessibility

- Use one `h1`, semantic sections, a fieldset/legend for product scopes, and a definition list for client and organization facts.
- Keep labels persistent; connect descriptions and errors with `aria-describedby` and invalid fields with `aria-invalid`.
- Move focus to the first actionable error or the page-level error notice after failure.
- Announce pending and terminal states without relying on color; do not replace button text with an unlabeled spinner.
- Maintain visible focus, existing token contrast, 44-pixel practical touch targets, logical keyboard order, and reduced-motion behavior.
- Deny remains keyboard reachable and visually subordinate but not hidden.
- The revocation dialog names the connection, identifies the effect, and returns focus to its trigger.

## Copy contract

Required product-scope labels:

- Projects: `See projects available in this organization`
- Incidents: `Read incident summaries and structured context`
- Artifacts: `Read existing redacted bundles and reproductions`
- Improvements: `Read improvement opportunities and existing evidence`
- Analytics: `Read aggregate product analytics`
- Health: `Read endpoint checks and bounded health results`

The analytics description is: `Visits, routes, devices, referrers, actions, funnels, journey patterns, and incident impact; individual journeys are excluded.` The data-transfer notice also excludes individual journey samples and custom analytics dimensions. The scope does not authorize analytics settings, saved funnels, opportunities, bundle generation, or any other mutation.

Required identity explanation: `Share your verified email only so ChatGPT or Codex can apply managed-workspace domain restrictions. Your email is not included in MCP access tokens or tool results.`

Required read-only explanation: `This connection cannot change, resolve, delete, send, or reconfigure anything in DebugBundle.`

Avoid `observability`, `full monitoring`, `autonomous repair`, and other claims excluded by the public v1 contract.

## Security and privacy interaction rules

- The API remains authoritative for client, redirect, resource, scope, session, organization, membership, reviewer identity, and interaction freshness.
- UI-hidden or disabled controls are not authorization controls.
- Allow and deny require CSRF-safe same-site requests and exact provider interaction binding.
- Customer-captured content is never rendered on consent or reviewer credential pages.
- Reviewer success never accepts an organization/project value from the browser.
- Consent/reviewer/Settings interactions must not be sent to product analytics. Operational security telemetry remains metadata-only and must not record credentials, identifiers, scope toggles, prompts, tool arguments, or customer content.

## Approval record

The owner approved these three standard patterns on 2026-08-30:

1. focused `AuthLayout` consent page with selectable product scopes;
2. credential-only synthetic reviewer page using the same auth layout; and
3. Settings-based connected-app revocation list with `AlertDialog` confirmation.

The local source now implements these patterns behind the existing OpenAI runtime feature gate. This approval does not authorize production migration/deployment, live secret or infrastructure mutation, OpenAI portal actions, publication, announcements, or spending. Automated source evidence is not manual accessibility, outside-network reviewer, live-client, or production proof.

On 2026-09-02 the owner approved adding one sixth checkbox using the same design-system pattern for a separate aggregate-only analytics read scope. No new component, interaction, visual token, layout, or write capability was approved or introduced. This tracked approval resolves the launch plan's earlier analytics exclusion in favor of the narrower aggregate-only source-of-truth contract in `FR-MCP-13`.

On 2026-09-03 the owner approved refining the consent decision footer to use the standard responsive action hierarchy: `Allow access` before `Deny` in logical and visual order on mobile, stacked with the primary action at the top, then inline and right-aligned with `Deny` on the left and `Allow access` on the right at tablet and desktop widths. The implementation reuses existing button variants, spacing, and breakpoints.

On 2026-09-03 the owner completed visual inspection and approved the implemented consent, reviewer, Settings revocation, aggregate-analytics consent, preview-state, and responsive action treatment. This closes the visual-design approval gate only; keyboard, screen-reader, real-client, deployed, reviewer, and OpenAI portal validation remain separate evidence gates.

## Development preview approval record

On 2026-09-02 the owner approved a development-only synthetic preview harness for pre-publication visual inspection. The harness reuses the production components and existing design-system primitives for the complete consent, reviewer, and Settings state matrix, all 64 product-scope subsets, and mobile, tablet, and desktop iframe viewports. It is opt-in through `make dev-openai-plugin-preview`, uses deterministic non-customer fixtures, performs no OAuth/reviewer/grant/revocation request, and is unavailable in production builds. This local aid does not change or satisfy any manual, deployed, portal, publication, communication, or spending gate.
