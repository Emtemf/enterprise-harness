import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const [tarballArg, expectedVersion] = process.argv.slice(2);
if (!tarballArg || !expectedVersion) {
  console.error('Usage: node bin/validate-artifact.mjs <tarball> <expected-version>');
  process.exit(1);
}
const tarball = path.resolve(tarballArg);
const extract = fs.mkdtempSync(path.join(os.tmpdir(), 'enterprise-harness-artifact-validation-'));
try {
  const untar = spawnSync('tar', ['-xzf', tarball, '-C', extract], {
    encoding: 'utf-8',
    shell: false,
  });
  assert.equal(untar.status, 0, untar.stderr);
  const pkg = JSON.parse(fs.readFileSync(path.join(extract, 'package.json'), 'utf-8'));
  const plugin = JSON.parse(fs.readFileSync(path.join(extract, '.claude-plugin', 'plugin.json'), 'utf-8'));
  assert.equal(pkg.version, expectedVersion, 'artifact package version must match release tag');
  assert.equal(plugin.version, expectedVersion, 'artifact plugin version must match release tag');
  const manifest = JSON.parse(fs.readFileSync(path.join(extract, 'manifest-files.json'), 'utf-8'));
  assert.equal(manifest.version, expectedVersion);
  assert.equal(
    manifest.files.some((entry) => /^(?:harness\/(?:archive|changes|work|lessons)|harness\/policy\.json|PROGRESS\.md)/u.test(entry.path)),
    false,
    'artifact contains a forbidden development or source-policy asset',
  );
  const releaseVerification = spawnSync(process.execPath, ['runtime/verify.mjs', '--release-surface', '--json'], {
    cwd: extract,
    encoding: 'utf-8',
  });
  assert.equal(releaseVerification.status, 0, releaseVerification.stderr || releaseVerification.stdout);
  const releaseVerificationResult = JSON.parse(releaseVerification.stdout);
  assert.equal(releaseVerificationResult.scope, 'release-surface');
  assert.equal(releaseVerificationResult['consumed-evidence-summary'].developmentChangeValidationSkipped, true);
  const validation = spawnSync('claude', ['plugin', 'validate', '.'], {
    cwd: extract,
    encoding: 'utf-8',
    shell: process.platform === 'win32',
  });
  assert.equal(validation.status, 0, validation.stderr || validation.stdout);
  assert.doesNotMatch(`${validation.stdout || ''}\n${validation.stderr || ''}`, /warning/iu);
  console.log(`PASS artifact validation ${expectedVersion}`);
} finally {
  fs.rmSync(extract, { recursive: true, force: true });
}
