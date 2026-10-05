# OpenAI reviewer demo recording

Record one reviewer-accessible video after the current portal ZIP and synthetic reviewer connection work. Use the ChatGPT MCP-only surface for the negative mutation case; a shell-capable Codex session with a separately installed DebugBundle CLI has a different authorized handoff path. The video URL is required before review submission and is deliberately absent from the local ZIP until a real accessible recording exists.

1. Sign in to the fixed synthetic reviewer tenant before recording. Confirm that the account works without MFA, email/SMS codes, magic links, or private-network access. Never show or speak the credential, authorization code, access token, or real customer data.
2. Show the DebugBundle plugin name, read-only connection, and synthetic project. Run the five positive prompts in `portal-review.json` in order: active incidents, incident evidence, an empty critical filter, retained health history, and seven-day aggregate checkout analytics. Show the actual tool names and the bounded answer for each. Keep the sanitized health display URL in view when relevant.
3. Run the three negative prompts in `portal-review.json` in order: incident/check mutation, secret/internal data, and individual journey plus funnel mutation. Show that the plugin does not claim an unauthorized change or reveal excluded data. Do not invoke a separate local CLI in these cases.
4. Close with the read-only and aggregate-only scope, then share the recording through a stable HTTPS URL that the review team can open without additional sign-in or approval. Verify access in a private browser session before entering the URL in Review details.

Keep the live recording and its URL outside source control until the owner reviews the actual content and destination. The portal's secure Review details form holds reviewer credentials and sign-in instructions separately from the public ZIP.
