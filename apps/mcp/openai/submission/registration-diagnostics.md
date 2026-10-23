# Public submission registration diagnostics

The 23 October 2026 retry displays `client.mode: "cimd"` but fails with a pre-defined OAuth client ID requirement. Deleting and recreating a draft under the same parent plugin reproduced it. That did not establish a new plugin or MCP registration.

The owner-supplied frontend establishes a concrete incompatibility: its CIMD predicate rejects the advertised `private_key_jwt`-only method list. Correcting only that predicate locally cleared the client-ID error on the existing canonical draft. Subsequent owner screenshots show OAuth authorization, configured MCP, verified domain, all twenty-three expected tools and no findings in the latest MCP scan. No new parent upload was needed. Explicit confirmation of an override-disabled reload remains separate from the screenshot evidence.

`make openai-plugin-diagnostics` builds one **diagnostic-only** ZIP under `dist/openai-plugin-diagnostics/1.0.2/`. It does not alter the canonical plugin, release manifest, installed plugin, hosted OAuth provider or production configuration. The diagnostic preserves the exact endpoint, OAuth/CIMD configuration, scopes, skill bytes and review cases. No credentials are embedded. This is a connection test, not a candidate for review or publication.

## Optional fallback: isolate the parent plugin record

Use `debugbundle-cimd-isolated-1.0.2.zip`. This retains the existing compatibility package layout and changes only the internal manifest name to `debugbundle-cimd-isolated`. The visible product name remains DebugBundle.

Start from the main **Plugins** list and its new-plugin upload action. Do not upload this file as a new version of the existing `debugbundle` plugin; its internal name is intentionally different. Confirm that the new record's plugin identifier in the URL differs from the existing record. A different name is a diagnostic input, not proof that the portal actually allocated new registration state. If the portal reuses or rejects the old record, record that result and stop treating it as a clean registration test.

Inspect the imported JSON, domain-verification state and effective authentication settings. Select Connect once and retain the exact outcome. If domain verification requires a new token, inspect permitted challenge origins and existing token ownership before making any separately authorised hosted config change. Existing verification does not prove either a new or reused OAuth registration.

## Portable format deferred after schema review

OpenAI's package documentation describes per-server `extensions.com.openai.auth` in root `mcp.json`. On 23 October, the published Agent Plugins 1.0.0 MCP schema's `streamableHttpServer` allowed only `type`, `url` and `headers`, with `additionalProperties: false`; it did not permit that OAuth extension. The portable variant therefore failed schema review and was removed from the builder before handover. The regression suite requires that requesting it fails. Do not strip authentication to satisfy that schema or present a speculative portable package as qualified.

The generic manifest schema accepted `extensions` at the plugin root, but its MCP schema did not reconcile the documented per-server OpenAI extension. This is a separate documentation/schema inconsistency, not an established explanation of the compatibility portal failure.

## Historical inspection of the Connect failure

Clear the browser Network list, select Fetch/XHR and click the lower Connect once. Record new request URLs, methods, statuses, Request Payload and Response, omitting Authorization, cookies, tokens and secrets. A 200 discovery/configuration response is not necessarily the failing save operation. If Connect produces the toast without a new save request, client-side validation becomes the leading hypothesis; the toast alone does not prove that.

Useful response fields include effective OAuth registration settings and supported registration/authentication methods. Preserve field names and types. Do not infer a field's meaning from its name alone or change it through undocumented browser/API operations. A sanitised request/response is diagnostic evidence; no HAR has yet been captured for this retry.

The initial owner Network screenshot shows two 200 fetch responses, their preflights and telemetry entries. The full URLs and bodies are needed before identifying either response as the effective MCP configuration.

