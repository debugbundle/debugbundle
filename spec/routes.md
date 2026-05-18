# Public Page Tree

Version: v1
Last updated: 2026-03-19

---

## Purpose

This file defines the public web-surface structure for DebugBundle v1 so routing, hosting, and content architecture are agreed before UI design and implementation begin.

It captures the current decisions for:
- the authenticated app host
- the public site host
- the blog location
- the docs location
- the shared public-site content stack
- machine-readable public artifacts for developer and agent consumption

This is a route and information-architecture planning artifact, not a visual design spec.

---

## Domain Structure Decision

DebugBundle should use one public content host plus a separate authenticated app host:

- `debugbundle.com` — static public site containing marketing pages, legal pages, docs under `/docs`, blog under `/blog`, and public machine-readable artifacts
- `app.debugbundle.com` — authenticated product app
- `api.debugbundle.com` — public API hostname

This is the intended default structure for v1.

### Why this split

**Keep the app on `app.`**
- The authenticated SPA has a different security, cookie, cache, and deployment profile than marketing/docs.
- It should be isolated from public content concerns.
- It keeps auth/session handling cleaner and avoids mixing product-app behavior into the apex domain.

**Keep docs and blog on the apex domain**
- Blog content should strengthen the main brand/domain.
- Product, company, legal, and launch content belongs naturally on `debugbundle.com`.
- Docs belong at `debugbundle.com/docs` so the public site, blog, machine-readable artifacts, and documentation ship from one static deployment artifact.
- A single route tree keeps cross-linking, sitemap generation, metadata, and static export simpler than coordinating multiple public-site frameworks or hosts.

### What not to do

- Do **not** place the authenticated SPA on the apex domain.
- Do **not** move the blog to `blog.debugbundle.com` unless there is a strong operational reason later.
- Do **not** force docs into the authenticated SPA shell.
- Do **not** split marketing, docs, and blog across separate public-site frameworks for v1.
- Do **not** require a Node.js server for the public site.
- Do **not** make docs/blog depend on client-only metadata.

---

## Content Stack Direction

### Public Site, Docs, and Blog

Preferred direction:
- **One Next.js app** for the full public site
- **Fumadocs** for both `/docs` and `/blog` content
- Normal static Next.js pages for marketing, legal, and trust routes

Why:
- one static deployment artifact for all public content
- `output: 'export'` keeps the public site compatible with S3 + CloudFront and removes any Node.js server requirement
- Next.js metadata, sitemap, and robots support preserve SEO-friendly behavior on static routes
- Fumadocs provides structured docs and content/blog primitives within the same public-site stack
- route groups and nested layouts allow `/docs`, `/blog`, and marketing/legal pages to share one app while keeping distinct UX shells

### Important separation rule

The authenticated app and the public static site should remain separate deployments even if they share brand styling.

---

## V1 Route Tree

