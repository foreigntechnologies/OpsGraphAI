# Runbook: Cascading Dependency Timeout

## Affected Services
- **Caller:** `orders-api` (Port 8083)
- **Slow Downstream Dependency:** `payments-api` (Port 8082, endpoint `/internal/charge`)
- **Symptom:** HTTP 504 Gateway Timeout in `orders-api`

## Architecture & Thresholds
- The HTTP client in `orders-api` is configured with a strict **1500 ms** timeout.
- If `payments-api` takes longer than 1500 ms to respond, `orders-api` aborts the upstream client call and returns HTTP 504 to the API Gateway.

## Diagnostics
Inspect distributed traces in Tempo where `service="orders-api"` and status code is 504:
- The span `orders-api: HTTP POST http://localhost:8082/internal/charge` is interrupted with a timeout error at 1500 ms.

## Mitigation
- Reset active artificial delay or roll back runtime changes in `payments-api`.
