# Design System Proposal — Session-Authenticated Web App

Version: v1
Last updated: 2026-03-17
Status: Approved with notes — see Section 13

---

## 1. Purpose

This document is the required Phase 11 design-system proposal for the DebugBundle web app.

It exists to satisfy the UI execution gate defined in:
- `/AGENTS.md`
- `/rules/architectural-constraints.md`
- `/spec/implementation-roadmap.md`

It covers the required approval inputs:
- design tokens
- primitives
- component inventory
- state matrix
- accessibility expectations
- usage patterns

This is a proposal for review and adjustment before UI implementation begins.

---

## 1a. Branding Alignment

The web app and all DebugBundle surfaces share the brand direction defined in the original branding document (`starter-kit/specs-plans/debugbundle_branding_direction.md`).

Key brand rules that carry into the design system:

**Voice and tone:**
- direct, developer-focused, technical but clear
- confident but not marketing-heavy
- no marketing buzzwords; prefer clear technical explanations

**Product vocabulary (use consistently):**
- bundle, debug bundle, incident, reproduction, verification, agent workflow

**Product vocabulary (avoid heavy usage of):**
- monitoring, observability, analytics, dashboard

**Brand feel:**
- technical, developer-native, pragmatic, automation-friendly, AI-ready
- avoid: enterprise-heavy, dashboard-centric, marketing-driven

**Product positioning:**
- DebugBundle is production debugging infrastructure, not an observability or monitoring platform
- the core value proposition is "stop investigating logs — receive debugging bundles"
- the UI should reinforce context-over-dashboards, artifacts-over-raw-logs, resolution-over-monitoring

**Marketing surface alignment:**
- The public site at `debugbundle.com` (static Next.js + Fumadocs) should follow the same brand voice but with more room for hero sections, value propositions, long-form docs, and calls to action
- The signed-in app at `app.debugbundle.com` should be the calm operational surface — not a marketing surface
- Copy in the app should stay functional and direct; save persuasive messaging for the marketing site and blog
- Both surfaces share the same color tokens and type system so the brand feels unified across the boundary

---

## 2. Source Constraints

This proposal is intentionally shaped by the current source-of-truth:
- `/spec/tech-stack.md`: React + Vite, Tailwind, shadcn/ui, dark/light mode required from day one
- `/spec/routes.md`: minimal app, not a dashboard-heavy product
- `/spec/auth-architecture.md`: cookie-backed SPA sessions, member/project token management, owner/member role separation
- the local status tracker: first approved surfaces should focus on auth and account-management flows

Hard constraints:
- The web app is not the product core; API, CLI, and MCP remain primary interfaces.
- The UI must use the default shadcn/ui new-york style with neutral base tokens as the source of truth for primitives.
- Core shadcn primitives should remain copy/paste-close to upstream defaults. App-specific styling belongs in composition and domain components, not in restyled forks of stock primitives.
- Theme behavior defaults to `system` via `prefers-color-scheme`, with explicit light/dark overrides as secondary controls.
- No page-local one-off components unless explicitly approved.
- Implementation should start with auth, account, billing, project, token, and organization-management surfaces, not analytics-heavy dashboards.
- The authenticated SPA lives on `app.debugbundle.com`, separate from the public site at `debugbundle.com` that serves marketing pages, docs, and blog content.
- Signed-in surfaces live at root-level routes on `app.debugbundle.com` such as `/dashboard`, `/projects`, and `/settings`.
- The SPA entry point at `app.debugbundle.com/` redirects authenticated users to `/dashboard`.

---

## 3. Design Direction

### 3.1 Product Feel

The web app should feel like a precise operator console rather than a marketing-heavy SaaS dashboard.

Desired qualities:
- calm
- technical
- credible
- compact
- high-signal
- low-ornament

This should look more like a polished developer tool than a sales-forward admin panel.

### 3.2 Visual Thesis

The proposed visual direction is:

**Default Shadcn Operator Surface**

