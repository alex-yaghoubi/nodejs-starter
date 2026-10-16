# Standard API — Fastify, TypeScript, PostgreSQL, Drizzle

A backend starter with real authentication, session management, account-owned
Task CRUD, typed input validation, security defaults, OpenAPI, migrations,
Docker and operational scripts. No managed vendor services or frontend required.

> **Status:** Starter software, not a complete identity platform or a security
> audit. Review the deployment checklist before exposing it to the Internet.

## Quick start

Requirements: Node.js **20.9+**, npm (or your chosen package manager) and access to **PostgreSQL**. **Docker is optional**. The generator creates a unique, Git-ignored `.env` secret. If using the template directly, copy `.env.example` to `.env` and replace `JWT_SECRET` with a strong random value.

```bash
npm install
# Set DATABASE_URL in .env to your local or hosted PostgreSQL instance.
# Optional local DB matching .env.example: docker compose up -d db
npm run db:generate
npm run db:migrate
npm run dev
```

If PostgreSQL is already available (locally or hosted), skip Docker entirely. The sample `DATABASE_URL` uses the optional Compose database credentials; replace it with your own connection string and required TLS settings.

- API: http://127.0.0.1:4000
- Swagger UI (local only): http://127.0.0.1:4000/docs
- Swagger JSON: http://127.0.0.1:4000/docs/json
- Health: `GET /health` (liveness, no database query)
- Readiness: `GET /ready` (real PostgreSQL query)

**Migrations:** `db:generate` creates the initial SQL migration under
`drizzle/`. Review it, then run `db:migrate`. **Commit the generated `drizzle/`
folder to your application repository** and use reviewed migrations on future
deployments. Do not generate different migrations independently on each
production instance. This scaffold is source-only; it does not include an
already-applied database or a pre-generated production migration.

## Detailed guides

- [Configuration reference](docs/CONFIGURATION.md) — every environment variable, local vs container networking and cookie deployment constraints.
- [API examples](docs/API-EXAMPLES.md) — end-to-end curl requests for registration, login, tasks, sessions and logout.
- [Deployment checklist](docs/DEPLOYMENT.md) — controlled migrations, secrets, health/readiness and recovery considerations.
- [Troubleshooting](docs/TROUBLESHOOTING.md) — common environment, database, auth, CORS, Docker and build issues.

## REST API

All application routes are versioned under `/v1`.

| Method | Route | Authorization | What it does |
| --- | --- | --- | --- |
| GET | `/health` | Public | Liveness |
| GET | `/ready` | Public | Database readiness |
| POST | `/v1/auth/register` | Public | Create a user account |
| POST | `/v1/auth/login` | Public | Issue access JWT + HTTP-only refresh cookie |
| POST | `/v1/auth/refresh` | Refresh cookie | Rotate refresh token, issue access JWT |
| POST | `/v1/auth/logout` | Refresh cookie | Revoke current refresh-token family |
| GET | `/v1/auth/me` | Bearer JWT | Return authenticated user profile |
| GET | `/v1/auth/sessions` | Bearer JWT | List active devices/sessions |
| DELETE | `/v1/auth/sessions/:id` | Bearer JWT | Revoke one session belonging to this user |
| POST | `/v1/auth/logout-all` | Bearer JWT | Revoke every session for this account |
| POST | `/v1/auth/change-password` | Bearer JWT | Verify current password and revoke all sessions |
| DELETE | `/v1/auth/account` | Bearer JWT + password | Permanently delete own account, sessions and tasks |
| GET | `/v1/users?limit=20&offset=0` | Admin JWT | Paginated users, excluding password hashes |
| GET | `/v1/tasks?limit=20&offset=0&status=todo&priority=high&search=ship&sort=newest` | Bearer JWT | Paginated tasks with exact title substring search, status/priority filters, newest/oldest sorting |
| POST | `/v1/tasks` | Bearer JWT | Create task for current account |
| GET | `/v1/tasks/:id` | Bearer JWT | Read own task |
| PATCH | `/v1/tasks/:id` | Bearer JWT | Change title, description, status or priority |
| DELETE | `/v1/tasks/:id` | Bearer JWT | Delete own task |

