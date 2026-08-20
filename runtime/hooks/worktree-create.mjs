import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { projectRoot } from '../lib/checks.mjs';

const root = projectRoot();
const worktreesRoot = path.join(process.env.HOME || '/home/wula', '.claude', 'worktrees');
fs.mkdirSync(worktreesRoot, { recursive: true });
const target = path.join(worktreesRoot, `enterprise-harness-${process.pid}-${crypto.randomUUID()}`);
fs.mkdirSync(path.dirname(target), { recursive: true });
const result = spawnSync('git', ['-C', root, 'worktree', 'add', '--detach', target, 'HEAD'], {
  encoding: 'utf-8',
  shell: false,
});
if (result.status !== 0) {
  process.stderr.write(String(result.stderr || result.stdout || ''));
  process.exit(result.status ?? 1);
}
process.stdout.write(`${target}\n`);
