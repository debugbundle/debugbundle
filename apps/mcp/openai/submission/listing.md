# DebugBundle OpenAI Plugin Listing

Version: 1.0.1
Evidence state: production candidate with Developer Mode connection and bounded live-client evidence; not submitted, approved, published, or directory-discoverable

## Portal fields

- Name: `DebugBundle`
- Publisher identity: verified individual `Owen Far` (verification pending in the OpenAI organization used for submission)
- Short description: `Investigate runtime incidents` (the current portal limit is 30 characters)
- Category: select `Developer Tools` if that exact category exists in the live portal. Otherwise pause, record the closest verified category in the release evidence, and obtain owner review before submission.
- Website: `https://debugbundle.com/docs/mcp/openai-plugin`
- Support: `https://debugbundle.com/contact`
- Privacy: `https://debugbundle.com/privacy`
- Terms: `https://debugbundle.com/terms`
- Security: `https://github.com/debugbundle/debugbundle/security/policy`
- MCP URL: `https://mcp.debugbundle.com/mcp`
- Availability: all countries supported by the OpenAI submission portal

The upload artifact is the generated `debugbundle-openai-plugin-1.0.1.zip`, not the local source folder. It contains a remote `.mcp.json` and no `.app.json`. The old unpublished 1.0.0 form-created draft blocked ZIP updates: **Upload new version** first required its assigned internal name and then rejected the matching-name package with “Publish the existing MCP app before updating its plugin ZIP”; a fresh main-page attempt also matched that draft. The owner has now uploaded the ZIP as a new 1.0.1 draft with internal `plugin.json` name `debugbundle` and public `interface.displayName` `DebugBundle`; the portal also imported the skill and production MCP URL. The generated manifest imports five positive and three negative review cases. Enter private reviewer access and the accessible demo-recording URL through the secure review form; neither belongs in the ZIP unless a public recording URL is deliberately added to the manifest. Skill scanning, domain verification, OAuth connection, tool scanning, and review information remain separate portal checks.

## Long description

DebugBundle helps developers investigate production runtime failures and aggregate product usage from ChatGPT and Codex. Connect a DebugBundle project, list active incidents, inspect structured context, retrieve redacted deterministic bundles and reproductions, review stored runtime improvements, analyze bounded aggregate usage/routes/devices/acquisition/actions/funnels/journey patterns/incident impact, and examine endpoint health. The MCP connection is read-only: it does not expose individual journeys or custom dimensions and does not modify projects, resolve incidents, revoke access, generate artifacts, reconfigure checks, or send external messages. In an environment with shell access and an independently installed, authenticated DebugBundle CLI, the skill checks that separate capability for explicitly authorized changes and verifies the result. The plugin does not install the CLI or grant additional permissions.

## Positioning boundaries

The listing must not claim full observability, generic infrastructure monitoring, autonomous repair, automatic production fixes, raw-log access, individual-user analytics, arbitrary event search, or replacement of another monitoring product. Product analytics claims must remain limited to the nine frozen aggregate-only readers. The owner selected every country offered by the OpenAI portal; the live portal remains authoritative for that exact supported-country list. Enhanced distribution and proactive suggestions remain separate live portal decisions and are not asserted by this packet.
