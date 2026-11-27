# Contributing to SecureDesk

Thanks for helping. This is a security-focused project, so a change is finished when it is correct,
tested and documented, not only when it works.

Report vulnerabilities privately, as described in [SECURITY.md](SECURITY.md). Everything else can
be a public issue or pull request.

## Set up

You need Node.js 24 (`nvm use` reads `.nvmrc`) and npm. The full walkthrough, including how to
generate the secrets and find the seeded passwords, is in [docs/running.md](docs/running.md); in
short:

```bash
npm ci
cp .env.example .env     # then replace the placeholder secrets as docs/running.md explains
npm run db:migrate && npm run db:seed
npm run dev              # Angular on :4200, API on :3000
```

## Checks to run before you push

```bash
npm run lint
npm run typecheck
npm run format:check     # npm run format fixes it
npm test                 # unit and integration tests, coverage gate of 80%
npm run test:e2e         # browser tests; run `npx playwright install chromium` once
```

`npm test` also runs the security traceability check and the image-location check described below.

## Branches and commits

- Branch from `main` and open a pull request back into it. Keep a pull request to one purpose.
- Commit messages follow Conventional Commits with a capitalised, past-tense summary, as in the
  existing history: `feat(audit): Added sequence range filters to the audit log`. Common types are
  `feat`, `fix`, `test`, `docs`, `chore`, `ui` and `refactor`.
- Never commit secrets, `.env` files, database files or credentials. `.env.example` holds
  placeholders only.

## Security tests and traceability

Security behaviour is tied to numbered scenarios, `SEC-01`, `SEC-02` and so on, listed in
[docs/testing.md](docs/testing.md). The check `scripts/check-sec-traceability.ts` requires every
listed ID to appear in the title of a real `describe`, `it` or `test`.

To add one: append a row to the table in `docs/testing.md` with the next free ID, and put the same
ID at the start of the test title (`it('SEC-97 refuses …', …)`). A removed or renamed test makes
the check fail, which is the point.

Screenshots and other images belong in `docs/report-evidence/` only (`npm run check:image-locations`).

## Definition of Done

A change is done when it meets the project's
[Definition of Done](docs/course/backlog-module-4.md#10-definition-of-done): the backend enforces
the rule independently of Angular, input is validated server-side with strict schemas, nothing
secret or user-controlled is logged unsanitised, positive and negative tests exist, new routes and
permission codes are documented, schema changes ship as migrations, and the feature runs from a
clean clone. The pull request template repeats this as a checklist.

## Reporting bugs and proposing features

Use the issue templates. For a bug, include what you expected, what happened, how to reproduce it
and the commit you tested. For a security hardening idea that is not an active vulnerability, use
the **Security hardening** template.
