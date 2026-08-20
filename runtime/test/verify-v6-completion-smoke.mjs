import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeClassificationArtifact } from '../core/classification-artifact.mjs';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const verifySource = fs.readFileSync(path.join(sourceRoot, 'runtime', 'verify.mjs'), 'utf-8');
assert.match(verifySource, /validateCompletionPredicate\(root, activeForCompletion\.changeId, activeForCompletion\.data\)/u);
assert.match(verifySource, /activeForCompletion\.data\.schemaVersion === 6/u);
assert.match(verifySource, /const developmentChangeProblems = releaseSurface\s*\? \[\]/u);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'enterprise-harness-verify-v6-'));
const changeId = 'verify-v6-probe';
const changeDir = path.join(root, 'harness', 'changes', changeId);
const verifyPath = path.join(sourceRoot, 'runtime', 'verify.mjs');

function copy(relPath) {
  fs.cpSync(path.join(sourceRoot, relPath), path.join(root, relPath), { recursive: true });
}

function runVerify(args = []) {
  const env = {
    ...process.env,
    ENTERPRISE_HARNESS_SESSION_ID: '',
    CLAUDE_SESSION_ID: '',
  };
  return spawnSync(process.execPath, [verifyPath, ...args], {
    cwd: root,
    encoding: 'utf-8',
    env,
    shell: false,
  });
}

try {
  copy('AGENTS.md');
  copy('CLAUDE.md');
  copy('.mcp.json');
  copy('package.json');
  copy('agents');
  copy('hooks');
  copy('runtime');
  copy('skills');
  copy('.claude-plugin');
  copy('harness');
  fs.rmSync(path.join(root, 'harness', 'changes'), { recursive: true, force: true });
  fs.mkdirSync(path.join(root, 'harness', 'changes'), { recursive: true });
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
  fs.copyFileSync(path.join(sourceRoot, '.claude', 'settings.json'), path.join(root, '.claude', 'settings.json'));

  fs.writeFileSync(path.join(root, 'harness', 'ACTIVE_CHANGE'), `${changeId}\n`, 'utf-8');
  fs.mkdirSync(changeDir, { recursive: true });
  const classification = writeClassificationArtifact(root, changeId, {
    impact: { api: 'no', data: 'no', architecture: 'yes', rule: 'yes', security: 'yes' },
  });
  fs.writeFileSync(path.join(changeDir, 'state.json'), JSON.stringify({
    schemaVersion: 6,
    revision: 1,
    changeId,
    lifecycle: 'active',
    stage: 'verify',
    artifacts: { classification },
    validation: { status: 'stale', digest: null, validatedAt: null },
  }, null, 2));
  fs.writeFileSync(path.join(changeDir, 'validation.md'), '# Validation\n');

  const plain = runVerify();
  assert.notEqual(plain.status, 0, plain.stderr);
  assert.match(plain.stdout, /Enterprise Harness Verify/u);
  assert.match(plain.stdout, /FAIL|WARN/u);

  const blocked = runVerify(['--json']);
  assert.notEqual(blocked.status, 0, blocked.stderr);
  const result = JSON.parse(blocked.stdout);
  assert.equal(result.ok, false);
  assert.ok(result.blockers.length > 0, `expected verify to block, got ${JSON.stringify(result)}`);

  const release = runVerify(['--json', '--release-surface']);
  assert.equal(release.status, 0, release.stderr);
  const releaseResult = JSON.parse(release.stdout);
  assert.equal(releaseResult.scope, 'release-surface');
  assert.ok(
    releaseResult.blockers.every((item) => !String(item).startsWith('completion:')),
    `release surface should not inspect dev completion gates, got ${JSON.stringify(releaseResult.blockers)}`,
  );

  console.log(`PASS verify-v6-completion ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
