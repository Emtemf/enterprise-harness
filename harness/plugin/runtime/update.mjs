import process from 'node:process';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
console.log('Enterprise Harness Update');

for (const args of [
  ['harness/plugin/runtime/sync.mjs'],
  ['harness/plugin/runtime/doctor.mjs'],
  ['harness/plugin/runtime/upstream-check.mjs'],
]) {
  const child = spawnSync('node', args, { cwd: repoRoot, encoding: 'utf-8' });
  process.stdout.write(child.stdout || '');
  process.stderr.write(child.stderr || '');
  if (child.status !== 0) {
    process.exit(child.status ?? 1);
  }
}

console.log('Update check complete.');
