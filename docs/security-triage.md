# Security scan triage

Review CodeQL alerts in the repository's Security tab. For each open high or critical alert,
record the alert number, affected code, disposition and reason here. Fix confirmed findings or link
to their tracking issue. Record the reason for dismissing a false positive in GitHub as well.

## Gitleaks

The first full-history scan flagged a seeded ticket identifier, a synthetic admin-form password,
a duration in the Module 4 scenario table and the numeric budget following an empty API-key field
in the Module 6 example. The matching paths and values are listed in [the allowlist](../.gitleaks.toml).
The environment template also has exact exceptions for its documented placeholders and Cloudflare's
test keys. Gitleaks continues to scan every other value even in those files.

## ESLint

The filesystem rule flagged test-owned paths and operator-configured paths for SQLite, the audit
anchor, local alerts and seed output. Each exception in the
[backend lint config](../apps/backend/eslint.config.mjs) documents why the relevant path is trusted
or checked. The diagram parser's regex exception is limited to a test that reads a checked-in file.