Meaning:
- stock shadcn new-york spacing, radii, borders, and component structure
- neutral base palette from the default shadcn token set
- direct product copy with minimal decorative framing
- dense but readable forms and management tables
- explicit empty, pending, warning, and destructive states

This avoids two failure modes:
- custom “house style” drift that diverges from approved shadcn blocks and primitives
- visually noisy observability-dashboard styling that does not match the current product scope

### 3.3 Interaction Principles

1. Important actions should look operational, not decorative.
2. Setup and management flows should feel guided, not crowded.
3. Tokens, invite links, and webhook secrets should be visually isolated from ordinary text.
4. Dangerous actions should be explicit, interruptive, and hard to misread.
5. Empty states should teach the next step, not merely report absence.
6. Billing and plan gates should be visible but not theatrically upsell-heavy.
7. The signed-in experience should feel like entering a working surface directly at `app.debugbundle.com`, with no extra namespace layer between the domain and product routes.

---

## 4. Design Tokens

These tokens define the baseline visual language. The default shadcn new-york neutral token set is the baseline and should not be replaced with a custom palette for core primitives.

### 4.1 Color Roles

Use semantic roles, not raw page-local colors.

Core roles:
- `bg.canvas`: app/page background
- `bg.surface`: primary card/panel background
- `bg.subtle`: quieter grouped sections
- `bg.elevated`: dialogs, popovers, dropdowns
- `fg.default`: primary text
- `fg.muted`: secondary/supporting text
- `fg.subtle`: tertiary labels and metadata
- `border.default`: standard separators and field borders
- `border.strong`: emphasized separators or active containers
- `accent.primary`: primary action and selection state
- `accent.secondary`: secondary highlight surfaces
- `focus.ring`: shared focus outline color

Status roles:
- `status.info`
- `status.success`
- `status.warning`
- `status.danger`

Token/secret roles:
- `code.bg`
- `code.border`
- `code.fg`

### 4.2 Proposed Palette Character

Source of truth:
- default shadcn/ui new-york neutral tokens for `background`, `foreground`, `card`, `popover`, `primary`, `secondary`, `muted`, `accent`, `border`, `input`, and `ring`
- additive domain tokens only for `success`, `warning`, and `info`

Light theme:
- canvas: default neutral background
- surfaces: default shadcn card/popover surfaces
- foreground: default shadcn neutral foreground
- borders: default shadcn neutral border/input values
- accent: default shadcn neutral accent behavior
- success: green with strong text contrast
- warning: amber/ochre
- danger: restrained red, not neon

Dark theme:
- canvas: default shadcn neutral dark background
- surfaces: default shadcn neutral dark card/popover surfaces
- foreground: default shadcn neutral dark foreground
- borders: default shadcn neutral dark border/input values
- accent: default shadcn neutral dark accent behavior
- status colors: slightly muted to avoid glowing dashboard aesthetics

Rationale:
- neutral enough for operator tooling
- matches upstream shadcn blocks and examples directly
- keeps the product visually consistent with the approved component source

### 4.3 Typography

Use two-font system:
- UI sans: `Instrument Sans` or `Manrope`
- mono: `JetBrains Mono`

Proposal:
- headings and navigation: UI sans, medium to semibold
- body and form labels: UI sans
- tokens, code snippets, IDs, webhook signatures, CLI examples: mono

Type scale:
- `text.hero`: marketing-only, limited use
- `text.h1`: page titles
- `text.h2`: section headers
- `text.h3`: card/group titles
- `text.body`: default body copy
- `text.small`: metadata/help text
- `text.mono`: tokens, IDs, inline technical values

Rules:
- avoid oversized headings inside the signed-in app
- prefer strong weight contrast over large size jumps
- use mono only for technical artifacts, never for long body copy

### 4.4 Spacing

Adopt a compact but breathable spacing scale.

Roles:
- `space.1`: 4
- `space.2`: 8
- `space.3`: 12
- `space.4`: 16
- `space.5`: 20
- `space.6`: 24
- `space.8`: 32
- `space.10`: 40
- `space.12`: 48

