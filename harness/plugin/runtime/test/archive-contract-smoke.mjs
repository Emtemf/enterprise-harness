import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const lifecyclePath = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'lifecycle.mjs');
const mode = process.argv[2];

function run(cwd, args) {
  return spawnSync('node', [lifecyclePath, ...args], { cwd, encoding: 'utf-8' });
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function pass(message) {
  console.log(message);
  process.exit(0);
}

if (!['red', 'green', 'verify'].includes(mode)) {
  console.error('Usage: node harness/plugin/runtime/test/archive-contract-smoke.mjs <red|green|verify>');
  process.exit(1);
}

function seedChange(root, changeId, state) {
  const dir = path.join(root, 'harness', 'changes', changeId);
  fs.mkdirSync(path.join(dir, 'evidence'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify({
    schemaVersion: 1,
    changeId,
    tier: 'L1',
    state,
    impact: { api: 'no', data: 'no', architecture: 'no', rule: 'no' },
    tooling: { codegraph: { status: 'available', queries: [], fallbackReason: null }, documentation: { status: 'not-needed', libraries: [] } },
    validation: { status: state === 'VALIDATED' ? 'fresh' : 'missing', digest: null, validatedAt: null },
  }, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, 'change.md'), '# Change\n');
  return dir;
}

// 在隔离临时目录里验证 archive 契约，避免动到真实 changes。
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-contract-'));
try {
  fs.mkdirSync(path.join(tempRoot, 'harness', 'plugin', 'runtime', 'test'), { recursive: true });

  // 1. VALIDATED change 应能成功归档。
  seedChange(tempRoot, 'done-change', 'VALIDATED');
  fs.writeFileSync(path.join(tempRoot, 'harness', 'ACTIVE_CHANGE'), 'done-change\n');
  const okArchive = run(tempRoot, ['archive', 'done-change']);
  const movedToArchive = fs.existsSync(path.join(tempRoot, 'harness', 'archive', 'done-change', 'state.json'));
  const removedFromChanges = !fs.existsSync(path.join(tempRoot, 'harness', 'changes', 'done-change'));
  const archivedState = movedToArchive
    ? JSON.parse(fs.readFileSync(path.join(tempRoot, 'harness', 'archive', 'done-change', 'state.json'), 'utf-8')).state
    : null;
  const activeCleared = !fs.existsSync(path.join(tempRoot, 'harness', 'ACTIVE_CHANGE'));

  // 2. 非 VALIDATED 应被拒绝。
  seedChange(tempRoot, 'draft-change', 'DRAFT');
  const rejectDraft = run(tempRoot, ['archive', 'draft-change']);

  // 3. 被 test 引用的 change 应被拒绝。
  seedChange(tempRoot, 'referenced-change', 'VALIDATED');
  fs.writeFileSync(path.join(tempRoot, 'harness', 'plugin', 'runtime', 'test', 'x-smoke.mjs'), "const id='referenced-change';\n");
  const rejectReferenced = run(tempRoot, ['archive', 'referenced-change']);

  const failures = [];
  if (okArchive.status !== 0) failures.push('VALIDATED archive should exit 0');
  if (!movedToArchive) failures.push('archived change should appear under harness/archive/');
  if (!removedFromChanges) failures.push('archived change should be removed from harness/changes/');
  if (archivedState !== 'ARCHIVED') failures.push(`archived state should be ARCHIVED, got ${archivedState}`);
  if (!activeCleared) failures.push('archiving active change should clear ACTIVE_CHANGE');
  if (rejectDraft.status === 0) failures.push('DRAFT archive should be rejected');
  if (rejectReferenced.status === 0) failures.push('test-referenced archive should be rejected');

  const ok = failures.length === 0;

  if (mode === 'red') {
    if (!ok) fail(`Expected archive contract to hold:\n${failures.join('\n')}`);
    pass('Red precondition no longer holds.');
  }
  if (!ok) fail(`Expected archive contract to hold:\n${failures.join('\n')}`);
  pass(mode === 'green' ? 'Green archive-contract smoke passed.' : 'Archive-contract verify smoke passed.');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
