---
name: design-discipline
description: Use this skill for any UI, UX, layout, interaction, component, accessibility, or design-system related task. It helps choose familiar patterns, preserve system consistency, and avoid low-quality generated UI.
---

# Design Discipline Skill

Use this skill whenever a task involves:

- frontend UI
- UX decisions
- layout
- components
- forms
- tables
- navigation
- dialogs/drawers
- dashboards
- states
- accessibility
- visual refinement
- design-system alignment

## Mission

Produce UI decisions that feel intentional, familiar, accessible, and aligned with the existing product system.

Do not generate generic UI.

Do not optimize for code convenience over user clarity.

## Default operating mode

For every relevant task, silently run this checklist.

### Step 1: Understand the human task

Ask yourself:

- What is the user trying to do?
- What is the primary action?
- What is secondary?
- What must be seen immediately?
- What can be deferred or progressively disclosed?

If the interface does not clearly support the primary task, redesign it.

### Step 2: Check local conventions first

Look for and reuse:

- existing components
- current design system primitives
- spacing and typography tokens
- current page patterns
- existing table/list/form/layout patterns
- current navigation style
- current feedback patterns

Prefer the product's own patterns over generic generated UI.

### Step 3: Choose the most familiar pattern

For the task, ask:

- Is this where users would expect this?
- Is this how mature design systems usually solve it?
- Is this standard on web/mobile/desktop?
- Is there a simpler, more typical pattern?

When a standard pattern works, use it.

### Step 4: Stress-test the proposal

Ask:

- Is this really the best UI for a human?
- Is anything visually competing with the primary task?
- Is there too much density or too little?
- Is the primary action obvious?
- Is the label language clear?
- Are edge states covered?
- Would this still work on small screens?
- Would this work without a mouse?
- Would a new user understand it without explanation?

If not, improve it before implementing.

### Step 5: Check whether the UX is unusual

If the pattern is novel, custom, or non-standard:

- identify the normal pattern
- explain why the normal pattern may not be enough
- recommend the custom option clearly
- ask for approval before implementation

Do not silently ship unusual UX.

## Hard rules

### Existing system first
If a framework, component library, or design system is already in use:

- use its components first
- use its layout primitives first
- use its state patterns first
- use its motion and overlay primitives first
- use its tokens and variables first

Only build custom UI when the existing system clearly does not cover the need.

### Never invent arbitrary styling
Do not introduce ad hoc:
- spacing values
- colors
- font sizes
- radius values
- shadows
- z-index layers
- motion durations
- breakpoints

Use existing tokens and variables.

### Never ignore states
Any interactive UI must account for:
- hover
- focus
- active
- selected
- disabled
- loading
- empty
- error
- success

### Accessibility is required
The result must support:
- semantic markup
- keyboard navigation
- visible focus
- accessible labels
- contrast awareness
- predictable reading order
- clear errors
- non-color state cues

## Pattern selection guide

### Modal vs drawer vs page

Use a **modal** when:
- the task is short
- focused attention is useful
- the content is limited
- confirmation is needed

Use a **drawer/sheet** when:
- the task is contextual
- the user should keep page context
- editing is lightweight to moderate

Use a **full page** when:
- the task is long
- the task is complex
- there are many fields or dependencies
- the task needs navigation depth
- the task deserves strong information hierarchy

Do not put a complex workflow in a modal just because it is faster to build.

### Tabs vs steps vs accordions

Use **tabs** for:
- sibling sections
- quick switching
- non-sequential content buckets

Use **steps** for:
- ordered multi-step flows
- dependencies between stages
- onboarding / checkout / setup

Use **accordions** for:
- secondary details
- optional content
- situations where users may scan headings first

Do not use tabs for a sequence.
Do not hide critical content in collapsed sections by default.

### Table vs list vs cards

Use a **table** when:
- users compare values across rows
- sorting/filtering/bulk actions matter
- columns carry meaning

Use a **list** when:
- content is scan-heavy
- rows vary naturally
- comparison is lighter

Use **cards** when:
- preview blocks are useful
- heterogeneous content is being browsed
- visual grouping matters more than strict comparison

Do not default to cards when a table or list would be clearer.

## Visual hierarchy test

Before finalizing, check:

- Can the user identify the main action in under a second?
- Is the page title stronger than surrounding text?
- Are section boundaries obvious?
- Is supporting copy quieter than core UI?
- Are destructive actions separated and clearly labeled?
- Is spacing being used as structure, not decoration?

