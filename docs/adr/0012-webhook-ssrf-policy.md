---
status: proposed
date: 2026-11-27
---

# Block server-side request forgery in outbound webhooks

## Context and problem statement

Outbound webhooks make the server fetch a user-supplied URL. Without limits that is a path to
internal services, cloud metadata and loopback.

## Considered options

- Trust configured URLs.
- Deny-list of known private ranges, checked on the URL string.
- Resolve the host, allow only public addresses, and connect to the address that was checked.

## Decision outcome

Resolve the name and refuse loopback, link-local, private and metadata addresses; connect to the
validated address so a DNS answer cannot change between check and use; no redirects; HTTPS in
production; short timeouts and a response size cap; deliveries are signed.

## Consequences

- Good: a webhook cannot be turned into an internal port scanner.
- Bad: legitimate internal receivers need an explicit, administrator-approved allow entry.

## Related

Webhook tasks in the Module 4 backlog; the existing Canarytokens webhook in
`server/security/canary-webhook.ts` is inbound and unaffected.
