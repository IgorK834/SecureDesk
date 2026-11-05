# Canarytokens deployment and evidence runbook

This procedure provisions the two assignment tokens without putting a URL or credential in Git.
The hosted service currently documents both **Web bug** and **AWS keys** tokens. The Web bug is
called by SecureDesk when the trap account is used. The AWS token is different: SecureDesk exposes
the planted keys in its decoy, while an attempted AWS API call with those keys is observed outside
the application and causes the provider's notification.

## Before starting

- Choose the notification e-mail or webhook used by the hosted service. Do not use a disposable
  destination that the report reviewer cannot verify.
- Use an untracked deployment `.env` or a secret manager. Never paste a token URL or either AWS
  value into source, documentation, test fixtures, screenshots, shell scripts or issue comments.
- Keep `CANARY_ALERTS_ENABLED=false` until the account token URL is installed. The independent
  administrator webhook is off when `ALERT_WEBHOOK_URL` is absent.
- Confirm the evidence directory contains only redacted images before committing it.

## 1. Create and install the account-trap Web bug

1. Follow the official HTTP-token guide at `docs.canarytokens.org/guide/http-token` and create a
   Web bug with reminder `SecureDesk backup administrator account trap`.
2. Store its generated URL as `CANARY_ACCOUNT_TRAP_URL` and set
   `CANARY_ALERTS_ENABLED=true` in the deployment environment. Restart the backend.
3. On the login page, solve the CAPTCHA, submit login `backup_admin` with any password, and verify
   that the client receives the ordinary `401 AUTH_INVALID_CREDENTIALS` response. When the later
   bot-simulation task is installed, its account-trap scenario is the repeatable equivalent.
4. Confirm that one local `HONEYTOKEN_TRIGGERED` event is CRITICAL and that the hosted notification
   arrives. A second request from the same address inside five minutes creates another event but
   does not call the Web bug again.

SecureDesk's Web-bug request carries only a generated event id and the static database label in
`User-Agent`. It does not copy the submitted login, password, address or request headers. Delivery
has a three-second timeout, one jittered retry and no redirects.

## 2. Create and install the AWS-keys token

1. Follow the official AWS-keys guide at `docs.canarytokens.org/guide/aws-keys-token.html`; create
   an AWS keys token with reminder `SecureDesk backup configuration decoy` and the same controlled
   notification destination.
2. Put the two generated values only in the deployment environment:

   ```dotenv
   CANARY_DECOY_AWS_ACCESS_KEY_ID=<value from the hosted service>
   CANARY_DECOY_AWS_SECRET_ACCESS_KEY=<value from the hosted service>
   ```

3. Restart the backend, then fetch the lure:

   ```sh
   curl -i https://<deployment-host>/api/backup/config
   ```

   Expect `200`, `Cache-Control: no-store`, the `backup_admin` bait login and the two planted
   values. The fetch itself creates a local aggregated `DECOY_RESOURCE_ACCESSED` CRITICAL event;
   it does not trigger the provider's AWS notification.

4. In a throwaway shell on a machine you control, export the two planted values and make a harmless
   identity request:

   ```sh
   aws sts get-caller-identity --region us-east-1
   ```

   The call is expected to fail as an AWS operation while still activating the token. Unset both
   variables and close the shell immediately afterwards. Do not run with shell tracing enabled and
   do not put the values on the command line, where they can enter shell history.

5. Wait for the notification. The official guide documents an AWS logging delay of approximately
   **2 to 30 minutes**, so a prompt local decoy event and a later hosted e-mail are expected.

The route remains safe and testable when both variables are absent: it returns
`DECOY_CREDENTIAL_NOT_CONFIGURED`, never a fallback application secret.

## 3. Optional administrator-controlled webhook

Set `ALERT_WEBHOOK_URL` to an HTTPS endpoint if CRITICAL events should also be delivered by
SecureDesk itself. The JSON body has exactly four fields: `type`, `time`, `severity`, `eventId`.
No request content, login, address, password or token is included. It uses the same three-second
per-attempt timeout, one retry, five-minute address deduplication and background failure handling.
Remove the variable to turn this channel off.

## 4. Evidence checklist

Save redacted screenshots in `docs/report-evidence/module-2/`:

- `m2-05-canarytoken-account-trap-alert.png`: Web-bug e-mail after the account-trap scenario.
- `m2-06-canarytoken-aws-alert.png`: AWS-keys e-mail after the identity request.
- `m2-08-security-events.png`: the two local CRITICAL event rows, generated automatically.

Before committing, mask the complete token URL, AWS access-key value, AWS secret-key value,
notification address, public IP and any provider tracking identifier. Leave visible the token type,
reminder, event time and non-secret description. Never manufacture an evidence image: if an alert
has not arrived, record it as pending.

After provisioning, replace the pending cells below with the fields actually visible in the two
redacted e-mails. This keeps the report factual rather than assuming the provider's mail format.

| Check                                | Observed result                                                        |
| ------------------------------------ | ---------------------------------------------------------------------- |
| Web bug type available               | Confirmed in official documentation on 2026-11-04                      |
| AWS keys type available              | Confirmed in official documentation on 2026-11-04                      |
| Account-trap hosted alert            | Pending operator notification destination and token provisioning       |
| AWS-use hosted alert                 | Pending operator notification destination, token provisioning and wait |
| Actual Web-bug e-mail fields         | Pending; record after receipt, without secret values                   |
| Actual AWS-keys e-mail fields        | Pending; record after receipt, without secret values                   |
| Stubbed payload/redaction assertions | Automated in `honeytokens.test.ts` and `webhook-alerts.test.ts`        |

## 5. Disable or rotate

- To stop application calls immediately, set `CANARY_ALERTS_ENABLED=false` and restart. Disable or
  delete the Web bug in the hosted service as well.
- To rotate the Web bug, create a replacement, update only `CANARY_ACCOUNT_TRAP_URL`, restart, test,
  then disable the old token.
- To rotate the AWS token, create a replacement, update both `CANARY_DECOY_AWS_*` values together,
  restart, fetch the decoy, test from a throwaway shell, then disable the old token.
- Remove `ALERT_WEBHOOK_URL` to disable the first-party channel.

The CI checks scan repository text for hosted-token URL literals and AWS-access-key-looking values.
They deliberately skip local `.env` files and never print a matched secret value.
