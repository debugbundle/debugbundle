# OpenAI Plugin 1.0.0 Policy Review

Status: Engineering privacy review complete on 2026-09-05; owner approved the OpenAI disclosure, customer-authorization, and restricted-data language on 2026-09-05. The reconciled public policies are deployed and verified. Remaining operator/controller, international-transfer, and country legal attestations remain pending.

This record separates implementation evidence from legal conclusions. No legal conclusion is inferred from a passing test or a source-level privacy control.

## Official Requirements Revalidated

The submission packet was checked on 2026-09-05 against current primary OpenAI sources:

- [Plugin guidelines](https://developers.openai.com/plugins/app-guidelines), including data minimization, restricted data, privacy-policy disclosures, and reviewer credentials;
- [Security and privacy](https://developers.openai.com/plugins/guides/security-privacy), including least privilege, explicit consent, retention, deletion, OAuth, security review, and monitoring;
- [Submit plugins](https://developers.openai.com/plugins/deploy/submission), including verified identity, public legal/support URLs, five positive and three negative cases, availability, and policy attestations; and
- [MCP server review requirements](https://developers.openai.com/plugins/deploy/app-review), including disclosure parity, outside-network reviewer access, and submission-project eligibility.

Recheck these pages if submission occurs after 2026-09-12 or if the portal requirements differ.

## Engineering Verification

| Requirement                | Verified implementation and disclosure                                                                                                                                                                                                                                                                                                  |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Purpose and minimization   | Exactly twenty-three purpose-specific read-only tools use strict inputs, fixed lookbacks and list bounds, existing redaction, an exact output allowlist, and no hidden generation or customer-state mutation.                                                                                                                           |
| Personal-data categories   | Verified email is used only for identity/workspace policy. Tool results may contain authorized project/service names, incident metadata, existing redacted operational evidence, improvement evidence, aggregate product analytics, and sanitized endpoint-health data.                                                                 |
| Recipient and use          | OpenAI is the recipient of a result only after a user links ChatGPT or Codex and requests a matching tool operation. Results are returned to answer that request.                                                                                                                                                                       |
| Retention                  | DebugBundle creates no separate persisted copy of MCP tool results. Source records retain their normal tier-based lifetime. Metadata-only hosted logs are retained for 14 days. OAuth codes, expired or revoked refresh history, and expired or revoked grants have 24-hour, 30-day, and 90-day physical-retention bounds respectively. |
| User controls              | Consent shows six independently removable product scopes. A linked member can review and revoke a connection in Settings, export retained account data, or delete the organization account.                                                                                                                                             |
| Exclusions                 | Raw logs, full chat history, prompt/model content, individual analytics journeys or sample IDs, credentials, authentication material, object keys, signed URLs, database-only identifiers, internal hashes, custom dimensions, payment data, and all writes are outside the public contract.                                            |
| Restricted-data safeguards | Tool inputs do not solicit PCI data, protected health information, government identifiers, or credentials. Existing SDK/server redaction and the OpenAI output allowlist remove supported secret, card, government-identifier, and authentication patterns. Customer-controlled strings remain untrusted and are never executed.        |
| Isolation and security     | Per-tool scopes, current membership/project checks, verified UserInfo, PKCE, exact issuer/resource/audience/client binding, revocation, canonical-host isolation, rate limits, database bulkheads, and the MCP-only emergency gate are implemented and tested.                                                                          |

Normative technical evidence remains in `contracts/openai-plugin-v1-data-map.md`, `tests/fixtures/openai-plugin-v1/tool-contracts.json`, `tests/fixtures/openai-plugin-v1/schemas.json`, and `spec/openai-plugin-threat-model.md`.

## Owner Legal Attestations

These are the only privacy/legal decisions that engineering evidence cannot make for the owner:

- [ ] The verified OpenAI developer or business identity accurately matches the public DebugBundle name, website, support contact, privacy policy, and terms.
- [ ] The public policies identify the correct legal operator/controller and contact details, and their governing-law, consumer, data-rights, and dispute terms are appropriate for the operator and target countries.
- [x] The owner approved terms requiring a member who connects OpenAI for an organization to have permission to share the selected project data. The consent UI separately identifies OpenAI, the selected scopes, and the read-only transfer before access is allowed.
- [ ] DebugBundle&apos;s lawful basis and controller/processor allocation for personal data belonging to users or other people are appropriate for the operator, customer agreements, and target countries.
- [ ] Processor/subprocessor, international-transfer, DPA, deletion/export, and security-incident commitments are accurate for the hosted vendors and countries offered.
- [x] The owner approved terms that prohibit use of the OpenAI connection with payment-card data, protected health information, government identifiers, access credentials, authentication secrets, and other restricted data prohibited by OpenAI.
- [x] Site commit `325bffd8953e01fcfd4f9fcc183fbd9e39839884` is deployed by site-only run `33954101292`; the exact privacy, terms, support, and OpenAI documentation listing URLs return successfully and their required disclosures were verified in the rendered responses on 2026-09-05.
- [ ] The final country/region availability selection matches the legal and support coverage the owner is prepared to provide.

If any attestation is uncertain, obtain qualified legal review before submission rather than weakening the technical data boundary or making an unsupported portal attestation.

## Evidence Boundary

This review does not authorize submission, publication, directory changes, communications, recurring spend, or a production deployment. The portal&apos;s final policy attestations must be compared with this record immediately before the owner approves the exact submission packet.