If everything looks equally important, the hierarchy is weak.

## Responsive judgment

Default to mobile-first implementation, but do not assume the mobile layout is the correct desktop UX.

Start from the smallest practical layout and the core task. Then explicitly evaluate whether larger screens need a different composition.

Ask:

- Should this remain single-column, or should it become multi-column?
- Would users benefit from side-by-side comparison here?
- Should navigation become more persistent on larger screens?
- Would desktop benefit from inline actions, split views, filters, or richer tooling?
- Is the current layout creating unnecessary scrolling on larger screens?
- Is a list still correct, or should this become a table at larger sizes?

### Apply this rule

- Keep the mobile baseline simple.
- Enhance progressively.
- Let desktop diverge when density, workflow complexity, comparison, or navigation needs require it.
- Do not preserve the same layout across breakpoints when doing so makes the UI worse for humans.
- Treat responsive design as adaptive task design, not just visual scaling.

## Form discipline

For forms:

- ask only for necessary data
- keep labels persistent
- prefer native and system-standard controls
- group related inputs
- validate helpfully and near the field
- keep helper text specific
- preserve user input on failure
- make submission consequences clear
- use defaults carefully

### Good form decisions
- radio buttons for a few exclusive choices
- inline field errors
- clear required/optional treatment
- logical field grouping
- helper text that prevents mistakes

### Bad form decisions
- placeholder-only labels
- giant forms in tiny modals
- disabled submit with no explanation
- generic errors
- unclear button copy like "Continue" when the outcome is ambiguous

## Microcopy discipline

Use copy that is:
- direct
- concrete
- action-oriented
- consistent with the product domain

Prefer:
- "Save changes"
- "Invite member"
- "Export CSV"
- "Delete workspace"

Avoid:
- "Submit"
- "Do action"
- "Proceed"
- "OK" for destructive confirmation

## Anti-pattern detector

If your proposal includes any of these, stop and reconsider:

- a centered card layout for a real app workflow
- too many stacked cards for structured data
- hidden primary actions
- icons without enough text labels
- weak focus styles
- color-only status signals
- random accent colors
- inconsistent spacing rhythm
- giant empty space that hurts scanning
- over-designed visuals with weak task support
- controls far away from the content they affect
- every screen looking like a SaaS landing page

## Required output format for design-related work

When handling a design task, structure your response around these points when useful:

1. **Chosen pattern**
   - what UI pattern you are using

2. **Why this fits**
   - why this is the best choice for the human task

3. **Convention check**
   - whether this is standard and where users would expect it

4. **System reuse**
   - what existing components, tokens, and patterns should be reused

5. **States**
   - key interaction states that must exist

6. **Accessibility**
   - notable accessibility considerations

7. **Approval gate**
   - whether anything custom or unusual needs approval

Keep it concise unless asked for more detail.

## Approval language for unusual UX

When proposing custom behavior, say something like:

- "Standard pattern: X."
- "Recommended custom variant: Y, because Z."
- "This is more opinionated than the standard approach."
- "Please approve before I implement this interaction."

## Review mode

When asked to review existing UI/code, explicitly check:

- does the current UI match the user task?
- does it follow existing product patterns?
- does it use the existing design system correctly?
- is the hierarchy strong enough?
- is the action placement standard?
- are forms and validation humane?
- are states complete?
- is responsiveness handled?
- is accessibility likely acceptable?
- is anything custom without strong justification?

## Examples

### Example 1: action placement

Bad:
- "Save" hidden in a kebab menu

Better:
- primary save action placed where users expect it in the page or form footer/header

Reason:
- saving is a primary action and should not be discoverability-dependent

### Example 2: editing entity details

Bad:
- open a small modal with 18 fields, tabs, and nested accordions

Better:
- use a page or large contextual panel with grouped sections and persistent save affordance

Reason:
- complexity deserves layout space and stable hierarchy

### Example 3: analytics view

Bad:
- six decorative stat cards, two charts, and filters scattered across the page

Better:
- key metrics grouped at top
- filters near affected content
- chart only where trend matters
- table for detailed records

Reason:
- users need scanability and control, not decoration

### Example 4: risky destructive action

Bad:
- trash icon only

Better:
- explicit destructive label
- danger zone separation
- confirmation dialog naming the resource

Reason:
- reduces accidental loss and improves confidence

## Final instruction

Your standard is not "acceptable generated UI."

Your standard is:

- familiar
- intentional
- accessible
- system-aligned
- production-grade
- defensible in a professional design review