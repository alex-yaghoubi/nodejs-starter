import {test} from 'node:test';
import assert from 'node:assert/strict';
import {escapeLikePattern} from '../src/lib/search.js';
import {isTrustedOrigin} from '../src/lib/request-origin.js';

test('search treats LIKE wildcards as literal user input', () => {
  assert.equal(escapeLikePattern('100%_\\done'), '100\\%\\_\\\\done');
  assert.equal(escapeLikePattern('release'), 'release');
});

test('only exact trusted origins are accepted for cookie requests', () => {
  const own = 'http://127.0.0.1:4000';
  const allowed = ['http://localhost:3000'];
  assert.ok(isTrustedOrigin(undefined, own, allowed));
  assert.ok(isTrustedOrigin(own, own, allowed));
  assert.ok(isTrustedOrigin('http://localhost:3000', own, allowed));
  assert.ok(!isTrustedOrigin('https://evil.example', own, allowed));
  assert.ok(!isTrustedOrigin('http://localhost:3000.evil.example', own, allowed));
  assert.ok(!isTrustedOrigin('null', own, allowed));
  assert.ok(!isTrustedOrigin('http://localhost:3000/path', own, allowed));
});
