# Runbook: High Database Latency (PostgreSQL)

## Affected Service
- **Primary Service:** `payments-api`
- **Component:** PostgreSQL (`shop` database) / Payment Transaction
- **Potential Severity:** SEV-1 / SEV-2

## Symptoms
- Transaction p95 latency exceeds 1000ms (normal SLO: ≤ 500ms).
- Accelerated Error Budget burn rate (`burn_rate` > 2x or > 14x).
- Gradual SLA degradation and potential timeouts in upstream callers (`orders-api`).

## Diagnostics & Real Telemetry

### 1. Metrics (Prometheus / PromQL)
Query p95 latency in Prometheus:
```promql
histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{service="payments-api"}[5m])) by (le))
```

Check Error Budget Burn Rate:
```promql
(sum(rate(http_requests_total{service="payments-api",status=~"5.."}[5m])) / sum(rate(http_requests_total{service="payments-api"}[5m]))) / 0.0001
```

### 2. Structured Logs (Loki / LogQL)
Search for slow queries or connection contention:
```logql
{service="payments-api"} |= "slow database query" or "pg_sleep" or "connection pool"
```

### 3. Distributed Tracing (Tempo / OpenTelemetry)
Inspect slow traces to pinpoint bottleneck spans:
```traceql
{service="payments-api" && duration > 1000ms}
```
**Typical Indicator in Trace Waterfall:**
The root span `POST /internal/charge` takes > 1500ms, with > 80% of total duration concentrated in the database child span:
`payments-api` ➔ `pg: execute_charge` or `pg: SELECT pg_sleep`.

## Mitigation Procedure (Safe Catalog)

### Recommended Action
Restore `payments-api` runtime configuration, clearing active injected delay parameters or reverting connection configuration:

```bash
# Via Chaos / Admin API
curl -X DELETE http://localhost:8082/admin/chaos \
  -H "Authorization: Bearer dev-chaos-token"
```

Or via OpsGraph AI GraphQL:
```graphql
mutation {
  resetAllChaos
}
```

## Recovery Verification
1. Monitor `/health/ready` on `payments-api` until it responds HTTP 200 with latency < 30ms.
2. Verify in Prometheus that p95 latency returns below 500ms for 2 consecutive minutes.
3. Confirm that Burn Rate stabilizes below 1x.
