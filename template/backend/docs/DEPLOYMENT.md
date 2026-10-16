# Deployment guide and operational checklist

This document provides a **pre-deployment runbook**, not a claim that the starter is certified production-ready. Its database integration tests, threat model, secret management, load behavior, disaster recovery, and cross-origin setup must be reviewed for your environment.

## 1. Prepare infrastructure

1. Provision PostgreSQL 16 or a compatible supported PostgreSQL instance. Use a dedicated least-privilege runtime database user and separate migration credentials where appropriate.
2. Provide HTTPS at the edge, enforce trusted proxy forwarding, limit direct database network access and configure private networking wherever possible.
3. Provision separate secret values **per environment** (`JWT_SECRET` and `DATABASE_URL`). Do not bake `.env` into Docker images; verify `.dockerignore` is retained.
4. Configure `NODE_ENV=production`, `HOST=0.0.0.0` inside containers, `ENABLE_DOCS=false`, explicit `CORS_ORIGINS` and `TRUST_PROXY` only for verified trusted proxies.
5. Design backup schedules, retention, tested restores and handling of user-data deletion across backup copies and downstream systems.

## 2. Build and verify an artifact

Inside a **generated application** with installed dependencies and a reviewed migration directory:

```bash
npm run typecheck
npm test
npm run build
```

If using Docker, review the included `Dockerfile` and build your application image with your deployment platform. The included `docker-compose.yml` is for local development, not a ready-made public reverse-proxy or production PostgreSQL configuration.

For a separate test database ending in `_test`, see the root generated app README for the opt-in integration procedure. The integration suite must never target production.

## 3. Apply migrations safely

Generate and review SQL **during development**, commit the generated `drizzle/` migration files, and apply those exact reviewed migrations in a controlled migration step before promoting the new API version:

```bash
npm run db:migrate
```

Use production migration credentials supplied by the deployment environment. Do not execute `db:generate` separately on each production replica. Plan what happens if a migration partially succeeds or a deployment is rolled back. Some database schema changes need a forward-fix migration and/or a tested database restore, not a simple rollback of application code.

## 4. Start and observe

The compiled server entrypoint is `dist/src/server.js`; `npm start` invokes it. Set appropriate process health checks:

- **Liveness:** `GET /health`, verifies HTTP process availability.
- **Readiness:** `GET /ready`, verifies the database query path and is a better gate for receiving traffic.
- Correlate logs with `x-request-id`; verify that tokens, cookies and DB credentials are redacted.
- Configure alerting for error rates, connection failures, latency, auth abuse and session cleanup failures.

The default rate limiter is **in-memory per process**. For replicas or aggressive public traffic, replace/augment it with a distributed limiter and edge admission controls. Review connection pool sizes relative to expected PostgreSQL capacity.

## 5. Scheduled operations

Run `npm run sessions:cleanup` on a trusted scheduler as a separate job. Avoid manually executing the admin-promotion script on a public server or exposing it through an API.

Admin bootstrap (trusted administrative environment only):

```bash
npm run admin:promote -- owner@example.com
```

A user must be registered before promotion. There is no public admin registration route.

## 6. Security decisions the template does not make for you

- **Frontend cookies:** same-site refresh-cookie design; cross-site architectures require a reviewed cookie + CSRF solution.
- **Identity:** email verification, password reset, MFA, and account recovery are **not included**.
- **Authorization:** starter `admin`/`user` roles are a foundation, not a policy engine for multi-tenant products.
- **Auditing:** durable security audit logs, anomaly monitoring and incident response are not included.
- **Deletion:** local DB cascades do not erase external data, backups or legally required records.
- **Resilience:** no built-in queue, high-availability failover, zero-downtime migration guarantee or tested restore automation.

Conduct dependency review, security assessment, load testing, recovery drills and integration tests in your own environment before allowing real users or sensitive data.

## 7. Release and recovery

Record the application commit, built image digest, migration version, approved rollback plan and relevant configuration (without storing secrets). If an app-only rollback is possible, preserve compatibility with applied migrations; otherwise use reviewed forward-fix migrations and/or tested restore procedures. Do not delete production DB volumes or rerun local development Compose cleanup commands during incident response.
