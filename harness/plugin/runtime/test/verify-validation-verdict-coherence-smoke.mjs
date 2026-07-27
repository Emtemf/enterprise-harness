import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const verifyPath = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'verify.mjs');
const mode = process.argv[2];

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

function fail(message) {
  console.error(message);
  process.exit(1);
}

function pass(message) {
  console.log(message);
  process.exit(0);
}

if (!['red', 'green', 'verify'].includes(mode)) {
  console.error('Usage: node harness/plugin/runtime/test/verify-validation-verdict-coherence-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-validation-verdict-'));
const repoCopy = path.join(tempRoot, 'repo');
try {
  copyDir(repoRoot, repoCopy);
  const changeDir = path.join(repoCopy, 'harness', 'changes', 'intake-smoke-demo');
  fs.mkdirSync(changeDir, { recursive: true });
  fs.writeFileSync(path.join(changeDir, 'validation.md'), `# Validation

## Commands Executed
- mvn test

## Review Verdicts
- verification-reviewer: pass

## Stage Gate Summary
- verify: ready

## Skipped Checks
- OpenAPI E2E skipped pending environment

## Failures and Retries
- First run failed on network timeout, not rerun

## Final Verdict
pass
`, 'utf-8');

  const result = spawnSync('node', [verifyPath, '--json'], {
    cwd: repoCopy,
    encoding: 'utf-8',
  });
  const parsed = JSON.parse(result.stdout || '{}');
  const problems = parsed?.contractChecks?.problems || [];
  const ok = problems.some((p) => p.includes('Final Verdict claims pass while Failures and Retries contains unresolved content'))
    && problems.some((p) => p.includes('Final Verdict does not explain non-empty Skipped Checks'));

  if (mode === 'red') {
    if (!ok) {
      fail('Expected verify to reject contradictory Final Verdict vs Failures/Skipped sections');
    }
    pass('Red precondition no longer holds.');
  }

  if (!ok) {
    fail('Expected verify to reject contradictory Final Verdict vs Failures/Skipped sections');
  }

  pass(mode === 'green' ? 'Green verify validation verdict coherence smoke passed.' : 'Verify validation verdict coherence smoke passed.');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
