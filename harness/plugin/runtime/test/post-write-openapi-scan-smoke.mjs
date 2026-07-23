import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const postWritePath = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'hooks', 'post-write.mjs');
const mode = process.argv[2];

if (!['red', 'green', 'verify'].includes(mode)) {
  console.error('Usage: node harness/plugin/runtime/test/post-write-openapi-scan-smoke.mjs <red|green|verify>');
  process.exit(1);
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === '.codegraph') continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(srcPath, destPath);
    else fs.copyFileSync(srcPath, destPath);
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function writeText(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, 'utf-8');
}

function createTempRepo() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'post-write-openapi-'));
  const repoCopy = path.join(tempRoot, 'repo');
  copyDir(repoRoot, repoCopy);
  fs.rmSync(path.join(repoCopy, 'harness', 'changes'), { recursive: true, force: true });
  return { tempRoot, repoCopy };
}

function createMinimalTrackedChange(repoCopy) {
  const changeId = 'openapi-structure-smoke';
  const changeDir = path.join(repoCopy, 'harness', 'changes', changeId);
  fs.mkdirSync(path.join(changeDir, 'evidence'), { recursive: true });
  fs.mkdirSync(path.join(changeDir, 'reviews'), { recursive: true });
  writeJson(path.join(changeDir, 'state.json'), {
    schemaVersion: 1,
    changeId,
    tier: 'L1',
    state: 'DISCOVERED',
    owner: 'harness-governance',
    impact: { api: 'yes', data: 'no', architecture: 'no', rule: 'yes' },
    tooling: {
      codegraph: { status: 'available', queries: [], fallbackReason: null },
      documentation: { status: 'not-needed', libraries: [] },
    },
    decisions: [],
    blockers: [],
    approvals: {},
    gates: { designApproved: false, redVerified: false, redTask: null, redEvidenceRef: null },
    currentTask: null,
    workflow: {
      stage: 'clarify',
      clarifyReady: false,
      userConfirmedScope: false,
      planReady: false,
      tddStatus: 'not-started',
      nextEntry: '/harness',
    },
    validation: { status: 'missing', digest: null, validatedAt: null },
  });
  writeText(path.join(changeDir, 'change.md'), '# Change\n');
  writeText(path.join(changeDir, 'validation.md'), '# Validation\n');
  writeText(path.join(changeDir, 'evidence', 'tooling.md'), '# Tooling Evidence\n');
  return changeId;
}

function runPostWrite(repoCopy, filePath) {
  return spawnSync('node', [postWritePath], {
    cwd: repoCopy,
    encoding: 'utf-8',
    input: JSON.stringify({ tool_input: { file_path: filePath } }),
  });
}

const failures = [];
function check(desc, fn) {
  try {
    fn();
  } catch (error) {
    failures.push(`${desc}: ${error.message}`);
  }
}

check('non-reference-service openapi path triggers semantic error instead of earlier gates', () => {
  const { tempRoot, repoCopy } = createTempRepo();
  try {
    createMinimalTrackedChange(repoCopy);
    const yamlPath = path.join(repoCopy, 'order-service', 'openapi', 'order-service.yaml');
    writeText(yamlPath, 'openapi: 3.0.0\ncomponents: {}\n');
    const result = runPostWrite(repoCopy, yamlPath);
    const output = `${result.stdout || ''}${result.stderr || ''}`;
    assert.notEqual(result.status, 0, `expected non-zero exit, got ${result.status}`);
    assert.match(output, /openapi:/);
    assert.doesNotMatch(output, /dir:|file:|designApproved|plan-critic|verification-reviewer|missing change\.md|missing validation\.md|missing evidence\/tooling\.md/);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

function fail(message) {
  console.error(message);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

function pass(message) {
  console.log(message);
  process.exit(0);
}

if (mode === 'red') {
  if (failures.length === 0) {
    fail('Expected post-write OpenAPI scan smoke to fail before implementation, but it passed.');
  }
  pass('Red precondition holds: post-write.mjs still silently skips non-reference-service OpenAPI files.');
}

if (failures.length > 0) {
  fail('post-write-openapi-scan-smoke failed.');
}

pass(mode === 'green' ? 'Green post-write-openapi-scan-smoke passed.' : 'post-write-openapi-scan-smoke verify passed.');
