## What and why

<!-- One or two sentences. Link the issue: Closes #123 -->

## Definition of Done

- [ ] The backend enforces the rule on its own; the Angular app is not the only guard
- [ ] Input is validated server-side with strict schemas
- [ ] Nothing secret or user-controlled is logged or stored unsanitised
- [ ] Positive and negative tests exist; new security behaviour has a `SEC-nn` row in `docs/testing.md`
- [ ] New routes and permission codes are documented (`docs/permissions.md`)
- [ ] Schema changes are migrations that keep existing data
- [ ] `npm run lint`, `npm run typecheck`, `npm run format:check` and `npm test` pass locally
- [ ] Docs, `.env.example` and the README are updated where behaviour changed

## How it was tested

<!-- Commands run, browser journeys tried, screenshots under docs/report-evidence/ if relevant -->