Rules:
- forms use tighter vertical rhythm than marketing pages
- cards should prefer internal consistency over large padding
- dense management screens should use section spacing to create hierarchy instead of oversized containers

### 4.5 Radius

Proposed radius system:
- `radius.sm`: inputs, small badges, inline pills
- `radius.md`: buttons, cards, table containers
- `radius.lg`: dialogs, hero panels

Direction:
- slightly rounded, not pill-heavy
- avoid extreme rounding that makes the app feel consumer-social

### 4.6 Shadow And Border Treatment

Primary depth model should be border-first, shadow-second.

Rules:
- rely on contrast and border layering before large shadows
- use soft elevation only for dialogs, popovers, dropdowns, and command surfaces
- default cards in app shell should usually not float dramatically

### 4.7 Motion

Motion should be sparse and informative.

Allowed motion:
- panel/dialog enter and exit
- theme transition
- toast entry
- accordion/collapsible expansion
- subtle loading skeleton shimmer

Avoid:
- decorative floating animation
- exaggerated spring motion for routine controls
- delayed stagger effects on dense management pages

Motion timing direction:
- fast for inline UI responses
- medium for overlays
- disabled or reduced under `prefers-reduced-motion`

---

## 5. Core Primitives

All primitives should be default shadcn-based and wrapped only where DebugBundle needs app-specific semantics. If a stock shadcn component exists, use it with default structure and variants before introducing any custom primitive.

### 5.1 Foundation Primitives

Required:
- Button
- Input
- Textarea
- Label
- Checkbox
- Radio Group
- Switch
- Select
- Combobox / searchable select
- Badge
- Separator
- Avatar
- Tooltip
- Popover
- Dialog
- Alert Dialog
- Sheet
- Tabs
- Empty
- Accordion
- Scroll Area
- Skeleton
- Toast / Sonner-style notification surface

### 5.2 Layout Primitives

Required:
- App Shell
- Sidebar Nav
- Top Bar
- Page Header
- Section Header
- Content Grid
- Stack
- Inline Cluster
- Panel
- Empty State
- Split Detail Panel

### 5.3 Data Display Primitives

Required:
- Data Table
- Key/Value List
- Definition Row
- Status Pill
- Token Display Box
- Code Block
- Copy Field
- Inline Metadata Pair

### 5.4 Feedback Primitives

Required:
- Inline Validation Message
- Banner / Notice
- Success Confirmation Block
- Warning Callout
- Destructive Confirmation Dialog
- Loading Block
- Pending State Block

### 5.5 Auth And Setup Primitives

Required:
- Auth Card
- OAuth Button Row
- Password Field
- Verification State Panel
- Setup Step Panel
- Copy-once Secret Reveal Panel

---

## 6. Shared Component Inventory

This is the first implementation inventory. Components should be created in reusable layers rather than directly inside pages.

### 6.1 Navigation And Shell

- `AppShell`
- `AppSidebar`
- `SidebarSection`
- `Topbar`
- `AccountMenu`
- `BreadcrumbHeader`
- `ThemeToggle`
- `OrgContextSummary`

### 6.2 Auth Surfaces

- `AuthPageLayout`
- `AuthCard`
- `LoginForm`
- `SignupForm`
- `GithubSignInButton`
- `ForgotPasswordForm`
- `ResetPasswordForm`
- `VerifyEmailPanel`
- `SessionNotice`

### 6.3 Project And Account Management

- `ProjectListTable`
- `CreateProjectDialog`
- `ProjectHeader`
- `ProjectSettingsForm`
- `BillingSummaryCard`
- `PlanBadge`
- `UsageMeter`
- `QuotaNotice`

### 6.4 Token And Secret Management

- `TokenTable`
- `CreateTokenDialog`
- `PlaintextTokenReveal`
- `SecretValueBox`
- `CopySecretButton`
- `RevokeTokenDialog`

