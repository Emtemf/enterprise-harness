import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHandoffInput } from '../lib/handoff.mjs';

const sourceRoot = process.cwd();
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-task-brief-worktree-'));
const changeId = 'task-brief-integration';
const worktree = path.join(root, 'worker');

function git(args, cwd = root) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf-8', shell: false });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

try {
  git(['init', '-q']);
  git(['config', 'user.email', 'harness@example.invalid']);
  git(['config', 'user.name', 'Enterprise Harness Test']);
  fs.mkdirSync(path.join(root, 'harness', 'changes', changeId, 'briefs'), { recursive: true });
  fs.copyFileSync(
    path.join(sourceRoot, 'runtime/test/fixtures/behavior-checks.json'),
  path.join(root, 'harness/behavior-checks.json'),
  );
  fs.writeFileSync(path.join(root, 'README.md'), '# baseline\n');
  git(['add', '.']);
  git(['commit', '-qm', 'baseline']);
  const headBefore = git(['rev-parse', 'HEAD']);

  const brief = path.join(root, 'harness', 'changes', changeId, 'briefs', 'task-brief-test-task.md');
  fs.writeFileSync(brief, '# Task brief\n\nImplement the fixture behavior.\n');
  const handoff = createHandoffInput(root, {
    changeId,
    stage: 'clarify',
    behavior: 'clarify.explore-code',
    role: 'execute',
    inputRefs: [`harness/changes/${changeId}/briefs/task-brief-test-task.md`],
    target: 'fixture task brief integration',
  });

  assert.equal(fs.existsSync(handoff.spoolPath), true);
  assert.match(fs.readFileSync(handoff.spoolPath, 'utf-8'), /Implement the fixture behavior/u);
  assert.equal(handoff.spoolPath.includes(`${path.sep}.git${path.sep}enterprise-harness${path.sep}runs`), true);

  git(['worktree', 'add', '--detach', worktree, 'HEAD']);
  assert.equal(git(['rev-parse', 'HEAD'], worktree), headBefore);
  assert.equal(fs.existsSync(path.join(worktree, 'harness', 'changes')), false);
  assert.equal(fs.existsSync(handoff.spoolPath), true);
  assert.match(fs.readFileSync(handoff.spoolPath, 'utf-8'), /Task brief/u);
  console.log('PASS task-brief-worktree-integration verify');
} finally {
  spawnSync('git', ['worktree', 'remove', '--force', worktree], { cwd: root, encoding: 'utf-8', shell: false });
  fs.rmSync(root, { recursive: true, force: true });
}
