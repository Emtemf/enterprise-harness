import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2] || 'verify';
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-release-surface-policy-'));
const extract = path.join(out, 'extract');

try {
  fs.mkdirSync(extract);
  const packed = spawnSync(process.execPath, [path.join(root, 'bin', 'package.mjs'), '--out', out], {
    cwd: root,
    encoding: 'utf-8',
    shell: false,
  });
  assert.equal(packed.status, 0, packed.stderr || packed.stdout);

  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));
  const tarball = path.join(out, `enterprise-harness-${pkg.version}.tar.gz`);
  const unpacked = spawnSync('tar', ['-xzf', tarball, '-C', extract], {
    encoding: 'utf-8',
    shell: false,
  });
  assert.equal(unpacked.status, 0, unpacked.stderr || unpacked.stdout);
  assert.equal(
    fs.existsSync(path.join(extract, 'harness', 'policy.json')),
    false,
    'source repository policy must not ship in the release artifact',
  );

  const verified = spawnSync(process.execPath, ['runtime/verify.mjs', '--release-surface', '--json'], {
    cwd: extract,
    encoding: 'utf-8',
    shell: false,
    env: { ...process.env, ENTERPRISE_HARNESS_SESSION_ID: undefined, CLAUDE_SESSION_ID: undefined },
  });
  assert.equal(verified.status, 0, verified.stderr || verified.stdout);
  const result = JSON.parse(verified.stdout);
  assert.equal(result.scope, 'release-surface');
  assert.equal(result.ok, true);
  assert.equal(
    result.contractChecks.problems.includes('file:harness/policy.json'),
    false,
    'release verification must not require a development-only source policy',
  );

  console.log(`PASS release-surface-policy ${mode}`);
} finally {
  fs.rmSync(out, { recursive: true, force: true });
}