Example task body:

```json
{
  "title": "Ship first release",
  "description": "Review the changelog",
  "status": "todo",
  "priority": "high"
}
```

Statuses: `todo`, `in_progress`, `done`. Priorities: `low`, `normal`, `high`.
Task ownership is **always derived from the authenticated JWT**, never a
client-supplied `userId`. All reads, edits and deletes are restricted to the
current user. Requests for someone else's task return 404 rather than
revealing that the task exists. Search treats `%`, `_`, and `\` as literal
characters rather than SQL wildcards, and queries remain parameterized.

List parameters: `limit` (1–100, default 20), `offset` (0–10000), optional
`status`, optional `priority`, optional `search` (1–100 characters, task
titles only), and `sort=newest|oldest` (newest is the default). The `total`
value applies the same search and filters, scoped to the current user.
Offset pagination is a starter convenience; move to cursor pagination for
large, frequently updated datasets.

### Authentication example

```bash
curl -X POST http://127.0.0.1:4000/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","password":"replace-with-a-long-private-passphrase"}'

curl -i -c cookies.txt -X POST http://127.0.0.1:4000/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","password":"replace-with-a-long-private-passphrase"}'

# Copy the returned accessToken into a LOCAL shell variable (not source control).
export ACCESS_TOKEN='paste-jwt-here'
curl -H "Authorization: Bearer $ACCESS_TOKEN" \
  http://127.0.0.1:4000/v1/auth/me

curl -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"title":"First task","priority":"high"}' \
  http://127.0.0.1:4000/v1/tasks

curl -b cookies.txt -c cookies.txt -X POST http://127.0.0.1:4000/v1/auth/refresh
```

Never commit `cookies.txt`, access tokens, or `.env` files. Refresh cookies
use `HttpOnly`, `SameSite=Strict`, and `Secure` in production. They are scoped
to `/v1/auth`. Cookie-authorized refresh/logout additionally reject explicitly
untrusted `Origin` headers and `Sec-Fetch-Site: cross-site`; configured
`CORS_ORIGINS` entries are accepted in addition to the API's own origin.

This starter assumes a **same-site** frontend/backend deployment, and permits
non-browser clients without an Origin header. For a cross-site frontend,
design and review SameSite, Secure cookies and an explicit CSRF token or
equivalent policy together; simply relaxing SameSite or CORS is unsafe.
If the API is behind a proxy, ensure it forwards the canonical `Host` and
only enable `TRUST_PROXY` for a trusted reverse proxy.

### Sessions and password changes

Each login creates a new session family. Rotations stay in the family, so
refreshing does not create extra devices. **A reused, revoked refresh token
invalidates its session family**; this is deliberate replay protection. Clients
must serialize refresh attempts, e.g. one refresh at a time across browser
tabs, to avoid accidentally tripping replay detection.

JWTs carry the session family ID. Every protected request verifies that a
live session exists in PostgreSQL, making logout/revoke effective without
waiting for JWT expiry. This costs an additional database lookup per request.

```bash
# List devices/sessions:
curl -H "Authorization: Bearer $ACCESS_TOKEN" \
  http://127.0.0.1:4000/v1/auth/sessions

# Revoke every device (also invalidates this access JWT):
curl -X POST -H "Authorization: Bearer $ACCESS_TOKEN" \
  http://127.0.0.1:4000/v1/auth/logout-all
