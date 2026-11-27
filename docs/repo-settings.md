# GitHub repository settings

Settings that live in GitHub, not in the repository, so a pull request cannot change them. Apply
them once by hand (or with the `gh` commands shown), and re-check after any repository transfer.
The names below are the labels in the GitHub web interface at the time of writing; GitHub renames
things occasionally.

## General

**Settings → General**

| Setting                                            | Value                                                                                           |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Description                                        | `Security-focused helpdesk: Argon2id, RBAC, CSRF, TOTP, abuse defences, hash-chained audit log` |
| Topics                                             | `cybersecurity`, `rbac`, `audit-log`, `angular`, `nextjs`, `owasp`, `siem`                      |
| Features → Issues                                  | On                                                                                              |
| Features → Discussions, Wiki, Projects             | Off unless they are used                                                                        |
| Pull Requests → Allow squash merging               | On                                                                                              |
| Pull Requests → Allow merge commits                | On (the existing history uses merge commits)                                                    |
| Pull Requests → Automatically delete head branches | On                                                                                              |

```bash
gh repo edit IgorK834/SecureDesk \
  --description "Security-focused helpdesk: Argon2id, RBAC, CSRF, TOTP, abuse defences, hash-chained audit log" \
  --add-topic cybersecurity --add-topic rbac --add-topic audit-log --add-topic angular \
  --add-topic nextjs --add-topic owasp --add-topic siem --delete-branch-on-merge
```

GitHub detects the licence from `LICENSE` on the default branch, so **About → License** shows
"MIT" after the first merge into `main`.

## Branch protection for `main`

**Settings → Branches → Add branch protection rule** (or **Rules → Rulesets**), branch name
pattern `main`:

| Option                                                           | Value                                                      |
| ---------------------------------------------------------------- | ---------------------------------------------------------- |
| Require a pull request before merging                            | On                                                         |
| Require approvals                                                | 0 for a solo maintainer, 1 once there is a second reviewer |
| Dismiss stale pull request approvals when new commits are pushed | On                                                         |
| Require review from Code Owners                                  | On when approvals are required (`.github/CODEOWNERS`)      |
| Require status checks to pass before merging                     | On, with the checks below                                  |
| Require branches to be up to date before merging                 | On                                                         |
| Require conversation resolution before merging                   | On                                                         |
| Require linear history                                           | Off (merge commits are used)                               |
| Do not allow bypassing the above settings                        | On                                                         |
| Allow force pushes, Allow deletions                              | Off                                                        |

Required status checks are added as the pipelines land; the names are the job names of the
workflows (see the CI tasks in [the Module 4 backlog](course/backlog-module-4.md)). Search for
the job name in the **Status checks that are required** box (for example `lint`; the list shows
them as `CI / lint`):

| Check                                                      | Added with              | Workflow                    | Status            |
| ---------------------------------------------------------- | ----------------------- | --------------------------- | ----------------- |
| `lint`, `typecheck`, `format`, `test`, `links`, `adr-lint` | CI workflow (SD-97)     | `.github/workflows/ci.yml`  | In the repository |
| `e2e`                                                      | E2E in CI (SD-98)       | `.github/workflows/ci.yml`  | Not built yet     |
| `CodeQL`, `gitleaks`                                       | Static analysis (SD-99) | `codeql.yml`, `secrets.yml` | Not built yet     |

A check can only be marked required after it has run once on the repository, so mark the six CI
checks after the first run of the workflow, from this pull request or from `main`.

The `test` job also publishes the coverage totals in the run summary and uploads the full report
as the `coverage` artifact (kept 14 days). Coverage is enforced by the 80% gate inside
`npm test`, not by a badge.

## Code security and analysis

**Settings → Code security** (called **Code security and analysis** in older layouts):

| Setting                         | Value                                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------ |
| Private vulnerability reporting | **Enable** (the link in [SECURITY.md](../SECURITY.md) and the issue chooser needs it)      |
| Dependency graph                | Enable                                                                                     |
| Dependabot alerts               | Enable                                                                                     |
| Dependabot security updates     | Enable                                                                                     |
| Secret scanning                 | Enable                                                                                     |
| Push protection                 | **Enable** (blocks a push that contains a detected secret)                                 |
| Code scanning                   | Set up through the CodeQL workflow, not the default setup, so the query suite is versioned |

```bash
gh api -X PUT repos/IgorK834/SecureDesk/private-vulnerability-reporting
gh api -X PATCH repos/IgorK834/SecureDesk \
  -f 'security_and_analysis[secret_scanning][status]=enabled' \
  -f 'security_and_analysis[secret_scanning_push_protection][status]=enabled'
```

## Actions

**Settings → Actions → General**

| Setting                                                             | Value                                                                                 |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Actions permissions                                                 | Allow actions created by GitHub and verified creators, or only the pinned list in use |
| Workflow permissions                                                | **Read repository contents and packages permissions**; workflows raise it per job     |
| Allow GitHub Actions to create and approve pull requests            | Off                                                                                   |
| Fork pull request workflows → Run workflows from fork pull requests | Require approval for first-time contributors                                          |

## Reviewing this page

Open the settings pages above and compare. Nothing here is enforced by code, so when a setting is
changed on purpose, update this file in the same pull request.