Sources: [OpenAI package structure and formats](https://developers.openai.com/plugins/build/plugins#plugin-structure), [automatic OAuth registration](https://developers.openai.com/plugins/build/plugins#use-automatic-oauth-client-registration), and [saved registration limitations](https://developers.openai.com/plugins/deploy/submission#configure-authentication-for-submission).

## Owner response evidence

The supplied plugin response identifies the same parent `plugin_asdk_app_6ac3a285ec848191a61ae75159bc7bba`, created `2026-10-05T13:13:44.198495+00:00`. Its associated MCP app is `asdk_app_6ac3a285ec848191a61ae75159bc7bba`. The response reports `mcp_configuration: {"type":"auth_not_configured","setup_complete":false,"source":"draft"}`, while the package's `settings_json` contains the expected OAuth/CIMD declaration. Thus draft recreation preserved the parent record, and the imported declaration has not established working authentication. The subsequent app response confirms `pending_version.mcp.type: "auth_not_configured"`, `oauth_client: null`, `supported_auth: null`, and no authorised version. Those unset fields establish no successful effective authentication configuration, but do not identify its discovery result or prove why Connect chooses pre-defined validation. The pending version also has `requires_mtls: false`. No credentials or raw response files were copied into the repository.

## Owner-provided frontend validation code

The owner supplied the loaded MCPServerSection JavaScript from the portal. Inspection confirms that the exact client-ID toast is constructed by the local request-building function when OAuth is enabled, the resolved mode is PREDEFINED, and neither an existing client nor an entered client ID is present. The save callback returns that validation error before invoking its mutation. This explains why no failing save request was visible; it is not an OAuth token-endpoint rejection.

The mode resolver accepts a requested CIMD mode only when its computed CIMD-support predicate passes; otherwise it falls back to automatic selection, ultimately PREDEFINED if neither CIMD nor DCR is available. Explicit or persisted PREDEFINED mode can also select that path even when CIMD is supported. The visible settings JSON is passed to a display component, while the save uses separate form state. Therefore displaying CIMD does not establish the resolved save mode, and the observed toast alone does not identify which mode-selection path ran.

The computed support check delegates to export `s` in `DiSHIPntD1.js`, imported as `gr`, using `client_id_metadata_document_supported` and `token_endpoint_auth_methods_supported`. The owner supplied this second module. Its export `s` is function `ep`, which accepts a non-empty method list only if `zt(methods).includes("none")`. The shared `zt` filter allows only `none`, `client_secret_post` and `client_secret_basic`, discarding `private_key_jwt`. Thus `ep({clientIdMetadataDocumentSupported: true, supportedAuthMethods: ["private_key_jwt"]})` returns false. The resolver then falls back to PREDEFINED when DCR is absent, producing the observed client-ID validation error before a save request.

The portal separately calls `getMcpOauthConfig` through its API client. Live DebugBundle discovery was refreshed and still advertises CIMD, `private_key_jwt` only and PKCE S256, with no DCR endpoint. The observed predicate is incompatible with this metadata and with OpenAI's current [client-registration documentation](https://developers.openai.com/plugins/build/auth#client-registration), which describes CIMD signed assertions using `private_key_jwt`. The exact discovered response consumed by the form was not retained. The subsequent corrected browser run described below confirms that the local predicate correction clears this blocker without changing the provider policy.

## Temporary local predicate correction

This is a browser-local diagnostic, not a DebugBundle runtime patch or an OpenAI release. Change only `ep` in the owner-loaded `DiSHIPntD1.js`; do not change the shared `zn`/`zt` credential-method filters, discovered responses, OAuth provider, validation errors, authentication flags, scan decisions or review gates. The original function returns false for the current metadata. Replace that function with:

```javascript
function ep({clientIdMetadataDocumentSupported: e, supportedAuthMethods: n}) {
    return e ? n != null && n.length
        ? zt(n).includes("none") || n.some(method => method?.trim() === "private_key_jwt")
        : !0
        : !1
}
```

An offline reproduction of these short pure functions covers twelve cases. The correction accepts `private_key_jwt` only when CIMD is advertised, preserves the existing absent/empty-list and `none` cases, and still rejects secret-only/unknown methods. With the current metadata and no DCR endpoint, resolved mode changes from PREDEFINED to CIMD. This is not browser execution, backend compatibility, token exchange or tool-scan evidence.

Use Chrome's documented [Local Overrides workflow](https://developer.chrome.com/docs/devtools/overrides): in Network find the loaded `DiSHIPntD1.js` request, right-click **Override content**, select an empty dedicated folder, grant DevTools access to that folder, edit only the function above and save with Command-S. Reload with DevTools open, then confirm the served script contains the correction and the request has the override indicator. Use the network-loaded script, not a source-map view. If the loaded filename or function differs, stop and inspect it before editing.

For a necessary future reproduction, reopen the existing DebugBundle connection, select CIMD if the form offers a registration-mode selector, and click the lower Connect once. The expected next step is a real configuration save using `use_cimd: true`, followed by server-enforced OAuth. A retained PREDEFINED form selection can still need explicit CIMD selection. Record the next outcome without copying cookies, tokens, assertions, secrets or authorization URLs. Do not submit for review or publish. If the backend rejects CIMD or signed assertions, retain that exact error and stop the diagnostic; do not add `none`, DCR or provided credentials to production. The owner has already completed the successful connection/scan sequence below; another attempt is not currently needed.

The owner could not save the editor buffer and supplied the local override path. The agent inspected its disk copy, confirmed the original predicate and zero `private_key_jwt` occurrences, staged the one-function change, then passed full-module syntax checking and twelve cases against the exact inspected helpers in a network-disabled Node 24 container. A byte comparison proves every other byte is unchanged. The corrected local file was atomically saved and independently read back with SHA-256 `9211f9e209c1f4b2a12c63269620c4e9728440c226b7f6bff8e9e651c02c068d`; the original is backed up in the temporary task directory. A stale unsaved DevTools buffer must be discarded rather than saved over that corrected file.

Disable **Sources > Overrides > Enable Local Overrides** after the bounded test and reload to restore the network-served portal. Only the owner-provided local override file was changed; no production metadata or provider policy was changed.

## Owner-confirmed connection and current scan

After loading the saved override, the owner first reached **Authorization required**, then completed the sign-in/consent flow and supplied an **Authorized** screenshot. The next screenshots show **MCP configuration: Configured**, **Authentication: Authorized**, **Domain verified** and **No findings in the latest MCP scan**, with server instructions and tools checked within the preceding minute. All twenty-three displayed tool names match `release-manifest.json`'s frozen catalog in order. The canonical parent remains `plugin_asdk_app_6ac3a285ec848191a61ae75159bc7bba`; its page selected app submission `appsub_6adb2e9621e08191a67e24595e22c21b`.

This is owner-observed portal authorization and metadata-scan evidence. It does not demonstrate execution of all reviewer cases, verify every imported tool annotation, record a raw token exchange, prove the override was disabled, or approve review/publication. The portal remains **Not published** and **Not submitted**. The owner completed the review-credentials step, and the five positive/three negative entries are marked complete. Supporting content still requires a video URL; release notes are imported. These are form-completion checks. The full recording script in `demo-recording-plan.md` preserves the eight imported prompts exactly; the recording and fresh reviewer-login/case evidence remain open.
