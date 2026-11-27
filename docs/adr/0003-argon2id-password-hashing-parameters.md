---
status: accepted
date: 2026-11-27
---

# Hash passwords with Argon2id at the OWASP minimum parameters

## Context and problem statement

Passwords need a memory-hard hash. The parameters set both the offline cracking cost and the login
latency.

## Considered options

- bcrypt (cost 12).
- scrypt.
- Argon2id with the OWASP minimum configuration, tuned later on real hardware.

## Decision outcome

Argon2id version 19, `memoryCost` 19456 KiB, `timeCost` 2, `parallelism` 1, a new 16-byte salt per
hash (`server/auth/password-hasher.ts`). The PHC string carries its own parameters, and
`needsRehash` flags hashes made with weaker settings so they can be upgraded at the next login.

## Consequences

- Good: parameters can be raised without a migration, old hashes keep verifying.
- Good: measured median of 14.6 ms per hash on the development machine, well inside the login
  budget, so there is headroom to raise the cost.
- Bad: the OWASP values are a minimum, not tuned. The benchmark (`npm run bench:argon2`) must be
  run on production hardware before deployment.

## Related

[architecture, Password hashing](../architecture.md#password-hashing)
