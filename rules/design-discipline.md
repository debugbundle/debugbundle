# Design Discipline

This file defines the design standard for all UI, UX, frontend, layout, and interaction work in this repository.

It exists to prevent shallow or generic UI decisions and to push every design-related task toward clear, familiar, accessible, and production-quality outcomes.

## Core principle

Design for humans first.

Every UI decision must answer this question:

> Is this actually the best interface for a person using this product, in this context, for this task?

The agent must not optimize for novelty, decoration, or implementation convenience over clarity and usability.

## Primary objectives

When designing or editing UI, optimize for:

1. Clarity
2. Familiarity
3. Hierarchy
4. Accessibility
5. Responsiveness
6. Consistency
7. Task completion speed
8. Low cognitive load

## Required design mindset

Before proposing or implementing UI, the agent must ask itself:

- What is the user's real goal here?
- What is the primary action?
- What is the minimum interface needed to support that goal well?
- Is this pattern familiar to users?
- Is this where users typically expect this control, content, or action?
- How do mature design systems usually solve this?
- Is there an existing local product pattern that should be reused?
- Is this interaction obvious without explanation?
- Does the layout make the most important thing visually dominant?
- Is anything decorative competing with the task?
- Will this still feel correct on mobile, tablet, and desktop?
- Are states, validation, errors, empty states, and loading states covered?
- Is it accessible by keyboard and screen reader?
- Does this respect the current design system, tokens, and component library?

If the answer is weak or uncertain, the agent must improve the design before implementation.

## Source of truth order

When making UI decisions, use this priority order:

1. Existing product patterns in this repository
2. Existing design system tokens, variables, and reusable components
3. Existing framework or component-library primitives already in use
4. Established platform conventions
5. Mature public design-system conventions
6. Custom UI only when the above do not solve the problem well

## Existing system first

If a framework, component library, or design system is already in use, the agent must prefer its own:

- components
- layout primitives
- navigation patterns
- form controls
- overlays
- menus
- tables
- feedback patterns
- motion primitives
- tokens and variables

Do not rebuild existing patterns without a strong reason.

Do not introduce:
- ad hoc spacing values
- one-off colors
- one-off shadows
- one-off border radii
- one-off typography sizes
- random interaction patterns
- custom components where standard components already fit

## Human-centered pattern selection

The agent must choose the UI pattern that best fits the user's task, not the pattern that is easiest to generate.

Examples:

### Good
- Use a modal for a short focused confirmation or small form.
- Use a drawer/sheet for contextual editing without losing page context.
- Use a full page when the task is complex, multi-step, or deserves navigation depth.
- Use tabs only for sibling content categories with low dependency.
- Use progressive disclosure when the advanced options are secondary.

### Bad
- Putting a long complicated workflow in a modal.
- Using tabs for steps in a process that should be sequential.
- Hiding critical actions in kebab menus.
- Using cards for everything when a list or table would be clearer.
- Using a dense data table when users really need filtering and detail views first.

## Familiarity over invention

Prefer interfaces users have likely seen before.

The agent should actively ask:

- Is this a common placement for this control?
- Is this label standard enough?
- Would a user predict what happens next?
- Is there a more conventional pattern that reduces learning cost?

Do not invent novel UX when standard UX works.

If a novel pattern appears beneficial, the agent must:

1. explain why the standard pattern is not sufficient
2. recommend the novel option clearly
3. request approval before implementing it

## Visual hierarchy rules

Every screen must make the importance of elements obvious.

The agent must ensure:

- one clear primary action
- obvious page or section title
- strong contrast between primary and secondary information
- related items grouped together
- spacing used intentionally to separate and connect content
- supporting text does not visually compete with key actions
- destructive actions are distinct and appropriately de-emphasized unless the task is explicitly destructive

Avoid flat interfaces where everything has the same weight.

## Layout rules

Layout should support scanning and task completion.

The agent must:

- place primary content where users expect it
- keep controls close to the content they affect
- avoid unnecessary nesting
- avoid excessive width for readable text
- avoid horizontal scrolling for standard content
- maintain a consistent spacing rhythm
- keep alignment intentional and predictable
- support responsive reflow cleanly across breakpoints

## Responsive strategy

Default to a mobile-first responsive approach, but not a mobile-only mindset.

Start with the smallest practical layout and the core user task first. Prioritize clarity, essential actions, and a clean hierarchy at narrow widths. Then expand intentionally for tablet and desktop.

The agent must not assume that the mobile layout should simply scale up unchanged.

For each breakpoint, ask:

- Does the user need more density here?
- Does comparison become more important on larger screens?
- Would desktop benefit from multi-column layout, persistent navigation, side panels, or inline editing?
- Is the current layout wasting space or increasing scroll cost on larger screens?
- Would a table, split view, or richer toolbar become more usable at this size?
- Does the primary action remain obvious across all screen sizes?

Use mobile-first implementation as the default, but adapt the experience per screen size when the task demands it.

### Rules

- Start with the core task and smallest practical layout first.
- Expand progressively for larger screens.
- Do not stretch a mobile layout onto desktop if it harms usability.
- Allow desktop layouts to diverge when workflow complexity, density, comparison, or navigation needs justify it.
- Keep behavior, meaning, and component logic consistent even when layout changes across breakpoints.
- Prefer adaptive layout changes over cosmetic scaling.

### Good

