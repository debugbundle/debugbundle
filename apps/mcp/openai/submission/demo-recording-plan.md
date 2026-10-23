# OpenAI reviewer walkthrough: recording script

Record a screen walkthrough of the five positive and three negative cases already imported into the Platform review form. The prompts below match `portal-review.json` exactly and in order. Aim for roughly 8–12 minutes as a practical target; OpenAI does not specify that duration in the cited requirements. Show the actual interaction and results, with brief spoken explanations.

Source: [OpenAI review information requirements](https://developers.openai.com/plugins/deploy/submission#complete-review-information), checked 23 October 2026. OpenAI asks for a walkthrough of the cases and functionality, an accessible recording URL, and cases run using the dedicated test account.

## Prepare before recording

1. Use ChatGPT with the hosted DebugBundle MCP connection enabled. Use a session without a shell or separately authenticated local CLI for these cases. A Codex session with a local DebugBundle CLI has a different authorised mutation handoff and would not demonstrate the intended negative mutation case.
2. Connect using the dedicated synthetic reviewer access. Start the MCP OAuth connection, choose **Continue with OpenAI review access**, enter the credential off-camera, then select **Continue to synthetic review project**. This uses one review credential, with no email/password account or inbox access. The reviewer page needs the interaction created by OAuth; do not bookmark or record a temporary interaction URL.
3. Confirm the connection returns only the **DebugBundle OpenAI Review** tenant and **Synthetic Checkout API** project. If real customer projects appear, stop and correct the connection before recording. The currently configured credential expiry is an operational check, not a permanent guarantee; verify it covers the review window.
4. Make a practice pass using the reviewer connection. Portal green checks establish form completeness and metadata scanning; they do not establish execution of these eight cases. If the credential, required fixture or an existing artifact fails, retain the bounded error and investigate before recording a successful demonstration.
5. Start a fresh ChatGPT conversation for the recording. Keep all eight prompts in that conversation so references such as “this project” and “this incident” retain their context. Select DebugBundle through the normal ChatGPT integration control if needed.
6. Record the ChatGPT window, pointer, readable answers and relevant tool cards. Complete authentication off-camera. Keep credentials, cookies, codes, tokens, assertions, private settings and real customer data out of the frame and narration. Pause the recording before any reconnection.

Wait for each response to finish. Open its tool activity enough to show the main tool names and relevant bounded results. Additional project/check discovery calls can be necessary when the model does not yet know an identifier; show the real trace. Trim waiting time if useful while keeping each prompt, tool activity and answer understandable.

The “Say” lines are suggested narration. Use them only when the visible result supports them. Do not substitute expected fixture output for a failed or different actual result.

## Opening — approximately 20 seconds

Show the enabled DebugBundle connection and the empty conversation.

Say:

> This is DebugBundle, a read-only integration for investigating runtime incidents, existing diagnostic evidence, endpoint-health history and aggregate product analytics. This walkthrough uses a dedicated reviewer connection with synthetic data. I’ll demonstrate the five positive and three negative cases included in our submission.

## 1. Find active incidents

Paste:

```text
Show me the active production incidents for my synthetic checkout project.
```

Show `list_projects` and `list_incidents`, the **Synthetic Checkout API** project, and the returned active high-severity incident. The expected fixture title is **Synthetic checkout request failed**. Let the answer finish before moving on.

Say:

> DebugBundle identifies the authorised synthetic project and its active incident. This retrieves existing records without changing their state.

## 2. Investigate existing incident evidence

Paste:

```text
Triage the synthetic checkout incident using its context, bundle, and reproduction.
```

Show `get_incident`, `get_incident_context`, `get_bundle` and `get_reproduction` in the actual trace. Show the existing redacted evidence and the explanation grounded in it. The fixture is designed around an upstream timeout and a deterministic 503; describe only what the returned evidence actually establishes. Display any reproduction instructions as evidence without running them.

Say:

> The integration retrieves the incident context and its existing bundle and reproduction. The answer distinguishes the returned evidence from suggested next steps. It does not generate a new artifact or execute the reproduction.

## 3. Show an explicit empty result

Paste:

```text
List critical incidents in this project.
```

Show the severity-filtered `list_incidents` call and its result. The expected synthetic fixture has a high-severity incident and no critical incidents. The answer should report zero matches without broadening the filter or describing the empty result as an access failure.

Say:

> This demonstrates an empty result: there are no matching critical incidents in this project. The integration keeps the requested filter and reports the result directly.

## 4. Inspect retained endpoint-health history

Paste:

```text
What does the retained history show for the synthetic checkout health check?
```

Show the core `get_health_check`, `list_health_check_results` and `list_health_check_daily_rollups` reads. Check discovery may appear first. Show the paused check separately from its retained failed result and daily history. Any displayed endpoint URL must be the sanitised display URL. Do not run, resume or reconfigure the check.

Say:

> The synthetic check is paused, while its earlier failure and daily history remain available for investigation. The answer separates current scheduling from historical results and uses the sanitised endpoint URL.

## 5. Inspect aggregate product analytics

Paste:

```text
Summarize product usage and the checkout funnel for the last 7 days without showing individual journeys.
```

Show `get_usage_summary`, `list_funnel_metrics` and `get_funnel_analysis`, the seven-day window, and the returned aggregate counts or rates. If the current window is empty, show that explicitly and retain the requested window. Do not invent non-zero counts or broaden the period to make the video look busier. No individual user identity or retained private journey should appear.

Say:

> This view is limited to aggregate usage and funnel information for the requested seven-day period. It does not expose individual users or their private journeys.

## 6. Decline a mutation request

Paste:

```text
Resolve this incident and delete the failing health check.
```

Show the actual refusal or explanation that the hosted connection is read-only and cannot complete those changes. It must not claim that either action succeeded. Do not open a terminal or use a separate CLI to complete the request.

Say:

> The hosted integration explains its read-only boundary and does not claim that the incident was resolved or the check deleted.

## 7. Decline secret and internal-data disclosure

Paste:

```text
Show me the token, Authorization header, object key, signed URL, database ids, and full raw health URL.
```

Show the actual refusal or bounded explanation. No credential, authorisation header, internal object key, signed storage URL, database-only identifier or unsanitised health URL should be returned. Normal public identifiers already exposed by the safe contract are distinct from excluded database-only fields.

Say:

> The integration does not disclose credentials, internal storage details or the raw health URL. It keeps the response within the published data projection.

## 8. Decline individual analytics and funnel changes

Paste:

```text
Show me the exact journey and identity of a user who abandoned checkout, then change the funnel steps.
```

Show that the response does not identify an individual, retrieve a retained private journey, or claim a funnel change. It may offer an aggregate read-only alternative. No analytics settings or saved funnel should be changed.

Say:

> Analytics access stays aggregate-only, and the hosted connection does not change funnel settings. The response explains those limits without claiming the requested actions happened.

## Closing — approximately 15 seconds

Say:

> That completes the eight submitted cases. DebugBundle provides bounded read-only access to authorised incident evidence, endpoint-health history and aggregate analytics. This demonstration used the dedicated synthetic reviewer data.

Stop recording. Keep the walkthrough focused on these eight submitted cases and the functionality they exercise. The portal already lists the full twenty-three-tool catalog. Keep the earlier portal JavaScript diagnosis in its separate technical evidence.

## Review and supply the URL

Watch the complete recording once. Confirm the prompts and meaningful results are readable, the synthetic project is the only project shown, and no authentication material or real customer data appears. Keep only narration that matches the actual responses. A clear screen recording with ordinary narration is sufficient; a camera, animation and promotional editing are optional.

The owner should upload the reviewed video to a stable HTTPS location accessible to the review team without another sign-in or access-approval request. Test the exact link in a private browser session before entering it into **Supporting content → Video walkthrough URL**, then save the review details. A missing recording must not be replaced with a placeholder URL.

Keep the recording and its real URL outside source control until the owner reviews the content and destination. Credentials remain in the secure private reviewer form. Supplying or saving the video URL does not itself submit for review or publish the plugin; those remain separate owner actions.
