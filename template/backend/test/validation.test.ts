import assert from 'node:assert/strict';
import {test} from 'node:test';
import {credentialsSchema} from '../src/modules/auth/auth.schemas.js';
import {validate} from '../src/lib/validation.js';
import {HttpError} from '../src/lib/http-error.js';

test('normalized registration credentials', () => {
  const result = validate(credentialsSchema, {email: ' Hello@Example.com ', password: 'this-is-a-good-password'});
  assert.equal(result.email, 'hello@example.com');
});

test('reject short passwords, invalid emails and unexpected input', () => {
  assert.throws(() => validate(credentialsSchema, {email: 'bad', password: '123'}), HttpError);
  assert.throws(() => validate(credentialsSchema, {email: 'me@example.com', password: 'valid-password', role: 'admin'}), HttpError);
});


test('account deletion requires the current password and explicit confirmation', async () => {
  const {deleteAccountSchema} = await import('../src/modules/auth/auth.schemas.js');
  assert.equal(deleteAccountSchema.safeParse({password: 'this-is-the-password', confirmation: 'DELETE'}).success, true);
  assert.equal(deleteAccountSchema.safeParse({password: 'this-is-the-password', confirmation: 'delete'}).success, false);
  assert.equal(deleteAccountSchema.safeParse({confirmation: 'DELETE'}).success, false);
  assert.equal(deleteAccountSchema.safeParse({password: 'valid', confirmation: 'DELETE', role: 'admin'}).success, false);
});
