# Platform Service Topology

OpsGraph AI monitors 5 real microservices running locally, instrumented with OpenTelemetry and Prometheus:

## 1. api-gateway (Port 8080)
- Ingress point for external HTTP traffic.
- Dispatches authentication calls to `auth-service`, checkout orders to `orders-api`, and status queries to downstream services.

## 2. auth-service (Port 8081)
- Issues and validates JWT authentication tokens.
- Endpoints: `/auth/login`, `/auth/verify`.

## 3. payments-api (Port 8082)
- Transactional payment processing.
- Connected to PostgreSQL relational database (`shop`).
- Executes ACID transactions inserting into the `payments` table.
- Supports runtime database delay injection (`SELECT pg_sleep`) for chaos engineering.

## 4. orders-api (Port 8083)
- Order lifecycle management (checkout, list, order status).
- Calls `payments-api` internally via HTTP with W3C Trace Context propagation (`traceparent`) and a strict 1500ms timeout.

## 5. notifications-service (Port 8084)
- Asynchronous processing and dispatching of transactional order status notifications.

## Observability Pipeline
- **Metrics:** Prometheus (Port 9090) scrapes `/metrics` from each service every 5s.
- **Traces:** OpenTelemetry SDK exports distributed spans via OTLP gRPC to the OpenTelemetry Collector (Port 4317) and Tempo (Port 3200).
- **Logs:** Pino Logger with correlation IDs (`traceId`, `spanId`) exports structured logs to Loki (Port 3100).
- **Dashboards:** Grafana (Port 3001) provisioned with Reliability and Platform dashboards.
