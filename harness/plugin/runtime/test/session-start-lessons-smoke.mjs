import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const hookPath = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'hooks', 'session-start.mjs');
const lessonsModule = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'lib', 'lessons.mjs');
const mode = process.argv[2];

function fail(message) {
  console.error(message);
  process.exit(1);
}

function pass(message) {
  console.log(message);
  process.exit(0);
}

if (!['red', 'green', 'verify'].includes(mode)) {
  console.error('Usage: node harness/plugin/runtime/test/session-start-lessons-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const failures = [];

// 1. 纯函数层：highSeverityLessons 只挑 high 严重度。
const { highSeverityLessons, readLessonIndex } = await import(lessonsModule);
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'session-start-lessons-'));
try {
  const lessonsDir = path.join(fixtureRoot, 'harness', 'lessons');
  fs.mkdirSync(lessonsDir, { recursive: true });
  fs.writeFileSync(path.join(lessonsDir, 'INDEX.md'), [
    '# Lessons Index',
    '',
    '<!-- LESSONS:BEGIN -->',
    '- high-one — high — a, b',
    '- low-one — low — c',
    '- high-two — high — d',
    '<!-- LESSONS:END -->',
    '',
  ].join('\n'));

  const all = readLessonIndex(fixtureRoot);
  const highs = highSeverityLessons(fixtureRoot);
  if (all.length !== 3) failures.push(`readLessonIndex should parse 3 entries, got ${all.length}`);
  if (highs.length !== 2) failures.push(`highSeverityLessons should return 2 high entries, got ${highs.length}`);
  if (!highs.every((l) => l.severity === 'high')) failures.push('highSeverityLessons should only include severity=high');
  if (!highs.some((l) => l.id === 'high-one' && l.tags === 'a, b')) failures.push('highSeverityLessons should preserve id and tags');

  // 2. 空/缺失索引不应崩。
  const emptyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'session-start-lessons-empty-'));
  try {
    const emptyHighs = highSeverityLessons(emptyRoot);
    if (emptyHighs.length !== 0) failures.push('missing index should yield no lessons');
  } finally {
    fs.rmSync(emptyRoot, { recursive: true, force: true });
  }
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}

// 3. hook 集成层：真实仓库 session-start 应输出高危教训行。
const hookRun = spawnSync('node', [hookPath], { cwd: repoRoot, encoding: 'utf-8' });
const hookOut = hookRun.stdout || '';
if (!hookOut.includes('[Harness 经验]')) failures.push('session-start should surface high-severity lessons in harness repo');

// 4. hook 在非 harness 目录应静默（不刷经验行）。
const nonHarness = fs.mkdtempSync(path.join(os.tmpdir(), 'session-start-nonharness-'));
try {
  fs.writeFileSync(path.join(nonHarness, 'package.json'), '{}\n');
  const silent = spawnSync('node', [hookPath], { cwd: nonHarness, encoding: 'utf-8' });
  if ((silent.stdout || '').includes('[Harness 经验]')) failures.push('non-harness project should not surface lessons');
} finally {
  fs.rmSync(nonHarness, { recursive: true, force: true });
}

const ok = failures.length === 0;

if (mode === 'red') {
  if (!ok) fail(`Expected session-start lessons contract to hold:\n${failures.join('\n')}`);
  pass('Red precondition no longer holds.');
}
if (!ok) fail(`Expected session-start lessons contract to hold:\n${failures.join('\n')}`);
pass(mode === 'green' ? 'Green session-start-lessons smoke passed.' : 'Session-start-lessons verify smoke passed.');
