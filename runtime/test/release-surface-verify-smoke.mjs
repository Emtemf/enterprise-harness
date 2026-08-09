import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const verifyPath = path.join(repoRoot, 'runtime', 'verify.mjs');
const mode = process.argv[2];

if (!['red', 'green', 'verify'].includes(mode)) {
  console.error('Usage: node runtime/test/release-surface-verify-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const normal = spawnSync(process.execPath, [verifyPath, '--json'], {
  cwd: repoRoot,
  encoding: 'utf-8',
});
assert.notEqual(normal.status, 0, 'development verification must continue blocking invalid active change assets');
const normalResult = JSON.parse(normal.stdout);
assert.equal(normalResult.scope, 'development');
assert.equal(normalResult['consumed-evidence-summary'].developmentChangeValidationSkipped, false);

const releaseSurface = spawnSync(process.execPath, [verifyPath, '--release-surface', '--json'], {
  cwd: repoRoot,
  encoding: 'utf-8',
});

assert.equal(
  releaseSurface.status,
  0,
  `release-surface verification must ignore development-only active change assets: ${releaseSurface.stderr || releaseSurface.stdout}`,
);

const parsed = JSON.parse(releaseSurface.stdout);
assert.equal(parsed.ok, true, 'release-surface verification must report a passing contract');
assert.equal(parsed.scope, 'release-surface');
assert.equal(
  parsed['consumed-evidence-summary'].developmentChangeValidationSkipped,
  true,
  'release-surface verification must report that it excluded development-only change assets',
);

console.log(`PASS release-surface-verify ${mode}`);
