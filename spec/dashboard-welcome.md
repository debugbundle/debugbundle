# Dashboard welcome and setup

Implements FR-ONB-07 / AC-ONB-08. This slice changes the signed-in dashboard
experience only. It adds no CLI flow, auth grant, API endpoint, database change
or automatic configuration action.

## Welcome and navigation

On `/dashboard`, successful reads showing no active Access token or accessible
project in the current workspace open **Welcome to DebugBundle** once in this
browser. Existing setup suppresses the automatic welcome. Billing, incoming deep
links and other management screens retain their ordinary navigation.

The primary action copies an agent setup prompt; the secondary action opens the
existing Access tokens screen. The prompt contains no credential or browser
session, links to the current quickstart and acknowledges that the user may need
to provide authentication or additional setup permissions. Copying instructions
does not establish that an agent is authenticated or that capture works.

Closing the modal leaves a bordered, subtly shaded **Setup guide** row above the
sidebar account menu. Its icon, label, essential-step count and dismiss button are
vertically centred on one line; it does not show a next-step subtitle.
The row uses a compact 40px height and the navigation's regular small-text style,
with an inset dismiss control and a 16px gap before the account menu.
The reminder can be dismissed independently. **Setup guide** in the account menu
always reopens the same guide, including after essential setup is complete.
The welcome uses the existing large Dialog width and a raised card-colour surface with a centred brand mark,
heading, short introduction and actions, without header/footer bands. The guide
uses the same width and compact rows; completed steps omit redundant help text.
The existing Dialog, Button, PendingButton, Field, Textarea, Badge,
Separator and Sidebar primitives retain the app's tokens and focus/overlay rules.
The copy button uses PendingButton's dedicated icon slot, separate from the text label.
Both modals offer copying without a View/Hide setup prompt disclosure. A selectable
prompt appears only when automatic copying fails. Progress refresh reuses the shared
TableRefreshButton with its small outline appearance and pending/spin behaviour.
Refresh icons use the shared Button icon slot and sizing, with no local size override.
The outgoing welcome/guide view is retained throughout the close animation, so
closing the welcome never briefly displays guide content.
Welcome actions use the shared default button size, typography and padding.
The optional heading and metadata rows across the dashboard use the shared
MetadataSeparator with spacing on both sides of the decorative dot. Shared Toggle
and ToggleGroup controls show a checkmark only for selected choices, retain normal
spacing without an empty icon slot for unselected choices, preserve
keyboard/accessible state, and wrap groups on narrow screens.
The modal scrolls internally on small viewports. Mobile navigation closes before
the guide opens; collapsed sidebars expose the guide through the existing tooltip.

## Progress and optional steps

The three essential milestones are an active, unexpired Access token belonging
to the user/current workspace; an accessible current-workspace project; and an
observed incident. Existing project incident counts establish receipt. When needed,
one bounded first-project incident read also recognises older resolved incidents.
This is onboarding progress, not SDK health, agent connection verification or a
claim that a generated bundle is ready.

Optional **Enable analytics in one project** appears on all analytics-capable plans
for workspace Owners and users with an accessible current-workspace project they
can administer. It links directly to that project's expanded analytics settings,
or to Projects when no suitable project exists. The step is complete only after
a saved settings read confirms analytics is available and enabled in at least one
manageable current-workspace project. Settings reads run only in the open guide,
at most four at once, stopping once an enabled project is found. Failures remain
unknown unless another project establishes completion; the guide never enables capture.

Optional **Smart Improvements** appears for eligible workspace Owners.
**Reports** appears for eligible workspace Owners and users who can administer an
accessible workspace project, with factual reporting on Solo/Team
and Business Smart Reports governed by the existing report page. Saved settings
must be enabled without review/pause requirements to count as configured. Optional
steps never prevent the three essential steps from reaching completion.

Reads refresh on navigation, browser focus, explicit refresh and every 30 seconds
while the guide or incomplete reminder is visible; hidden tabs do not poll. Optional
configuration reads run only when the full guide is opened. Read failures remain
unknown, never falsely empty or completed. Late results cannot cross account,
workspace, plan or role changes. No guide action performs a backend mutation.

## Display persistence

Versioned browser preferences are keyed by user and workspace. They store only
welcome dismissal, reminder visibility and the observed first-incident milestone;
no secret or permission is persisted. A small in-memory fallback keeps a blocked
storage environment usable. Cross-tab storage changes update display preferences.

These preferences do not sync between browsers/devices and clearing browser data
resets them. Current setup is re-read before any automatic welcome. Incident
completion survives normal artifact retention in the browser where it was observed.
Server-side account-wide onboarding persistence is outside this dashboard slice.

## Verification

Functional tests cover welcome/reopen/dismiss/navigation, clipboard failure,
current account/workspace filtering, token expiry/revocation, plan/role visibility,
enabled versus paused settings, stale reads and storage failure. Existing auth,
token, report, sidebar and dashboard regression tests remain required. No hosted
canary or production mutation is needed for this presentation change.

In the opt-in local demo (`make dev-mock`), `/dashboard?welcome=1` replays the
welcome once per page load, even for the populated demo account. It does not reset
existing progress or display preferences, and is ignored with the real local API or a
production build. Use the account menu's Setup guide to review the ongoing steps.

Add `setup=empty` to review the welcome followed by a **0 of 3** sidebar reminder.
`/dashboard?setup=started` opens the sidebar directly at **1 of 3**, with the token
step complete. These development/mock-only display scenarios use in-memory setup
preferences, ignore stored completion/dismissal and storage events, and never
overwrite the account's saved preferences or mutate mock API data. They remain
active while navigating in that mounted shell; a full load without `setup` ends
the preview. Other dashboard data remains the existing populated demo data.
