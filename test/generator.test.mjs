import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, rm, readdir, stat, writeFile, access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {generate} from '../bin/create-nodejs-standard-api.mjs';

test('generator makes a complete project with a unique untracked secret', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'backend-starter-test-'));
  t.after(() => rm(dir, {recursive:true, force:true}));
  const result = await generate(['my-api', '--skip-install', '--no-git'], dir);
  const root = path.join(dir, 'my-api');
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.name, 'my-api');
  assert.match(result.message, /docker compose up -d db/);
  assert.match(result.message, /db:migrate/);
  assert.match(result.message, /db:generate/);
  const env = await readFile(path.join(root, '.env'), 'utf8');
  assert.match(env, /^JWT_SECRET=[a-f0-9]{96}$/m);
  assert.doesNotMatch(env, /replace-with/);
  assert.match(await readFile(path.join(root, '.gitignore'), 'utf8'), /^\.env$/m);
  await assert.rejects(access(path.join(root, 'gitignore.template')));
  assert.ok((await stat(path.join(root, 'src/modules/auth/auth.routes.ts'))).isFile());
});

test('different generated projects get different JWT secrets', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'backend-secrets-'));
  t.after(() => rm(dir, {recursive:true, force:true}));
  await generate(['one', '--skip-install', '--no-git'], dir);
  await generate(['two', '--skip-install', '--no-git'], dir);
  const a = await readFile(path.join(dir,'one','.env'),'utf8');
  const b = await readFile(path.join(dir,'two','.env'),'utf8');
  assert.notEqual(a.match(/JWT_SECRET=(.*)/)?.[1], b.match(/JWT_SECRET=(.*)/)?.[1]);
});

test('generator never overwrites an existing directory', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'backend-existing-'));
  t.after(() => rm(dir, {recursive:true, force:true}));
  await mkdir(path.join(dir, 'existing'));
  await writeFile(path.join(dir, 'existing', 'important'), 'preserve');
  await assert.rejects(generate(['existing','--skip-install','--no-git'],dir), /refusing to overwrite/);
  assert.equal(await readFile(path.join(dir,'existing','important'),'utf8'),'preserve');
});

test('unsafe names and unknown managers are rejected without side effects', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'backend-invalid-'));
  t.after(() => rm(dir, {recursive:true, force:true}));
  for (const args of [['../bad'], ['CON'], ['valid', '--pm','bad'], ['valid','--unknown']]) {
    await assert.rejects(generate(args,dir));
  }
  assert.deepEqual(await readdir(dir), []);
});

test('CLI help and version do not create files', async () => {
  assert.match((await generate(['--help'])).message, /Usage:/);
  assert.equal((await generate(['--version'])).message, '0.3.0');
});

test('generated backend includes functioning task and session modules', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'backend-modules-'));
  t.after(() => rm(dir, {recursive: true, force: true}));
  await generate(['modular-api', '--skip-install', '--no-git'], dir);
  const folder = path.join(dir, 'modular-api');
  for (const file of [
    'src/modules/tasks/tasks.routes.ts', 'src/modules/tasks/tasks.schemas.ts',
    'src/modules/auth/auth.service.ts', 'src/lib/request-origin.ts',
    'src/lib/search.ts', 'scripts/cleanup-sessions.ts',
    'test/tasks.test.ts',
  ]) assert.ok((await stat(path.join(folder, file))).isFile(), file);
  const pkg = JSON.parse(await readFile(path.join(folder, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts.start, 'node dist/src/server.js');
  assert.ok(pkg.scripts['sessions:cleanup']);
});
