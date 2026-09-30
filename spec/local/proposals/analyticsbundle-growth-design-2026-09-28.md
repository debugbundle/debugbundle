# Analytics growth surfaces: design proposal

Date: 2026-09-28
Status: explicitly approved by the owner on 2026-09-28; local UI implementation authorized.
Scope: the UI portion of the semantic tracking and growth analytics plan.

## Human task and navigation

Keep the existing workspace Analytics entry and each project's single Analytics tab. Preserve all current routes and report links. A scope selector offers a single project or an explicitly linked analytics space; portfolio comparison and connected journeys have separate labels. Display the selected source projects and environment beside the report title. Missing source permission produces an access explanation, never a silently reduced denominator.

Within Analytics, retain Overview, Routes, Funnels, Audiences, Journeys, Opportunities and Bundles. Add Tracking and Reports using the same section navigation. On desktop the navigation may scroll horizontally within its container; on small screens a labeled section Select exposes all sections without squeezing labels. Tracking lists catalog definitions and producer health. Reports contains a report-kind Select for Trends, Retention, Acquisition and Revenue, followed by shared time/scope filters. Existing Funnels gains an explicit Legacy step counts / Ordered funnels choice; historical legacy data remains readable with its actual meaning.

Space membership management belongs in Analytics settings. Creating/editing an ordered funnel, cohort or measurement plan uses a full page, with labeled fields and a visible review/save footer. A modal is limited to short unlink/archive confirmations. No freeform graph canvas, dragging requirement, consent popup or marketing automation is introduced.

## Existing system and tokens

Use `apps/web/components.json`'s radix-nova/neutral shadcn system, Lucide icons and `src/styles/globals.css`. Preserve Instrument Sans, JetBrains Mono for technical identifiers, existing spacing utilities, radius variables, light/dark styles, focus rings and success/warning/destructive/info tokens. Use semantic colors with labels, never new report-specific colors or invented breakpoints. Existing chart tokens apply only when a chart adds value; every chart has the equivalent accessible table.

Reuse `PageHeader`, `AnalyticsSectionHeader`, `AnalyticsFilterPanel` (desktop Popover/mobile Sheet), `AppliedAnalyticsFilterList`, `ProjectScopeSelect`, `ResourceListState`, `CursorPaginationControls`, existing analytics tables and the project's settings form patterns. Reuse shadcn `Table`, `Tabs`, `Select`, `Field`/`FieldGroup`, `Input`, `Button`, `Badge`, `Notice`, `Skeleton`, `AlertDialog`, `Separator` and chart primitives. No library upgrade or new component package is required for this proposal.

## Reusable component inventory

| Component | Shared contract and consumers |
| --- | --- |
| Analytics scope control | Controlled project/space selection, source summary, permission/loading states; all new reports, definitions and bundle requests. Wrap existing scope primitives, not a new picker framework. |
| Measurement coverage notice | Typed complete/partial/unavailable/provisional status, fixed reason labels, observation cutoff and producer counts; report, funnel and bundle detail. No captured values or subject lists. |
| Aggregate metric table | Typed columns and units, exact counts/numerators/denominators, optional comparison, accessible empty/unknown cells; trends, retention, revenue and acquisition. Use existing Table and pagination. |
| Definition editor | Shared labeled scope, subject, window and bounded predicate fields; goal/funnel/cohort variants. Funnel step order uses labeled move-up/down buttons, not drag-only interaction. |
| Definition revision preview | Current/proposed comparison, instrumentation gaps, available-from date, retention/cost estimate, conflict errors and explicit Apply revision action; catalog and saved measurement plans. Preview makes no writes. |
| Measurement health table | Declared/observed/verified producers, last accepted time, fixed loss/rejection reasons and capability versions; Tracking and setup guidance. No example customer payloads. |

Component APIs use explicit variants and typed data shared by multiple consumers. Pages compose components and API state; metric calculations and authorization live in domain packages, never React components.

## Screen hierarchy and actions

1. Report title, selected scope and one primary task action (Save report or Generate analytics bundle).
2. Report-kind/window controls and applied filters beside the content they affect.
3. Measurement coverage and observation cutoff, visible before the results.
4. A compact summary row with named units, then a comparison table; trends can add one chart above its table.
5. Related evidence and methodology through progressive disclosure. Readable definition revision and linked incident evidence remain available.

Tracking's primary action is Create event definition; report definitions use Create funnel/cohort. Editing follows Draft → Preview revision → Apply revision, preserving unsaved input on errors and requiring the reviewed expected revision. Creating a definition never enables SDK collection. Space linking/unlinking names affected projects and explains prospective collection/history effects before confirmation. Export CSV/JSON contains the same authorized aggregate scope as the table.

Retention cells show cohort size, observed period and count/percentage; immature periods say Pending. Revenue is separated by currency and distinguishes receipts from MRR. Missing instrumentation says Unavailable with a reason; it never becomes zero. Ordered funnels show entered/completed/open/expired counts and their denominator; tiny samples show counts and uncertainty. No precision or causal claim is inferred from decorative charts.

## States, responsiveness and accessibility

Every screen covers initial loading, refresh with existing data, empty, disabled analytics, unsupported producer, missing instrumentation, pending processing, partial loss, immature cohort, quota/retention limit, access denied, stale revision, transient failure and successful mutation. Retry is explicit; mutations do not retry blindly. Forms retain entered values, associate errors with fields and expose clear save consequences. Owner/admin editing and member read-only previews are visibly distinct and server-enforced.

Mobile uses a single column, stacked filter controls and the existing Sheet. Comparable tables scroll within a labeled region instead of causing page-wide overflow. Desktop keeps filters and primary actions adjacent, with side-by-side revision comparisons where space permits. Essential counts, coverage and selected scope are not hidden behind disclosure.

Use semantic headings, table captions/headers, persistent labels, visible keyboard focus, text with status colors, predictable tab order, keyboard-operable Select/Tabs and focus return after dialogs. Announce async errors/success politely without repeated notifications. Do not auto-focus refreshed data. Region labels and accessible summaries expose chart/retention values to screen readers.

## Approval and verification

Approve this exact reuse/navigation/component/state proposal before UI code. This gate comes from `AGENTS.md` section 3: "Before any UI design/layout/component implementation, first define a design system proposal ... get explicit user approval, and only then implement UI."

Verification uses source, React interaction/keyboard tests, route/permission tests and shared domain fixtures. No browser investigation or screenshot capture is part of the task unless separately requested. New UI must show identical authorized results to API/CLI/stdio MCP and leave the hosted OpenAI V1 catalog unchanged.

Owner approval recorded on 2026-09-28: "Approve the proposed UI" in response to the concrete proposal question. This authorizes local UI implementation using this proposal; it does not authorize commit, push, publication or deployment.
