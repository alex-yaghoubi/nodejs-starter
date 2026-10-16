import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  createTaskSchema, updateTaskSchema, listTasksSchema,
} from '../src/modules/tasks/tasks.schemas.js';
import {changePasswordSchema} from '../src/modules/auth/auth.schemas.js';

test('tasks reject injected owner IDs and unknown properties', () => {
  assert.equal(createTaskSchema.safeParse({title: ' Plan release ', priority: 'high'}).success, true);
  assert.equal(createTaskSchema.safeParse({title: 'A', ownerId: 'someone-else'}).success, false);
  assert.equal(createTaskSchema.safeParse({title: '   '}).success, false);
  assert.equal(createTaskSchema.safeParse({title: 'A', status: 'malicious'}).success, false);
});

test('patch requires a meaningful change and validates status', () => {
  assert.equal(updateTaskSchema.safeParse({}).success, false);
  assert.equal(updateTaskSchema.safeParse({status: 'done'}).success, true);
  assert.equal(updateTaskSchema.safeParse({priority: 'urgent'}).success, false);
});

test('bounded pagination and optional status filter', () => {
  assert.deepEqual(listTasksSchema.parse({}), {limit: 20, offset: 0, sort: 'newest'});
  assert.equal(listTasksSchema.safeParse({limit: 1000}).success, false);
  assert.equal(listTasksSchema.parse({status: 'todo'}).status, 'todo');
});

test('password change requires a sufficiently long new password', () => {
  assert.equal(changePasswordSchema.safeParse({currentPassword: 'old', newPassword: 'too-short'}).success, false);
  assert.equal(changePasswordSchema.safeParse({currentPassword: 'old', newPassword: 'a-better-long-password'}).success, true);
  assert.equal(changePasswordSchema.safeParse({currentPassword: 'old', newPassword: 'a-better-long-password', role: 'admin'}).success, false);
});


test('task query supports bounded literal search, priority and stable sorting', () => {
  assert.deepEqual(listTasksSchema.parse({}), {limit: 20, offset: 0, sort: 'newest'});
  assert.deepEqual(listTasksSchema.parse({search: 'release', priority: 'high', sort: 'oldest'}), {
    limit: 20, offset: 0, search: 'release', priority: 'high', sort: 'oldest',
  });
  assert.equal(listTasksSchema.safeParse({search: 'x'.repeat(101)}).success, false);
  assert.equal(listTasksSchema.safeParse({priority: 'critical'}).success, false);
});
