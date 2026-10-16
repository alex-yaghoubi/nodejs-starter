import assert from 'node:assert/strict';
import {test} from 'node:test';
import {hashPassword, verifyPassword} from '../src/lib/password.js';

test('scrypt password hashing uses distinct salts and safely checks credentials', async () => {
  const first = await hashPassword('a-high-entropy-password');
  const second = await hashPassword('a-high-entropy-password');
  assert.notEqual(first, second);
  assert.equal(await verifyPassword('a-high-entropy-password', first), true);
  assert.equal(await verifyPassword('wrong-password', first), false);
  assert.equal(await verifyPassword('password', 'not-a-valid-hash'), false);
});
