# Project details layout

The owner requested columns with each label above its value. Reuse the existing
Card and detail-item composition with the existing typography and spacing tokens
(FR-WEB-06/08/09, AC-WEB-09). The request approves this layout change.

- Use a semantic definition list with one column on mobile, two from sm and three
  from xl, aligned with the existing setup summary grid.
- Each existing detail item stacks its muted label above its medium-weight value.
  Keep items at min-width zero and wrap long emails, slugs and environment names.
- Retain the existing field order, conditional owner visibility, actual values,
  role/access resolution, dates and the setup summary below the divider.
- Add no components, colours, controls, requests, schema or access-policy changes.
  Verify through existing project overview/sharing/settings regressions, types,
  scoped lint/format and the production build. No new cosmetic tests or browser
  review is needed.

The original overview module exceeded the 1,000-line source limit after normal
formatting. Summary, incident table and shared presentation moved to natural
modules while the original exports remain available. Final source lengths are
741/204/142/40. No request, handler, access rule or field value changed.

Existing overview, overview-management, project-sharing, settings, incident and
bundle regressions pass in the 149-case analytics/project compatibility run.
Root types, scoped lint/format and the Docker production dashboard build pass.
Evidence: `.tmp/analytics-ui-consistency-20261110/regressions-final.log`,
`check-qualified.log` and `build-options.log`. Local changes only; no browser
review or deployment.
