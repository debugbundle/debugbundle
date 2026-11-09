# OpenAI Plugin V1 Tools

The 1.1 local candidate adds two saved-report readers to the original twenty-three read-only tools:

| Tool                              | Use                                                  | Required product scope                                     |
| --------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------- |
| `list_projects`                   | List projects visible to the current grant           | `debugbundle:projects:read`                                |
| `list_services`                   | List services/environments in one authorized project | `debugbundle:projects:read`                                |
| `list_incidents`                  | List bounded recent or active incidents              | `debugbundle:incidents:read`                               |
| `get_incident`                    | Read one incident summary and lifecycle state        | `debugbundle:incidents:read`                               |
| `get_incident_context`            | Read bounded incident and existing artifact context  | `debugbundle:incidents:read`, `debugbundle:artifacts:read` |
| `get_bundle`                      | Read an existing redacted debug bundle               | `debugbundle:artifacts:read`                               |
| `get_reproduction`                | Read existing redacted reproduction evidence         | `debugbundle:artifacts:read`                               |
| `list_improvements`               | List bounded runtime improvement opportunities       | `debugbundle:improvements:read`                            |
| `get_improvement`                 | Read one stored improvement and evidence summary     | `debugbundle:improvements:read`                            |
| `get_improvement_bundle`          | Read an existing improvement artifact                | `debugbundle:improvements:read`                            |
| `get_usage_summary`               | Read aggregate visits, visitors, and breakdowns      | `debugbundle:analytics:read`                               |
| `get_route_metrics`               | Read aggregate route traffic and friction            | `debugbundle:analytics:read`                               |
| `get_journey_patterns`            | Read aggregate transitions without samples           | `debugbundle:analytics:read`                               |
| `get_device_breakdown`            | Read aggregate device/browser/OS/language metrics    | `debugbundle:analytics:read`                               |
| `get_referrer_metrics`            | Read aggregate referrer and standard UTM metrics     | `debugbundle:analytics:read`                               |
| `get_action_metrics`              | Read aggregate action/conversion/marker metrics      | `debugbundle:analytics:read`                               |
| `list_funnel_metrics`             | List aggregate funnel conversion metrics             | `debugbundle:analytics:read`                               |
| `get_funnel_analysis`             | Read aggregate metrics for one named funnel          | `debugbundle:analytics:read`                               |
| `get_incident_impact`             | Read aggregate incident reach without samples        | `debugbundle:analytics:read`, `debugbundle:incidents:read` |
| `list_health_checks`              | List endpoint-health definitions with sanitized URLs | `debugbundle:health:read`                                  |
| `get_health_check`                | Read one sanitized endpoint-health definition        | `debugbundle:health:read`                                  |
| `list_health_check_results`       | Read bounded recent endpoint outcomes                | `debugbundle:health:read`                                  |
| `list_health_check_daily_rollups` | Read bounded daily health aggregates                 | `debugbundle:health:read`                                  |

| `list_reports` | List saved report runs in the linked workspace | `debugbundle:reports:read` |
| `get_report_content` | Read canonical saved facts, resolutions, priorities and coverage | `debugbundle:reports:read` |

All tools advertise `readOnlyHint: true`, `openWorldHint: false`, and `destructiveHint: false`. Tool inputs reject unknown fields and never accept source selection, local paths, bearer/member/project tokens, arbitrary URLs, organization IDs, sample IDs, or custom dimensions. Analytics lookbacks are fixed to 24 hours, 7 days, 30 days, or 90 days and result lists are capped at 25.

There are no tools for incident or configuration mutation, artifact generation, individual journey samples, analytics opportunities/bundles/settings, probes, alerts, webhooks, notifications, credential or member management, billing, local files, setup, or verification in this plugin.

Saved-report access requires new explicit OAuth consent. Existing grants remain unchanged. Reports require current access to every frozen project/origin; incomplete access withholds the whole report. Report reads preserve canonical narrative, expire with the archive, disclose unavailable/oversized content and never generate AI, prepare PDF, send email or return storage keys/internal request hashes.
