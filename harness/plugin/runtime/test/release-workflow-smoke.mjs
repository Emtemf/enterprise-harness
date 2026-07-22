import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const repoRoot = '/home/wula/IdeaProjects/sdd';
const releaseScriptPath = path.join(repoRoot, 'bin', 'release.mjs');
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
  console.error('Usage: node harness/plugin/runtime/test/release-workflow-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'release-workflow-smoke-'));
try {
  // 运行 release.mjs --dry-run（不实际执行 git 操作）
  const releaseResult = spawnSync('node', [releaseScriptPath, '--dry-run'], {
    cwd: repoRoot,
    encoding: 'utf-8',
  });

  const output = releaseResult.stdout || '';

  // dry-run 应该显示将要执行的步骤
  const showsVersion = /version|版本/i.test(output);
  const showsDryRun = /dry.?run/i.test(output);
  const showsSteps = /step|步骤|tag|push|build|release/i.test(output);

  const ok =
    releaseResult.status === 0 &&
    showsVersion &&
    showsDryRun &&
    showsSteps;

  if (mode === 'red') {
    if (!ok) {
      fail('Expected release workflow contract to fail before implementation');
    }
    pass('Red precondition no longer holds.');
  }

  if (!ok) {
    const failures = [];
    if (releaseResult.status !== 0) failures.push(`release.mjs --dry-run exited ${releaseResult.status}: ${(releaseResult.stderr || '').trim()}`);
    if (!showsVersion) failures.push('output does not show version');
    if (!showsDryRun) failures.push('output does not indicate dry-run mode');
    if (!showsSteps) failures.push('output does not show release steps');
    fail(`Expected release workflow contract to pass:\n${failures.join('\n')}`);
  }

  pass(mode === 'green' ? 'Green release-workflow smoke passed.' : 'Release-workflow verify smoke passed.');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
