import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  assertSafeId,
  canonicalPath,
  isSafeId,
  isSafeRelativePath,
  pathIsWithin,
  resolveChild,
  resolveWithin,
  safeSlug,
} from '../lib/safe-paths.mjs';

const mode = process.argv[2] || 'verify';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-safe-paths-'));
const governed = path.join(root, 'governed');
const outside = path.join(root, 'outside');
fs.mkdirSync(governed);
fs.mkdirSync(outside);

assert.equal(isSafeId('change-1'), true);
for (const value of ['../outside', '..', 'a..b', 'a/b', 'a\\b', '/tmp/x', 'C:\\tmp\\x', '']) {
  assert.equal(isSafeId(value), false, `${value} must not be accepted as an id`);
  assert.throws(() => assertSafeId(value));
}
assert.equal(isSafeRelativePath('evidence/result.json'), true);
for (const value of ['../outside', 'a/../../b', '/tmp/x', 'C:\\tmp\\x', 'a//b']) {
  assert.equal(isSafeRelativePath(value), false, `${value} must not be accepted as relative`);
}
assert.equal(resolveChild(governed, 'change-1'), path.join(governed, 'change-1'));
assert.equal(safeSlug('Launcher probe'), 'launcher-probe');
assert.throws(() => resolveWithin(governed, '../outside'));
assert.equal(pathIsWithin(path.join(governed, 'new', 'file.json'), governed), true);
assert.equal(pathIsWithin(path.join(outside, 'file.json'), governed), false);

const link = path.join(governed, 'escape');
try {
  fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal(pathIsWithin(path.join(link, 'file.json'), governed), false);
  assert.throws(() => resolveWithin(governed, 'escape/file.json'));
} catch (error) {
  if (!['EPERM', 'EACCES', 'UNKNOWN'].includes(error.code)) throw error;
}

assert.equal(canonicalPath(governed), fs.realpathSync(governed));
console.log(`PASS safe-paths-adversarial ${mode}`);