```text
debugbundle.com
├── /
│   ├── Public landing page
│   ├── Core value proposition
│   ├── Main product framing
│   └── Primary calls to action: Open app, Read docs
├── /pricing
│   ├── Free / Solo / Team comparison
│   ├── Shared allowance explanation
│   └── Extra capacity pricing explanation
├── /blog
│   ├── Blog index
│   └── Content hub for product, engineering, launch, and agent-focused posts
├── /blog/:slug
│   └── Individual blog article
├── /changelog
│   └── Optional launch/post-v1 product updates surface
├── /about
│   └── Optional company/product philosophy page
├── /contact
│   └── Optional contact page
├── /privacy
│   └── Privacy policy
├── /terms
│   └── Terms of service
├── /security
│   └── Security overview / trust page
├── /docs
│   └── Redirect to current docs version
├── /docs/agent-workflows
│   └── Stable agent-workflows entry point (may redirect to current version)
├── /docs/v1
│   ├── /docs/v1/overview
│   ├── /docs/v1/api
│   ├── /docs/v1/cli
│   ├── /docs/v1/mcp
│   ├── /docs/v1/webhooks
│   ├── /docs/v1/sdks
│   │   ├── /docs/v1/sdks/node
│   │   ├── /docs/v1/sdks/browser
│   │   ├── /docs/v1/sdks/python
│   │   └── /docs/v1/sdks/php
│   ├── /docs/v1/auth
│   ├── /docs/v1/billing
│   ├── /docs/v1/agent-workflows
│   ├── /docs/v1/examples
│   └── /docs/v1/reference
│       ├── /docs/v1/reference/api-endpoints
│       ├── /docs/v1/reference/cli-commands
│       ├── /docs/v1/reference/mcp-tools
│       ├── /docs/v1/reference/webhook-events
│       ├── /docs/v1/reference/bundle-schema
│       ├── /docs/v1/reference/profile-schema
│       └── /docs/v1/reference/error-codes
└── /404
    └── Not found

app.debugbundle.com
├── /
│   └── App entry / authenticated home
├── /login
│   └── Session-based sign-in (email code, GitHub)
├── /signup
│   └── First-time account creation through the shared email-code flow
├── /auth/github/callback
│   └── GitHub sign-in completion
├── /invite
│   └── Project invite acceptance handoff
├── /dashboard
│   └── Minimal signed-in home
├── /billing
│   ├── Current plan
│   ├── Usage and quota view
│   ├── Upgrade / manage subscription
│   └── Allowance-capacity management
├── /projects
│   ├── Project list
│   └── Create project
├── /projects/:projectId
│   └── Project overview
├── /projects/:projectId/members
│   ├── Project member list (owner/admin only)
│   ├── Pending invites (owner/admin only)
│   ├── Invite collaborator (owner/admin only)
│   ├── Role management (owner/admin only)
│   └── Remove collaborator (owner/admin only)
├── /projects/:projectId/settings
│   ├── Project details
│   ├── Environment / install guidance entry point
│   └── Destructive actions (owner only)
│       └── Delete project confirmation
├── /projects/:projectId/github
│   ├── GitHub integration status (connection, assigned repo)
│   ├── Connect GitHub / Reconnect prompt (owner/admin only)
│   ├── Repository selection (owner/admin only)
│   ├── Dispatch rules list / create / edit / delete
│   ├── Delivery history table with status and retry
│   └── Free-tier upgrade prompt (when applicable)
├── /projects/:projectId/tokens
│   ├── Project token list
│   ├── Create token
│   ├── Show plaintext once state
│   └── Revoke token
├── /projects/:projectId/webhooks
│   ├── Webhook list
│   ├── Create webhook
│   ├── Test webhook
│   └── Delivery status/history entry point
├── /projects/:projectId/alerts
│   ├── Alert rules list
│   ├── Create alert rule
│   └── Delete alert rule
├── /projects/:projectId/capture-policy
│   ├── Current capture preset and resolved policy
│   ├── Preset selection (minimal / balanced / investigative, owner/admin only)
│   └── Advanced override controls (owner/admin only; members see preview only)
├── /member-tokens
│   ├── Member token list
│   ├── Create token
│   ├── Show plaintext once state
│   └── Revoke token
├── /settings
│   ├── Account profile
│   ├── Password change
│   └── Session/logout controls
├── /incidents
│   ├── Basic incident browser
│   └── Low-priority V1 surface only
└── /404
    └── Not found

```

---

## Public Non-Page Artifacts

These are public-facing machine-readable surfaces and should remain outside the app shell.

```text
debugbundle.com
├── /llms.txt
├── /robots.txt
├── /sitemap.xml
├── /openapi.json
├── /schemas
│   ├── /schemas/bundle.json
│   ├── /schemas/webhook-events.json
│   ├── /schemas/profile.json
│   └── /schemas/mcp-tools.json
└── /examples
    ├── /examples/bundle.failure.json
    └── /examples/bundle.improvement.json
```

---

## UX Grouping

The tree above breaks into five UX zones:

1. Marketing and trust entry
   - landing, pricing, trust, blog, and public company/product pages on the apex domain

2. Auth bootstrap
   - login, signup, shared email-code verification, and GitHub callback under `app.`

3. Signed-in app shell
   - a minimal operational surface rooted at `/dashboard`, `/billing`, `/projects`, `/member-tokens`, and `/settings`

4. Documentation product
   - concepts, install guides, versioned product docs, reference docs, and agent workflow docs under `/docs`

5. Machine-readable discovery
   - `llms.txt`, OpenAPI, schemas, and example artifacts for developer tooling and AI consumption

---

## Scope Guardrails

Included in V1:
- public landing page
- pricing page
- blog index and article pages
- legal/trust pages needed for launch
- auth pages under `app.`
- billing and usage pages in the app
- project and token management
- project member management
- webhook and alert management pages
- GitHub integration management (Solo+ only): connection, repo assignment, dispatch rules, delivery history
- docs landing, concepts, install guides, versioned docs, and references
- public site generated as a static export suitable for S3 + CloudFront deployment

Explicitly not a V1 page direction:
- placing docs inside the SPA app
- placing blog inside the SPA app
- using the apex domain as the authenticated app shell
- splitting the public site across multiple public-web frameworks or deployments
- chart-heavy observability UI as the center of the first web product
- session replay UI
- hosted MCP control plane UI

Low-priority or optional in V1:
- public changelog page
- richer project overview pages beyond what is required for setup and management
- basic incident browser refinements inside the signed-in app

---

## Implementation Notes

- The public site and blog should be built for SEO-first/static delivery.
- The docs site should be built for documentation-first information architecture and versioned navigation.
- The app should remain a true authenticated SPA with its own deployment/security boundary.
- Shared brand styling is fine, but route ownership and hosting boundaries should remain explicit.

---

## Source Alignment

This proposed tree is aligned with the current product and architecture direction, including:
- `tech-stack.md`
- `tiers.md`
- auth/session decisions for the SPA app
- public content/docs separation decisions made after review

If a later route or page design conflicts with the source-of-truth architecture documents, the architecture documents win.
