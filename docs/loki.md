# Ship audit entries to Loki

Leave `LOKI_PUSH_URL` empty to disable shipping. Set it to a base URL. SecureDesk appends
`/loki/api/v1/push`. A remote destination requires HTTPS. Local loopback addresses can use
HTTP. The destination belongs to the audit database's cursor. When changing collectors,
preserve the old copy and explicitly plan a new export or migration.

Audit commits schedule shipping in the background. The shipper reads up to 100 rows per
batch in ascending sequence and sends their original UTC timestamps as nanoseconds. It
advances the SQLite cursor only after the collector acknowledges the batch. If the
collector is unavailable, requests continue and shipping retries with capped backoff.
`npm run audit:ship` forces an attempt for a quiet deployment. A lease coordinates the
CLI and app processes using the same database.

If the collector accepts a batch but loses the acknowledgement, that batch can be sent
again. Compare or query copies by sequence and entry hash in this case. The lease and
persisted cursor prevent repeat delivery of already acknowledged batches in normal operation.

## Local Grafana

From the repository root, start the provisioned Grafana and Loki services.

```sh
docker compose -f docker-compose.observability.yml up -d
export LOKI_PUSH_URL=http://127.0.0.1:3100
npm run audit:ship
```

Use this URL in the backend environment to ship later activity. Generate a failed login
on the local test instance, then open [Grafana](http://127.0.0.1:3300) and select the
**SecureDesk audit** dashboard. The stack binds both published ports to loopback. This
local collector is intended for demonstration. Use a separately administered deployment
for an independent off-host copy.

In Grafana Explore, select **SecureDesk Loki** and run this LogQL query over a range that
includes the activity.

```logql
{app="securedesk",stream="audit"} | json | action="AUTH_LOGIN_FAILURE"
```

For per-minute counts use the query from the dashboard.

```logql
sum(count_over_time({app="securedesk",stream="audit"} | json | action="AUTH_LOGIN_FAILURE" [1m]))
```

## Compare the off-host copy

Retrieve the lines for `{app="securedesk",stream="audit"}` through Loki's range query API.
Use time slices small enough to retrieve all lines and sort them by `seq`. Verify the copied
prefix with the independent chain check in [Architecture](architecture.md#append-only-audit-trail).
The JSON lines use the same field names and canonical details text as a full SecureDesk JSON
Lines export. Compare `seq`, `entry_hash`, and the preceding hash with the local export over
the same prefix. A missing local sequence within the shipped prefix, a local head behind the
shipped head, or a mismatching hash is evidence to investigate. Later local rows can be pending
delivery.

See the [Loki HTTP API](https://grafana.com/docs/loki/latest/reference/loki-http-api/) and
[Grafana provisioning documentation](https://grafana.com/docs/grafana/latest/administration/provisioning/).
