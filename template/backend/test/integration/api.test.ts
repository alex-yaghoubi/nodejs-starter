import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';

// Never run destructive integration scenarios against a normal app database.
// A dedicated, migrated database whose name ends in _test is required.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ??= 'integration-test-only-secret-do-not-use-in-production-123456';
const databaseUrl = process.env.DATABASE_URL;
let databaseName = '';
try { databaseName = decodeURIComponent(new URL(databaseUrl ?? '').pathname.slice(1)); }
catch { /* Invalid or missing DATABASE_URL is rejected below. */ }
if (!databaseName.endsWith('_test') || process.env.ALLOW_INTEGRATION_DB !== 'true') {
  throw new Error('Integration requires a dedicated *_test database and ALLOW_INTEGRATION_DB=true');
}

const {buildApp} = await import('../../src/app.js');

test('auth, ownership-scoped task CRUD and immediate session revocation', async (t) => {
  const app = await buildApp();
  const createdEmails: string[] = [];
  t.after(async () => {
    try {
      const {db} = await import('../../src/db/index.js');
      const {users} = await import('../../src/db/schema.js');
      const {inArray} = await import('drizzle-orm');
      if (createdEmails.length) await db.delete(users).where(inArray(users.email, createdEmails));
    } finally {
      await app.close();
    }
  });

  const email = `api-${randomUUID()}@example.test`;
  createdEmails.push(email);
  const password = 'a-long-passphrase-for-tests';
  const register = await app.inject({method: 'POST', url: '/v1/auth/register', payload: {email, password}});
  assert.equal(register.statusCode, 201, register.body);
  assert.equal(register.json().email, email);
  assert.ok(!('passwordHash' in register.json()));

  const login = await app.inject({method: 'POST', url: '/v1/auth/login', payload: {email, password}});
  assert.equal(login.statusCode, 200, login.body);
  const token = login.json().accessToken as string;
  assert.equal(typeof token, 'string');
  const rawCookie = login.headers['set-cookie'];
  const cookie = (Array.isArray(rawCookie) ? rawCookie[0] : rawCookie)?.split(';')[0];
  assert.ok(cookie?.startsWith('refresh_token='));
  if (!cookie) throw new Error('Expected refresh cookie');
  const headers = {authorization: `Bearer ${token}`};

  const me = await app.inject({method: 'GET', url: '/v1/auth/me', headers});
  assert.equal(me.statusCode, 200, me.body);
  assert.equal(me.json().email, email);
  assert.ok(me.headers['x-request-id']);

  const forbiddenAdmin = await app.inject({method: 'GET', url: '/v1/users', headers});
  assert.equal(forbiddenAdmin.statusCode, 403);

  const create = await app.inject({method: 'POST', url: '/v1/tasks', headers,
    payload: {title: ' Prepare release ', priority: 'high'}});
  assert.equal(create.statusCode, 201, create.body);
  const taskId = create.json().id as string;
  assert.equal(create.json().title, 'Prepare release');

  const taskList = await app.inject({method: 'GET', url: '/v1/tasks?limit=5', headers});
  assert.equal(taskList.statusCode, 200, taskList.body);
  assert.ok(taskList.json().data.some((task: {id: string}) => task.id === taskId));

  // Literal matching avoids treating % and _ as user-supplied wildcard patterns.
  const searched = await app.inject({method: 'GET',
    url: '/v1/tasks?search=Prepare&priority=high&sort=newest', headers});
  assert.equal(searched.statusCode, 200, searched.body);
  assert.equal(searched.json().data.some((task: {id: string}) => task.id === taskId), true);
  const noWildcard = await app.inject({method: 'GET', url: '/v1/tasks?search=%25', headers});
  assert.equal(noWildcard.statusCode, 200, noWildcard.body);
  assert.equal(noWildcard.json().data.length, 0);

  const update = await app.inject({method: 'PATCH', url: `/v1/tasks/${taskId}`, headers,
    payload: {status: 'done'}});
  assert.equal(update.statusCode, 200, update.body);
  assert.equal(update.json().status, 'done');

  // A second account must never be able to see or alter the first user's task.
  const secondEmail = `second-${randomUUID()}@example.test`;
  createdEmails.push(secondEmail);
  assert.equal((await app.inject({method: 'POST', url: '/v1/auth/register',
    payload: {email: secondEmail, password}})).statusCode, 201);
  const secondLogin = await app.inject({method: 'POST', url: '/v1/auth/login',
    payload: {email: secondEmail, password}});
  assert.equal(secondLogin.statusCode, 200);
  const outsiderHeaders = {authorization: `Bearer ${secondLogin.json().accessToken as string}`};
  assert.equal((await app.inject({method: 'GET', url: `/v1/tasks/${taskId}`,
    headers: outsiderHeaders})).statusCode, 404);
  assert.equal((await app.inject({method: 'PATCH', url: `/v1/tasks/${taskId}`,
    headers: outsiderHeaders, payload: {status: 'done'}})).statusCode, 404);
  assert.equal((await app.inject({method: 'DELETE', url: `/v1/tasks/${taskId}`,
    headers: outsiderHeaders})).statusCode, 404);
  const outsiderList = await app.inject({method: 'GET', url: '/v1/tasks', headers: outsiderHeaders});
  assert.equal(outsiderList.statusCode, 200);
  assert.equal(outsiderList.json().data.length, 0);

  const ownSecond = await app.inject({method: 'POST', url: '/v1/tasks', headers: outsiderHeaders,
    payload: {title: 'Owned by second user'}});
  assert.equal(ownSecond.statusCode, 201, ownSecond.body);
  const invalidDelete = await app.inject({method: 'DELETE', url: '/v1/auth/account',
    headers: outsiderHeaders, payload: {password: 'wrong password', confirmation: 'DELETE'}});
  assert.equal(invalidDelete.statusCode, 403);
  const deletedAccount = await app.inject({method: 'DELETE', url: '/v1/auth/account',
    headers: outsiderHeaders, payload: {password, confirmation: 'DELETE'}});
  assert.equal(deletedAccount.statusCode, 204, deletedAccount.body);
  assert.equal((await app.inject({method: 'GET', url: '/v1/auth/me', headers: outsiderHeaders})).statusCode, 401);
  assert.equal((await app.inject({method: 'POST', url: '/v1/auth/login',
    payload: {email: secondEmail, password}})).statusCode, 401);
  // Cascading deletes prevent orphaned tasks after account removal.
  assert.equal((await app.inject({method: 'GET', url: '/v1/tasks', headers: outsiderHeaders})).statusCode, 401);

  const sessions = await app.inject({method: 'GET', url: '/v1/auth/sessions', headers});
  assert.equal(sessions.statusCode, 200, sessions.body);
  assert.ok(sessions.json().data.some((session: {current: boolean}) => session.current));

  const crossSiteRefresh = await app.inject({method: 'POST', url: '/v1/auth/refresh',
    headers: {cookie, origin: 'https://attacker.example'}});
  assert.equal(crossSiteRefresh.statusCode, 403);
  const crossSiteLogout = await app.inject({method: 'POST', url: '/v1/auth/logout',
    headers: {cookie, origin: 'https://attacker.example'}});
  assert.equal(crossSiteLogout.statusCode, 403);

  const refreshed = await app.inject({method: 'POST', url: '/v1/auth/refresh', headers: {cookie}});
  assert.equal(refreshed.statusCode, 200, refreshed.body);
  const nextToken = refreshed.json().accessToken as string;

  const replay = await app.inject({method: 'POST', url: '/v1/auth/refresh', headers: {cookie}});
  assert.equal(replay.statusCode, 401);
  const revoked = await app.inject({method: 'GET', url: '/v1/auth/me',
    headers: {authorization: `Bearer ${nextToken}`}});
  assert.equal(revoked.statusCode, 401, revoked.body);

  const loginAgain = await app.inject({method: 'POST', url: '/v1/auth/login', payload: {email, password}});
  assert.equal(loginAgain.statusCode, 200, loginAgain.body);
  const nextHeaders = {authorization: `Bearer ${loginAgain.json().accessToken as string}`};
  // Revoking an individual session invalidates its access token immediately.
  const anotherDevice = await app.inject({method: 'POST', url: '/v1/auth/login', payload: {email, password}});
  assert.equal(anotherDevice.statusCode, 200);
  const secondDeviceHeaders = {authorization: `Bearer ${anotherDevice.json().accessToken as string}`};
  const devices = await app.inject({method: 'GET', url: '/v1/auth/sessions', headers: nextHeaders});
  assert.equal(devices.statusCode, 200);
  const other = devices.json().data.find((session: {id: string; current: boolean}) => !session.current);
  assert.ok(other);
  const revoke = await app.inject({method: 'DELETE', url: `/v1/auth/sessions/${other.id}`, headers: nextHeaders});
  assert.equal(revoke.statusCode, 204);
  assert.equal((await app.inject({method: 'GET', url: '/v1/auth/me',
    headers: secondDeviceHeaders})).statusCode, 401);

  const changePassword = await app.inject({method: 'POST', url: '/v1/auth/change-password',
    headers: nextHeaders, payload: {currentPassword: password, newPassword: 'a-new-long-passphrase-for-tests'}});
  assert.equal(changePassword.statusCode, 204, changePassword.body);
  assert.equal((await app.inject({method: 'GET', url: '/v1/auth/me', headers: nextHeaders})).statusCode, 401);
  assert.equal((await app.inject({method: 'POST', url: '/v1/auth/login', payload: {email, password}})).statusCode, 401);

  const lastLogin = await app.inject({method: 'POST', url: '/v1/auth/login',
    payload: {email, password: 'a-new-long-passphrase-for-tests'}});
  assert.equal(lastLogin.statusCode, 200, lastLogin.body);
  const lastHeaders = {authorization: `Bearer ${lastLogin.json().accessToken as string}`};
  const deletion = await app.inject({method: 'DELETE', url: `/v1/tasks/${taskId}`, headers: lastHeaders});
  assert.equal(deletion.statusCode, 204);
  assert.equal((await app.inject({method: 'GET', url: `/v1/tasks/${taskId}`, headers: lastHeaders})).statusCode, 404);

  const logoutAll = await app.inject({method: 'POST', url: '/v1/auth/logout-all', headers: lastHeaders});
  assert.equal(logoutAll.statusCode, 204);
  assert.equal((await app.inject({method: 'GET', url: '/v1/auth/me', headers: lastHeaders})).statusCode, 401);
});
