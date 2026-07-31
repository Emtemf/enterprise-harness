import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const lifecyclePath = path.join(repoRoot, 'runtime', 'lifecycle.mjs');
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
  console.error('Usage: node runtime/test/archive-contract-smoke.mjs <red|green|verify>');
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
  fs.mkdirSync(path.join(tempRoot, 'runtime', 'test'), { recursive: true });

  // 1. 只有 VALIDATED projection、但缺 completion evidence 的 change 必须拒绝且无副作用。
  seedChange(tempRoot, 'done-change', 'VALIDATED');
  fs.writeFileSync(path.join(tempRoot, 'harness', 'ACTIVE_CHANGE'), 'done-change\n');
  const okArchive = run(tempRoot, ['archive', 'done-change']);
  const movedToArchive = fs.existsSync(path.join(tempRoot, 'harness', 'archive', 'done-change', 'state.json'));
  const remainsInChanges = fs.existsSync(path.join(tempRoot, 'harness', 'changes', 'done-change', 'state.json'));
  const activePreserved = fs.readFileSync(path.join(tempRoot, 'harness', 'ACTIVE_CHANGE'), 'utf-8') === 'done-change\n';

  // 2. 非 VALIDATED 应被拒绝。
  seedChange(tempRoot, 'draft-change', 'DRAFT');
  const rejectDraft = run(tempRoot, ['archive', 'draft-change']);

  // 3. 被 test 引用的 change 应被拒绝。
  seedChange(tempRoot, 'referenced-change', 'VALIDATED');
  fs.writeFileSync(path.join(tempRoot, 'runtime', 'test', 'x-smoke.mjs'), "const id='referenced-change';\n");
  const rejectReferenced = run(tempRoot, ['archive', 'referenced-change']);

  const failures = [];
  if (okArchive.status === 0) failures.push('incomplete VALIDATED archive should be rejected');
  if (movedToArchive) failures.push('failed archive must not create archive destination');
  if (!remainsInChanges) failures.push('failed archive must preserve source change');
  if (!activePreserved) failures.push('failed archive must preserve ACTIVE_CHANGE');
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