### 6.5 Organization And Member Management

- `MemberTable`
- `InviteMemberDialog`
- `PendingInvitesTable`
- `RoleSelect`
- `RemoveMemberDialog`
- `InviteAcceptancePanel`

### 6.6 Webhook And Alert Management

- `WebhookTable`
- `CreateWebhookDialog`
- `DeliveryHistoryTable`
- `TestWebhookDialog`
- `AlertRuleTable`
- `CreateAlertRuleDialog`

### 6.7 Reusable Status Surfaces

- `EmptyStateCard`
- `ErrorStateCard`
- `PendingStateCard`
- `SuccessStateCard`
- `UpgradeGateCard`
- `VerificationGateCard`

---

## 7. Page Templates

These templates keep page construction consistent and prevent ad-hoc page composition.

### 7.1 Public Auth Template

Used for:
- `/login`
- `/signup`
- `/forgot-password`
- `/reset-password`
- `/verify-email`

Structure:
- simple centered layout
- narrow content width
- one primary card
- optional secondary help panel below
- minimal chrome

### 7.2 Signed-In Management Template

Used for:
- billing
- projects
- tokens
- settings
- project members
- webhooks
- alerts

Structure:
- persistent app shell
- page header with title, context, primary action
- one main content lane
- optional right-side context panel only when materially useful

### 7.3 List + Dialog Template

Used for:
- project lists
- token lists
- member lists
- invite lists
- webhook lists
- alert lists

Structure:
- header with primary action
- filter/search row only when needed
- table/list container
- row actions via menu or inline buttons
- create/edit in dialog or sheet unless form complexity forces dedicated page

### 7.4 Destructive Settings Template

Used for:
- revoke token
- delete project
- remove member
- cancel invite

Structure:
- warning-toned section
- explicit irreversible copy
- typed confirmation only for high-risk actions
- no visually subtle destructive CTAs

---

## 8. State Matrix

Every reusable surface should support these states where applicable.

### 8.1 Core States

- default
- hover
- focus-visible
- active
- disabled
- loading

### 8.2 Data States

- empty
- populated
- refreshing
- incremental loading
- error
- stale-but-visible

### 8.3 Form States

- default
- dirty
- valid
- invalid
- submitting
- submitted-success
- submitted-error

### 8.4 Access States

- anonymous
- signed-in verified owner
- signed-in verified member
- signed-in unverified user
- plan-gated
- permission-denied

### 8.5 Secret States

- hidden
- revealed-once
- copied
- expired / unavailable

### 8.6 Invite States

- pending
- accepted
- expired
- cancelled
- email-mismatch failure

### 8.7 Billing States

- free
- solo
- team
- upgrade available
- quota near limit
- quota exceeded

---

## 9. Accessibility Expectations

Accessibility is part of the design system, not cleanup after implementation.

### 9.1 Non-Negotiable Requirements

- All interactive controls must be keyboard reachable.
- All focusable controls must have visible focus states.
- Color alone must not carry critical meaning.
- All dialogs, sheets, and menus must use accessible shadcn/Radix patterns.
- Form errors must be announced and linked to fields.
- Destructive actions must use explicit language, not icon-only affordances.
- Theme contrast must remain acceptable in both light and dark mode.
- Reduced-motion preference must be respected.

### 9.2 Form Requirements

- labels always visible
- helper text placed consistently
- error text placed directly near the field
- required fields indicated by text, not color only
- submit buttons reflect submitting state clearly

### 9.3 Table Requirements

- row actions keyboard accessible
- sortable headers, if added later, clearly announced
- status badges paired with text labels
- no hover-only critical controls

### 9.4 Copy/Secret Requirements

- copy buttons require readable labels or accessible names
- revealed secret states must be obvious to screen-reader and visual users
- one-time token display should have explicit warning copy and stable keyboard order

---

## 10. Usage Patterns

These rules define how components should be used together.

### 10.0 Single-Source Reusability Discipline