```

To change a password, POST `{"currentPassword":"...","newPassword":"..."}`
to `/v1/auth/change-password` with a bearer token. All sessions are revoked;
the user must log in again. New passwords must contain at least 12 characters.

### Account deletion

Send `DELETE /v1/auth/account` with a valid bearer JWT and JSON body
`{"password":"current-account-password","confirmation":"DELETE"}`. It
verifies the current password under a database lock, then permanently
deletes the user, all their Tasks and all refresh sessions using PostgreSQL
foreign-key cascades. The JWT immediately becomes unusable. This is
**irreversible**; your application must separately address backups,
privacy/legal retention obligations, and any external data integrations.

### First administrator

There is intentionally **no public admin registration**. Register a user, then
run from a trusted development/admin environment:

```bash
npm run admin:promote -- alice@example.com
```

Do not expose this script as an API endpoint.

## Commands

```bash
npm run dev                # tsx watch / auto reload
npm run typecheck          # static TypeScript checking
npm test                   # unit tests without a database
npm run build              # compile to dist/
npm start                  # run dist/src/server.js
npm run db:generate        # create initial or revised SQL migration
npm run db:migrate         # apply reviewed migrations
npm run db:studio          # inspect development database
npm run admin:promote -- person@example.com
npm run sessions:cleanup   # remove expired refresh records (schedule daily)
npm run test:integration   # needs a separate migrated PostgreSQL database
```

Integration runs are destructive and require a separate migrated database
whose name ends in `_test`, plus explicit `ALLOW_INTEGRATION_DB=true`.
For local testing, create an isolated database and migrate it first. The example below uses **optional Docker Compose**. With a locally installed or hosted PostgreSQL instance instead, create a distinct `_test` database and use its URL with the same migrate/test commands:

```bash
docker compose up -d db
docker compose exec db psql -U app -d postgres -c 'CREATE DATABASE standard_api_test;'
DATABASE_URL=postgres://app:local_dev_password@127.0.0.1:5432/standard_api_test npm run db:migrate
NODE_ENV=test ALLOW_INTEGRATION_DB=true \
  DATABASE_URL=postgres://app:local_dev_password@127.0.0.1:5432/standard_api_test npm run test:integration
```

The integration test cleans up its generated accounts after execution. Do
**not** point it at an existing application or production database.

## Optional Docker

Docker is not required for the API. If you prefer a disposable PostgreSQL database instead of an existing local or hosted one:

```bash
docker compose up -d db
```

For API and DB together: first install dependencies and run migrations from
the host, then run:

```bash
docker compose --profile full up --build -d
```

`api` is bound to localhost:4000 and `db` to localhost:5432 on the host.
The API container connects to the Compose `db` hostname internally.
The example database password is **for local development only**.
The production-mode container does not expose Swagger. The Dockerfile binds
the API on `0.0.0.0`, drops root privileges and never copies `.env` into the
image. Provision real secrets via your deployment environment.

## Project organization

```text
src/
  app.ts                         plugins, request ID, error handling, routes
  server.ts                      HTTP listener and graceful shutdown
  config/env.ts                  strict environment validation
  db/{index,schema}.ts           DB client, Drizzle tables
  lib/                            scrypt, validation, typed HTTP errors
  modules/
    auth/                         login, refresh, sessions, guards
    users/                        admin-only paginated users
    tasks/                        authenticated, owner-scoped task CRUD
    health/                       readiness and liveness
scripts/
  promote-admin.ts               trusted admin bootstrap
  cleanup-sessions.ts            expired refresh-session cleanup
test/
  integration/                   opt-in real PostgreSQL HTTP scenarios
```

### Error responses and tracing

Errors use a stable `error.code`, a safe public message, and a `requestId`
that matches the `x-request-id` response header. Never return stack traces,
password hashes, tokens or raw SQL to API clients.

## Security and production checklist

- Use HTTPS, managed secrets, individual application DB credentials and backups.
- Configure `CORS_ORIGINS` with exact frontend origins and `TRUST_PROXY` only
  when requests originate through a trusted reverse proxy.
- Store passwords with `scrypt`; check your organizational password/KDF policy.
- Use persistent **distributed** rate limiting for multi-replica deployments.
  The built-in limiter is process-local and should not be your only defense.
- Keep DB migrations reviewed and under source control; plan rollback/restore.
- Run `sessions:cleanup` daily and monitor failed authentication attempts.
- Account deletion is supported; add independent handling for object storage,
  backups, downstream systems and applicable retention/privacy obligations.
- Add email verification, password recovery, MFA, audit trails and notification
  delivery if your actual product requires them.
- Perform load, fault, vulnerability, penetration and recovery testing before
  treating this starter as a production system.

No payment, tenant, messaging, email provider or proprietary platform code is
bundled. The Backend Starter remains independent from the Next.js starter.
