# Runbook: HTTP 500 Error Spike

## Affected Services
- **Primary Services:** `auth-service`, `api-gateway`, `payments-api`
- **Severity:** SEV-1 (if availability < 99.00%) or SEV-2

## Symptoms
- Sudden increase in HTTP 5xx server error responses.
- Overall availability drops below the Four Nines SLO target (99.99%).
- Error budget burn rate accelerates beyond 14x.

## Diagnostics

### 1. Prometheus / PromQL
Error rate per service:
```promql
sum(rate(http_requests_total{service="auth-service",status=~"5.."}[5m])) 
/ 
sum(rate(http_requests_total{service="auth-service"}[5m])) * 100
```

### 2. Loki / LogQL
Identify exception messages in structured logs:
```logql
{service="auth-service"} |= "error" or "Internal Server Error" or "ChaosError"
```

## Mitigation
1. Clear active fault injection via POST request to `/admin/chaos` on `auth-service`.
2. Validate automated recovery in the OpsGraph AI Reliability Dashboard.
