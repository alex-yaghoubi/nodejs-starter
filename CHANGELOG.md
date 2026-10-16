# Changelog

## 0.3.0 — Unreleased

- Added account self-deletion with password confirmation, row locking and
  cascading removal of owned tasks and sessions.
- Added task title search, priority filtering and newest/oldest sorting with
  SQL wildcard escaping and consistently filtered pagination totals.
- Hardened refresh/logout cookie endpoints with Origin and Fetch Metadata checks
  in addition to strict SameSite cookies and restrictive CORS.
- Bounded PostgreSQL connection setup time and isolated integration tests to
  opt-in databases ending in `_test`, with example-account cleanup.
- Expanded multilingual-independent API documentation and unit/integration
  scenarios for the new functionality.

## 0.2.0 — Unreleased

- Added independent, owner-scoped Tasks CRUD module with status, priority,
  pagination and database models.
- Added account session listing, targeted session revocation, logout-all,
  password change and refresh-token family replay detection.
- Bound bearer JWTs to active database session families for immediate logout.
- Added graceful shutdown, request correlation IDs, expiration cleanup and
  optional full Docker Compose environment.
- Fixed compiled server entrypoint and provided local PostgreSQL integration
  coverage in the opt-in/manual workflow.
- Expanded endpoint, authentication, database and deployment documentation.

## 0.1.0 — Unreleased initial draft

- Basic CLI generator, authentication, admin role, Drizzle migrations, local
  PostgreSQL Compose, Swagger, validation and HTTP error handling.

### Documentation expansion

- Add a complete environment configuration reference, practical API walkthrough, deployment runbook and troubleshooting manual to the generated backend.
- Link each guide from both the generator README and generated application README.
