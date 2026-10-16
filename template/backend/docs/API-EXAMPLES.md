# API walkthrough (local development)

These examples use `http://127.0.0.1:4000`, a generated app that has run its migrations, and a local PostgreSQL database. Replace email/password with test-only credentials. Never copy a real account's tokens into a public terminal transcript or commit them.

## Check readiness

```bash
curl -i http://127.0.0.1:4000/health
curl -i http://127.0.0.1:4000/ready
```

`/health` verifies that the API process is reachable. `/ready` also performs a PostgreSQL query; it is the correct endpoint for checking whether the app can serve database-backed requests.

## Register and sign in

```bash
curl -i -X POST http://127.0.0.1:4000/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"demo@example.com","password":"example-password-only-1234"}'

curl -i -c ./local-cookies.txt -X POST http://127.0.0.1:4000/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"demo@example.com","password":"example-password-only-1234"}'
```

Successful login returns JSON with `accessToken`, `tokenType: "Bearer"` and `expiresIn`; the refresh token is stored in an **HttpOnly cookie**, not in the JSON response. Copy the access token to a local shell variable for subsequent commands:

```bash
export ACCESS_TOKEN='paste-accessToken-from-local-login-response'
curl -H "Authorization: Bearer $ACCESS_TOKEN" \
  http://127.0.0.1:4000/v1/auth/me
```

Protect `local-cookies.txt` and delete it when finished. Add it to your own ignore rules if you keep local examples in a project directory.

## CRUD: tasks

```bash
# Create
curl -i -X POST http://127.0.0.1:4000/v1/tasks \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"title":"Ship documentation","description":"Review API examples","status":"todo","priority":"high"}'

# Search/filter/sort/paginate (all filters are scoped to the signed-in user)
curl -G http://127.0.0.1:4000/v1/tasks \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  --data-urlencode 'search=documentation' \
  --data-urlencode 'status=todo' \
  --data-urlencode 'priority=high' \
  --data-urlencode 'sort=newest' \
  --data-urlencode 'limit=20' \
  --data-urlencode 'offset=0'
```

Copy the `id` UUID returned by Create into `TASK_ID` before calling the next commands:

```bash
export TASK_ID='paste-task-uuid-from-create-response'
curl -H "Authorization: Bearer $ACCESS_TOKEN" \
  "http://127.0.0.1:4000/v1/tasks/$TASK_ID"

curl -i -X PATCH "http://127.0.0.1:4000/v1/tasks/$TASK_ID" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"status":"done"}'

curl -i -X DELETE "http://127.0.0.1:4000/v1/tasks/$TASK_ID" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Accepted statuses: `todo`, `in_progress`, `done`. Priorities: `low`, `normal`, `high`. For `GET /v1/tasks`, `limit` is 1–100, `offset` is 0–10000 and `sort` is `newest` or `oldest`. Each user can access only their own tasks; a missing or other user's task returns 404.

## Refresh, sessions, logout

```bash
# Rotate refresh cookie and return a new accessToken
curl -i -b ./local-cookies.txt -c ./local-cookies.txt \
  -X POST http://127.0.0.1:4000/v1/auth/refresh

# Inspect sessions using a currently valid access token
curl -H "Authorization: Bearer $ACCESS_TOKEN" \
  http://127.0.0.1:4000/v1/auth/sessions

# Revoke this refresh-session family
curl -i -b ./local-cookies.txt -X POST \
  http://127.0.0.1:4000/v1/auth/logout
```

Refresh token rotation detects reuse: **do not** send two concurrent refresh requests using the same cookie. Refresh responses contain a replacement access token; update your local `ACCESS_TOKEN` before further authenticated calls.

Other session routes:

- `DELETE /v1/auth/sessions/:id` (Bearer) revokes a single session owned by the user.
- `POST /v1/auth/logout-all` (Bearer) revokes all sessions, including the current one.
- `POST /v1/auth/change-password` (Bearer; JSON `currentPassword`, `newPassword`) changes the password and revokes all sessions.
- `DELETE /v1/auth/account` (Bearer; JSON `password`, `confirmation: "DELETE"`) deletes the account and related tasks and sessions permanently.

**Destructive operations:** logout-all, password change and account deletion invalidate sessions. Account deletion is irreversible; test it only with disposable data. Do not run destructive examples against production accounts.

## Common HTTP responses

| Code | Typical meaning |
| --- | --- |
| `200` | Success, including login, reading and refresh. |
| `201` | Resource created (registration/tasks). |
| `204` | Operation succeeded with no body (e.g. delete/logout). |
| `400` | Malformed or rejected input. |
| `401` | Missing/invalid bearer or refresh token. |
| `403` | Not allowed, such as password confirmation failure or non-admin access. |
| `404` | Route/resource absent, or resource not owned by the caller. |
| `409` | Duplicate email on registration. |
| `429` | Rate limit exceeded. |
| `500` | Internal error; review correlated server logs. |

Errors follow `{ "error": { "code": "...", "message": "...", "requestId": "..." } }` for the app's custom error handler. Match `requestId` with the `x-request-id` response header. Fastify's schema-validation errors may use framework-generated error formats; do not rely on one identical body shape for every invalid request without an explicit response-normalization layer.

For the exact request and response schemas, inspect the development-only Swagger UI at `/docs` and the TypeScript route modules in `src/modules/`.
