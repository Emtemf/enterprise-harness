import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const verifyPath = path.join(repoRoot, 'runtime', 'verify.mjs');
const mode = process.argv[2];

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === '.codegraph' || entry.name === '.bun' || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.cache') continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(srcPath, destPath);
    else fs.copyFileSync(srcPath, destPath);
  }
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
  console.error('Usage: node runtime/test/verify-validation-pass-detection-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-validation-pass-detect-'));
const repoCopy = path.join(tempRoot, 'repo');
try {
  copyDir(repoRoot, repoCopy);
  const changeDir = path.join(repoCopy, 'harness', 'changes', 'test-validation-pass-probe');
  fs.mkdirSync(changeDir, { recursive: true });
  fs.writeFileSync(path.join(changeDir, 'validation.md'), `# Validation

## Commands Executed
- mvn test

## Review Verdicts
- verification-reviewer: pass

## Stage Gate Summary
- verify: ready

## Skipped Checks
- none

## Failures and Retries
- 第一轮失败后已修复并重试完成

## Final Verdict
当前 change 已完成验证收口，但上面的失败记录仅用于历史说明。
`, 'utf-8');

  const result = spawnSync('node', [verifyPath, '--json'], { cwd: repoCopy, encoding: 'utf-8' });
  const parsed = JSON.parse(result.stdout || '{}');
  const problems = parsed?.contractChecks?.problems || [];
  const ok = !problems.some((p) => p.includes('Final Verdict claims pass while Failures and Retries contains unresolved content'));

  if (mode === 'red') {
    if (!ok) {
      fail('Expected verify pass detection to stop treating generic “完成” wording as an unconditional pass claim');
    }
    pass('Red precondition no longer holds.');
  }

  if (!ok) {
    fail('Expected verify pass detection to stop treating generic “完成” wording as an unconditional pass claim');
  }

  pass(mode === 'green' ? 'Green verify validation pass detection smoke passed.' : 'Verify validation pass detection smoke passed.');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