This is the most important implementation rule in the design system. Every repeated visual pattern must resolve to exactly one shared component. There must be no page-local copies or near-duplicates of shared primitives.

Mandatory rules:

1. **One component, one source.** Every reusable pattern lives in one file. Every consumer imports from that file. If the pattern changes, it changes everywhere.
2. **Empty states** are always rendered through the shared `EmptyStateCard`. No page may invent its own empty-state layout. The shared component accepts domain-specific copy (title, description, action) as props.
3. **Dialogs and modals** are always rendered through the shared `Dialog` / `AlertDialog` primitives from shadcn. No page may create alternative overlay patterns. Confirmation dialogs use `AlertDialog`; form dialogs use `Dialog` or `Sheet`.
4. **Color palette** is defined entirely through Tailwind CSS theme variables mapped from the design tokens in Section 4. No component or page may use raw hex/RGB values or invent local color names. All color changes flow through the theme configuration.
5. **Typography** uses the shared type scale tokens. No component may define ad-hoc font sizes, weights, or families outside the token system.
6. **Headings** use a consistent shared hierarchy from the type scale. Page titles, section headers, and card titles always use the same heading components so visual hierarchy changes propagate site-wide.
7. **Status indicators** (success, warning, error, info, pending) always use the shared `StatusPill` / `Badge` / `Banner` components with semantic color tokens. No one-off colored text or inline status styling.
8. **Tables** use the shared `DataTable` component. No page may create a local table layout that diverges from the standard column, row-action, and empty-state patterns.
9. **Form fields** use shadcn `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormDescription`, `FormMessage` grouping. All forms wire through the same validation and error display pattern.
10. **Buttons** always use the shared `Button` component with its size/variant props. Destructive buttons always use the `destructive` variant. No page may create button-shaped elements outside the shared component.
11. **Icons** are always consumed through the shared icon wrapper. Direct icon-library imports in page files are not allowed.
12. **Toast notifications** always use the shared toast/Sonner surface. No page may create local notification patterns.

Enforcement approach:
- Code review must reject any page-local reimplementation of a shared pattern.
- If a shared component does not yet support a needed variant, extend the shared component — do not create a page-local workaround.
- The shadcn skills reference (`.agents/skills/shadcn/`) defines how to add, customize, and compose shadcn components correctly.

### 10.1 Page Composition

- Each page should be assembled from shared templates plus shared feature components.
- Page files should compose existing building blocks, not invent local styles.
- A page may introduce a feature component only if that component is reusable across at least one other route or clearly belongs to a stable domain surface.

### 10.2 Forms

- Use one primary submit action per form area.
- Secondary actions should be visually subordinate.
- Long forms should be broken into grouped panels with section headers.
- Inline validation for field-level problems; banner-level feedback for request-level failures.

### 10.3 Tables And Lists

- Default to simple tables for management surfaces.
- Avoid card grids for operational lists unless the content is naturally card-shaped.
- Bulk actions should not be built unless a real use case appears.

### 10.4 Empty States

- Every empty state must explain what the thing is, why it is empty, and the next useful action.
- Empty states should be domain-specific, not generic “No results” placeholders.

### 10.5 Plan And Verification Gates

- Gates should appear as structured notices, not modal interruptions by default.
- The notice should explain the reason, the blocked capability, and the next action.
- Upgrade messaging should remain calm and factual.

### 10.6 Destructive Actions

- Destructive buttons should not sit adjacent to primary positive actions without spacing or separation.
- Alert dialogs should name the target resource directly.
- Reversible and irreversible actions must not share the same visual severity.

---

## 11. First Approved Surface Slice

If this proposal is approved, the first UI implementation slice should stay narrow.

Recommended first slice:
- `/login`
- `/signup`
- `/verify-email`
- `/forgot-password`
- `/reset-password`
- minimal `/dashboard` signed-in home
- `/settings`
- `/member-tokens`