- A simple single-column mobile form that becomes grouped two-column sections on desktop.
- A mobile list that becomes a sortable table on desktop when comparison matters.
- A mobile details flow that becomes master-detail or split-pane on larger screens.
- Condensed navigation on mobile and more persistent navigation on larger screens.

### Bad

- Keeping everything in one narrow centered column on desktop when the task is dense or analytical.
- Forcing card layouts on desktop when a table would be clearer.
- Moving primary actions into unusual places just to preserve the same layout structure across breakpoints.
- Treating responsive design as only resizing, not rethinking hierarchy and task flow.

## Forms and input rules

Forms must reduce friction and error.

The agent must:

- ask only for necessary data
- use the right control for the job
- keep labels clear and persistent
- group related fields
- show helper text only when useful
- validate near the input
- make required vs optional obvious
- preserve entered data during validation failures
- support keyboard, autofill, and paste flows
- use sensible defaults when safe

### Prefer
- radio groups for a small mutually exclusive set
- select/combobox only when the choice set or search warrants it
- segmented controls for a few high-frequency options
- checkboxes for independent booleans
- inline validation for fast correction

### Avoid
- placeholder-only labels
- overly long forms in cramped modals
- ambiguous required indicators
- generic validation like "invalid input"
- disabling submission with no visible reason

## Tables, lists, and cards

Choose the structure that best matches the information.

### Use tables when
- comparison across rows and columns matters
- users need scanning, sorting, filtering, or bulk actions

### Use lists when
- the main unit is content or activity
- comparison is light
- rows may vary in height or metadata

### Use cards when
- content is heterogeneous
- preview and visual grouping matter
- strict comparability is not the main need

Do not use cards by default when a list or table is clearer.

## Navigation and information architecture

Navigation must reflect user mental models.

The agent must ensure:

- labels are specific and predictable
- primary navigation is stable
- secondary navigation is clearly subordinate
- breadcrumbs exist only when hierarchy matters
- users can tell where they are
- users can tell what will happen next

Avoid burying important destinations behind weak labels or layered menus.

## States are mandatory

No interface is complete without states.

Every relevant UI should account for:

- default
- hover
- focus
- active/pressed
- selected
- disabled
- loading
- empty
- error
- success
- skeleton or progress feedback where appropriate

If the agent proposes UI without states, the proposal is incomplete.

## Accessibility requirements

Accessibility is not optional.

All UI work must aim for robust accessibility, including:

- semantic structure
- keyboard access
- visible focus states
- sufficient color contrast
- accessible names and labels
- error identification
- logical reading order
- meaningful button and link text
- non-color cues where color alone is insufficient
- touch target sizing appropriate to platform
- motion used carefully and not required for comprehension

If the UI would likely fail accessibility review, it must be revised before implementation.

## Content and microcopy

Interface copy must be:

- clear
- short
- specific
- human
- action-oriented
- consistent with product terminology

Prefer:
- "Save changes"
- "Delete project"
- "Invite teammate"

Avoid:
- "Submit"
- "Confirm"
- "Proceed"
- "Click here"

## Design-system discipline

The agent must remain inside the current visual system unless explicitly told otherwise.

Use existing:
- color tokens
- spacing scale
- typography scale
- icon set
- radius values
- elevation/shadow scale
- motion duration/easing
- z-index layering rules
- responsive breakpoints

Never drift from the existing palette or token strategy with arbitrary values.

## AI-specific anti-patterns to avoid

The agent must avoid common low-quality generated UI patterns such as:

- centered marketing-card layouts for app screens that need real structure
- too many cards where one panel or table would do
- weak hierarchy with same-size headings and actions
- decorative gradients or glass effects without product reason
- random accent colors outside the design system
- missing empty/loading/error states
- overstuffed toolbars
- hidden primary actions
- overuse of icons without text labels
- excessive whitespace that hurts density and scanning
- overly dense screens with no grouping
- fancy interactions with weak usability justification

## Approval gate for unique UX

If the feature or interaction feels custom, novel, or non-standard, the agent must not silently implement it.

It must instead say something like:

- "The standard pattern would be X."
- "A custom pattern may work better here because Y."
- "Recommendation: use Z."
- "Please approve the custom interaction before I implement it."

## Delivery expectations

When asked to review or create UI, the agent should respond with:

1. the chosen pattern
2. why it fits the human task
3. how it aligns with existing conventions
4. what existing components/tokens should be reused
5. what states and accessibility considerations matter
6. where approval is needed for novel UX

## Examples

### Example: dangerous action in a settings page

Bad:
- small trash icon only
- hidden in overflow menu
- no confirmation copy
- destructive action styled like a neutral action

Better:
- clear "Delete project" action in a danger zone
- separated from routine settings
- short consequence text
- confirmation dialog with explicit object name
- destructive button styling consistent with the system

### Example: dashboard data display

Bad:
- every metric shown as a separate card
- charts mixed with controls
- no clear primary KPI
- inconsistent spacing and titles

Better:
- top-level KPI group with obvious primary metric
- filters near the data they affect
- table for comparable records
- charts used only where trend matters
- strong section hierarchy

### Example: long create/edit workflow

Bad:
- cram entire form into modal
- nested accordions inside tabs
- unclear save behavior

Better:
- full page or step flow
- persistent primary action
- grouped sections
- inline validation
- unsaved changes handling if needed

## Final rule

Do not stop at "looks decent."

The result should feel like it was designed by someone who understands product UX, interaction design, accessibility, and system consistency.