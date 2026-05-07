# Security Policy

## Reporting a Vulnerability

Do not report security issues in public issues, discussions, or pull requests.

Report vulnerabilities through GitHub's private vulnerability reporting flow for `debugbundle/debugbundle`:

- https://github.com/debugbundle/debugbundle/security/advisories/new

Include a clear description, impact assessment, affected version or commit, reproduction steps, and any mitigations you have already validated.

## Supported Versions

DebugBundle is pre-production. Security fixes are applied against the current main branch and the latest unreleased code in this repository.

## Response Expectations

- Initial triage within 3 business days.
- A follow-up status update after reproduction and impact assessment.
- Coordinated disclosure after a fix or mitigation is available.

## Scope

Security concerns include:

- Token leakage, token scope confusion, or token storage weaknesses.
- Redaction failures for secrets, PII, or regulated data.
- Authentication, authorization, or session boundary bypasses.
- Ingestion abuse, webhook signature validation flaws, or queue amplification paths.
- Browser relay trust-boundary failures or exposure of server-side credentials.

## Disclosure Process

Please avoid public issues until maintainers confirm a fix or mitigation window. Once a report is confirmed, maintainers will coordinate remediation, validation, and disclosure timing with the reporter when practical.
