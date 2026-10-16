# nodejs-starter

**Create a real, modular Fastify API in one command.** Backend-only and
independent of any specific frontend, payment service or cloud provider.

This public-ready template generates a Node.js 20.9+ / TypeScript / Fastify 5
API with PostgreSQL, Drizzle ORM and versioned REST endpoints. Included:

- **Authentication:** account registration, login, short-lived access JWTs,
  random HTTP-only refresh cookies and rotating/replay-detected sessions.
- **Session security:** per-device listing, session revocation, logout-all,
  current-password verification and revoke-on-password-change.
- **Real resource module:** user-owned Tasks CRUD with status, priority,
  literal-text search, ordering, bounded pagination and ownership enforcement.
- **Account lifecycle:** password-confirmed permanent self-service account
  deletion with database cascades for owned tasks and sessions.
- **Security defaults:** Zod, Helmet, restrictive CORS, scoped rate limits,
  redacted logs, safe errors with request IDs, scrypt password hashes,
  secure production cookies, cookie-request Origin validation and
  database-backed session authorization.
- **Developer experience:** OpenAPI/Swagger, typed modules, responsive
  Docker Compose environments, PostgreSQL migrations, health/readiness
  endpoints, graceful shutdown, and maintenance scripts.
- **Generator:** no upstream backend subscription or credentials, unique
  secret for each new app, npm/pnpm/Yarn support and safe directory handling.

> The source is **not yet published on npm**. Until it is released, run the
> generator from this repository checkout rather than assuming `npx` resolves
> the new code. This is a security-conscious starter, not a security audit or
> a complete identity service.

## Generate an API

```bash
# From a local checkout of this generator:
node ./bin/create-nodejs-standard-api.mjs my-api --skip-install
cd my-api
npm install
docker compose up -d db
npm run db:generate
npm run db:migrate
npm run dev
```

Visit http://localhost:4000/docs (development only) and use the sample Tasks
API after creating an account. The generator creates a local, git-ignored `.env`
with an unpredictable JWT secret. Your database migrations must be reviewed
and committed with the **generated application**, not with the generator.

See the [generated app guide](template/backend/README.md) for the complete
endpoint table, login/session behavior, data ownership rules, Compose setup
and deployment checklist.

## Documentation map

The generated API includes self-contained guides that remain in your new project's `docs/` directory:

| Guide | Covers |
| --- | --- |
| [Generated API README](template/backend/README.md) | Quick start, routes, migrations, auth, Docker, maintenance and security |
| [Configuration](template/backend/docs/CONFIGURATION.md) | Environment variables, secrets, local/Docker networking |
| [API examples](template/backend/docs/API-EXAMPLES.md) | Register/login, protected Tasks CRUD, refresh sessions |
| [Deployment](template/backend/docs/DEPLOYMENT.md) | Production checklist, migrations, operations and recovery |
| [Troubleshooting](template/backend/docs/TROUBLESHOOTING.md) | Common errors and safe diagnostics |

## Generator options

```bash
node ./bin/create-nodejs-standard-api.mjs my-api --pm pnpm
node ./bin/create-nodejs-standard-api.mjs my-api --pm yarn
node ./bin/create-nodejs-standard-api.mjs my-api --skip-install --no-git
node ./bin/create-nodejs-standard-api.mjs --help
```

No existing folder is overwritten. An installation failure preserves the
created project for manual recovery.

## Validation

```bash
npm test
npm pack --dry-run
```

After scaffolding and installing the backend dependencies, run
`npm run typecheck`, `npm test` and `npm run build` inside the created app.
A manual-only GitHub Actions workflow includes an optional PostgreSQL
integration suite running against an explicitly separate `_test` database;
it never blocks commits, PRs or deployment.

**Validation status:** Generator tests and packed-consumer checks can run
without backend dependencies. Full TypeScript/build and PostgreSQL integration
checks require installing backend dependencies from npm Registry, which is not
available in the artifact-building environment. Do not claim those checks
passed until actually executed.

## Repository and release

Suggested public GitHub repository:
`alex-yaghoubi/nodejs-starter`.
Suggested npm generator package: `create-nodejs-standard-api` (not published).
This project is standalone and does not modify the Next.js starter.

MIT license. See [SECURITY.md](SECURITY.md) for security reporting.
