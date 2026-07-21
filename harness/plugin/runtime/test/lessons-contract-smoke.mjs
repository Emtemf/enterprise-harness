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
  console.error('Usage: node harness/plugin/runtime/test/lessons-contract-smoke.mjs <red|green|verify>');
  process.exit(1);
}

// 在隔离临时目录里验证 lesson-add / lesson-list 契约，避免污染真实 harness/lessons。
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lessons-contract-'));
try {
  fs.mkdirSync(path.join(tempRoot, 'harness'), { recursive: true });

  // 1. 空态 lesson-list 应有明确提示，不应崩。
  const emptyList = run(tempRoot, ['lesson-list']);
  // 2. lesson-add 应创建文件 + 更新索引。
  const add1 = run(tempRoot, ['lesson-add', 'sample-pitfall', 'high', 'a,b', 'demo-change', '2026-07-21']);
  const lessonFile = path.join(tempRoot, 'harness', 'lessons', 'sample-pitfall.md');
  const indexFile = path.join(tempRoot, 'harness', 'lessons', 'INDEX.md');
  const fileCreated = fs.existsSync(lessonFile);
  const indexHasEntry = fs.existsSync(indexFile) && fs.readFileSync(indexFile, 'utf-8').includes('- sample-pitfall — high — a, b');
  // 3. 幂等：重复 add 同 slug，索引里仍只有一条。
  run(tempRoot, ['lesson-add', 'sample-pitfall', 'high', 'a,b', 'demo-change', '2026-07-21']);
  const indexRaw = fs.existsSync(indexFile) ? fs.readFileSync(indexFile, 'utf-8') : '';
  const occurrences = (indexRaw.match(/- sample-pitfall /g) || []).length;
  // 4. tag 过滤应命中 / 未命中分别有确定行为。
  const listByTag = run(tempRoot, ['lesson-list', 'a']);
  const listMiss = run(tempRoot, ['lesson-list', 'zzz']);

  const failures = [];
  if (emptyList.status !== 0) failures.push('empty lesson-list should exit 0');
  if (add1.status !== 0) failures.push('lesson-add should exit 0');
  if (!fileCreated) failures.push('lesson-add should create lesson md file');
  if (!indexHasEntry) failures.push('lesson-add should append index entry');
  if (occurrences !== 1) failures.push(`idempotent add should keep single index entry, got ${occurrences}`);
  if (!(listByTag.stdout || '').includes('sample-pitfall')) failures.push('lesson-list by matching tag should include entry');
  if (!(listMiss.stdout || '').includes('无匹配')) failures.push('lesson-list by missing tag should report no match');

  const ok = failures.length === 0;

  if (mode === 'red') {
    if (!ok) fail(`Expected lessons contract to hold:\n${failures.join('\n')}`);
    pass('Red precondition no longer holds.');
  }
  if (!ok) fail(`Expected lessons contract to hold:\n${failures.join('\n')}`);
  pass(mode === 'green' ? 'Green lessons-contract smoke passed.' : 'Lessons-contract verify smoke passed.');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