Rationale:
- aligns with already-shipped backend auth/session capabilities
- exercises the homepage redirect rule from signed-in `/` to `/dashboard`
- exercises the auth template, app shell, forms, token reveal, and verification gate patterns
- avoids prematurely committing to heavier project/billing/incident layouts before the foundation is proven

Second slice after that:
- `/projects`
- `/projects/:projectId/tokens`
- `/projects/:projectId/members`

---

## 12. Implementation Guidance

This is not code yet, but the proposal assumes the following implementation shape.

### 12.1 App Structure

- `apps/web/src/components/ui/*` for shadcn primitives
- `apps/web/src/components/system/*` for DebugBundle wrappers and layout primitives
- `apps/web/src/components/auth/*` for auth-domain reusable components
- `apps/web/src/components/projects/*`, `tokens/*`, `organization/*`, etc. for feature-level reusable components
- `apps/web/src/routes/*` for page composition only

### 12.2 Styling Rules

- token-driven Tailwind theme variables
- shared semantic utility classes only when they eliminate real repetition
- no page-scoped bespoke palette unless explicitly approved
- icon usage routed through a shared wrapper

### 12.3 Block Usage

Use official shadcn blocks where they genuinely accelerate consistent implementation, especially for:
- auth page structure
- sidebar/app shell structure
- settings and management layouts

Do not adopt blocks wholesale if they introduce visual drift or unnecessary dashboard complexity.

### 12.4 shadcn Skills Reference

The repository includes installed shadcn agent skills at `.agents/skills/shadcn/`. These skills define:
- how to add new shadcn components (`cli.md`)
- customization patterns (`customization.md`)
- component rules and conventions (`rules/`)

All agents and developers working on the frontend must follow the patterns defined in these skills when adding, modifying, or composing shadcn components. The skills ensure consistent component installation, theme integration, and composition patterns.

### 12.5 Maintainability Rules

- Token changes (colors, spacing, radius, typography) must propagate through the Tailwind theme config — never require per-component edits.
- A component variant change (e.g., updating `EmptyStateCard` layout) must automatically apply everywhere that component is used.
- If a shared component needs a new variant, add it as a prop variant on the existing component — do not fork the component.
- Prefer fewer, more flexible shared components over many specialized near-duplicates.
- Periodically audit for drift: if two components look similar, they should probably be the same component with different props.

---

## 13. Approval Checklist

This proposal should be considered approved only if the reviewer agrees with all of the following:

1. The overall visual direction should be a calm, technical operator UI rather than a generic SaaS dashboard.
2. The web app should use a neutral field-guide palette with a blue-cyan accent family.
3. The typography direction should use a distinctive sans plus mono pairing rather than default system styling.
4. The first implementation slice should stay limited to auth, settings, and member-token surfaces.
5. Shared components should be built before page-specific assembly.
6. Tables, forms, notices, and token-display patterns should be the dominant management UI building blocks.
7. The single-source reusability discipline (Section 10.0) is mandatory — no page-local reimplementations of shared patterns.
8. Brand voice and vocabulary (Section 1a) should be reflected in all user-facing copy within the app.

**Approval status:** Approved. The reviewer confirmed the overall direction, emphasized that single-source component reusability and maintainability are critical priorities, and requested that the shadcn skills be installed for implementation consistency.

---

## 14. Open Review Points

These are the parts most likely to need user adjustment before implementation:

1. Accent family: keep the proposed blue-cyan direction, or shift warmer/cooler.
2. Typography: keep `Instrument Sans`/`JetBrains Mono`, or swap to another pair.
3. Density: keep the compact operator feel, or loosen spacing for a more spacious app shell.
4. First slice: start with auth + settings + member tokens, or include projects immediately.
5. Incident browser: keep visually low-priority in V1, or make it a more prominent shell destination.

---

## 15. Proposed Decision

This proposal is approved as the baseline design system for Phase 11. The next step is to implement the first narrow auth/account-management slice against it.

If adjustments are needed during implementation, this file should be updated first and only then used as the implementation reference.
